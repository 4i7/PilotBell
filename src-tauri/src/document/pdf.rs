use std::path::Path;

use lopdf::Document;

use super::{DocumentAnalysis, DocumentLimits};

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

    let sample_pages = pages.keys().copied().take(5).collect::<Vec<_>>();
    let extracted_text = if sample_pages.is_empty() {
        String::new()
    } else {
        document.extract_text(&sample_pages).unwrap_or_default()
    };
    let preview = extracted_text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(6)
        .map(|line| vec![line.chars().take(120).collect::<String>()])
        .collect::<Vec<_>>();

    let mut warnings = Vec::new();
    if extracted_text.trim().is_empty() {
        warnings.push(
            "Best-effort text extraction produced no preview text; the PDF may be scanned, encrypted, or structurally unusual."
                .into(),
        );
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.pdf")
        .to_string();

    Ok(DocumentAnalysis {
        title: format!("PDF analysis: {file_name}"),
        kind: "pdf".into(),
        source_path: path.display().to_string(),
        file_name,
        facts: vec![
            ("Pages".into(), pages.len().to_string()),
            ("Text preview lines".into(), preview.len().to_string()),
            (
                "Embedded JavaScript / files".into(),
                "Ignored by PilotBell document workflow".into(),
            ),
        ],
        validations: vec![
            "Parsed PDF structure without evaluating actions or embedded JavaScript.".into(),
            "Used bounded best-effort text extraction for preview only.".into(),
        ],
        preview,
        warnings,
    })
}
