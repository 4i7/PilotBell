use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
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

fn validate_provider(provider: &ProviderConfig) -> Result<(), String> {
    if provider.name.trim().is_empty()
        || provider.endpoint.trim().is_empty()
        || provider.api_key.trim().is_empty()
        || provider.model.trim().is_empty()
    {
        return Err("Provider settings are incomplete.".into());
    }

    if !provider.endpoint.starts_with("https://") {
        return Err("Provider endpoint must start with https://".into());
    }

    Ok(())
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

async fn call_provider(prompt: &str, provider: ProviderConfig) -> Result<AssistantReply, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is empty.".into());
    }

    let payload = json!({
        "model": provider.model,
        "input": prompt,
    });

    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?
        .post(&provider.endpoint)
        .header(CONTENT_TYPE, "application/json")
        .header(AUTHORIZATION, format!("Bearer {}", provider.api_key))
        .json(&payload)
        .send()
        .await
        .map_err(|error| format!("Network error: {error}"))?;

    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|error| format!("Failed to read response: {error}"))?;

    let parsed: ResponseEnvelope =
        serde_json::from_str(&raw).map_err(|_| format!("Unexpected provider response: {raw}"))?;

    if !status.is_success() {
        if let Some(message) = parsed.error.and_then(|error| error.message) {
            return Err(format!("Provider error ({status}): {message}"));
        }
        return Err(format!("Provider error ({status}): {raw}"));
    }

    let content = extract_output_text(&parsed)
        .ok_or_else(|| format!("No output text found in provider response: {raw}"))?;

    Ok(AssistantReply {
        content,
        provider: provider.name,
        model: provider.model,
    })
}

#[tauri::command]
async fn test_provider(provider: ProviderConfig) -> Result<String, String> {
    validate_provider(&provider)?;
    call_provider(
        "Reply exactly with: PilotBell provider test OK",
        provider.clone(),
    )
    .await?;
    Ok(format!(
        "Provider test succeeded for {} / {}.",
        provider.name, provider.model
    ))
}

#[tauri::command]
async fn handle_prompt(prompt: String, provider: ProviderConfig) -> Result<AssistantReply, String> {
    validate_provider(&provider)?;
    call_provider(&prompt, provider).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![handle_prompt, test_provider])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
