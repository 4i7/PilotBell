use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;

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
    output_text: Option<String>,
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

async fn call_provider(prompt: &str, provider: ProviderConfig) -> Result<AssistantReply, String> {
    let payload = json!({"model": provider.model, "input": prompt});

    let response = reqwest::Client::new()
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

    if !status.is_success() {
        return Err(format!("Provider error ({status}): {raw}"));
    }

    let parsed: ResponseEnvelope =
        serde_json::from_str(&raw).map_err(|_| format!("Unexpected provider response: {raw}"))?;

    let content = parsed
        .output_text
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| format!("No output_text in provider response: {raw}"))?;

    Ok(AssistantReply {
        content,
        provider: provider.name,
        model: provider.model,
    })
}

#[tauri::command]
async fn test_provider(provider: ProviderConfig) -> Result<String, String> {
    validate_provider(&provider)?;
    call_provider("Reply exactly with: PilotBell provider test OK", provider).await?;
    Ok("Provider test succeeded. You can now send prompts.".into())
}

#[tauri::command]
async fn handle_prompt(prompt: String, provider: ProviderConfig) -> Result<AssistantReply, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is empty.".into());
    }

    validate_provider(&provider)?;
    call_provider(prompt, provider).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![handle_prompt, test_provider])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
