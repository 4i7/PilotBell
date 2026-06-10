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
use super::word::{normalize_template_id, write_docx};
use super::{
    DocumentJobMetadata, DocumentJobPhase, DocumentJobProgress, DocumentLimits,
    DocumentWorkflowRequest, DocumentWorkflowResult, DOCUMENT_JOB_PROGRESS_EVENT,
};

struct WorkflowContext<'a> {
    app: &'a AppHandle,
    cancel_flag: Arc<AtomicBool>,
    limits: DocumentLimits,
    job_id: String,
}

impl<'a> WorkflowContext<'a> {
    fn new(app: &'a AppHandle, cancel_flag: Arc<AtomicBool>, job_id: String) -> Self {
        Self {
            app,
            cancel_flag,
            limits: DocumentLimits::default(),
            job_id,
        }
    }

    fn check_cancelled(&self) -> Result<(), String> {
        check_cancelled(self.cancel_flag.as_ref())
    }

    fn emit_progress(
        &self,
        phase: DocumentJobPhase,
        current: u32,
        total: u32,
        message: impl Into<String>,
    ) {
        emit_progress(self.app, &self.job_id, phase, current, total, message);
    }

    fn emit_progress_with_warnings(
        &self,
        phase: DocumentJobPhase,
        current: u32,
        total: u32,
        message: impl Into<String>,
        warnings: Vec<String>,
    ) {
        emit_progress_with_warnings(
            self.app,
            &self.job_id,
            phase,
            current,
            total,
            message,
            warnings,
        );
    }

    fn fail<T>(&self, message: String) -> Result<T, String> {
        fail_job(self.app, &self.job_id, message)
    }
}

struct PreparedWorkflow {
    input_path: PathBuf,
    selected_template: String,
    provider_id: Option<String>,
    input_kind: WorkflowInputKind,
    output_paths: OutputPaths,
}

struct OutputPaths {
    markdown_path: PathBuf,
    svg_path: PathBuf,
    docx_path: PathBuf,
}

struct RenderedOutputs {
    markdown: String,
    svg: String,
}

#[derive(Clone, Copy, Debug)]
enum WorkflowInputKind {
    Pdf,
    Spreadsheet,
}

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
    let workflow = WorkflowContext::new(app, cancel_flag, job_id);
    workflow.check_cancelled()?;

    workflow.emit_progress(
        DocumentJobPhase::Reading,
        1,
        10,
        "Reading selected document metadata.",
    );
    let prepared = prepare_workflow(&workflow, request)?;
    let analysis = analyze_document_input(&workflow, &prepared)?;

    workflow.check_cancelled()?;
    workflow.emit_progress(
        DocumentJobPhase::Validating,
        4,
        10,
        "Validating extracted metadata and workflow limits.",
    );

    let rendered = render_workflow_outputs(&workflow, &analysis, &prepared.selected_template)?;
    write_workflow_outputs(
        &workflow,
        &prepared.output_paths,
        &rendered,
        &analysis,
        &prepared.selected_template,
    )?;

    let metadata = build_metadata(
        &workflow.job_id,
        &prepared.input_path,
        &prepared.output_paths.markdown_path,
        prepared.selected_template,
        prepared.provider_id,
        "completed",
        None,
    )?;

    workflow.emit_progress(
        DocumentJobPhase::Completed,
        10,
        10,
        "Document workflow completed.",
    );

    Ok(build_workflow_result(
        metadata,
        prepared.output_paths,
        rendered.markdown,
        analysis.warnings,
    ))
}

fn prepare_workflow(
    workflow: &WorkflowContext<'_>,
    request: DocumentWorkflowRequest,
) -> Result<PreparedWorkflow, String> {
    let input_path = canonical_file_path(&request.input_path)?;
    let output_dir = canonical_output_dir(&request.output_dir)?;
    ensure_input_size(&input_path, &workflow.limits).or_else(|message| workflow.fail(message))?;

    let input_kind = classify_input_kind(input_extension(&input_path).as_str())
        .or_else(|message| workflow.fail(message))?;
    let output_paths = build_output_paths(&output_dir, &input_path, request.overwrite)?;

    let selected_template = normalize_template_id(&request.selected_template)
        .or_else(|message| workflow.fail(message))?
        .to_string();

    Ok(PreparedWorkflow {
        input_path,
        selected_template,
        provider_id: request.provider_id,
        input_kind,
        output_paths,
    })
}

fn analyze_document_input(
    workflow: &WorkflowContext<'_>,
    prepared: &PreparedWorkflow,
) -> Result<super::DocumentAnalysis, String> {
    workflow.check_cancelled()?;

    match prepared.input_kind {
        WorkflowInputKind::Pdf => {
            workflow.emit_progress(
                DocumentJobPhase::ParsingPdf,
                2,
                10,
                "Parsing PDF structure and page metadata.",
            );
            let analysis = analyze_pdf(&prepared.input_path, &workflow.limits)?;
            if !analysis.warnings.is_empty() {
                workflow.emit_progress_with_warnings(
                    DocumentJobPhase::ParsingPdf,
                    3,
                    10,
                    "PDF text extraction completed with review warnings.",
                    analysis.warnings.clone(),
                );
            }
            Ok(analysis)
        }
        WorkflowInputKind::Spreadsheet => {
            workflow.emit_progress(
                DocumentJobPhase::ParsingExcel,
                2,
                10,
                "Reading workbook sheets and preview ranges.",
            );
            analyze_excel(&prepared.input_path, &workflow.limits)
        }
    }
}

fn render_workflow_outputs(
    workflow: &WorkflowContext<'_>,
    analysis: &super::DocumentAnalysis,
    selected_template: &str,
) -> Result<RenderedOutputs, String> {
    workflow.check_cancelled()?;
    workflow.emit_progress(
        DocumentJobPhase::GeneratingMarkdown,
        5,
        10,
        "Generating reviewable Markdown IR.",
    );
    let markdown = render_markdown(analysis, selected_template.trim());

    workflow.check_cancelled()?;
    workflow.emit_progress(
        DocumentJobPhase::GeneratingSvg,
        6,
        10,
        "Generating and sanitizing SVG summary.",
    );
    let svg = render_summary_svg(analysis)?;

    workflow.check_cancelled()?;
    workflow.emit_progress(
        DocumentJobPhase::GeneratingDocx,
        7,
        10,
        "Generating Word report.",
    );

    Ok(RenderedOutputs { markdown, svg })
}

fn write_workflow_outputs(
    workflow: &WorkflowContext<'_>,
    output_paths: &OutputPaths,
    rendered: &RenderedOutputs,
    analysis: &super::DocumentAnalysis,
    selected_template: &str,
) -> Result<(), String> {
    workflow.check_cancelled()?;
    workflow.emit_progress(
        DocumentJobPhase::WritingOutput,
        8,
        10,
        "Writing Markdown, SVG, and DOCX outputs.",
    );

    fs::write(&output_paths.markdown_path, rendered.markdown.as_bytes()).map_err(|error| {
        format!(
            "Failed to write Markdown output {}: {error}",
            output_paths.markdown_path.display()
        )
    })?;
    fs::write(&output_paths.svg_path, rendered.svg.as_bytes()).map_err(|error| {
        format!(
            "Failed to write SVG output {}: {error}",
            output_paths.svg_path.display()
        )
    })?;
    write_docx(&output_paths.docx_path, analysis, selected_template)?;
    ensure_output_size(&output_paths.markdown_path, &workflow.limits)?;
    ensure_output_size(&output_paths.svg_path, &workflow.limits)?;
    ensure_output_size(&output_paths.docx_path, &workflow.limits)?;

    Ok(())
}

fn build_workflow_result(
    metadata: DocumentJobMetadata,
    output_paths: OutputPaths,
    markdown_content: String,
    warnings: Vec<String>,
) -> DocumentWorkflowResult {
    DocumentWorkflowResult {
        metadata,
        markdown_path: output_paths.markdown_path.display().to_string(),
        svg_path: output_paths.svg_path.display().to_string(),
        docx_path: output_paths.docx_path.display().to_string(),
        markdown_content,
        warnings,
    }
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
    emit_progress_with_warnings(app, job_id, phase, current, total, message, Vec::new());
}

fn emit_progress_with_warnings(
    app: &AppHandle,
    job_id: &str,
    phase: DocumentJobPhase,
    current: u32,
    total: u32,
    message: impl Into<String>,
    warnings: Vec<String>,
) {
    let _ = app.emit(
        DOCUMENT_JOB_PROGRESS_EVENT,
        DocumentJobProgress {
            job_id: job_id.into(),
            phase,
            current,
            total,
            message: message.into(),
            warnings,
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

fn ensure_input_size(path: &Path, limits: &DocumentLimits) -> Result<(), String> {
    let input_metadata =
        fs::metadata(path).map_err(|error| format!("Failed to inspect input file: {error}"))?;
    if input_metadata.len() > limits.max_input_bytes {
        return Err(format!(
            "Input file exceeds the {} MB limit.",
            limits.max_input_bytes / 1024 / 1024
        ));
    }
    Ok(())
}

fn input_extension(path: &Path) -> String {
    path.extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn classify_input_kind(extension: &str) -> Result<WorkflowInputKind, String> {
    match extension {
        "pdf" => Ok(WorkflowInputKind::Pdf),
        "xls" | "xlsx" | "xlsm" | "xlsb" | "ods" => Ok(WorkflowInputKind::Spreadsheet),
        _ => Err("Supported document workflow inputs are PDF and Excel workbooks.".into()),
    }
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

fn build_output_paths(
    output_dir: &Path,
    input_path: &Path,
    overwrite: bool,
) -> Result<OutputPaths, String> {
    let output_stem = sanitize_output_stem(
        input_path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("document"),
    );
    let output_paths = OutputPaths {
        markdown_path: output_dir.join(format!("{output_stem}-review.md")),
        svg_path: output_dir.join(format!("{output_stem}-summary.svg")),
        docx_path: output_dir.join(format!("{output_stem}-report.docx")),
    };

    ensure_output_paths_available(
        &[
            output_paths.markdown_path.as_path(),
            output_paths.svg_path.as_path(),
            output_paths.docx_path.as_path(),
        ],
        overwrite,
    )?;

    Ok(output_paths)
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
    use super::{
        build_output_paths, classify_input_kind, ensure_output_paths_available,
        sanitize_output_stem, WorkflowInputKind,
    };
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

    #[test]
    fn classifies_supported_input_extensions() {
        assert!(matches!(
            classify_input_kind("pdf"),
            Ok(WorkflowInputKind::Pdf)
        ));
        assert!(matches!(
            classify_input_kind("xlsx"),
            Ok(WorkflowInputKind::Spreadsheet)
        ));
        assert!(classify_input_kind("txt")
            .expect_err("unsupported extension should fail")
            .contains("Supported document workflow inputs"));
    }

    #[test]
    fn builds_output_paths_from_sanitized_input_stem() {
        let temp_dir = std::env::temp_dir().join(format!(
            "pilotbell-output-paths-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("current time")
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");
        let input_path = temp_dir.join("Quarterly Report final.xlsx");
        fs::write(&input_path, "placeholder").expect("input placeholder should be written");

        let output_paths =
            build_output_paths(&temp_dir, &input_path, false).expect("paths should build");
        assert_eq!(
            output_paths
                .markdown_path
                .file_name()
                .and_then(|name| name.to_str()),
            Some("Quarterly_Report_final-review.md")
        );
        assert_eq!(
            output_paths
                .svg_path
                .file_name()
                .and_then(|name| name.to_str()),
            Some("Quarterly_Report_final-summary.svg")
        );
        assert_eq!(
            output_paths
                .docx_path
                .file_name()
                .and_then(|name| name.to_str()),
            Some("Quarterly_Report_final-report.docx")
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
