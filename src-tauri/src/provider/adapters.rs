use super::payloads::{
    build_anthropic_messages_payload, build_llama_cpp_chat_payload, build_ollama_payload,
    build_openai_responses_payload,
};
use super::responses::{
    parse_anthropic_messages_output, parse_llama_cpp_chat_output, parse_ollama_output,
    parse_openai_responses_output, preview_text, provider_error_message,
};
use super::secrets::read_provider_secret;
use super::types::{AssistantReply, ProviderCommandError, ProviderConfig, ProviderErrorKind};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::Url;
use serde_json::Value;
use std::borrow::Cow;
use std::time::Duration;

const OPENAI_RESPONSES_KIND: &str = "openai-responses";
const ANTHROPIC_MESSAGES_KIND: &str = "anthropic-messages";
const OLLAMA_KIND: &str = "ollama";
const LLAMA_CPP_KIND: &str = "llama-cpp";
const OPENAI_RESPONSES_ENDPOINT: &str = "https://api.openai.com/v1/responses";
const ANTHROPIC_MESSAGES_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION_HEADER: &str = "2023-06-01";

#[derive(Clone, Copy)]
enum ProviderKind {
    OpenAiResponses,
    AnthropicMessages,
    Ollama,
    LlamaCpp,
}

#[derive(Debug)]
pub(super) struct ProviderAdapter {
    pub(super) healthcheck_prompt: &'static str,
    requires_secret: bool,
    validate: fn(&ProviderConfig) -> Result<(), ProviderCommandError>,
    build_payload: fn(&ProviderConfig, &str) -> Value,
    prepare_request: fn(reqwest::RequestBuilder, Option<&str>) -> reqwest::RequestBuilder,
    parse_response: fn(&str, Value) -> Result<String, ProviderCommandError>,
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
            build_payload: build_ollama_payload,
            prepare_request: prepare_local_request,
            parse_response: parse_ollama_output,
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

pub(super) fn validate_provider(
    provider: &ProviderConfig,
) -> Result<ProviderAdapter, ProviderCommandError> {
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

pub(super) async fn call_provider(
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

#[cfg(test)]
#[path = "adapters_tests.rs"]
mod tests;
