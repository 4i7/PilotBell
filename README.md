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
- Rust backend commands that forward prompts to registered provider APIs and test provider connectivity

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

The Windows installer for general users is generated as an NSIS `.exe` bundle:

```powershell
npm run build:windows-installer
```

After the build finishes, look in:

```text
src-tauri\target\release\bundle\nsis\
```

This project is configured to produce a user-friendly Windows installer with:

- a standard `.exe` installer
- Start menu shortcut creation
- Japanese and English installer language support
- automatic WebView2 bootstrapper download when needed

For the current desktop validation path, use a Windows host with `stable-msvc`; Linux-native dependency errors are not blockers for this target.

```powershell
rustup default stable-msvc
cargo -V
cd src-tauri
cargo check
```

## Project Layout

- `src/App.tsx` - minimal React UI
- `src/App.css` - application styling
- `src/domain/provider.ts` - provider types and normalization
- `src/lib/providerStore.ts` - browser storage persistence helpers
- `src-tauri/src/lib.rs` - Tauri command handler and provider bridge
- `src-tauri/tauri.conf.json` - Tauri app configuration

## Next Phase Hooks

- Phase 2: add `@tauri-apps/plugin-global-shortcut` and spotlight-style window toggle.
- Phase 3: move API keys to secure storage and add provider adapters for OpenAI, Anthropic, Ollama, llama.cpp, Obsidian vaults, and local KB search.
