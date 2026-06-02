use super::types::ProviderConfig;
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
