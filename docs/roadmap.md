# PilotBell Roadmap

## Product Direction

PilotBell is a desktop AI command palette built with Tauri v2, Rust, React, and TypeScript.
The app is intentionally desktop-first: provider secrets, global shortcuts, and window behavior
are handled on the Rust/Tauri side instead of in a browser-only shell.

## Phase Breakdown

### Phase 1 - MVP shell

- [x] Provider registration UI
- [x] Prompt send flow through a registered provider
- [x] Provider test command
- [x] Local provider metadata persistence

### Phase 2 - Desktop foundation

- [x] Move provider API keys out of browser localStorage into OS credential storage
- [x] Add structured provider errors with validation / network / timeout / response categories
- [x] Route prompt send and provider test through a provider adapter layer
- [x] Add global shortcut registration with fallback handling
- [x] Add command-palette window behavior: prompt refocus, Escape hide, and window-state restore

### Phase 3 - Daily-use UX

- [x] Add prompt history, retry, copy, and clear-session actions
- [x] Improve provider status UX with richer health/readiness data
- [x] Add provider edit flow and per-provider capability display
- [x] Add hosted and local adapters beyond OpenAI Responses (OpenAI Responses, Anthropic Messages, Ollama, and llama.cpp now ship through the shared adapter layer)

### Phase 4 - Local knowledge

- [x] Add local source registration
- [ ] Add indexing and retrieval storage
- [ ] Inject retrieved context into the provider request pipeline

## Current Implementation Areas

### Frontend

- `src/domain/provider.ts` - provider metadata types and normalization
- `src/domain/source.ts` - local source registration types and normalization
- `src/lib/providerStore.ts` - browser-side provider metadata persistence
- `src/lib/sourceStore.ts` - local source registration persistence
- `src/lib/sessionStore.ts` - local prompt session persistence
- `src/App.tsx` - provider UI, command status, and prompt interaction flow

### Backend

- `src-tauri/src/lib.rs` - provider validation, secure secret access, adapter dispatch,
  prompt handling, shortcut registration, and window toggle logic
- `src-tauri/tauri.conf.json` - desktop window and bundling configuration

## Validation Baseline

- `npm run build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run tauri build`

## Operating Assumptions

- Windows 11 is the primary validation target.
- The supported Rust toolchain is `stable-msvc`.
- Linux-native desktop failures are not blockers for the Windows packaging path.
