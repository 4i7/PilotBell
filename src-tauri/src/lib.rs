use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::borrow::Cow;
use std::time::Duration;

#[derive(Serialize)]
struct AssistantReply {
    content: String,
    provider: String,
    model: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderConfig {
    name: String,
    endpoint: String,
    api_key: String,
    model: String,
}

#[derive(Deserialize)]
struct ResponseEnvelope {
    output: Option<Vec<ResponseItem>>,
    error: Option<ResponseError>,
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
struct ResponseError {
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum ProviderErrorKind {
    Validation,
    Timeout,
    Network,
    Provider,
    ResponseFormat,
    Internal,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderCommandError {
    kind: ProviderErrorKind,
    message: String,
    status_code: Option<u16>,
    retryable: bool,
    details: Option<String>,
}

#[derive(Serialize)]
struct ProviderHealth {
    message: String,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum ProviderCommandResult<T> {
    Success { data: T },
    Error { error: ProviderCommandError },
}

impl ProviderCommandError {
    fn new(
        kind: ProviderErrorKind,
        message: impl Into<String>,
        retryable: bool,
    ) -> ProviderCommandError {
        ProviderCommandError {
            kind,
            message: message.into(),
            status_code: None,
            retryable,
            details: None,
        }
    }

    fn with_status(mut self, status_code: u16) -> ProviderCommandError {
        self.status_code = Some(status_code);
        self
    }

    fn with_details(mut self, details: impl Into<String>) -> ProviderCommandError {
        let details = details.into();
        if !details.trim().is_empty() {
            self.details = Some(details);
        }
        self
    }
}

fn validate_provider(provider: &ProviderConfig) -> Result<(), ProviderCommandError> {
    if provider.name.trim().is_empty()
        || provider.endpoint.trim().is_empty()
        || provider.api_key.trim().is_empty()
        || provider.model.trim().is_empty()
    {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider settings are incomplete.",
            false,
        ));
    }

    if !provider.endpoint.starts_with("https://") {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider endpoint must start with https://",
            false,
        ));
    }

    Ok(())
}

fn preview_text(raw: &str) -> Option<String> {
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

fn extract_output_text(parsed: &ResponseEnvelope) -> Option<String> {
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

async fn call_provider(
    prompt: &str,
    provider: ProviderConfig,
) -> Result<AssistantReply, ProviderCommandError> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Prompt is empty.",
            false,
        ));
    }

    let payload = json!({
        "model": provider.model,
        "input": prompt,
    });

    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| {
            ProviderCommandError::new(
                ProviderErrorKind::Internal,
                format!("Failed to create HTTP client: {error}"),
                false,
            )
        })?
        .post(&provider.endpoint)
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {}", provider.api_key))
        .json(&payload)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                ProviderCommandError::new(
                    ProviderErrorKind::Timeout,
                    "The provider request timed out after 90 seconds.",
                    true,
                )
            } else {
                ProviderCommandError::new(
                    ProviderErrorKind::Network,
                    format!("Network error: {error}"),
                    true,
                )
            }
        })?;

    let status = response.status();
    let raw = response.text().await.map_err(|error| {
        ProviderCommandError::new(
            ProviderErrorKind::Internal,
            format!("Failed to read response: {error}"),
            true,
        )
    })?;

    let parsed = serde_json::from_str::<ResponseEnvelope>(&raw);

    if !status.is_success() {
        let retryable =
            status.is_server_error() || status.as_u16() == 408 || status.as_u16() == 429;
        let details = preview_text(&raw);

        if let Ok(parsed) = parsed {
            if let Some(message) = parsed.error.and_then(|error| error.message) {
                let mut error = ProviderCommandError::new(
                    ProviderErrorKind::Provider,
                    format!("Provider error ({status}): {message}"),
                    retryable,
                )
                .with_status(status.as_u16());
                if let Some(details) = details {
                    error = error.with_details(details);
                }
                return Err(error);
            }
        }

        let mut error = ProviderCommandError::new(
            ProviderErrorKind::Provider,
            format!("Provider error ({status})."),
            retryable,
        )
        .with_status(status.as_u16());
        if let Some(details) = details {
            error = error.with_details(details);
        }
        return Err(error);
    }

    let parsed = parsed.map_err(|_| {
        let details = preview_text(&raw)
            .map(Cow::Owned)
            .unwrap_or_else(|| Cow::Borrowed("Response body could not be parsed as JSON."));
        ProviderCommandError::new(
            ProviderErrorKind::ResponseFormat,
            "Unexpected provider response format.",
            false,
        )
        .with_details(details)
    })?;

    let content = extract_output_text(&parsed).ok_or_else(|| {
        let details = preview_text(&raw)
            .map(Cow::Owned)
            .unwrap_or_else(|| Cow::Borrowed("Response contained no message output."));
        ProviderCommandError::new(
            ProviderErrorKind::ResponseFormat,
            "No output text was found in the provider response.",
            false,
        )
        .with_details(details)
    })?;

    Ok(AssistantReply {
        content,
        provider: provider.name,
        model: provider.model,
    })
}

#[tauri::command]
async fn test_provider(provider: ProviderConfig) -> ProviderCommandResult<ProviderHealth> {
    let result = match validate_provider(&provider) {
        Ok(()) => {
            call_provider(
                "Reply exactly with: PilotBell provider test OK",
                provider.clone(),
            )
            .await
        }
        Err(error) => Err(error),
    };

    match result {
        Ok(_) => ProviderCommandResult::Success {
            data: ProviderHealth {
                message: format!(
                    "Provider test succeeded for {} / {}.",
                    provider.name, provider.model
                ),
            },
        },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[tauri::command]
async fn handle_prompt(
    prompt: String,
    provider: ProviderConfig,
) -> ProviderCommandResult<AssistantReply> {
    let result = match validate_provider(&provider) {
        Ok(()) => call_provider(&prompt, provider).await,
        Err(error) => Err(error),
    };

    match result {
        Ok(reply) => ProviderCommandResult::Success { data: reply },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![handle_prompt, test_provider])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
