# PilotBell

PilotBell is a lightweight desktop AI command palette built with Tauri v2, Rust, React, and TypeScript.

The project is currently in an early MVP stage. The first milestone focuses on a clean desktop shell, a prompt input, and a Rust command bridge that can later be connected to real AI providers and local knowledge sources.

## Current Scope

- Clean desktop window
- Prompt textarea
- Send button
- Response display area
- Rust backend command returning a mock assistant response

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

## Project Layout

- `src/App.tsx` - minimal React UI
- `src/App.css` - application styling
- `src-tauri/src/lib.rs` - Tauri command handler
- `src-tauri/tauri.conf.json` - Tauri app configuration

## Next Phase Hooks

- Phase 2: add `@tauri-apps/plugin-global-shortcut` and spotlight-style window toggle.
- Phase 3: add provider adapters for OpenAI, Anthropic, Ollama, llama.cpp, Obsidian vaults, and local KB search.
