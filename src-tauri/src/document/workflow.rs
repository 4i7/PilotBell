use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, State};

use super::excel::analyze_excel;
use super::markdown::render_markdown;
use super::pdf::analyze_pdf;
use super::svg::render_summary_svg;
use super::word::write_docx;
use super::{
    DocumentJobMetadata, DocumentJobPhase, DocumentJobProgress, DocumentLimits,
    DocumentWorkflowRequest, DocumentWorkflowResult, DOCUMENT_JOB_PROGRESS_EVENT,
};

#[derive(Default)]
pub struct DocumentJobState {
    cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

pub async fn start_document_workflow(
    app: AppHandle,
    state: State<'_, DocumentJobState>,
    request: DocumentWorkflowRequest,
) -> Result<DocumentWorkflowResult, String> {
    let job_id = normalize_job_id(&request.job_id)?;
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut cancellations = state
            .cancellations
            .lock()
            .map_err(|_| "Document job state is unavailable.".to_string())?;
        if cancellations.contains_key(&job_id) {
            return Err(format!("Document job already exists: {job_id}"));
        }
        cancellations.insert(job_id.clone(), Arc::clone(&cancel_flag));
    }

    emit_progress(
        &app,
        &job_id,
        DocumentJobPhase::Queued,
        0,
        10,
        "Document job queued.",
    );

    let app_for_job = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_document_workflow_blocking(&app_for_job, request, cancel_flag)
    })
    .await
    .map_err(|error| format!("Document worker failed: {error}"))?;

    if let Ok(mut cancellations) = state.cancellations.lock() {
        cancellations.remove(&job_id);
    }

    result
}

pub fn cancel_document_job(
    state: State<'_, DocumentJobState>,
    job_id: String,
) -> Result<DocumentJobMetadata, String> {
    let job_id = normalize_job_id(&job_id)?;
    let cancellations = state
        .cancellations
        .lock()
        .map_err(|_| "Document job state is unavailable.".to_string())?;
    let Some(cancel_flag) = cancellations.get(&job_id) else {
        return Err(format!("No active document job found for {job_id}."));
    };
    cancel_flag.store(true, Ordering::Relaxed);

    Ok(DocumentJobMetadata {
        job_id,
        file_name: String::new(),
        file_path: String::new(),
        output_path: String::new(),
        timestamp: timestamp_string(),
        status: "cancel_requested".into(),
        selected_template: String::new(),
        provider_id: None,
        error_summary: None,
    })
}

fn run_document_workflow_blocking(
    app: &AppHandle,
    request: DocumentWorkflowRequest,
    cancel_flag: Arc<AtomicBool>,
) -> Result<DocumentWorkflowResult, String> {
    let job_id = normalize_job_id(&request.job_id)?;
    let limits = DocumentLimits::default();
    check_cancelled(&cancel_flag)?;

    emit_progress(
        app,
        &job_id,
        DocumentJobPhase::Reading,
        1,
        10,
        "Reading selected document metadata.",
    );
    let input_path = canonical_file_path(&request.input_path)?;
    let output_dir = canonical_output_dir(&request.output_dir)?;
    let input_metadata = fs::metadata(&input_path)
        .map_err(|error| format!("Failed to inspect input file: {error}"))?;
    if input_metadata.len() > limits.max_input_bytes {
        return fail_job(
            app,
            &job_id,
            format!(
                "Input file exceeds the {} MB limit.",
                limits.max_input_bytes / 1024 / 1024
            ),
        );
    }

    let extension = input_path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    check_cancelled(&cancel_flag)?;
    let analysis = match extension.as_str() {
        "pdf" => {
            emit_progress(
                app,
                &job_id,
                DocumentJobPhase::ParsingPdf,
                2,
                10,
                "Parsing PDF structure and page metadata.",
            );
            analyze_pdf(&input_path, &limits)?
        }
        "xls" | "xlsx" | "xlsm" | "xlsb" | "ods" => {
            emit_progress(
                app,
                &job_id,
                DocumentJobPhase::ParsingExcel,
                2,
                10,
                "Reading workbook sheets and preview ranges.",
            );
            analyze_excel(&input_path, &limits)?
        }
        _ => {
            return fail_job(
                app,
                &job_id,
                "Supported document workflow inputs are PDF and Excel workbooks.".into(),
            );
        }
    };

    check_cancelled(&cancel_flag)?;
    emit_progress(
        app,
        &job_id,
        DocumentJobPhase::Validating,
        4,
        10,
        "Validating extracted metadata and workflow limits.",
    );
    let output_stem = sanitize_output_stem(
        input_path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("document"),
    );
    let markdown_path = output_dir.join(format!("{output_stem}-review.md"));
    let svg_path = output_dir.join(format!("{output_stem}-summary.svg"));
    let docx_path = output_dir.join(format!("{output_stem}-report.docx"));
    ensure_output_paths_available(&[&markdown_path, &svg_path, &docx_path], request.overwrite)?;

    check_cancelled(&cancel_flag)?;
    emit_progress(
        app,
        &job_id,
        DocumentJobPhase::GeneratingMarkdown,
        5,
        10,
        "Generating reviewable Markdown IR.",
    );
    let markdown = render_markdown(&analysis, request.selected_template.trim());

    check_cancelled(&cancel_flag)?;
    emit_progress(
        app,
        &job_id,
        DocumentJobPhase::GeneratingSvg,
        6,
        10,
        "Generating and sanitizing SVG summary.",
    );
    let svg = render_summary_svg(&analysis)?;

    check_cancelled(&cancel_flag)?;
    emit_progress(
        app,
        &job_id,
        DocumentJobPhase::GeneratingDocx,
        7,
        10,
        "Generating Word report.",
    );

    check_cancelled(&cancel_flag)?;
    emit_progress(
        app,
        &job_id,
        DocumentJobPhase::WritingOutput,
        8,
        10,
        "Writing Markdown, SVG, and DOCX outputs.",
    );
    fs::write(&markdown_path, markdown.as_bytes()).map_err(|error| {
        format!(
            "Failed to write Markdown output {}: {error}",
            markdown_path.display()
        )
    })?;
    fs::write(&svg_path, svg.as_bytes())
        .map_err(|error| format!("Failed to write SVG output {}: {error}", svg_path.display()))?;
    write_docx(&docx_path, &markdown)?;
    ensure_output_size(&markdown_path, &limits)?;
    ensure_output_size(&svg_path, &limits)?;
    ensure_output_size(&docx_path, &limits)?;

    let metadata = build_metadata(
        &job_id,
        &input_path,
        &markdown_path,
        request.selected_template,
        request.provider_id,
        "completed",
        None,
    )?;

    emit_progress(
        app,
        &job_id,
        DocumentJobPhase::Completed,
        10,
        10,
        "Document workflow completed.",
    );

    Ok(DocumentWorkflowResult {
        metadata,
        markdown_path: markdown_path.display().to_string(),
        svg_path: svg_path.display().to_string(),
        docx_path: docx_path.display().to_string(),
        warnings: analysis.warnings,
    })
}

fn fail_job<T>(app: &AppHandle, job_id: &str, message: String) -> Result<T, String> {
    emit_progress(app, job_id, DocumentJobPhase::Failed, 0, 1, &message);
    Err(message)
}

fn check_cancelled(cancel_flag: &AtomicBool) -> Result<(), String> {
    if cancel_flag.load(Ordering::Relaxed) {
        return Err("Document job cancelled.".into());
    }
    Ok(())
}

fn emit_progress(
    app: &AppHandle,
    job_id: &str,
    phase: DocumentJobPhase,
    current: u32,
    total: u32,
    message: impl Into<String>,
) {
    let _ = app.emit(
        DOCUMENT_JOB_PROGRESS_EVENT,
        DocumentJobProgress {
            job_id: job_id.into(),
            phase,
            current,
            total,
            message: message.into(),
        },
    );
}

fn normalize_job_id(job_id: &str) -> Result<String, String> {
    let trimmed = job_id.trim();
    if trimmed.is_empty() {
        return Err("Document job id is required.".into());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("Document job id contains unsupported characters.".into());
    }
    Ok(trimmed.to_string())
}

fn canonical_file_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw.trim());
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Failed to canonicalize input file path: {error}"))?;
    if !canonical.is_file() {
        return Err("Selected input path is not a file.".into());
    }
    Ok(canonical)
}

fn canonical_output_dir(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw.trim());
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("Failed to canonicalize output directory: {error}"))?;
    if !canonical.is_dir() {
        return Err("Selected output path is not a directory.".into());
    }
    Ok(canonical)
}

pub fn sanitize_output_stem(value: &str) -> String {
    let mut stem = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    while stem.contains("__") {
        stem = stem.replace("__", "_");
    }

    let stem = stem.trim_matches('_').chars().take(80).collect::<String>();
    if stem.is_empty() {
        "document-report".into()
    } else {
        stem
    }
}

fn ensure_output_paths_available(paths: &[&Path], overwrite: bool) -> Result<(), String> {
    if overwrite {
        return Ok(());
    }

    for path in paths {
        if path.exists() {
            return Err(format!(
                "Output already exists: {}. Confirm overwrite before running again.",
                path.display()
            ));
        }
    }

    Ok(())
}

fn ensure_output_size(path: &Path, limits: &DocumentLimits) -> Result<(), String> {
    let size = fs::metadata(path)
        .map_err(|error| format!("Failed to inspect output {}: {error}", path.display()))?
        .len();
    if size > limits.max_output_bytes {
        return Err(format!(
            "Output {} exceeds the {} MB limit.",
            path.display(),
            limits.max_output_bytes / 1024 / 1024
        ));
    }
    Ok(())
}

fn build_metadata(
    job_id: &str,
    input_path: &Path,
    output_path: &Path,
    selected_template: String,
    provider_id: Option<String>,
    status: &str,
    error_summary: Option<String>,
) -> Result<DocumentJobMetadata, String> {
    let file_name = input_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Input file name is invalid.".to_string())?
        .to_string();
    Ok(DocumentJobMetadata {
        job_id: job_id.into(),
        file_name,
        file_path: input_path.display().to_string(),
        output_path: output_path.display().to_string(),
        timestamp: timestamp_string(),
        status: status.into(),
        selected_template,
        provider_id,
        error_summary,
    })
}

fn timestamp_string() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis.to_string()
}

#[cfg(test)]
mod tests {
    use super::{ensure_output_paths_available, sanitize_output_stem};
    use std::fs;

    #[test]
    fn sanitizes_output_stem() {
        assert_eq!(
            sanitize_output_stem("../Quarterly Report?.xlsx"),
            "Quarterly_Report_xlsx"
        );
        assert_eq!(sanitize_output_stem(""), "document-report");
    }

    #[test]
    fn overwrite_guard_rejects_existing_output() {
        let temp_dir = std::env::temp_dir().join(format!(
            "pilotbell-output-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("current time")
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let output_path = temp_dir.join("report.md");
        fs::write(&output_path, "existing").expect("output should be written");

        let error = ensure_output_paths_available(&[&output_path], false)
            .expect_err("existing output should require confirmation");
        assert!(error.contains("Confirm overwrite"));

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
