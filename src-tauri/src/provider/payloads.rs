use super::types::ProviderConfig;
use reqwest::Url;
use serde_json::{json, Value};

pub(super) fn build_openai_responses_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    json!({
        "model": provider.model,
        "input": prompt,
    })
}

pub(super) fn build_anthropic_messages_payload(provider: &ProviderConfig, prompt: &str) -> Value {
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

pub(super) fn build_ollama_generate_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    json!({
        "model": provider.model,
        "prompt": prompt,
        "stream": false,
    })
}

pub(super) fn build_ollama_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    if endpoint_uses_chat_completions(&provider.endpoint) {
        build_ollama_chat_completions_payload(provider, prompt)
    } else {
        build_ollama_generate_payload(provider, prompt)
    }
}

fn build_ollama_chat_completions_payload(provider: &ProviderConfig, prompt: &str) -> Value {
    json!({
        "model": provider.model,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
        "stream": false,
        "reasoning_effort": "none",
    })
}

pub(super) fn build_llama_cpp_chat_payload(provider: &ProviderConfig, prompt: &str) -> Value {
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

fn endpoint_uses_chat_completions(endpoint: &str) -> bool {
    Url::parse(endpoint.trim())
        .map(|url| {
            url.path()
                .trim_end_matches('/')
                .eq_ignore_ascii_case("/v1/chat/completions")
        })
        .unwrap_or(false)
}
