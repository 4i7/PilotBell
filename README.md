# PilotBell

PilotBell is a lightweight desktop AI command palette built with Tauri v2, Rust, React, and TypeScript.

The project is currently in an early MVP stage. The current milestone includes an open provider registration UI where anyone using the app can add an AI endpoint and call that provider directly from the prompt screen.

## Current Scope

- Clean desktop window
- Prompt textarea
- Send button
- Response display area
- Provider registration settings (name / endpoint / model / API key)
- Local provider metadata saved in browser storage
- Provider API keys saved in the OS credential store through Rust/Tauri
- Rust backend command that forwards prompts to registered provider APIs

Planned next steps include a global shortcut, a compact spotlight-style window, provider adapters for remote and local models, and optional local knowledge-base integrations.

## Setup

Clone the repository and install dependencies:

```powershell
git clone https://github.com/4i7/PilotBell.git
cd PilotBell
npm install
```

Run the desktop app in development mode:

```powershell
npm run tauri dev
```

Build the web frontend only:

```powershell
npm run build
```

Build a desktop bundle:

```powershell
npm run tauri build
```

## Provider Secret Storage

- Provider metadata is stored in browser localStorage for the current desktop profile.
- Provider API keys are stored separately in the OS credential store from the Rust/Tauri side.
- Existing browser-stored provider secrets are migrated on startup when possible.

## Windows 11 Development Notes (Primary Target)

If your main target is Windows 11, validate Rust/Tauri on Windows host (PowerShell or cmd), not Linux/WSL:

```powershell
rustup default stable-msvc
cargo -V
cd src-tauri
cargo check
```

Tauri prerequisites on Windows:
- MSVC Build Tools
- Microsoft Edge WebView2

Linux native dependency errors (`glib-2.0`, `gobject-2.0`) are not blockers when your release target is Windows-only.

## Project Layout

- `src/App.tsx` - minimal React UI
- `src/App.css` - application styling
- `src-tauri/src/lib.rs` - Tauri command handler
- `src-tauri/tauri.conf.json` - Tauri app configuration

## Next Phase Hooks

- Phase 2: add `@tauri-apps/plugin-global-shortcut` and spotlight-style window toggle.
- Phase 3: add provider adapters for OpenAI, Anthropic, Ollama, llama.cpp, Obsidian vaults, and local KB search.
