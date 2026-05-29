pub mod excel;
pub mod markdown;
pub mod pdf;
pub mod svg;
pub mod word;
pub mod workflow;

use serde::{Deserialize, Serialize};

pub const DOCUMENT_JOB_PROGRESS_EVENT: &str = "pilotbell://document-job-progress";

#[derive(Clone, Debug)]
pub struct DocumentLimits {
    pub max_input_bytes: u64,
    pub max_pdf_pages: usize,
    pub max_workbook_sheets: usize,
    pub max_sheet_rows: usize,
    pub max_sheet_columns: usize,
    pub max_output_bytes: u64,
}

impl Default for DocumentLimits {
    fn default() -> Self {
        Self {
            max_input_bytes: 100 * 1024 * 1024,
            max_pdf_pages: 500,
            max_workbook_sheets: 100,
            max_sheet_rows: 100_000,
            max_sheet_columns: 1_000,
            max_output_bytes: 50 * 1024 * 1024,
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowRequest {
    pub job_id: String,
    pub input_path: String,
    pub output_dir: String,
    pub selected_template: String,
    pub provider_id: Option<String>,
    pub overwrite: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentJobMetadata {
    pub job_id: String,
    pub file_name: String,
    pub file_path: String,
    pub output_path: String,
    pub timestamp: String,
    pub status: String,
    pub selected_template: String,
    pub provider_id: Option<String>,
    pub error_summary: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentWorkflowResult {
    pub metadata: DocumentJobMetadata,
    pub markdown_path: String,
    pub svg_path: String,
    pub docx_path: String,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentJobProgress {
    pub job_id: String,
    pub phase: DocumentJobPhase,
    pub current: u32,
    pub total: u32,
    pub message: String,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentJobPhase {
    Queued,
    Reading,
    ParsingPdf,
    ParsingExcel,
    Validating,
    GeneratingMarkdown,
    GeneratingSvg,
    GeneratingDocx,
    WritingOutput,
    Completed,
    Failed,
}

#[derive(Clone, Debug)]
pub struct DocumentAnalysis {
    pub title: String,
    pub kind: String,
    pub source_path: String,
    pub file_name: String,
    pub facts: Vec<(String, String)>,
    pub validations: Vec<String>,
    pub preview: Vec<Vec<String>>,
    pub warnings: Vec<String>,
}
