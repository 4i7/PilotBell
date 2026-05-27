use keyring::{Entry, Error as KeyringError};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::borrow::Cow;
use std::time::Duration;

const PROVIDER_SECRET_SERVICE: &str = "io.github.fouri7.pilotbell.provider";
const OPENAI_RESPONSES_KIND: &str = "openai-responses";

#[derive(Serialize)]
struct AssistantReply {
    content: String,
    provider: String,
    model: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderConfig {
    id: String,
    kind: String,
    name: String,
    endpoint: String,
    model: String,
    has_secret: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderSecretInput {
    provider_id: String,
    api_key: String,
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

#[derive(Clone, Copy)]
enum ProviderKind {
    OpenAiResponses,
}

struct ProviderAdapter {
    healthcheck_prompt: &'static str,
    validate: fn(&ProviderConfig) -> Result<(), ProviderCommandError>,
    build_payload: fn(&ProviderConfig, &str) -> Value,
    parse_response: fn(&str, ResponseEnvelope) -> Result<String, ProviderCommandError>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum ProviderErrorKind {
    Validation,
    SecretStore,
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
#[serde(rename_all = "camelCase")]
struct ProviderSecretStatus {
    provider_id: String,
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

fn parse_provider_kind(kind: &str) -> Result<ProviderKind, ProviderCommandError> {
    match kind.trim() {
        OPENAI_RESPONSES_KIND => Ok(ProviderKind::OpenAiResponses),
        "" => Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider type is missing.",
            false,
        )),
        other => Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            format!("Unsupported provider type: {other}"),
            false,
        )),
    }
}

fn provider_adapter(kind: ProviderKind) -> ProviderAdapter {
    match kind {
        ProviderKind::OpenAiResponses => ProviderAdapter {
            healthcheck_prompt: "Reply exactly with: PilotBell provider test OK",
            validate: validate_openai_responses_provider,
            build_payload: build_openai_responses_payload,
            parse_response: parse_openai_responses_output,
        },
    }
}

fn validate_provider(provider: &ProviderConfig) -> Result<ProviderAdapter, ProviderCommandError> {
    if provider.id.trim().is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider id is missing.",
            false,
        ));
    }

    if provider.name.trim().is_empty()
        || provider.endpoint.trim().is_empty()
        || provider.model.trim().is_empty()
    {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider settings are incomplete.",
            false,
        ));
    }

    if !provider.has_secret {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider secret is missing. Re-enter the API key and save the provider again.",
            false,
        ));
    }

    let adapter = provider_adapter(parse_provider_kind(&provider.kind)?);
    (adapter.validate)(provider)?;
    Ok(adapter)
}

fn validate_openai_responses_provider(
    provider: &ProviderConfig,
) -> Result<(), ProviderCommandError> {
    if !provider.endpoint.starts_with("https://") {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider endpoint must start with https://",
            false,
        ));
    }

    Ok(())
}

fn validate_secret_input(input: &ProviderSecretInput) -> Result<(), ProviderCommandError> {
    if input.provider_id.trim().is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider id is missing.",
            false,
        ));
    }

    if input.api_key.trim().is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "API key is required.",
            false,
        ));
    }

    Ok(())
}

fn provider_secret_entry(provider_id: &str) -> Result<Entry, ProviderCommandError> {
    Entry::new(PROVIDER_SECRET_SERVICE, provider_id).map_err(|error| {
        ProviderCommandError::new(
            ProviderErrorKind::SecretStore,
            format!("Failed to access the OS credential store: {error}"),
            false,
        )
    })
}

fn read_provider_secret(provider_id: &str) -> Result<String, ProviderCommandError> {
    provider_secret_entry(provider_id)?
        .get_password()
        .map_err(|error| match error {
            KeyringError::NoEntry => ProviderCommandError::new(
                ProviderErrorKind::Validation,
                "Provider secret is missing. Re-enter the API key and save the provider again.",
                false,
            ),
            other => ProviderCommandError::new(
                ProviderErrorKind::SecretStore,
                format!("Failed to read provider secret: {other}"),
                false,
            ),
        })
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

fn build_openai_responses_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    json!({
        "model": provider.model,
        "input": prompt,
    })
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

fn parse_openai_responses_output(
    raw: &str,
    parsed: ResponseEnvelope,
) -> Result<String, ProviderCommandError> {
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

async fn call_provider(
    prompt: &str,
    provider: ProviderConfig,
    adapter: ProviderAdapter,
) -> Result<AssistantReply, ProviderCommandError> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Prompt is empty.",
            false,
        ));
    }

    let payload = (adapter.build_payload)(&provider, prompt);
    let api_key = read_provider_secret(&provider.id)?;

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
        .header(AUTHORIZATION, format!("Bearer {api_key}"))
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

    let content = (adapter.parse_response)(&raw, parsed)?;

    Ok(AssistantReply {
        content,
        provider: provider.name,
        model: provider.model,
    })
}

#[tauri::command]
async fn store_provider_secret(
    input: ProviderSecretInput,
) -> ProviderCommandResult<ProviderSecretStatus> {
    let result = validate_secret_input(&input).and_then(|_| {
        provider_secret_entry(&input.provider_id)?
            .set_password(input.api_key.trim())
            .map_err(|error| {
                ProviderCommandError::new(
                    ProviderErrorKind::SecretStore,
                    format!("Failed to store provider secret: {error}"),
                    false,
                )
            })?;

        Ok(ProviderSecretStatus {
            provider_id: input.provider_id.clone(),
            message: "Provider secret saved to the OS credential store.".into(),
        })
    });

    match result {
        Ok(status) => ProviderCommandResult::Success { data: status },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[tauri::command]
async fn delete_provider_secret(
    provider_id: String,
) -> ProviderCommandResult<ProviderSecretStatus> {
    let trimmed = provider_id.trim();
    let result = if trimmed.is_empty() {
        Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider id is missing.",
            false,
        ))
    } else {
        match provider_secret_entry(trimmed) {
            Ok(entry) => match entry.delete_credential() {
                Ok(()) | Err(KeyringError::NoEntry) => Ok(ProviderSecretStatus {
                    provider_id,
                    message: "Provider secret removed from the OS credential store.".into(),
                }),
                Err(error) => Err(ProviderCommandError::new(
                    ProviderErrorKind::SecretStore,
                    format!("Failed to remove provider secret: {error}"),
                    false,
                )),
            },
            Err(error) => Err(error),
        }
    };

    match result {
        Ok(status) => ProviderCommandResult::Success { data: status },
        Err(error) => ProviderCommandResult::Error { error },
    }
}

#[tauri::command]
async fn test_provider(provider: ProviderConfig) -> ProviderCommandResult<ProviderHealth> {
    let result = match validate_provider(&provider) {
        Ok(adapter) => call_provider(adapter.healthcheck_prompt, provider.clone(), adapter).await,
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
        Ok(adapter) => call_provider(&prompt, provider, adapter).await,
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
        .invoke_handler(tauri::generate_handler![
            delete_provider_secret,
            handle_prompt,
            store_provider_secret,
            test_provider
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
