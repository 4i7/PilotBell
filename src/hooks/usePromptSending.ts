import { type RefObject, useState } from "react";

import { providerIsCloud, type ProviderConfig } from "../domain/provider";
import type { PromptInputPreferences } from "../domain/inputPreferences";
import type { AttachedPromptFile } from "../domain/prompt";
import type { PromptSessionEntry } from "../lib/sessionStore";
import { type ProviderCommandError, sendProviderPrompt } from "../lib/providerCommands";
import { buildPromptWithAttachments } from "../lib/promptAttachments";

type PromptStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message: string;
  dismissKey?: "global-shortcut";
};

type UsePromptSendingOptions = {
  attachedFiles: AttachedPromptFile[];
  browserPreviewMessage: string;
  cloudContextReviewAccepted: boolean;
  hasLocalAttachmentContext: boolean;
  inputPreferences: PromptInputPreferences;
  isTauriRuntime: boolean;
  prompt: string;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  selectedProvider: ProviderConfig | null;
  acceptCloudContextReview: () => void;
  addSessionEntry: (entry: PromptSessionEntry) => void;
  clearAttachments: () => void;
  openProviderSettings: () => void;
  resetCloudContextReview: () => void;
  setChatStatus: (status: PromptStatus | null) => void;
  setPrompt: (prompt: string) => void;
  toneForProviderError: (error: ProviderCommandError) => PromptStatus["tone"];
};

function localValidationError(message: string): ProviderCommandError {
  return {
    kind: "validation",
    message,
    retryable: false,
  };
}

function makeSessionEntryId() {
  return `session-${crypto.randomUUID()}`;
}

export function usePromptSending({
  attachedFiles,
  browserPreviewMessage,
  cloudContextReviewAccepted,
  hasLocalAttachmentContext,
  inputPreferences,
  isTauriRuntime,
  prompt,
  promptRef,
  selectedProvider,
  acceptCloudContextReview,
  addSessionEntry,
  clearAttachments,
  openProviderSettings,
  resetCloudContextReview,
  setChatStatus,
  setPrompt,
  toneForProviderError,
}: UsePromptSendingOptions) {
  const [replyError, setReplyError] = useState<ProviderCommandError | null>(null);
  const [pendingSendCount, setPendingSendCount] = useState(0);
  const isSending = pendingSendCount > 0;

  function clearReplyError() {
    setReplyError(null);
  }

  async function sendPrompt(
    promptOverride?: string,
    providerOverride?: ProviderConfig,
    options: PromptInputPreferences = inputPreferences,
  ) {
    if (!isTauriRuntime) {
      setReplyError(localValidationError(browserPreviewMessage));
      setChatStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    if (isSending && !options.allowSubmitWhileSending) {
      const error = localValidationError("Wait for the current response before sending again.");
      setReplyError(error);
      setChatStatus({
        tone: "warning",
        message: error.message,
      });
      return;
    }

    const targetPrompt = promptOverride ?? prompt;
    const targetProvider = providerOverride ?? selectedProvider;

    if (!targetProvider) {
      const error = localValidationError("Select a provider before sending.");
      setReplyError(error);
      setChatStatus({
        tone: "warning",
        message: error.message,
      });
      openProviderSettings();
      return;
    }
    if (!targetPrompt.trim()) {
      const error = localValidationError("Prompt is empty.");
      setReplyError(error);
      setChatStatus({
        tone: "warning",
        message: error.message,
      });
      return;
    }

    if (
      providerIsCloud(targetProvider.kind) &&
      hasLocalAttachmentContext &&
      !cloudContextReviewAccepted
    ) {
      acceptCloudContextReview();
      setChatStatus({
        tone: "warning",
        message:
          "Local document excerpts may be included in prompts sent to the selected provider. Review the context before sending sensitive data. Press send again to continue.",
      });
      return;
    }

    setPendingSendCount((current) => current + 1);
    setReplyError(null);

    try {
      const withAttachments = buildPromptWithAttachments(targetPrompt, attachedFiles);
      const result = await sendProviderPrompt(withAttachments.preparedPrompt, targetProvider);
      if (result.status === "success") {
        addSessionEntry({
          id: makeSessionEntryId(),
          prompt: targetPrompt,
          createdAt: new Date().toISOString(),
          providerId: targetProvider.id,
          providerName: result.data.provider,
          model: result.data.model,
          response: result.data.content,
        });
        if (promptOverride === undefined && options.clearOnSubmit) {
          setPrompt("");
        }
        clearAttachments();
        setChatStatus({
          tone: "success",
          message:
            withAttachments.attachmentCount > 0
              ? `Responded with ${result.data.provider} / ${result.data.model} using ${withAttachments.attachmentCount} attachment(s).`
              : `Responded with ${result.data.provider} / ${result.data.model}.`,
        });
      } else {
        setReplyError(result.error);
        addSessionEntry({
          id: makeSessionEntryId(),
          prompt: targetPrompt,
          createdAt: new Date().toISOString(),
          providerId: targetProvider.id,
          providerName: targetProvider.name,
          model: targetProvider.model,
          error: result.error.message,
        });
        setChatStatus({
          tone: toneForProviderError(result.error),
          message: result.error.retryable
            ? "Provider request failed. Adjust settings and retry."
            : "Provider request failed. Inspect provider state before retrying.",
        });
      }
    } catch (err) {
      const error = localValidationError(err instanceof Error ? err.message : String(err));
      setReplyError(error);
      setChatStatus({
        tone: "error",
        message: error.message,
      });
    } finally {
      setPendingSendCount((current) => Math.max(0, current - 1));
      if (options.focusAfterSubmit) {
        promptRef.current?.focus();
      }
      if (attachedFiles.length === 0) {
        resetCloudContextReview();
      }
    }
  }

  function requestPromptSubmit() {
    void sendPrompt(undefined, undefined, inputPreferences);
  }

  return {
    isSending,
    replyError,
    clearReplyError,
    requestPromptSubmit,
    sendPrompt,
  };
}
