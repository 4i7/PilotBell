use std::collections::HashSet;
use std::path::Path;

use calamine::{open_workbook_auto, Reader};

use super::{DocumentAnalysis, DocumentLimits};

pub fn analyze_excel(path: &Path, limits: &DocumentLimits) -> Result<DocumentAnalysis, String> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|error| format!("Failed to open Excel workbook: {error}"))?;
    let sheet_names = workbook.sheet_names().to_owned();
    if sheet_names.len() > limits.max_workbook_sheets {
        return Err(format!(
            "Workbook sheet count exceeds the {} sheet limit.",
            limits.max_workbook_sheets
        ));
    }

    let mut facts = vec![("Sheets".into(), sheet_names.len().to_string())];
    let mut validations = vec!["Workbook formulas were not evaluated by PilotBell.".into()];
    let mut warnings = Vec::new();
    let mut preview = Vec::new();

    for sheet_name in sheet_names.iter().take(5) {
        let range = workbook
            .worksheet_range(sheet_name)
            .map_err(|error| format!("Failed to read sheet {sheet_name}: {error}"))?;
        let (rows, columns) = range.get_size();
        if rows > limits.max_sheet_rows {
            return Err(format!(
                "Sheet {sheet_name} exceeds the {} row limit.",
                limits.max_sheet_rows
            ));
        }
        if columns > limits.max_sheet_columns {
            return Err(format!(
                "Sheet {sheet_name} exceeds the {} column limit.",
                limits.max_sheet_columns
            ));
        }

        let mut blank_cells = 0usize;
        let mut seen_rows = HashSet::new();
        let mut duplicate_rows = 0usize;

        for row in range.rows().take(1_000) {
            let values = row.iter().map(ToString::to_string).collect::<Vec<_>>();
            blank_cells += values
                .iter()
                .filter(|value| value.trim().is_empty())
                .count();
            let row_key = values.join("\u{1f}");
            if !row_key.trim_matches('\u{1f}').is_empty() && !seen_rows.insert(row_key) {
                duplicate_rows += 1;
            }
        }

        facts.push((
            format!("Sheet {sheet_name} size"),
            format!("{rows} rows x {columns} columns"),
        ));
        validations.push(format!(
            "Sheet {sheet_name}: sampled blank cells={blank_cells}, duplicate sampled rows={duplicate_rows}."
        ));

        if rows == 0 || columns == 0 {
            warnings.push(format!("Sheet {sheet_name} appears empty."));
        }

        if preview.is_empty() {
            preview = range
                .rows()
                .take(8)
                .map(|row| {
                    row.iter()
                        .take(8)
                        .map(|cell| cell.to_string().chars().take(80).collect::<String>())
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>();
        }
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("workbook.xlsx")
        .to_string();

    Ok(DocumentAnalysis {
        title: format!("Excel analysis: {file_name}"),
        kind: "excel".into(),
        source_path: path.display().to_string(),
        file_name,
        facts,
        validations,
        preview,
        warnings,
    })
}
