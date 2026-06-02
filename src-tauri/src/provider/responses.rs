use super::types::{ProviderCommandError, ProviderErrorKind};
use serde::Deserialize;
use serde_json::Value;
use std::borrow::Cow;

#[derive(Deserialize)]
struct ResponseEnvelope {
    output: Option<Vec<ResponseItem>>,
}

#[derive(Deserialize)]
struct ResponseItem {
    #[serde(rename = "type")]
    item_type: String,
    content: Option<Vec<ResponseContent>>,
}

#[derive(Deserialize)]
struct ResponseContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicResponseEnvelope {
    content: Option<Vec<AnthropicContentItem>>,
}

#[derive(Deserialize)]
struct AnthropicContentItem {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

pub(super) fn preview_text(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    const LIMIT: usize = 280;
    let mut preview = String::new();
    for (index, ch) in trimmed.chars().enumerate() {
        if index == LIMIT {
            preview.push_str("...");
            break;
        }
        preview.push(ch);
    }
    Some(preview)
}

fn extract_openai_output_text(parsed: &ResponseEnvelope) -> Option<String> {
    let mut text_chunks = Vec::new();

    for item in parsed.output.as_ref().into_iter().flatten() {
        if item.item_type != "message" {
            continue;
        }

        for content in item.content.as_ref().into_iter().flatten() {
            if content.content_type == "output_text" {
                if let Some(text) = content.text.as_ref() {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        text_chunks.push(trimmed.to_string());
                    }
                }
            }
        }
    }

    if text_chunks.is_empty() {
        None
    } else {
        Some(text_chunks.join("\n\n"))
    }
}

pub(super) fn parse_openai_responses_output(
    raw: &str,
    parsed: Value,
) -> Result<String, ProviderCommandError> {
    let parsed = serde_json::from_value::<ResponseEnvelope>(parsed).map_err(|_| {
        let details = preview_text(raw)
            .map(Cow::Owned)
            .unwrap_or_else(|| Cow::Borrowed("Response body could not be parsed as JSON."));
        ProviderCommandError::new(
            ProviderErrorKind::ResponseFormat,
            "Unexpected OpenAI Responses API response format.",
            false,
        )
        .with_details(details)
    })?;

    extract_openai_output_text(&parsed).ok_or_else(|| {
        let details = preview_text(raw)
            .map(Cow::Owned)
            .unwrap_or_else(|| Cow::Borrowed("Response contained no message output."));
        ProviderCommandError::new(
            ProviderErrorKind::ResponseFormat,
            "No output text was found in the provider response.",
            false,
        )
        .with_details(details)
    })
}

pub(super) fn parse_anthropic_messages_output(
    raw: &str,
    parsed: Value,
) -> Result<String, ProviderCommandError> {
    let parsed = serde_json::from_value::<AnthropicResponseEnvelope>(parsed).map_err(|_| {
        let details = preview_text(raw)
            .map(Cow::Owned)
            .unwrap_or_else(|| Cow::Borrowed("Response body could not be parsed as JSON."));
        ProviderCommandError::new(
            ProviderErrorKind::ResponseFormat,
            "Unexpected Anthropic Messages response format.",
            false,
        )
        .with_details(details)
    })?;

    let text = parsed
        .content
        .as_ref()
        .into_iter()
        .flatten()
        .filter(|item| item.content_type == "text")
        .filter_map(|item| item.text.as_ref())
        .map(|text| text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if text.is_empty() {
        let details = preview_text(raw)
            .map(Cow::Owned)
            .unwrap_or_else(|| Cow::Borrowed("Response contained no text content."));
        return Err(ProviderCommandError::new(
            ProviderErrorKind::ResponseFormat,
            "No text content was found in the Anthropic response.",
            false,
        )
        .with_details(details));
    }

    Ok(text)
}

pub(super) fn parse_ollama_generate_output(
    raw: &str,
    parsed: Value,
) -> Result<String, ProviderCommandError> {
    if let Some(message) = parsed.get("error").and_then(Value::as_str) {
        if !message.trim().is_empty() {
            return Err(ProviderCommandError::new(
                ProviderErrorKind::Provider,
                format!("Ollama error: {}", message.trim()),
                false,
            ));
        }
    }

    parsed
        .get("response")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            let details = preview_text(raw)
                .map(Cow::Owned)
                .unwrap_or_else(|| Cow::Borrowed("Response contained no generated text."));
            ProviderCommandError::new(
                ProviderErrorKind::ResponseFormat,
                "No generated text was found in the Ollama response.",
                false,
            )
            .with_details(details)
        })
}

pub(super) fn parse_llama_cpp_chat_output(
    raw: &str,
    parsed: Value,
) -> Result<String, ProviderCommandError> {
    if let Some(message) = parsed.get("error").and_then(Value::as_str) {
        if !message.trim().is_empty() {
            return Err(ProviderCommandError::new(
                ProviderErrorKind::Provider,
                format!("llama.cpp error: {}", message.trim()),
                false,
            ));
        }
    }

    let content = parsed
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| {
            choice
                .get("message")
                .and_then(|message| message.get("content"))
                .or_else(|| choice.get("text"))
        })
        .and_then(Value::as_str)
        .or_else(|| parsed.get("content").and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);

    content.ok_or_else(|| {
        let details = preview_text(raw)
            .map(Cow::Owned)
            .unwrap_or_else(|| Cow::Borrowed("Response contained no generated text."));
        ProviderCommandError::new(
            ProviderErrorKind::ResponseFormat,
            "No generated text was found in the llama.cpp response.",
            false,
        )
        .with_details(details)
    })
}

pub(super) fn provider_error_message(parsed: &Value) -> Option<String> {
    if let Some(message) = parsed
        .get("error")
        .and_then(|error| error.get("message").or(Some(error)))
        .and_then(Value::as_str)
    {
        let trimmed = message.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    None
}
