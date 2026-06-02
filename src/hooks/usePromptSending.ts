import { type RefObject, useEffect, useState } from "react";

import type { PromptContextPreview } from "../domain/prompt";
import type { ProviderConfig } from "../domain/provider";
import type { PromptInputPreferences } from "../domain/inputPreferences";
import type { AttachedPromptFile } from "../domain/prompt";
import type { PromptSessionEntry } from "../lib/sessionStore";
import { type ProviderCommandError, sendProviderPrompt } from "../lib/providerCommands";
import { buildPromptContextPreview, buildPromptWithAttachments } from "../lib/promptAttachments";

type PromptStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message: string;
  dismissKey?: "global-shortcut";
};

type UsePromptSendingOptions = {
  attachedFiles: AttachedPromptFile[];
  browserPreviewMessage: string;
  inputPreferences: PromptInputPreferences;
  isTauriRuntime: boolean;
  prompt: string;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  selectedProvider: ProviderConfig | null;
  addSessionEntry: (entry: PromptSessionEntry) => void;
  clearAttachments: () => void;
  openProviderSettings: () => void;
  setChatStatus: (status: PromptStatus | null) => void;
  setPrompt: (prompt: string) => void;
  toneForProviderError: (error: ProviderCommandError) => PromptStatus["tone"];
};

type PendingPromptReview = {
  preview: PromptContextPreview;
  prompt: string;
  provider: ProviderConfig;
  options: PromptInputPreferences;
  clearPromptOnSuccess: boolean;
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
  inputPreferences,
  isTauriRuntime,
  prompt,
  promptRef,
  selectedProvider,
  addSessionEntry,
  clearAttachments,
  openProviderSettings,
  setChatStatus,
  setPrompt,
  toneForProviderError,
}: UsePromptSendingOptions) {
  const [replyError, setReplyError] = useState<ProviderCommandError | null>(null);
  const [pendingSendCount, setPendingSendCount] = useState(0);
  const [pendingReview, setPendingReview] = useState<PendingPromptReview | null>(null);
  const isSending = pendingSendCount > 0;

  useEffect(() => {
    setPendingReview(null);
  }, [attachedFiles, prompt, selectedProvider?.id]);

  function clearReplyError() {
    setReplyError(null);
  }

  async function performSend(
    targetPrompt: string,
    targetProvider: ProviderConfig,
    options: PromptInputPreferences,
    clearPromptOnSuccess: boolean,
    preview?: PromptContextPreview,
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

    setPendingSendCount((current) => current + 1);
    setReplyError(null);

    try {
      const withAttachments =
        preview ?? buildPromptContextPreview(targetPrompt, attachedFiles, targetProvider);
      const preparedPrompt =
        attachedFiles.length > 0
          ? withAttachments.preparedPrompt
          : buildPromptWithAttachments(targetPrompt, attachedFiles).preparedPrompt;
      const result = await sendProviderPrompt(preparedPrompt, targetProvider);
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
        if (clearPromptOnSuccess && options.clearOnSubmit) {
          setPrompt("");
        }
        clearAttachments();
        setChatStatus({
          tone: "success",
          message:
            attachedFiles.length > 0
              ? `Responded with ${result.data.provider} / ${result.data.model} using ${attachedFiles.length} attachment(s).`
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
    }
  }

  async function sendPrompt(
    promptOverride?: string,
    providerOverride?: ProviderConfig,
    options: PromptInputPreferences = inputPreferences,
  ) {
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

    if (attachedFiles.length > 0) {
      const preview = buildPromptContextPreview(targetPrompt, attachedFiles, targetProvider);
      setPendingReview({
        preview,
        prompt: targetPrompt,
        provider: targetProvider,
        options,
        clearPromptOnSuccess: promptOverride === undefined,
      });
      setChatStatus({
        tone: preview.requiresCloudReview ? "warning" : "neutral",
        message: preview.requiresCloudReview
          ? "Review the exact attachment context before sending it to the selected cloud provider."
          : "Review the exact attachment context before sending it to the selected local provider.",
      });
      return;
    }

    await performSend(targetPrompt, targetProvider, options, promptOverride === undefined);
  }

  function cancelPromptReview() {
    setPendingReview(null);
    setChatStatus({
      tone: "neutral",
      message: "Attachment context review dismissed. Edit the prompt or send again when ready.",
    });
  }

  function approvePromptReview() {
    if (!pendingReview) {
      return;
    }

    const nextReview = pendingReview;
    setPendingReview(null);
    void performSend(
      nextReview.prompt,
      nextReview.provider,
      nextReview.options,
      nextReview.clearPromptOnSuccess,
      nextReview.preview,
    );
  }

  function requestPromptSubmit() {
    void sendPrompt(undefined, undefined, inputPreferences);
  }

  return {
    isSending,
    replyError,
    pendingPromptContextPreview: pendingReview?.preview ?? null,
    clearReplyError,
    cancelPromptReview,
    approvePromptReview,
    requestPromptSubmit,
    sendPrompt,
  };
}
