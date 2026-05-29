use super::DocumentAnalysis;

pub fn render_markdown(analysis: &DocumentAnalysis, template: &str) -> String {
    let mut output = String::new();
    output.push_str(&format!("# {}\n\n", analysis.title));
    output.push_str("## Source\n\n");
    output.push_str(&format!("- File: `{}`\n", analysis.file_name));
    output.push_str(&format!("- Path: `{}`\n", analysis.source_path));
    output.push_str(&format!("- Type: `{}`\n", analysis.kind));
    output.push_str(&format!("- Template: `{}`\n\n", template));

    output.push_str("## Extracted Metadata\n\n");
    for (label, value) in &analysis.facts {
        output.push_str(&format!("- {}: {}\n", label, value));
    }

    output.push_str("\n## Validation Notes\n\n");
    if analysis.validations.is_empty() {
        output.push_str("- No validation notes were produced.\n");
    } else {
        for item in &analysis.validations {
            output.push_str(&format!("- {}\n", item));
        }
    }

    if !analysis.preview.is_empty() {
        output.push_str("\n## Review Preview\n\n");
        for row in &analysis.preview {
            output.push_str("- ");
            output.push_str(&row.join(" | "));
            output.push('\n');
        }
    }

    if !analysis.warnings.is_empty() {
        output.push_str("\n## Warnings\n\n");
        for warning in &analysis.warnings {
            output.push_str(&format!("- {}\n", warning));
        }
    }

    output.push_str(
        "\n## LLM Review Boundary\n\nDocument contents are treated as untrusted data. Any downstream LLM prompt should preserve PilotBell app instructions and expose a context preview before sending excerpts to a cloud provider.\n",
    );

    output
}
