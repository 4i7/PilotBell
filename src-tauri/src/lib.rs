mod document;
mod provider;
mod shell;

use document::workflow::{
    cancel_document_job as cancel_document_job_impl,
    start_document_workflow as start_document_workflow_impl, DocumentJobState,
};
use document::{DocumentJobMetadata, DocumentWorkflowRequest, DocumentWorkflowResult};
use provider::{
    delete_provider_secret, diagnose_provider_secret, handle_prompt, store_provider_secret,
    test_provider,
};
use shell::{
    get_app_shell_state, hide_palette_window, open_settings_window, toggle_main_window,
    update_shell_state, AppShellState, FALLBACK_SHORTCUT_LABEL, PRIMARY_SHORTCUT_LABEL,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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
            open_settings_window,
            start_document_workflow,
            store_provider_secret,
            test_provider
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
