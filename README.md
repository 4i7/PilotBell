# PilotBell

PilotBell is a Rust + Tauri desktop tool for fast local document processing with optional LLM assistance.

The product direction is narrow by design: selected PDFs and Excel workbooks are processed in Rust, converted into reviewable Markdown and sanitized SVG, and exported as DOCX reports. LLM providers assist with draft wording and report shaping only after the user reviews what local document context may be sent.

## Download

Windows installer builds are published from GitHub Releases. Download the latest `PilotBell_*_x64-setup.exe` asset from the release page and run it as the current user.

## Current Scope

- Tauri v2 desktop shell with global shortcut palette behavior
- Provider registration, testing, editing, and health status
- Provider metadata in browser localStorage, with API keys stored in the OS credential store
- OpenAI Responses and Anthropic Messages adapters for official hosted HTTPS endpoints
- Ollama and llama.cpp adapters for local loopback HTTP endpoints
- Advanced endpoint mode with warnings for hosted custom URLs, LAN URLs, and external URLs
- Credential-store diagnosis, repair, re-save, and delete actions
- Rust document workflow for selected PDF and Excel files
- Tauri progress events for long-running document processing
- Reviewable Markdown IR, sanitized SVG summary, and DOCX report output
- Lightweight document job metadata persistence

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

## Storage Policy

Allowed browser storage is limited to lightweight metadata:

- `jobId`
- `fileName`
- `filePath`
- `outputPath`
- `timestamp`
- `status`
- `selectedTemplate`
- `providerId`
- `errorSummary`

PilotBell does not persist PDF body text, Excel cell contents, Word body text, extracted text, chunks, LLM context, or other sensitive intermediate document data in localStorage. Legacy `pilotbell.localSourceIndex` snapshots are cleared on startup.

## Provider Safety

- OpenAI and Anthropic use official HTTPS endpoints by default.
- Hosted custom endpoints require advanced endpoint mode and show a warning.
- Ollama and llama.cpp default to `localhost`, `127.0.0.1`, or `[::1]`.
- LAN and external local-provider URLs require advanced endpoint mode and show a warning.
- Provider tests report missing credential-store secrets clearly.
- Secret values are never shown in UI errors or logs.
- Model availability depends on the selected provider account. If provider testing fails, choose a model available to that API key.

When local document excerpts may be sent to a cloud provider, PilotBell warns before submission:

```text
Local document excerpts may be included in prompts sent to the selected provider. Review the context before sending sensitive data.
```

## Setup

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
- `src/components/DocumentWorkflowPanel.tsx` - document workflow controls
- `src/hooks/useDocumentJobs.ts` - document workflow state and progress event handling
- `src-tauri/src/document/` - Rust document processing modules
- `src-tauri/src/lib.rs` - Tauri shell, provider bridge, and command registration
- `src-tauri/tauri.conf.json` - Tauri app configuration

## Next Exploration Hooks

- Improve PDF text extraction quality while keeping extracted text temporary.
- Expand Excel validation summaries for data quality review without evaluating formulas.
- Add context preview for LLM-assisted Markdown and report wording.
- Add more DOCX templates for repeatable report formats.
