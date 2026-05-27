# PilotBell

PilotBell is a lightweight Dreadnought desktop AI command palette built with Tauri v2, Rust, React, and TypeScript.

## Phase 1 Scope

- Clean desktop window
- Prompt textarea
- Send button
- Response display area
- Rust backend command returning a mock assistant response

## Setup

From the Dreadnought workspace:

```powershell
cd C:\Users\4i7\Claude\Projects\Dreadnought\apps\pilotbell
npm install
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
