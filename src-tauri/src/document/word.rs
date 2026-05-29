use std::fs::File;
use std::path::Path;

use docx_rs::{Docx, Paragraph, Run};

pub fn write_docx(path: &Path, markdown: &str) -> Result<(), String> {
    let mut doc = Docx::new();

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            doc = doc.add_paragraph(Paragraph::new());
            continue;
        }

        let (text, bold) = if let Some(heading) = trimmed.strip_prefix("# ") {
            (heading, true)
        } else if let Some(heading) = trimmed.strip_prefix("## ") {
            (heading, true)
        } else if let Some(item) = trimmed.strip_prefix("- ") {
            (item, false)
        } else {
            (trimmed, false)
        };

        let mut run = Run::new().add_text(text);
        if bold {
            run = run.bold();
        }
        doc = doc.add_paragraph(Paragraph::new().add_run(run));
    }

    let file = File::create(path)
        .map_err(|error| format!("Failed to create DOCX output {}: {error}", path.display()))?;
    doc.build()
        .pack(file)
        .map_err(|error| format!("Failed to write DOCX output: {error}"))
}
