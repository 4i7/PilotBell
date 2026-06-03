# Security Policy

PilotBell is an early-stage desktop AI workflow for local document processing with optional hosted or local LLM providers.

## Security Model

PilotBell is designed around explicit user control of cloud-bound context.

- Local document processing is performed in the Tauri/Rust backend.
- Extracted document text, chunks, and LLM context are treated as temporary workflow data.
- Browser `localStorage` is limited to lightweight metadata.
- Input paths, output paths, provider identifiers, document body text, extracted text, chunks, and prompt context are not persisted in browser storage.
- API keys are stored in the operating system credential store where supported.
- Legacy browser-stored API keys are scrubbed or migrated into metadata-only provider records.
- Cloud provider sends require pre-send review.
- Advanced/custom endpoints require explicit opt-in before send.

## Supported Versions

PilotBell is currently pre-1.0. Security fixes are applied to the `main` branch and current GitHub Releases.

## Reporting a Vulnerability

Report vulnerabilities through GitHub Issues if the report does not expose secrets or private data.

For sensitive reports, contact the maintainer through the GitHub profile or repository contact path instead of posting exploit details publicly.

Useful reports include:

- Secret leakage in UI, logs, `localStorage`, release artifacts, or error messages
- Cloud-bound prompt transmission without review
- Persistence of local document body text or extracted context
- Endpoint classification or review-gating bypasses
- Unsafe handling of untrusted document input

## Non-Goals

PilotBell is not a sandbox, antivirus tool, malware analysis tool, enterprise DLP product, or general-purpose autonomous agent framework.
