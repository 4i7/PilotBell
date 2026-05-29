import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import {
  DEFAULT_DOCUMENT_TEMPLATE,
  DOCUMENT_JOB_PROGRESS_EVENT,
  type DocumentJobDraft,
  type DocumentJobMetadata,
  type DocumentJobProgress,
  type DocumentWorkflowResult,
  isDocumentJobDraftReady,
  makeDocumentJobId,
} from "../domain/document";
import {
  clearDeprecatedLocalSourceIndex,
  loadDocumentJobs,
  saveDocumentJobs,
} from "../lib/documentJobStore";

const DEFAULT_DRAFT: DocumentJobDraft = {
  inputPath: "",
  outputDir: "",
  selectedTemplate: DEFAULT_DOCUMENT_TEMPLATE,
  providerId: "",
  overwrite: false,
};

export function useDocumentJobs(isTauriRuntime: boolean) {
  const [draft, setDraft] = useState<DocumentJobDraft>({ ...DEFAULT_DRAFT });
  const [jobs, setJobs] = useState<DocumentJobMetadata[]>(() => loadDocumentJobs());
  const [progress, setProgress] = useState<Record<string, DocumentJobProgress>>({});
  const [activeJobId, setActiveJobId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    clearDeprecatedLocalSourceIndex();
  }, []);

  useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    async function bindProgress() {
      unlisten = await listen<DocumentJobProgress>(DOCUMENT_JOB_PROGRESS_EVENT, (event) => {
        if (disposed) {
          return;
        }
        setProgress((current) => ({
          ...current,
          [event.payload.jobId]: event.payload,
        }));
        setStatusMessage(event.payload.message);
      });
    }

    void bindProgress();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isTauriRuntime]);

  function persistJobs(next: DocumentJobMetadata[]) {
    setJobs(next);
    saveDocumentJobs(next);
  }

  async function startJob() {
    if (!isDocumentJobDraftReady(draft)) {
      setStatusMessage("Select an input file and output folder before starting a document workflow.");
      return;
    }

    if (!isTauriRuntime) {
      setStatusMessage("Open PilotBell through Tauri to run document workflows.");
      return;
    }

    const jobId = makeDocumentJobId();
    setActiveJobId(jobId);
    setIsRunning(true);
    setStatusMessage("Starting document workflow...");

    try {
      const result = await invoke<DocumentWorkflowResult>("start_document_workflow", {
        request: {
          jobId,
          inputPath: draft.inputPath.trim(),
          outputDir: draft.outputDir.trim(),
          selectedTemplate: draft.selectedTemplate.trim(),
          providerId: draft.providerId.trim() || null,
          overwrite: draft.overwrite,
        },
      });
      persistJobs([result.metadata, ...jobs]);
      setStatusMessage(
        result.warnings.length > 0
          ? `${result.metadata.fileName} completed with ${result.warnings.length} warning(s).`
          : `${result.metadata.fileName} completed.`,
      );
    } catch (error) {
      const errorSummary = error instanceof Error ? error.message : String(error);
      const failedJob: DocumentJobMetadata = {
        jobId,
        fileName: fileNameFromPath(draft.inputPath),
        filePath: draft.inputPath.trim(),
        outputPath: draft.outputDir.trim(),
        timestamp: new Date().toISOString(),
        status: "failed",
        selectedTemplate: draft.selectedTemplate.trim(),
        providerId: draft.providerId.trim() || null,
        errorSummary,
      };
      persistJobs([failedJob, ...jobs]);
      setStatusMessage(errorSummary);
    } finally {
      setIsRunning(false);
    }
  }

  async function cancelActiveJob() {
    if (!activeJobId || !isTauriRuntime) {
      return;
    }
    try {
      await invoke("cancel_document_job", { jobId: activeJobId });
      setStatusMessage("Cancel requested for the active document workflow.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  function clearJobs() {
    persistJobs([]);
    setProgress({});
    setStatusMessage("Document job metadata cleared.");
  }

  const activeProgress = activeJobId ? progress[activeJobId] ?? null : null;
  const latestProgress = useMemo(() => {
    const values = Object.values(progress);
    return values.length > 0 ? values[values.length - 1] ?? null : null;
  }, [progress]);

  return {
    draft,
    setDraft,
    jobs,
    progress,
    activeProgress,
    latestProgress,
    statusMessage,
    isRunning,
    startJob,
    cancelActiveJob,
    clearJobs,
  };
}

function fileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? "document";
}
