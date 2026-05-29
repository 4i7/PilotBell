# PilotBell Roadmap

## Product Direction

PilotBell is a Rust-native document processing desktop app built with Tauri v2, Rust, React, and TypeScript.

The app focuses on local document workflows: PDF structure inspection, Excel data extraction and validation, Markdown review IR, sanitized SVG diagrams, and DOCX report generation. LLM providers are optional helpers for draft wording and report shaping, not autonomous planners.

## Completed Foundation

- [x] Tauri v2 desktop shell with global shortcut and compact palette behavior
- [x] Provider registration, edit flow, readiness display, and health checks
- [x] OS credential-store storage for provider API keys
- [x] Hosted provider adapters for OpenAI Responses and Anthropic Messages
- [x] Local provider adapters for Ollama and llama.cpp
- [x] Prompt history, retry, copy, and clear-session actions
- [x] Deprecated persistent local source index snapshots and clear them from active workflow state

## Current Phase - Rust Document Workflow

- [x] Add `lopdf`, `calamine`, and `docx-rs`
- [x] Add `src-tauri/src/document/` module boundary
- [x] Add PDF structure/page inspection and best-effort text preview
- [x] Add Excel sheet/range preview and validation summary without formula evaluation
- [x] Add Markdown, sanitized SVG, and DOCX output generation
- [x] Add Tauri document progress event handling
- [x] Add lightweight document job metadata persistence only
- [x] Add provider endpoint advanced-mode warnings
- [x] Add credential-store diagnosis, repair, re-save, and delete UI

## Next Slices

- Add richer context preview before LLM-assisted report drafting.
- Add more document templates and template-specific DOCX styling.
- Improve PDF extraction quality while preserving temporary processing boundaries.
- Add focused frontend component extraction around provider settings and prompt/session surfaces.
- Add end-to-end UI verification for document progress, cancellation, and provider warning flows.

## Explicit Non-Goals

- No general-purpose AI agent framework
- No multi-agent orchestration
- No autonomous agent planner
- No advanced RAG, embedding search, or retrieval ranking expansion
- No persistent local knowledge-base indexing tool
- No direction that competes with Hermes-Agent / OpenClaw

## Validation Baseline

- `npm run build`
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `npm run tauri build`
- `git diff --check`

## Operating Assumptions

- Windows is the primary packaging validation target.
- The supported Rust toolchain is `stable-msvc`.
- Document contents are untrusted input.
- Extracted document text, chunks, and LLM context are temporary workflow data and are not stored in browser storage.
