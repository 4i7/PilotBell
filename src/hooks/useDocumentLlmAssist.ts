import { useEffect, useState } from "react";

import type { ReviewableDocumentJob } from "../domain/document";
import type { PromptContextPreview } from "../domain/prompt";
import type { ProviderConfig } from "../domain/provider";
import { type ProviderCommandError, sendProviderPrompt } from "../lib/providerCommands";
import { buildDocumentContextPreview } from "../lib/promptAttachments";

type DocumentLlmAssistStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message: string;
};

type DocumentLlmAssistResult = {
  content: string;
  providerLabel: string;
  fileName: string;
};

type UseDocumentLlmAssistOptions = {
  browserPreviewMessage: string;
  isTauriRuntime: boolean;
  selectedProvider: ProviderConfig | null;
  openProviderSettings: () => void;
};

type PendingDocumentReview = {
  preview: PromptContextPreview;
  source: ReviewableDocumentJob;
  provider: ProviderConfig;
};

function localValidationError(message: string): ProviderCommandError {
  return {
    kind: "validation",
    message,
    retryable: false,
  };
}

export function useDocumentLlmAssist({
  browserPreviewMessage,
  isTauriRuntime,
  selectedProvider,
  openProviderSettings,
}: UseDocumentLlmAssistOptions) {
  const [pendingReview, setPendingReview] = useState<PendingDocumentReview | null>(null);
  const [status, setStatus] = useState<DocumentLlmAssistStatus | null>(null);
  const [replyError, setReplyError] = useState<ProviderCommandError | null>(null);
  const [lastResult, setLastResult] = useState<DocumentLlmAssistResult | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setPendingReview(null);
  }, [selectedProvider?.id]);

  function clearResult() {
    setLastResult(null);
  }

  function requestReview(source: ReviewableDocumentJob) {
    if (!isTauriRuntime) {
      setReplyError(localValidationError(browserPreviewMessage));
      setStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    if (!selectedProvider) {
      const error = localValidationError("Select a provider before sending document-derived context.");
      setReplyError(error);
      setStatus({
        tone: "warning",
        message: error.message,
      });
      openProviderSettings();
      return;
    }

    if (!source.markdownContent.trim()) {
      const error = localValidationError("No reviewable Markdown is available for that document run.");
      setReplyError(error);
      setStatus({
        tone: "warning",
        message: error.message,
      });
      return;
    }

    const preview = buildDocumentContextPreview(source, selectedProvider);
    setPendingReview({
      preview,
      source,
      provider: selectedProvider,
    });
    setReplyError(null);
    setStatus({
      tone: preview.requiresExplicitOptIn || preview.requiresCloudReview ? "warning" : "neutral",
      message: preview.reviewReason,
    });
  }

  function cancelReview() {
    setPendingReview(null);
    setStatus({
      tone: "neutral",
      message: "Document context review dismissed.",
    });
  }

  async function approveReview() {
    if (!pendingReview || isSending) {
      return;
    }

    setPendingReview(null);
    setIsSending(true);
    setReplyError(null);

    try {
      const result = await sendProviderPrompt(
        pendingReview.preview.preparedPrompt,
        pendingReview.provider,
      );
      if (result.status === "success") {
        setLastResult({
          content: result.data.content,
          providerLabel: `${result.data.provider} / ${result.data.model}`,
          fileName: pendingReview.source.fileName,
        });
        setStatus({
          tone: "success",
          message: `Received wording output from ${result.data.provider} / ${result.data.model}.`,
        });
        return;
      }

      setReplyError(result.error);
      setStatus({
        tone: result.error.retryable ? "warning" : "error",
        message: result.error.retryable
          ? "Provider request failed. Adjust settings and retry."
          : "Provider request failed. Inspect provider state before retrying.",
      });
    } catch (error) {
      const nextError = localValidationError(error instanceof Error ? error.message : String(error));
      setReplyError(nextError);
      setStatus({
        tone: "error",
        message: nextError.message,
      });
    } finally {
      setIsSending(false);
    }
  }

  return {
    pendingDocumentContextPreview: pendingReview?.preview ?? null,
    documentAssistStatus: status,
    documentAssistReplyError: replyError,
    documentAssistLastResult: lastResult,
    isSendingDocumentAssist: isSending,
    clearDocumentAssistResult: clearResult,
    requestDocumentAssistReview: requestReview,
    cancelDocumentAssistReview: cancelReview,
    approveDocumentAssistReview: approveReview,
  };
}
