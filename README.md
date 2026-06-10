# PilotBell

[![CI](https://github.com/4i7/PilotBell/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/4i7/PilotBell/actions/workflows/ci.yml)

PilotBell is a Rust + Tauri desktop tool for fast local document processing with optional LLM assistance.

The product direction is narrow by design: selected PDFs and Excel workbooks are processed in Rust, converted into reviewable Markdown and sanitized SVG, and exported as DOCX reports. LLM providers assist with draft wording and report shaping only after the user reviews what local document context may be sent.

PilotBell is designed more like a sharp desktop utility than a browser-like AI workspace. The intended flow is simple: press Alt+Space, select or drop in a local document, let Rust handle extraction and output generation, review any context before it leaves the machine, and use hosted or local LLM providers only where they make the workflow faster.

## Why This Matters

Most desktop AI tooling is optimized either for cloud-first chat, browser-like workspaces, or broad agent frameworks. PilotBell is aimed at a different gap: a low-friction desktop utility for local document workflows where users can move quickly, keep Rust-native processing and repeatable outputs in the foreground, and still retain explicit control over files, outbound context, provider routing, and intermediate workflow state.

That makes the project useful as OSS in three ways:

- It is a concrete reference for privacy-conscious desktop AI workflows on Windows with Rust + Tauri.
- It shows how to combine local document processing, explicit context review, and optional hosted/local model providers without turning the app into a general-purpose agent shell.
- It creates a testable surface for contributors who care about safer endpoint handling, better extraction quality, and repeatable report generation for real document-heavy work.

## Download

Windows installer builds are published from GitHub Releases. Download the latest `PilotBell_*_x64-setup.exe` asset from the release page and run it as the current user.

## Current Scope

- Tauri v2 desktop shell with global shortcut palette behavior
- Provider registration, testing, editing, and health status
- Provider metadata in browser localStorage, with API keys stored in the OS credential store
- OpenAI Responses and Anthropic Messages adapters for official hosted HTTPS endpoints
- Ollama and llama.cpp adapters for local loopback HTTP endpoints
- Advanced endpoint mode with warnings for hosted custom URLs, LAN URLs, and external URLs
- Review-before-send gates for cloud providers and explicit opt-in for advanced endpoints
- Credential-store diagnosis, repair, re-save, and delete actions
- Rust document workflow for selected PDF and Excel files
- Tauri progress events for long-running document processing
- Reviewable Markdown IR, sanitized SVG summary, and DOCX report output
- Minimized document job metadata persistence, with optional private mode

## Non-Goals

PilotBell will not expand into a general-purpose AI agent framework, multi-agent orchestration layer, autonomous agent planner, advanced RAG system, embedding search engine, retrieval-ranking project, persistent local knowledge-base indexer, or a Hermes-Agent / OpenClaw competitor.

Local documents are not accumulated as a searchable asset. A user-selected file is processed only for the active workflow, and extracted text, chunks, and LLM context are discarded when the workflow completes, is cancelled, or is cleared.

## Document Workflow

The document workflow is structured as:

```text
React UI
  -> invoke Tauri command
  -> Rust document workflow
  -> emit progress event
  -> React progress bar / log display
  -> output Markdown / SVG / DOCX
```

Rust owns file reading, PDF parsing, Excel workbook inspection, validation, Markdown generation, SVG sanitization, and DOCX generation. React owns file/folder selection, workflow start/cancel, progress display, result metadata, and error display.

The Rust workflow currently uses:

- `lopdf` for PDF structure and best-effort text preview
- `calamine` for workbook, sheet, range, and preview extraction without formula evaluation
- `docx-rs` for Word report generation
- `quick-xml` for SVG validation before preview/output

### DOCX Templates

PilotBell currently exposes three explicit DOCX report templates in the document workflow UI:

- `summary-report` - short handoff report with top findings and a compact preview excerpt
- `detailed-analysis` - fuller report with document profile, validation walkthrough, and preview evidence
- `data-quality-review` - validation-focused report with warnings and recommended follow-up actions

The template contract lives in [`src-tauri/src/document/word.rs`](/C:/Users/4i7/Claude/Projects/Dreadnought/apps/pilotbell/src-tauri/src/document/word.rs). To add a new template:

1. Add a new `DocumentTemplate` variant plus its canonical `id()` and `label()`.
2. Implement the section layout in a dedicated `build_*` helper that writes DOCX content directly from `DocumentAnalysis`.
3. Add the same template ID and copy to `DOCUMENT_TEMPLATE_OPTIONS` in [`src/domain/document.ts`](/C:/Users/4i7/Claude/Projects/Dreadnought/apps/pilotbell/src/domain/document.ts) so the React workflow panel exposes the new choice explicitly.
4. Extend the Rust DOCX generation test matrix in `word.rs` so the new template is exercised against both PDF and Excel fixture analyses.

## Storage Policy

Allowed browser storage is limited to lightweight metadata:

- `jobId`
- `fileName`
- `timestamp`
- `status`
- `selectedTemplate`
- `errorSummary`
- `warnings`
- `failureKind`

PilotBell does not persist PDF body text, Excel cell contents, Word body text, extracted text, chunks, LLM context, input paths, output paths, or provider identifiers in localStorage. Legacy `pilotbell.localSourceIndex` snapshots are cleared on startup, and legacy browser-stored provider API keys are scrubbed into metadata-only provider records.

When private mode is enabled, document job metadata is not persisted at all between launches.

## Provider Safety

- OpenAI and Anthropic use official HTTPS endpoints by default.
- Hosted custom endpoints require advanced endpoint mode and show a warning.
- Ollama and llama.cpp default to `localhost`, `127.0.0.1`, or `[::1]`.
- LAN and external local-provider URLs require advanced endpoint mode and show a warning.
- Provider tests report missing credential-store secrets clearly.
- Secret values are never shown in UI errors or logs.
- Cloud-bound sends require pre-send review.
- Advanced endpoints require an explicit pre-send opt-in.
- Model availability depends on the selected provider account. If provider testing fails, choose a model available to that API key.

When a prompt is sent through a cloud provider, or through an advanced custom endpoint, PilotBell stops on a review step before submission:

```text
Review the destination host, risk level, stored-secret usage, and final prompt body before sending sensitive data.
```

## Setup

```powershell
git clone https://github.com/4i7/PilotBell.git
cd PilotBell
npm ci
```

Run the desktop app in development mode:

```powershell
npm run tauri dev
```

Build the web frontend only:

```powershell
npm run build
```

Run the frontend unit tests:

```powershell
npm run test
```

Build a desktop bundle:

```powershell
npm run tauri build
```

The Windows installer for general users is generated as an NSIS `.exe` bundle:

```powershell
npm run build:windows-installer
```

After the build finishes, look in:

```text
src-tauri\target\release\bundle\nsis\
```

For the current desktop validation path, use a Windows host with `stable-msvc`.

## Project Layout

- `src/domain/document.ts` - document workflow and progress types
- `src/domain/provider.ts` - provider types, endpoint classification, and normalization
- `src/lib/documentJobStore.ts` - lightweight document job metadata persistence
- `src/lib/providerStore.ts` - provider metadata persistence helpers
- `src/lib/promptAttachments.ts` - prompt review payload construction and review gating
- `src/components/DocumentWorkflowPanel.tsx` - document workflow controls
- `src/hooks/useDocumentJobs.ts` - document workflow state and progress event handling
- `src-tauri/src/document/` - Rust document processing modules
- `src-tauri/src/lib.rs` - Tauri shell, provider bridge, and command registration
- `src-tauri/tauri.conf.json` - Tauri app configuration

## Next Exploration Hooks

- Expand Excel validation summaries for data quality review without evaluating formulas.
- Add UI-level coverage for provider migration scrub, document private mode, and send-review flows.
