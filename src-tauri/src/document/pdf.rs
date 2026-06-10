use std::collections::BTreeSet;
use std::panic::{self, AssertUnwindSafe};
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use lopdf::content::Operation;
use lopdf::{Dictionary, Document, Object};

use super::{DocumentAnalysis, DocumentLimits};

const PDF_SAMPLE_PAGE_LIMIT: usize = 5;
static PDF_EXTRACT_PANIC_HOOK_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ExtractionConfidence {
    High,
    Medium,
    Low,
    None,
}

impl ExtractionConfidence {
    fn as_str(self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
            Self::None => "none",
        }
    }
}

#[derive(Default)]
struct PdfStructureSignals {
    has_type0_or_cid_font: bool,
    has_text_showing_operators: bool,
    has_rotated_pages: bool,
    has_rotated_text_matrices: bool,
    likely_multi_column_layout: bool,
}

struct PdfTextExtraction {
    confidence: ExtractionConfidence,
    normalized_lines: Vec<String>,
    warnings: Vec<String>,
}

pub fn analyze_pdf(path: &Path, limits: &DocumentLimits) -> Result<DocumentAnalysis, String> {
    let document =
        Document::load(path).map_err(|error| format!("Failed to parse PDF structure: {error}"))?;
    let pages = document.get_pages();
    if pages.len() > limits.max_pdf_pages {
        return Err(format!(
            "PDF page count exceeds the {} page limit.",
            limits.max_pdf_pages
        ));
    }

    let sample_pages = pages
        .keys()
        .copied()
        .take(PDF_SAMPLE_PAGE_LIMIT)
        .collect::<Vec<_>>();
    let structure = inspect_pdf_structure(&document, &sample_pages);
    let extraction = extract_pdf_preview(path, &sample_pages, &structure);

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.pdf")
        .to_string();

    let sampled_text_line_count = extraction.normalized_lines.len();
    let preview = match extraction.confidence {
        ExtractionConfidence::Medium | ExtractionConfidence::High => extraction
            .normalized_lines
            .iter()
            .map(|line| vec![line.clone()])
            .collect(),
        _ => Vec::new(),
    };

    Ok(DocumentAnalysis {
        title: format!("PDF analysis: {file_name}"),
        kind: "pdf".into(),
        source_path: path.display().to_string(),
        file_name,
        facts: vec![
            ("Pages".into(), pages.len().to_string()),
            (
                "Sampled pages for text preview".into(),
                sample_pages.len().to_string(),
            ),
            (
                "Text extraction confidence".into(),
                extraction.confidence.as_str().into(),
            ),
            (
                "Sampled extractable text lines".into(),
                sampled_text_line_count.to_string(),
            ),
            (
                "Embedded JavaScript / files".into(),
                "Ignored by PilotBell document workflow".into(),
            ),
        ],
        validations: vec![
            "Parsed PDF structure without evaluating actions or embedded JavaScript.".into(),
            "Used bounded temporary text extraction from sampled pages for preview and confidence checks.".into(),
            "Extracted text is included in the review preview but not persisted in job metadata or browser storage.".into(),
        ],
        preview,
        warnings: extraction.warnings,
    })
}

fn extract_pdf_preview(
    path: &Path,
    sample_pages: &[u32],
    structure: &PdfStructureSignals,
) -> PdfTextExtraction {
    let mut warnings = structure_warnings(structure);

    if sample_pages.is_empty() {
        warnings.push(
            "No extractable text was found because the sampled PDF page set was empty.".into(),
        );
        return PdfTextExtraction {
            confidence: ExtractionConfidence::None,
            normalized_lines: Vec::new(),
            warnings,
        };
    }

    let page_text = match extract_text_by_pages_safely(path) {
        Ok(Ok(pages)) => pages
            .into_iter()
            .take(sample_pages.len())
            .collect::<Vec<String>>()
            .join("\n"),
        Ok(Err(error)) => {
            warnings.push(format!(
                "PDF text extraction failed after structure parsing; preview text is unavailable. {error}"
            ));
            String::new()
        }
        Err(_) => {
            warnings.push(
                "PDF text extraction failed inside the extraction library; preview text is unavailable."
                    .into(),
            );
            String::new()
        }
    };

    let normalized_lines = normalize_preview_lines(&page_text);
    let confidence = classify_extraction_confidence(&page_text, &normalized_lines, structure);

    match confidence {
        ExtractionConfidence::None => warnings.push(
            "No extractable text layer was found in the sampled PDF pages; the document may be scanned, image-only, encrypted, or structurally unusual."
                .into(),
        ),
        ExtractionConfidence::Low => warnings.push(
            "PDF text extraction returned low-confidence output, so PilotBell omitted the preview instead of showing likely garbage text."
                .into(),
        ),
        ExtractionConfidence::Medium => warnings.push(
            "PDF text extraction completed with medium confidence; review the source PDF before relying on the preview ordering."
                .into(),
        ),
        ExtractionConfidence::High => {}
    }

    PdfTextExtraction {
        confidence,
        normalized_lines,
        warnings: dedupe_warnings(warnings),
    }
}

fn extract_text_by_pages_safely(
    path: &Path,
) -> Result<Result<Vec<String>, pdf_extract::OutputError>, String> {
    let hook_lock = PDF_EXTRACT_PANIC_HOOK_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = hook_lock
        .lock()
        .map_err(|_| "PDF text extraction panic guard is unavailable.".to_string())?;
    let previous_hook = panic::take_hook();
    panic::set_hook(Box::new(|_| {}));
    let result = panic::catch_unwind(AssertUnwindSafe(|| {
        pdf_extract::extract_text_by_pages(path)
    }));
    panic::set_hook(previous_hook);

    result.map_err(|_| "PDF text extraction panicked.".to_string())
}

fn inspect_pdf_structure(document: &Document, sample_pages: &[u32]) -> PdfStructureSignals {
    let pages = document.get_pages();
    let mut signals = PdfStructureSignals::default();
    let mut text_positions = Vec::new();

    for page_number in sample_pages {
        let Some(page_id) = pages.get(page_number) else {
            continue;
        };
        let Ok(page) = document.get_object(*page_id).and_then(Object::as_dict) else {
            continue;
        };

        if page
            .get(b"Rotate")
            .ok()
            .and_then(object_to_i64)
            .map(|degrees| degrees.rem_euclid(360) != 0)
            .unwrap_or(false)
        {
            signals.has_rotated_pages = true;
        }

        if page_uses_type0_or_cid_font(document, page) {
            signals.has_type0_or_cid_font = true;
        }

        if let Ok(content) = document.get_and_decode_page_content(*page_id) {
            let mut current_x = None;
            for operation in content.operations {
                inspect_text_operation(
                    &operation,
                    &mut signals,
                    &mut current_x,
                    &mut text_positions,
                );
            }
        }
    }

    signals.likely_multi_column_layout = has_multiple_x_clusters(&text_positions);
    signals
}

fn inspect_text_operation(
    operation: &Operation,
    signals: &mut PdfStructureSignals,
    current_x: &mut Option<f64>,
    text_positions: &mut Vec<f64>,
) {
    match operation.operator.as_str() {
        "Tm" if operation.operands.len() == 6 => {
            let a = object_to_f64(&operation.operands[0]).unwrap_or(1.0);
            let b = object_to_f64(&operation.operands[1]).unwrap_or(0.0);
            let c = object_to_f64(&operation.operands[2]).unwrap_or(0.0);
            let d = object_to_f64(&operation.operands[3]).unwrap_or(1.0);
            if b.abs() > 0.001 || c.abs() > 0.001 || a.abs() < 0.001 || d.abs() < 0.001 {
                signals.has_rotated_text_matrices = true;
            }
            *current_x = object_to_f64(&operation.operands[4]);
        }
        "Td" | "TD" => {
            if let Some(x) = operation.operands.first().and_then(object_to_f64) {
                *current_x = Some(current_x.unwrap_or(0.0) + x);
            }
        }
        "Tj" | "'" | "\"" | "TJ" => {
            signals.has_text_showing_operators = true;
            if let Some(x) = current_x {
                text_positions.push(*x);
            }
        }
        _ => {}
    }
}

fn page_uses_type0_or_cid_font(document: &Document, page: &Dictionary) -> bool {
    let Some(resources) = page.get(b"Resources").ok() else {
        return false;
    };
    let Some(resources) = resolve_dictionary(document, resources) else {
        return false;
    };
    let Some(fonts) = resources.get(b"Font").ok() else {
        return false;
    };
    let Some(fonts) = resolve_dictionary(document, fonts) else {
        return false;
    };

    fonts.iter().any(|(_, font_object)| {
        let Some(font) = resolve_dictionary(document, font_object) else {
            return false;
        };
        name_equals(font.get(b"Subtype").ok(), b"Type0")
            || name_contains(font.get(b"Subtype").ok(), b"CID")
            || name_contains(font.get(b"Encoding").ok(), b"Identity-")
    })
}

fn resolve_dictionary<'a>(document: &'a Document, object: &'a Object) -> Option<&'a Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Reference(id) => document
            .get_object(*id)
            .ok()
            .and_then(|object| object.as_dict().ok()),
        _ => None,
    }
}

fn structure_warnings(structure: &PdfStructureSignals) -> Vec<String> {
    let mut warnings = Vec::new();
    if structure.has_type0_or_cid_font {
        warnings.push(
            "PDF uses CID/Type0 font encoding; extracted text may be incomplete or incorrectly decoded."
                .into(),
        );
    }
    if structure.likely_multi_column_layout {
        warnings.push(
            "PDF appears to use a multi-column layout; preview line ordering may not match visual reading order."
                .into(),
        );
    }
    if structure.has_rotated_pages || structure.has_rotated_text_matrices {
        warnings.push(
            "PDF includes rotated pages or rotated text; preview ordering may not match the visual layout."
                .into(),
        );
    }
    warnings
}

fn classify_extraction_confidence(
    raw_text: &str,
    normalized_lines: &[String],
    structure: &PdfStructureSignals,
) -> ExtractionConfidence {
    if normalized_lines.is_empty() {
        return ExtractionConfidence::None;
    }
    if looks_like_garbage(raw_text) {
        return ExtractionConfidence::Low;
    }
    if structure.has_type0_or_cid_font
        || structure.likely_multi_column_layout
        || structure.has_rotated_pages
        || structure.has_rotated_text_matrices
    {
        return ExtractionConfidence::Medium;
    }
    ExtractionConfidence::High
}

fn normalize_preview_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(collapse_whitespace)
        .filter(|line| !line.is_empty())
        .collect()
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn looks_like_garbage(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    let char_count = trimmed.chars().count();
    let suspicious_count = trimmed
        .chars()
        .filter(|ch| {
            *ch == '\u{fffd}'
                || ch.is_control() && !matches!(*ch, '\n' | '\r' | '\t')
                || ('\u{e000}'..='\u{f8ff}').contains(ch)
        })
        .count();
    let cid_marker_count = trimmed.matches("(cid:").count() + trimmed.matches("cid:").count();

    suspicious_count * 4 > char_count || cid_marker_count >= 3
}

fn has_multiple_x_clusters(positions: &[f64]) -> bool {
    let mut clusters = BTreeSet::new();
    for position in positions {
        if position.is_finite() {
            clusters.insert((*position / 80.0).round() as i64);
        }
    }

    if clusters.len() < 2 {
        return false;
    }

    let min = clusters.iter().next().copied().unwrap_or_default();
    let max = clusters.iter().next_back().copied().unwrap_or_default();
    max - min >= 2
}

fn object_to_i64(object: &Object) -> Option<i64> {
    match object {
        Object::Integer(value) => Some(*value),
        Object::Real(value) => Some(*value as i64),
        _ => None,
    }
}

fn object_to_f64(object: &Object) -> Option<f64> {
    match object {
        Object::Integer(value) => Some(*value as f64),
        Object::Real(value) => Some((*value).into()),
        _ => None,
    }
}

fn name_equals(object: Option<&Object>, expected: &[u8]) -> bool {
    matches!(object, Some(Object::Name(name)) if name.as_slice() == expected)
}

fn name_contains(object: Option<&Object>, needle: &[u8]) -> bool {
    matches!(object, Some(Object::Name(name)) if name.windows(needle.len()).any(|window| window == needle))
}

fn dedupe_warnings(warnings: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    warnings
        .into_iter()
        .filter(|warning| seen.insert(warning.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use lopdf::content::{Content, Operation};
    use lopdf::{dictionary, Document, Object, Stream};

    use super::{analyze_pdf, ExtractionConfidence};
    use crate::document::DocumentLimits;

    #[test]
    fn high_confidence_pdf_populates_preview_lines() {
        let path = write_pdf_fixture(
            "simple-text",
            simple_text_document("Quarterly review ready"),
        );

        let analysis = analyze_pdf(&path, &DocumentLimits::default()).expect("PDF should analyze");

        assert!(
            !analysis.preview.is_empty(),
            "high-confidence PDF should populate preview"
        );
        assert_eq!(analysis.preview[0], vec!["Quarterly review ready"]);
        assert_fact(&analysis, "Sampled extractable text lines", "1");
        assert!(analysis.facts.contains(&(
            "Text extraction confidence".into(),
            ExtractionConfidence::High.as_str().into()
        )));
        assert!(analysis.warnings.is_empty());

        let _ = fs::remove_file(path);
    }

    #[test]
    fn warns_for_cid_type0_fonts() {
        let path = write_pdf_fixture("cid-font", type0_font_document("Encoded invoice text"));

        let analysis = analyze_pdf(&path, &DocumentLimits::default()).expect("PDF should analyze");

        assert_warning_contains(&analysis.warnings, "CID/Type0 font encoding");
        assert_fact(&analysis, "Text extraction confidence", "none");
        assert_warning_contains(&analysis.warnings, "preview text is unavailable");

        let _ = fs::remove_file(path);
    }

    #[test]
    fn warns_for_multi_column_layouts() {
        let path = write_pdf_fixture("multi-column", multi_column_document());

        let analysis = analyze_pdf(&path, &DocumentLimits::default()).expect("PDF should analyze");

        assert_warning_contains(&analysis.warnings, "multi-column layout");
        assert_fact(&analysis, "Text extraction confidence", "medium");

        let _ = fs::remove_file(path);
    }

    #[test]
    fn warns_for_rotated_pages() {
        let path = write_pdf_fixture("rotated-page", rotated_page_document());

        let analysis = analyze_pdf(&path, &DocumentLimits::default()).expect("PDF should analyze");

        assert_warning_contains(&analysis.warnings, "rotated pages or rotated text");
        assert_fact(&analysis, "Text extraction confidence", "medium");

        let _ = fs::remove_file(path);
    }

    #[test]
    fn reports_no_extractable_text_for_image_only_pdf() {
        let path = write_pdf_fixture("image-only", image_only_document());

        let analysis = analyze_pdf(&path, &DocumentLimits::default()).expect("PDF should analyze");

        assert!(analysis.preview.is_empty());
        assert_warning_contains(&analysis.warnings, "No extractable text layer");
        assert_fact(&analysis, "Text extraction confidence", "none");

        let _ = fs::remove_file(path);
    }

    fn assert_warning_contains(warnings: &[String], expected: &str) {
        assert!(
            warnings.iter().any(|warning| warning.contains(expected)),
            "expected warning containing {expected:?}, got {warnings:?}"
        );
    }

    fn assert_fact(analysis: &crate::document::DocumentAnalysis, label: &str, expected: &str) {
        assert!(
            analysis
                .facts
                .iter()
                .any(|(fact_label, value)| fact_label == label && value == expected),
            "expected fact {label:?}={expected:?}, got {:?}",
            analysis.facts
        );
    }

    fn write_pdf_fixture(name: &str, mut document: Document) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "pilotbell-{name}-{}.pdf",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("current time")
                .as_nanos()
        ));
        document.save(&path).expect("fixture PDF should save");
        path
    }

    fn simple_text_document(text: &str) -> Document {
        text_document(
            dictionary! {
                "Type" => "Font",
                "Subtype" => "Type1",
                "BaseFont" => "Helvetica",
            },
            vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 18.into()]),
                Operation::new(
                    "Tm",
                    vec![
                        1.into(),
                        0.into(),
                        0.into(),
                        1.into(),
                        72.into(),
                        720.into(),
                    ],
                ),
                Operation::new("Tj", vec![Object::string_literal(text)]),
                Operation::new("ET", vec![]),
            ],
            None,
        )
    }

    fn type0_font_document(text: &str) -> Document {
        text_document(
            dictionary! {
                "Type" => "Font",
                "Subtype" => "Type0",
                "BaseFont" => "Identity-H",
                "Encoding" => "Identity-H",
            },
            vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 18.into()]),
                Operation::new(
                    "Tm",
                    vec![
                        1.into(),
                        0.into(),
                        0.into(),
                        1.into(),
                        72.into(),
                        720.into(),
                    ],
                ),
                Operation::new("Tj", vec![Object::string_literal(text)]),
                Operation::new("ET", vec![]),
            ],
            None,
        )
    }

    fn multi_column_document() -> Document {
        text_document(
            dictionary! {
                "Type" => "Font",
                "Subtype" => "Type1",
                "BaseFont" => "Helvetica",
            },
            vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 14.into()]),
                Operation::new(
                    "Tm",
                    vec![
                        1.into(),
                        0.into(),
                        0.into(),
                        1.into(),
                        72.into(),
                        720.into(),
                    ],
                ),
                Operation::new("Tj", vec![Object::string_literal("Left column one")]),
                Operation::new(
                    "Tm",
                    vec![
                        1.into(),
                        0.into(),
                        0.into(),
                        1.into(),
                        330.into(),
                        720.into(),
                    ],
                ),
                Operation::new("Tj", vec![Object::string_literal("Right column one")]),
                Operation::new("ET", vec![]),
            ],
            None,
        )
    }

    fn rotated_page_document() -> Document {
        text_document(
            dictionary! {
                "Type" => "Font",
                "Subtype" => "Type1",
                "BaseFont" => "Helvetica",
            },
            vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 18.into()]),
                Operation::new(
                    "Tm",
                    vec![
                        1.into(),
                        0.into(),
                        0.into(),
                        1.into(),
                        72.into(),
                        720.into(),
                    ],
                ),
                Operation::new("Tj", vec![Object::string_literal("Rotated page text")]),
                Operation::new("ET", vec![]),
            ],
            Some(90),
        )
    }

    fn image_only_document() -> Document {
        text_document(
            dictionary! {
                "Type" => "Font",
                "Subtype" => "Type1",
                "BaseFont" => "Helvetica",
            },
            vec![Operation::new("q", vec![]), Operation::new("Q", vec![])],
            None,
        )
    }

    fn text_document(
        font: lopdf::Dictionary,
        operations: Vec<Operation>,
        rotate: Option<i64>,
    ) -> Document {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(font);
        let resources_id = document.add_object(dictionary! {
            "Font" => dictionary! {
                "F1" => font_id,
            },
        });
        let content = Content { operations };
        let content_id = document.add_object(Stream::new(
            dictionary! {},
            content.encode().expect("content should encode"),
        ));

        let mut page = dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            "Contents" => content_id,
        };
        if let Some(rotate) = rotate {
            page.set("Rotate", rotate);
        }
        let page_id = document.add_object(page);

        let pages = dictionary! {
            "Type" => "Pages",
            "Kids" => vec![Object::Reference(page_id)],
            "Count" => 1,
        };
        document.objects.insert(pages_id, Object::Dictionary(pages));
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        document
    }
}
