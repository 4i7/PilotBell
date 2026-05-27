# PilotBell Roadmap

## Product Direction

PilotBell is the Dreadnought command palette: a fast desktop AI entry point for API models, local LLMs, Obsidian vaults, Hermes/Codex skills, and local knowledge bases.

React + TypeScript was selected for the frontend because Phase 2 and Phase 3 will add more client state: history, provider settings, shortcut status, vault search results, and skill command metadata.

## Phase 1 - MVP

Goal: prove the Tauri shell, UI, and Rust command bridge.

Implemented:

- Tauri v2 app scaffold
- React + TypeScript frontend
- Prompt textarea
- Send button
- Response panel
- Rust command: `handle_prompt`
- Mock assistant provider
- Windows release build and installer generation

Out of scope:

- Global shortcut
- Frameless overlay
- Real API model calls
- Local LLM integration
- Obsidian/KB indexing
- Persistent history

## Phase 2 - Command Palette UX

Goal: make PilotBell feel instant and OS-native.

Planned:

- Add Tauri global shortcut plugin
- Toggle window with `Alt+Space` or a configurable fallback
- Add tray icon
- Add compact spotlight window mode
- Persist window position and user preferences
- Add command history
- Add provider settings UI

Implementation notes:

- Keep Phase 1 `handle_prompt` as the stable command boundary.
- Introduce a `Provider` trait on the Rust side before adding real model calls.
- Store API keys in the OS keychain or an encrypted Tauri store plugin, not in plaintext config files.

## Phase 3 - Local Knowledge Integration

Goal: turn PilotBell from a chat launcher into a local context router.

Planned:

- Obsidian vault path configuration
- Knowledge-distiller search command
- Local KB result cards
- Ollama / llama.cpp provider adapter
- Skill registry and skill command execution
- Prompt pattern library integration
- Model roster and quick provider switching

Design constraints:

- Local-first by default
- BYOK for remote APIs
- Clear provider and context indicators in every response
- No hidden upload of local vault content

## Phase 1 Setup Commands

The app has already been scaffolded. To reproduce from a clean workspace:

```powershell
cd C:\Users\4i7\Claude\Projects\Dreadnought
npm create tauri-app@latest apps/pilotbell -- --template react-ts --manager npm --identifier com.dreadnought.pilotbell --tauri-version 2 --yes
cd apps\pilotbell
npm install
npm run tauri dev
```

Current verification commands:

```powershell
cd C:\Users\4i7\Claude\Projects\Dreadnought\apps\pilotbell
npm run build
cd src-tauri
cargo check
cd ..
npm run tauri build
```
