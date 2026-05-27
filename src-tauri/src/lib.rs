use serde::Serialize;

#[derive(Serialize)]
struct AssistantReply {
    content: String,
    provider: String,
    model: String,
}

#[tauri::command]
fn handle_prompt(prompt: String) -> Result<AssistantReply, String> {
    let prompt = prompt.trim();

    if prompt.is_empty() {
        return Err("Prompt is empty.".into());
    }

    Ok(AssistantReply {
        content: format!(
            "PilotBell mock response:\n\nI received your prompt:\n\"{}\"\n\nPhase 1 is wired through a Rust Tauri command. Next we can swap this mock provider for OpenAI, Anthropic, Ollama, llama.cpp, or a local KB search pipeline.",
            prompt
        ),
        provider: "mock".into(),
        model: "pilotbell-phase1".into(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![handle_prompt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
