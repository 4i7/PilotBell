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
    let text = parse_openai_responses_output(raw, parsed).expect("output text should be extracted");

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
