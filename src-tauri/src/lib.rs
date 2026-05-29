mod document;

use document::workflow::{
    cancel_document_job as cancel_document_job_impl,
    start_document_workflow as start_document_workflow_impl, DocumentJobState,
};
use document::{DocumentJobMetadata, DocumentWorkflowRequest, DocumentWorkflowResult};
use keyring::{Entry, Error as KeyringError};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::borrow::Cow;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const PROVIDER_SECRET_SERVICE: &str = "io.github.fouri7.pilotbell.provider";
const OPENAI_RESPONSES_KIND: &str = "openai-responses";
const ANTHROPIC_MESSAGES_KIND: &str = "anthropic-messages";
const OLLAMA_KIND: &str = "ollama";
const LLAMA_CPP_KIND: &str = "llama-cpp";
const OPENAI_RESPONSES_ENDPOINT: &str = "https://api.openai.com/v1/responses";
const ANTHROPIC_MESSAGES_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION_HEADER: &str = "2023-06-01";
const PRIMARY_SHORTCUT_LABEL: &str = "Alt+Space";
const FALLBACK_SHORTCUT_LABEL: &str = "Ctrl+Shift+Space";
const FOCUS_PROMPT_EVENT: &str = "pilotbell://focus-prompt";

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
    #[serde(default)]
    advanced_endpoint: bool,
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

#[derive(Clone, Copy)]
enum ProviderKind {
    OpenAiResponses,
    AnthropicMessages,
    Ollama,
    LlamaCpp,
}

#[derive(Debug)]
struct ProviderAdapter {
    healthcheck_prompt: &'static str,
    requires_secret: bool,
    validate: fn(&ProviderConfig) -> Result<(), ProviderCommandError>,
    build_payload: fn(&ProviderConfig, &str) -> Value,
    prepare_request: fn(reqwest::RequestBuilder, Option<&str>) -> reqwest::RequestBuilder,
    parse_response: fn(&str, Value) -> Result<String, ProviderCommandError>,
}

#[derive(Default)]
struct AppShellState(Mutex<AppShellStateSnapshot>);

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppShellStateSnapshot {
    active_shortcut: String,
    used_fallback_shortcut: bool,
    global_shortcut_registered: bool,
    message: Option<String>,
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Serialize)]
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
#[serde(rename_all = "camelCase")]
struct ProviderSecretDiagnosis {
    provider_id: String,
    has_secret: bool,
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
        ANTHROPIC_MESSAGES_KIND => Ok(ProviderKind::AnthropicMessages),
        OLLAMA_KIND => Ok(ProviderKind::Ollama),
        LLAMA_CPP_KIND => Ok(ProviderKind::LlamaCpp),
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
            requires_secret: true,
            validate: validate_openai_responses_provider,
            build_payload: build_openai_responses_payload,
            prepare_request: prepare_bearer_request,
            parse_response: parse_openai_responses_output,
        },
        ProviderKind::AnthropicMessages => ProviderAdapter {
            healthcheck_prompt: "Reply exactly with: PilotBell provider test OK",
            requires_secret: true,
            validate: validate_anthropic_messages_provider,
            build_payload: build_anthropic_messages_payload,
            prepare_request: prepare_anthropic_request,
            parse_response: parse_anthropic_messages_output,
        },
        ProviderKind::Ollama => ProviderAdapter {
            healthcheck_prompt: "Reply exactly with: PilotBell provider test OK",
            requires_secret: false,
            validate: validate_ollama_provider,
            build_payload: build_ollama_generate_payload,
            prepare_request: prepare_local_request,
            parse_response: parse_ollama_generate_output,
        },
        ProviderKind::LlamaCpp => ProviderAdapter {
            healthcheck_prompt: "Reply exactly with: PilotBell provider test OK",
            requires_secret: false,
            validate: validate_llama_cpp_provider,
            build_payload: build_llama_cpp_chat_payload,
            prepare_request: prepare_local_request,
            parse_response: parse_llama_cpp_chat_output,
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

    let adapter = provider_adapter(parse_provider_kind(&provider.kind)?);

    if adapter.requires_secret && !provider.has_secret {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider secret is missing. Re-enter the API key and save the provider again.",
            false,
        ));
    }

    (adapter.validate)(provider)?;
    Ok(adapter)
}

fn validate_openai_responses_provider(
    provider: &ProviderConfig,
) -> Result<(), ProviderCommandError> {
    validate_hosted_endpoint(provider, OPENAI_RESPONSES_ENDPOINT, "OpenAI Responses")
}

fn validate_anthropic_messages_provider(
    provider: &ProviderConfig,
) -> Result<(), ProviderCommandError> {
    validate_hosted_endpoint(provider, ANTHROPIC_MESSAGES_ENDPOINT, "Anthropic Messages")
}

fn validate_ollama_provider(provider: &ProviderConfig) -> Result<(), ProviderCommandError> {
    validate_local_endpoint(provider, "Ollama")
}

fn validate_llama_cpp_provider(provider: &ProviderConfig) -> Result<(), ProviderCommandError> {
    validate_local_endpoint(provider, "llama.cpp")
}

fn parse_endpoint(endpoint: &str) -> Result<Url, ProviderCommandError> {
    Url::parse(endpoint.trim()).map_err(|error| {
        ProviderCommandError::new(
            ProviderErrorKind::Validation,
            format!("Provider endpoint is not a valid URL: {error}"),
            false,
        )
    })
}

fn normalized_endpoint(endpoint: &str) -> String {
    endpoint.trim().trim_end_matches('/').to_ascii_lowercase()
}

fn validate_hosted_endpoint(
    provider: &ProviderConfig,
    official_endpoint: &str,
    label: &str,
) -> Result<(), ProviderCommandError> {
    let parsed = parse_endpoint(&provider.endpoint)?;
    if parsed.scheme() != "https" {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            format!("{label} endpoint must use https://."),
            false,
        ));
    }

    if normalized_endpoint(&provider.endpoint) == normalized_endpoint(official_endpoint) {
        return Ok(());
    }

    if !provider.advanced_endpoint {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            format!("{label} custom endpoints require advanced mode because cloud API keys would be sent to a non-standard URL."),
            false,
        ));
    }

    Ok(())
}

fn validate_local_endpoint(
    provider: &ProviderConfig,
    label: &str,
) -> Result<(), ProviderCommandError> {
    let parsed = parse_endpoint(&provider.endpoint)?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            format!("{label} endpoint must start with http:// or https://."),
            false,
        ));
    }

    if is_loopback_endpoint(&parsed) {
        return Ok(());
    }

    if !provider.advanced_endpoint {
        return Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            format!("{label} LAN or external endpoints require advanced mode."),
            false,
        ));
    }

    Ok(())
}

fn is_loopback_endpoint(url: &Url) -> bool {
    matches!(
        url.host_str()
            .map(|host| host.to_ascii_lowercase())
            .as_deref(),
        Some("localhost") | Some("127.0.0.1") | Some("::1") | Some("[::1]")
    )
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

fn build_anthropic_messages_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    json!({
        "model": provider.model,
        "max_tokens": 1024,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    })
}

fn build_ollama_generate_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    json!({
        "model": provider.model,
        "prompt": prompt,
        "stream": false,
    })
}

fn build_llama_cpp_chat_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    json!({
        "model": provider.model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "stream": false,
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

fn parse_openai_responses_output(raw: &str, parsed: Value) -> Result<String, ProviderCommandError> {
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

fn parse_anthropic_messages_output(
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

fn parse_ollama_generate_output(raw: &str, parsed: Value) -> Result<String, ProviderCommandError> {
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

fn parse_llama_cpp_chat_output(raw: &str, parsed: Value) -> Result<String, ProviderCommandError> {
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

fn prepare_bearer_request(
    request: reqwest::RequestBuilder,
    api_key: Option<&str>,
) -> reqwest::RequestBuilder {
    if let Some(api_key) = api_key {
        request.header(AUTHORIZATION, format!("Bearer {api_key}"))
    } else {
        request
    }
}

fn prepare_anthropic_request(
    request: reqwest::RequestBuilder,
    api_key: Option<&str>,
) -> reqwest::RequestBuilder {
    let request = request.header("anthropic-version", ANTHROPIC_VERSION_HEADER);
    if let Some(api_key) = api_key {
        request.header("x-api-key", api_key)
    } else {
        request
    }
}

fn prepare_local_request(
    request: reqwest::RequestBuilder,
    _api_key: Option<&str>,
) -> reqwest::RequestBuilder {
    request
}

fn provider_error_message(parsed: &Value) -> Option<String> {
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
    let api_key = if adapter.requires_secret {
        Some(read_provider_secret(&provider.id)?)
    } else {
        None
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| {
            ProviderCommandError::new(
                ProviderErrorKind::Internal,
                format!("Failed to create HTTP client: {error}"),
                false,
            )
        })?;

    let mut request = client
        .post(&provider.endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload);

    request = (adapter.prepare_request)(request, api_key.as_deref());

    let response = request.send().await.map_err(|error| {
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

    let parsed = serde_json::from_str::<Value>(&raw);

    if !status.is_success() {
        let retryable =
            status.is_server_error() || status.as_u16() == 408 || status.as_u16() == 429;
        let details = preview_text(&raw);

        if let Ok(parsed) = parsed.as_ref() {
            if let Some(message) = provider_error_message(parsed) {
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

fn update_shell_state(
    state: &State<'_, AppShellState>,
    updater: impl FnOnce(&mut AppShellStateSnapshot),
) {
    if let Ok(mut current) = state.0.lock() {
        updater(&mut current);
    }
}

fn toggle_main_window<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable.".to_string())?;
    let visible = window.is_visible().map_err(|error| error.to_string())?;

    if visible {
        hide_main_window_impl(app, &window)?;
    } else {
        show_main_window_impl(app, &window)?;
    }

    Ok(())
}

fn hide_main_window_impl<R: tauri::Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    let _ = app.save_window_state(StateFlags::all());
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window.hide().map_err(|error| error.to_string())
}

fn show_main_window_impl<R: tauri::Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    app.emit_to("main", FOCUS_PROMPT_EVENT, ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_app_shell_state(state: State<'_, AppShellState>) -> AppShellStateSnapshot {
    state
        .0
        .lock()
        .map(|snapshot| snapshot.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn hide_palette_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable.".to_string())?;
    hide_main_window_impl(&app, &window)
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
async fn diagnose_provider_secret(
    provider_id: String,
) -> ProviderCommandResult<ProviderSecretDiagnosis> {
    let trimmed = provider_id.trim();
    let result = if trimmed.is_empty() {
        Err(ProviderCommandError::new(
            ProviderErrorKind::Validation,
            "Provider id is missing.",
            false,
        ))
    } else {
        match provider_secret_entry(trimmed) {
            Ok(entry) => match entry.get_password() {
                Ok(secret) if !secret.trim().is_empty() => Ok(ProviderSecretDiagnosis {
                    provider_id: trimmed.into(),
                    has_secret: true,
                    message: "Provider secret exists in the OS credential store.".into(),
                }),
                Ok(_) | Err(KeyringError::NoEntry) => Ok(ProviderSecretDiagnosis {
                    provider_id: trimmed.into(),
                    has_secret: false,
                    message: "Provider metadata exists, but no secret was found in the OS credential store.".into(),
                }),
                Err(error) => Err(ProviderCommandError::new(
                    ProviderErrorKind::SecretStore,
                    format!("Failed to diagnose provider secret: {error}"),
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
async fn start_document_workflow(
    app: AppHandle,
    state: State<'_, DocumentJobState>,
    request: DocumentWorkflowRequest,
) -> Result<DocumentWorkflowResult, String> {
    start_document_workflow_impl(app, state, request).await
}

#[tauri::command]
fn cancel_document_job(
    state: State<'_, DocumentJobState>,
    job_id: String,
) -> Result<DocumentJobMetadata, String> {
    cancel_document_job_impl(state, job_id)
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
    let primary_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let fallback_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .manage(AppShellState::default())
        .manage(DocumentJobState::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler({
                    move |app, shortcut, event| {
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }

                        if shortcut == &primary_shortcut || shortcut == &fallback_shortcut {
                            let _ = toggle_main_window(app);
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let state = app.state::<AppShellState>();
            let registration_result = app.global_shortcut().register(primary_shortcut);

            match registration_result {
                Ok(()) => update_shell_state(&state, |snapshot| {
                    snapshot.active_shortcut = PRIMARY_SHORTCUT_LABEL.into();
                    snapshot.used_fallback_shortcut = false;
                    snapshot.global_shortcut_registered = true;
                    snapshot.message =
                        Some("Global shortcut ready. Use Alt+Space to toggle PilotBell.".into());
                }),
                Err(primary_error) => {
                    if let Err(fallback_error) =
                        app.global_shortcut().register(fallback_shortcut)
                    {
                        update_shell_state(&state, |snapshot| {
                            snapshot.active_shortcut = PRIMARY_SHORTCUT_LABEL.into();
                            snapshot.used_fallback_shortcut = false;
                            snapshot.global_shortcut_registered = false;
                            snapshot.message = Some(format!(
                                "Global shortcut registration failed. Alt+Space error: {primary_error}. Fallback error: {fallback_error}."
                            ));
                        });
                    } else {
                        update_shell_state(&state, |snapshot| {
                            snapshot.active_shortcut = FALLBACK_SHORTCUT_LABEL.into();
                            snapshot.used_fallback_shortcut = true;
                            snapshot.global_shortcut_registered = true;
                            snapshot.message = Some(format!(
                                "Alt+Space was unavailable. PilotBell is using Ctrl+Shift+Space instead. Original error: {primary_error}."
                            ));
                        });
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cancel_document_job,
            delete_provider_secret,
            diagnose_provider_secret,
            get_app_shell_state,
            handle_prompt,
            hide_palette_window,
            start_document_workflow,
            store_provider_secret,
            test_provider
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_provider() -> ProviderConfig {
        ProviderConfig {
            id: "provider-1".into(),
            kind: OPENAI_RESPONSES_KIND.into(),
            name: "OpenAI".into(),
            endpoint: "https://api.openai.com/v1/responses".into(),
            model: "gpt-4.1-mini".into(),
            has_secret: true,
            advanced_endpoint: false,
        }
    }

    fn sample_ollama_provider() -> ProviderConfig {
        ProviderConfig {
            id: "provider-local".into(),
            kind: OLLAMA_KIND.into(),
            name: "Ollama".into(),
            endpoint: "http://127.0.0.1:11434/api/generate".into(),
            model: "llama3.2".into(),
            has_secret: false,
            advanced_endpoint: false,
        }
    }

    fn sample_anthropic_provider() -> ProviderConfig {
        ProviderConfig {
            id: "provider-anthropic".into(),
            kind: ANTHROPIC_MESSAGES_KIND.into(),
            name: "Anthropic".into(),
            endpoint: "https://api.anthropic.com/v1/messages".into(),
            model: "claude-sonnet-4-20250514".into(),
            has_secret: true,
            advanced_endpoint: false,
        }
    }

    fn sample_llama_cpp_provider() -> ProviderConfig {
        ProviderConfig {
            id: "provider-llama".into(),
            kind: LLAMA_CPP_KIND.into(),
            name: "llama.cpp".into(),
            endpoint: "http://127.0.0.1:8080/v1/chat/completions".into(),
            model: "local-llama".into(),
            has_secret: false,
            advanced_endpoint: false,
        }
    }

    #[test]
    fn validate_provider_accepts_openai_responses_shape() {
        assert!(validate_provider(&sample_provider()).is_ok());
    }

    #[test]
    fn validate_provider_rejects_missing_secret() {
        let mut provider = sample_provider();
        provider.has_secret = false;

        let error = validate_provider(&provider).expect_err("provider without secret should fail");
        assert!(matches!(error.kind, ProviderErrorKind::Validation));
        assert!(error.message.contains("Provider secret is missing"));
    }

    #[test]
    fn validate_provider_rejects_non_https_endpoint() {
        let mut provider = sample_provider();
        provider.endpoint = "http://localhost:11434/api/generate".into();

        let error = validate_provider(&provider).expect_err("http endpoint should fail");
        assert!(matches!(error.kind, ProviderErrorKind::Validation));
        assert!(error.message.contains("https://"));
    }

    #[test]
    fn validate_provider_rejects_custom_hosted_endpoint_without_advanced_mode() {
        let mut provider = sample_provider();
        provider.endpoint = "https://proxy.example.com/v1/responses".into();

        let error = validate_provider(&provider).expect_err("custom hosted endpoint should fail");
        assert!(matches!(error.kind, ProviderErrorKind::Validation));
        assert!(error.message.contains("advanced mode"));
    }

    #[test]
    fn validate_provider_accepts_custom_hosted_endpoint_with_advanced_mode() {
        let mut provider = sample_provider();
        provider.endpoint = "https://proxy.example.com/v1/responses".into();
        provider.advanced_endpoint = true;

        assert!(validate_provider(&provider).is_ok());
    }

    #[test]
    fn validate_provider_accepts_ollama_without_secret() {
        assert!(validate_provider(&sample_ollama_provider()).is_ok());
    }

    #[test]
    fn validate_provider_rejects_external_local_endpoint_without_advanced_mode() {
        let mut provider = sample_ollama_provider();
        provider.endpoint = "http://192.168.1.20:11434/api/generate".into();

        let error =
            validate_provider(&provider).expect_err("LAN endpoint should require advanced mode");
        assert!(matches!(error.kind, ProviderErrorKind::Validation));
        assert!(error.message.contains("advanced mode"));
    }

    #[test]
    fn validate_provider_accepts_anthropic_with_secret() {
        assert!(validate_provider(&sample_anthropic_provider()).is_ok());
    }

    #[test]
    fn validate_provider_accepts_llama_cpp_without_secret() {
        assert!(validate_provider(&sample_llama_cpp_provider()).is_ok());
    }

    #[test]
    fn build_ollama_payload_disables_streaming() {
        let provider = sample_ollama_provider();
        let payload = build_ollama_generate_payload(&provider, "hello");

        assert_eq!(payload["model"], "llama3.2");
        assert_eq!(payload["prompt"], "hello");
        assert_eq!(payload["stream"], false);
    }

    #[test]
    fn build_openai_payload_uses_model_and_input() {
        let provider = sample_provider();
        let payload = build_openai_responses_payload(&provider, "hello");

        assert_eq!(payload["model"], "gpt-4.1-mini");
        assert_eq!(payload["input"], "hello");
    }

    #[test]
    fn build_anthropic_payload_uses_messages_shape() {
        let provider = sample_anthropic_provider();
        let payload = build_anthropic_messages_payload(&provider, "hello");

        assert_eq!(payload["model"], "claude-sonnet-4-20250514");
        assert_eq!(payload["messages"][0]["role"], "user");
        assert_eq!(payload["messages"][0]["content"], "hello");
        assert_eq!(payload["max_tokens"], 1024);
    }

    #[test]
    fn build_llama_cpp_payload_uses_chat_completions_shape() {
        let provider = sample_llama_cpp_provider();
        let payload = build_llama_cpp_chat_payload(&provider, "hello");

        assert_eq!(payload["model"], "local-llama");
        assert_eq!(payload["messages"][0]["role"], "user");
        assert_eq!(payload["messages"][0]["content"], "hello");
        assert_eq!(payload["stream"], false);
    }

    #[test]
    fn parse_openai_response_extracts_output_text() {
        let raw = r#"{
            "output": [
                {
                    "type": "message",
                    "content": [
                        { "type": "output_text", "text": "first" },
                        { "type": "output_text", "text": "second" }
                    ]
                }
            ]
        }"#;

        let parsed: Value = serde_json::from_str(raw).expect("response should parse");
        let text =
            parse_openai_responses_output(raw, parsed).expect("output text should be extracted");

        assert_eq!(text, "first\n\nsecond");
    }

    #[test]
    fn parse_openai_response_returns_structured_error_when_output_missing() {
        let raw = r#"{
            "output": [
                {
                    "type": "message",
                    "content": [
                        { "type": "input_text", "text": "ignored" }
                    ]
                }
            ]
        }"#;

        let parsed: Value = serde_json::from_str(raw).expect("response should parse");
        let error = parse_openai_responses_output(raw, parsed)
            .expect_err("missing output_text should return a structured error");

        assert!(matches!(error.kind, ProviderErrorKind::ResponseFormat));
        assert!(error.message.contains("No output text"));
        assert!(error.details.is_some());
    }

    #[test]
    fn parse_anthropic_response_extracts_text_content() {
        let raw = r#"{
            "content": [
                { "type": "text", "text": "first" },
                { "type": "text", "text": "second" }
            ]
        }"#;

        let parsed: Value = serde_json::from_str(raw).expect("response should parse");
        let text =
            parse_anthropic_messages_output(raw, parsed).expect("text content should be extracted");

        assert_eq!(text, "first\n\nsecond");
    }

    #[test]
    fn parse_ollama_response_extracts_generated_text() {
        let raw = r#"{ "model": "llama3.2", "response": "local answer", "done": true }"#;
        let parsed: Value = serde_json::from_str(raw).expect("response should parse");
        let text =
            parse_ollama_generate_output(raw, parsed).expect("generated text should be extracted");

        assert_eq!(text, "local answer");
    }

    #[test]
    fn parse_llama_cpp_response_extracts_generated_text() {
        let raw = r#"{
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "local answer"
                    }
                }
            ]
        }"#;
        let parsed: Value = serde_json::from_str(raw).expect("response should parse");
        let text =
            parse_llama_cpp_chat_output(raw, parsed).expect("generated text should be extracted");

        assert_eq!(text, "local answer");
    }
}
