use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use super::DocumentAnalysis;

pub fn render_summary_svg(analysis: &DocumentAnalysis) -> Result<String, String> {
    let title = escape_xml(&analysis.title);
    let kind = escape_xml(&analysis.kind);
    let facts = analysis
        .facts
        .iter()
        .take(4)
        .enumerate()
        .map(|(index, (label, value))| {
            let y = 96 + index * 34;
            format!(
                r##"<text x="32" y="{y}" font-size="14" fill="#2f3440">{}</text><text x="256" y="{y}" font-size="14" fill="#596170">{}</text>"##,
                escape_xml(label),
                escape_xml(value)
            )
        })
        .collect::<Vec<_>>()
        .join("");

    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="720" height="260" viewBox="0 0 720 260" role="img" aria-label="{title}">
<rect width="720" height="260" rx="8" fill="#f7f8fb"/>
<rect x="20" y="20" width="680" height="220" rx="8" fill="#ffffff" stroke="#d7dce5"/>
<text x="32" y="56" font-size="22" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#20242d">{title}</text>
<text x="32" y="80" font-size="13" font-family="Segoe UI, Arial, sans-serif" fill="#697386">Document type: {kind}</text>
<g font-family="Segoe UI, Arial, sans-serif">{facts}</g>
</svg>"##
    );

    sanitize_svg(&svg)
}

pub fn sanitize_svg(svg: &str) -> Result<String, String> {
    let mut reader = Reader::from_str(svg);
    reader.config_mut().trim_text(true);

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => validate_element(&event)?,
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("SVG could not be parsed safely: {error}")),
        }
    }

    Ok(svg.to_string())
}

fn validate_element(event: &BytesStart<'_>) -> Result<(), String> {
    let name = lower_ascii(event.name().as_ref());
    if name == "script" || name == "foreignobject" {
        return Err(format!("SVG element <{name}> is not allowed."));
    }

    for attribute in event.attributes() {
        let attribute = attribute.map_err(|error| format!("Invalid SVG attribute: {error}"))?;
        let key = lower_ascii(attribute.key.as_ref());
        let value = String::from_utf8_lossy(attribute.value.as_ref())
            .trim()
            .to_ascii_lowercase();

        if key.starts_with("on") {
            return Err(format!(
                "SVG event handler attribute `{key}` is not allowed."
            ));
        }

        if (key == "href" || key.ends_with(":href"))
            && (value.starts_with("http://")
                || value.starts_with("https://")
                || value.starts_with("javascript:")
                || value.starts_with("data:"))
        {
            return Err("SVG external or scriptable references are not allowed.".into());
        }

        if value.contains("javascript:") || value.contains("data:") || value.contains("url(") {
            return Err("SVG attribute contains a disallowed reference.".into());
        }
    }

    Ok(())
}

fn lower_ascii(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).to_ascii_lowercase()
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::sanitize_svg;

    #[test]
    fn sanitizer_rejects_script_element() {
        let error = sanitize_svg(r#"<svg><script>alert(1)</script></svg>"#)
            .expect_err("script must be rejected");
        assert!(error.contains("script"));
    }

    #[test]
    fn sanitizer_rejects_event_handler() {
        let error = sanitize_svg(r#"<svg><rect onclick="alert(1)"/></svg>"#)
            .expect_err("event handler must be rejected");
        assert!(error.contains("event handler"));
    }

    #[test]
    fn sanitizer_rejects_external_reference() {
        let error = sanitize_svg(r#"<svg><image href="https://example.com/a.png"/></svg>"#)
            .expect_err("external href must be rejected");
        assert!(error.contains("references"));
    }
}
