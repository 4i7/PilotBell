use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

pub(crate) const PRIMARY_SHORTCUT_LABEL: &str = "Alt+Space";
pub(crate) const FALLBACK_SHORTCUT_LABEL: &str = "Ctrl+Shift+Space";
const FOCUS_PROMPT_EVENT: &str = "pilotbell://focus-prompt";
const SETTINGS_SECTION_EVENT: &str = "pilotbell://settings-section";

#[derive(Default)]
pub(crate) struct AppShellState(Mutex<AppShellStateSnapshot>);

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppShellStateSnapshot {
    pub(crate) active_shortcut: String,
    pub(crate) used_fallback_shortcut: bool,
    pub(crate) global_shortcut_registered: bool,
    pub(crate) message: Option<String>,
}

pub(crate) fn update_shell_state(
    state: &State<'_, AppShellState>,
    updater: impl FnOnce(&mut AppShellStateSnapshot),
) {
    if let Ok(mut current) = state.0.lock() {
        updater(&mut current);
    }
}

pub(crate) fn toggle_main_window<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String> {
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
pub(crate) fn get_app_shell_state(state: State<'_, AppShellState>) -> AppShellStateSnapshot {
    state
        .0
        .lock()
        .map(|snapshot| snapshot.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub(crate) fn hide_palette_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is unavailable.".to_string())?;
    hide_main_window_impl(&app, &window)
}

fn normalize_settings_section(section: Option<String>) -> String {
    match section.as_deref() {
        Some("documents") => "documents".into(),
        Some("sources") => "sources".into(),
        _ => "providers".into(),
    }
}

#[tauri::command]
pub(crate) fn open_settings_window(app: AppHandle, section: Option<String>) -> Result<(), String> {
    let section = normalize_settings_section(section);

    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        app.emit_to("settings", SETTINGS_SECTION_EVENT, &section)
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    // Keep the secondary window state in the fragment so the app shell asset path stays
    // `index.html` in packaged builds while React can still choose the settings view.
    WebviewWindowBuilder::new(
        &app,
        "settings",
        WebviewUrl::App(format!("index.html#view=settings&section={section}").into()),
    )
    .title("PilotBell Settings")
    .inner_size(760.0, 820.0)
    .min_inner_size(420.0, 520.0)
    .center()
    .decorations(false)
    .resizable(true)
    .focused(true)
    .build()
    .map(|_| ())
    .map_err(|error| error.to_string())
}
