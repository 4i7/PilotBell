use std::fs::File;
use std::path::Path;

use docx_rs::{Docx, Paragraph, Run, Table, TableCell, TableRow, WidthType};

use super::DocumentAnalysis;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DocumentTemplate {
    SummaryReport,
    DetailedAnalysis,
    DataQualityReview,
}

impl DocumentTemplate {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim() {
            "summary-report" | "standard-review" | "executive-brief" => Ok(Self::SummaryReport),
            "detailed-analysis" => Ok(Self::DetailedAnalysis),
            "data-quality-review" | "validation-summary" => Ok(Self::DataQualityReview),
            _ => Err(format!(
                "Unsupported DOCX template: {}. Use summary-report, detailed-analysis, or data-quality-review.",
                value.trim()
            )),
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::SummaryReport => "summary-report",
            Self::DetailedAnalysis => "detailed-analysis",
            Self::DataQualityReview => "data-quality-review",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::SummaryReport => "Summary report",
            Self::DetailedAnalysis => "Detailed analysis",
            Self::DataQualityReview => "Data-quality review",
        }
    }
}

pub fn normalize_template_id(value: &str) -> Result<&'static str, String> {
    DocumentTemplate::parse(value).map(DocumentTemplate::id)
}

pub fn template_label(value: &str) -> &'static str {
    DocumentTemplate::parse(value)
        .map(DocumentTemplate::label)
        .unwrap_or("Unknown template")
}

pub fn write_docx(
    path: &Path,
    analysis: &DocumentAnalysis,
    selected_template: &str,
) -> Result<(), String> {
    let template = DocumentTemplate::parse(selected_template)?;
    let file = File::create(path)
        .map_err(|error| format!("Failed to create DOCX output {}: {error}", path.display()))?;
    build_docx(analysis, template)
        .build()
        .pack(file)
        .map_err(|error| format!("Failed to write DOCX output: {error}"))
}

fn build_docx(analysis: &DocumentAnalysis, template: DocumentTemplate) -> Docx {
    let mut doc = Docx::new()
        .add_paragraph(title_paragraph(&analysis.title))
        .add_paragraph(subtitle_paragraph(&format!(
            "{} | {} | {}",
            template.label(),
            analysis.file_name,
            analysis.kind.to_ascii_uppercase()
        )))
        .add_paragraph(body_paragraph(
            "PilotBell generated this report directly from Rust-owned document analysis.",
        ))
        .add_paragraph(body_paragraph(
            "Template selection stays explicit so repeated exports keep a predictable report shape.",
        ))
        .add_paragraph(section_heading("Source summary"))
        .add_table(source_summary_table(analysis, template));

    doc = match template {
        DocumentTemplate::SummaryReport => build_summary_report(doc, analysis),
        DocumentTemplate::DetailedAnalysis => build_detailed_analysis(doc, analysis),
        DocumentTemplate::DataQualityReview => build_data_quality_review(doc, analysis),
    };

    doc.add_paragraph(section_heading("LLM review boundary"))
        .add_paragraph(body_paragraph(
            "Document contents remain untrusted data. Any provider send should preserve PilotBell instructions and require context review before transmission.",
        ))
}

fn build_summary_report(mut doc: Docx, analysis: &DocumentAnalysis) -> Docx {
    doc = doc
        .add_paragraph(section_heading("Report focus"))
        .add_paragraph(body_paragraph(
            "This template keeps the report compact for quick handoff, triage, and repeatable status review.",
        ))
        .add_paragraph(section_heading("Top findings"));

    for item in summary_findings(analysis) {
        doc = doc.add_paragraph(bullet_paragraph(&item));
    }

    doc = doc
        .add_paragraph(section_heading("Preview excerpt"))
        .add_table(preview_table(analysis, 4));

    if !analysis.warnings.is_empty() {
        doc = doc.add_paragraph(section_heading("Warnings"));
        for warning in analysis.warnings.iter().take(4) {
            doc = doc.add_paragraph(bullet_paragraph(warning));
        }
    }

    doc
}

fn build_detailed_analysis(mut doc: Docx, analysis: &DocumentAnalysis) -> Docx {
    doc = doc
        .add_paragraph(section_heading("Document profile"))
        .add_paragraph(body_paragraph(
            "This template expands the analysis record for closer review of extracted facts, checks, and preview evidence.",
        ))
        .add_table(facts_table(analysis))
        .add_paragraph(section_heading("Validation walkthrough"));

    if analysis.validations.is_empty() {
        doc = doc.add_paragraph(body_paragraph("No validation notes were produced."));
    } else {
        for item in &analysis.validations {
            doc = doc.add_paragraph(bullet_paragraph(item));
        }
    }

    doc = doc
        .add_paragraph(section_heading("Review preview"))
        .add_table(preview_table(analysis, 6));

    if !analysis.warnings.is_empty() {
        doc = doc.add_paragraph(section_heading("Warnings"));
        for warning in &analysis.warnings {
            doc = doc.add_paragraph(bullet_paragraph(warning));
        }
    }

    doc
}

fn build_data_quality_review(mut doc: Docx, analysis: &DocumentAnalysis) -> Docx {
    doc = doc
        .add_paragraph(section_heading("Quality posture"))
        .add_paragraph(body_paragraph(
            "This template emphasizes data quality checks, review gaps, and follow-up actions that can be repeated across report runs.",
        ))
        .add_paragraph(bullet_paragraph(&format!(
            "Validation notes captured: {}",
            analysis.validations.len()
        )))
        .add_paragraph(bullet_paragraph(&format!(
            "Warnings captured: {}",
            analysis.warnings.len()
        )))
        .add_paragraph(section_heading("Checks reviewed"));

    if analysis.validations.is_empty() {
        doc = doc.add_paragraph(body_paragraph("No validation notes were produced."));
    } else {
        for item in &analysis.validations {
            doc = doc.add_paragraph(bullet_paragraph(item));
        }
    }

    doc = doc
        .add_paragraph(section_heading("Observed evidence"))
        .add_table(preview_table(analysis, 5))
        .add_paragraph(section_heading("Recommended follow-up"));

    for item in quality_follow_up(analysis) {
        doc = doc.add_paragraph(bullet_paragraph(&item));
    }

    doc
}

fn summary_findings(analysis: &DocumentAnalysis) -> Vec<String> {
    let mut items = vec![
        format!("Source type: {}.", analysis.kind),
        format!("Template-ready file: {}.", analysis.file_name),
    ];

    items.extend(
        analysis
            .facts
            .iter()
            .take(3)
            .map(|(label, value)| format!("{label}: {value}.")),
    );
    items.extend(
        analysis
            .validations
            .iter()
            .take(2)
            .map(|value| format!("Validation note: {value}")),
    );

    if items.len() < 5 {
        items.push(
            "Review the source document before using this output for external reporting.".into(),
        );
    }

    items
}

fn quality_follow_up(analysis: &DocumentAnalysis) -> Vec<String> {
    let mut items = Vec::new();
    if analysis.warnings.is_empty() {
        items.push("No workflow warnings were captured; keep the source file under normal review controls.".into());
    } else {
        items.extend(
            analysis
                .warnings
                .iter()
                .take(3)
                .map(|warning| format!("Investigate warning: {warning}")),
        );
    }
    items.push(
        "Confirm the source document still reflects the latest local file before distribution."
            .into(),
    );
    items.push("Re-run the same template after source updates so report sections stay comparable between runs.".into());
    items
}

fn source_summary_table(analysis: &DocumentAnalysis, template: DocumentTemplate) -> Table {
    Table::new(vec![
        key_value_row("Template", template.label()),
        key_value_row("Template ID", template.id()),
        key_value_row("Source file", &analysis.file_name),
        key_value_row("Source path", &analysis.source_path),
        key_value_row("Document kind", &analysis.kind),
        key_value_row("Validation notes", &analysis.validations.len().to_string()),
        key_value_row("Warnings", &analysis.warnings.len().to_string()),
    ])
    .set_grid(vec![2400, 7200])
}

fn facts_table(analysis: &DocumentAnalysis) -> Table {
    let mut rows = vec![fixed_header_row(["Fact", "Value"])];
    for (label, value) in &analysis.facts {
        rows.push(TableRow::new(vec![
            table_cell(label, true),
            table_cell(value, false),
        ]));
    }
    if analysis.facts.is_empty() {
        rows.push(TableRow::new(vec![
            table_cell("Fact", true),
            table_cell("No extracted facts were produced.", false),
        ]));
    }

    Table::new(rows).set_grid(vec![2800, 6800])
}

fn preview_table(analysis: &DocumentAnalysis, max_rows: usize) -> Table {
    if analysis.preview.is_empty() {
        return Table::new(vec![TableRow::new(vec![table_cell(
            "No preview rows were produced for this document.",
            false,
        )])])
        .set_grid(vec![9600]);
    }

    let preview_rows = analysis.preview.iter().take(max_rows).collect::<Vec<_>>();
    let column_count = preview_rows
        .iter()
        .map(|row| row.len())
        .max()
        .unwrap_or(1)
        .max(1);
    let grid_width = 9600 / column_count.max(1);
    let mut rows = vec![dynamic_header_row(
        (0..column_count)
            .map(|index| format!("Column {}", index + 1))
            .collect::<Vec<_>>(),
    )];

    for row in preview_rows {
        let cells = (0..column_count)
            .map(|index| row.get(index).cloned().unwrap_or_else(|| "-".into()))
            .map(|value| table_cell(&value, false))
            .collect::<Vec<_>>();
        rows.push(TableRow::new(cells));
    }

    Table::new(rows).set_grid(vec![grid_width; column_count])
}

fn fixed_header_row<const N: usize>(values: [&str; N]) -> TableRow {
    TableRow::new(
        values
            .into_iter()
            .map(|value| table_cell(value, true))
            .collect(),
    )
}

fn dynamic_header_row(values: Vec<String>) -> TableRow {
    TableRow::new(
        values
            .into_iter()
            .map(|value| table_cell(&value, true))
            .collect(),
    )
}

fn key_value_row(label: &str, value: &str) -> TableRow {
    TableRow::new(vec![table_cell(label, true), table_cell(value, false)])
}

fn table_cell(value: &str, emphasize: bool) -> TableCell {
    let paragraph = if emphasize {
        Paragraph::new()
            .add_run(Run::new().add_text(value).bold())
            .size(22)
    } else {
        Paragraph::new()
            .add_run(Run::new().add_text(value))
            .size(22)
    };

    TableCell::new()
        .width(if emphasize { 2600 } else { 7000 }, WidthType::Dxa)
        .add_paragraph(paragraph)
}

fn title_paragraph(value: &str) -> Paragraph {
    Paragraph::new()
        .style("Title")
        .add_run(Run::new().add_text(value).bold())
        .size(34)
}

fn subtitle_paragraph(value: &str) -> Paragraph {
    Paragraph::new()
        .add_run(Run::new().add_text(value))
        .size(22)
}

fn section_heading(value: &str) -> Paragraph {
    Paragraph::new()
        .style("Heading1")
        .add_run(Run::new().add_text(value).bold())
        .size(28)
}

fn body_paragraph(value: &str) -> Paragraph {
    Paragraph::new()
        .add_run(Run::new().add_text(value))
        .size(22)
}

fn bullet_paragraph(value: &str) -> Paragraph {
    Paragraph::new()
        .add_run(Run::new().add_text(format!("- {value}")))
        .size(22)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::fs::File;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use zip::ZipArchive;

    use super::{write_docx, DocumentTemplate};
    use crate::document::DocumentAnalysis;

    #[test]
    fn normalizes_legacy_template_aliases() {
        assert_eq!(
            super::normalize_template_id("standard-review")
                .expect("legacy template should normalize"),
            "summary-report"
        );
        assert_eq!(
            super::normalize_template_id("validation-summary")
                .expect("legacy template should normalize"),
            "data-quality-review"
        );
    }

    #[test]
    fn rejects_unknown_template_ids() {
        assert!(super::normalize_template_id("mystery-template")
            .expect_err("unknown template should fail")
            .contains("Unsupported DOCX template"));
    }

    #[test]
    fn generates_each_template_for_pdf_and_excel_analysis() {
        let analyses = [pdf_fixture_analysis(), excel_fixture_analysis()];
        let templates = [
            (
                DocumentTemplate::SummaryReport,
                ["Summary report", "Top findings", "Preview excerpt"],
            ),
            (
                DocumentTemplate::DetailedAnalysis,
                [
                    "Detailed analysis",
                    "Validation walkthrough",
                    "Review preview",
                ],
            ),
            (
                DocumentTemplate::DataQualityReview,
                [
                    "Data-quality review",
                    "Checks reviewed",
                    "Recommended follow-up",
                ],
            ),
        ];

        for analysis in analyses {
            for (template, markers) in templates {
                let path = unique_docx_path(&format!("{}-{}", analysis.kind, template.id()));
                write_docx(&path, &analysis, template.id()).expect("DOCX should be written");

                let content_types = read_docx_entry(&path, "[Content_Types].xml");
                assert!(
                    content_types.contains("wordprocessingml.document.main+xml"),
                    "content types missing Word main document type for {} / {}",
                    analysis.kind,
                    template.id()
                );

                let document_xml = read_docx_entry(&path, "word/document.xml");
                assert!(document_xml.contains(&analysis.title));
                assert!(document_xml.contains(&analysis.file_name));
                assert!(document_xml.contains(template.label()));
                for marker in markers {
                    assert!(
                        document_xml.contains(marker),
                        "document XML for {} / {} should contain {}",
                        analysis.kind,
                        template.id(),
                        marker
                    );
                }

                if analysis.kind == "pdf" {
                    assert!(document_xml.contains("Quarterly compliance overview"));
                } else {
                    assert!(document_xml.contains("Revenue"));
                }

                let _ = fs::remove_file(&path);
            }
        }
    }

    fn pdf_fixture_analysis() -> DocumentAnalysis {
        DocumentAnalysis {
            title: "PDF analysis: Q2-report.pdf".into(),
            kind: "pdf".into(),
            source_path: "C:\\fixtures\\Q2-report.pdf".into(),
            file_name: "Q2-report.pdf".into(),
            facts: vec![
                ("Pages".into(), "12".into()),
                ("Text extraction confidence".into(), "high".into()),
                ("Sampled extractable text lines".into(), "18".into()),
            ],
            validations: vec![
                "Parsed PDF structure without evaluating actions or embedded JavaScript.".into(),
                "Used bounded temporary text extraction from sampled pages for preview and confidence checks.".into(),
            ],
            preview: vec![
                vec!["Quarterly compliance overview".into()],
                vec!["Owner: Operations".into()],
                vec!["Escalation status: stable".into()],
            ],
            warnings: vec![
                "PDF text extraction completed with medium confidence; review source ordering.".into(),
            ],
        }
    }

    fn excel_fixture_analysis() -> DocumentAnalysis {
        DocumentAnalysis {
            title: "Excel analysis: revenue.xlsx".into(),
            kind: "excel".into(),
            source_path: "C:\\fixtures\\revenue.xlsx".into(),
            file_name: "revenue.xlsx".into(),
            facts: vec![
                ("Sheets".into(), "3".into()),
                ("Sheet Revenue size".into(), "40 rows x 6 columns".into()),
                ("Sheet Exceptions size".into(), "12 rows x 4 columns".into()),
            ],
            validations: vec![
                "Workbook formulas were not recalculated by PilotBell.".into(),
                "Sheet Revenue: sampled blank cells=4, duplicate sampled rows=0.".into(),
            ],
            preview: vec![
                vec!["Revenue".into(), "Region".into(), "Variance".into()],
                vec!["1200".into(), "West".into(), "-2%".into()],
                vec!["980".into(), "East".into(), "4%".into()],
            ],
            warnings: vec!["Sheet Exceptions appears empty.".into()],
        }
    }

    fn unique_docx_path(prefix: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("current time")
            .as_nanos();
        std::env::temp_dir().join(format!("pilotbell-{prefix}-{unique}.docx"))
    }

    fn read_docx_entry(path: &Path, entry_name: &str) -> String {
        let file = File::open(path).expect("DOCX file should exist");
        let mut archive = ZipArchive::new(file).expect("DOCX should be a valid zip archive");
        let mut entry = archive
            .by_name(entry_name)
            .unwrap_or_else(|_| panic!("missing entry {entry_name}"));
        let mut xml = String::new();
        use std::io::Read;
        entry
            .read_to_string(&mut xml)
            .expect("archive entry should read as UTF-8 XML");
        xml
    }
}
