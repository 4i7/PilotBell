import {
  classifyProviderEndpoint,
  providerRequiresApiKey,
  providerIsCloud,
  type ProviderConfig,
} from "../domain/provider";
import { getDocumentTemplateLabel } from "../domain/document";
import type { AttachedPromptFile } from "../domain/prompt";
import type {
  PromptContextPreview,
  PromptContextPreviewItem,
} from "../domain/prompt";
import { formatBytes } from "./formatters";

const MAX_ATTACHMENT_TEXT_BYTES = 200_000;
const MAX_ATTACHMENT_TEXT_CHARS = 8_000;
const MAX_DOCUMENT_CONTEXT_CHARS = 12_000;
const REDACTED_LOCAL_PATH = "[redacted local path]";

export type DocumentReviewContext = {
  jobId: string;
  fileName: string;
  selectedTemplate: string;
  markdownContent: string;
};

function makeAttachmentId() {
  return `attachment-${crypto.randomUUID()}`;
}

export function buildPromptWithAttachments(prompt: string, files: AttachedPromptFile[]) {
  if (files.length === 0) {
    return {
      preparedPrompt: prompt,
      attachmentCount: 0,
    };
  }

  const attachmentBlock = files
    .map((file, index) => {
      const metadata = `${file.name} (${formatBytes(file.size)}${file.type ? `, ${file.type}` : ""})`;
      if (file.textContent) {
        return `[${index + 1}] ${metadata}\n${file.textContent}`;
      }

      return `[${index + 1}] ${metadata}\n${file.note ?? "Attachment added without extracted text content."}`;
    })
    .join("\n\n");

  return {
    preparedPrompt: `Use the following attached file context when it is relevant.\n\n${attachmentBlock}\n\nUser prompt:\n${prompt}`,
    attachmentCount: files.length,
  };
}

function describeAttachment(file: AttachedPromptFile): PromptContextPreviewItem {
  return {
    id: file.id,
    name: file.name,
    detail: `${formatBytes(file.size)}${file.type ? ` / ${file.type}` : ""}`,
    excerpt: file.textContent ?? null,
    note: file.note ?? null,
    textTruncated: file.textTruncated ?? false,
    includedCharCount: file.textContent?.length ?? 0,
  };
}

function buildPreviewWarnings(items: PromptContextPreviewItem[]) {
  return items
    .flatMap((item) => {
      const nextWarnings = [];
      if (item.note) {
        nextWarnings.push(`${item.name}: ${item.note}`);
      }
      if (item.textTruncated && item.note !== "Attachment text was truncated before prompt injection.") {
        nextWarnings.push(`${item.name}: Context was truncated before provider submission.`);
      }
      return nextWarnings;
    })
    .filter((warning, index, values) => values.indexOf(warning) === index);
}

function describeProvider(provider: ProviderConfig) {
  const endpointRisk = classifyProviderEndpoint(provider.kind, provider.endpoint);
  const providerHost = (() => {
    try {
      return new URL(provider.endpoint).host;
    } catch {
      return provider.endpoint;
    }
  })();
  const requiresCloudReview = providerIsCloud(provider.kind);
  const requiresExplicitOptIn = endpointRisk.isAdvanced;

  return {
    endpointRisk,
    providerHost,
    requiresCloudReview,
    requiresExplicitOptIn,
  };
}

export function buildPromptContextPreview(
  prompt: string,
  files: AttachedPromptFile[],
  provider: ProviderConfig,
): PromptContextPreview {
  const { preparedPrompt } = buildPromptWithAttachments(prompt, files);
  const contextItems = files.map(describeAttachment);
  const { endpointRisk, providerHost, requiresCloudReview, requiresExplicitOptIn } =
    describeProvider(provider);
  const warnings = buildPreviewWarnings(contextItems);
  const requiresReview = requiresCloudReview || requiresExplicitOptIn || contextItems.length > 0;
  const reviewReason = requiresExplicitOptIn
    ? "Advanced endpoint opt-in is required before this send."
    : requiresCloudReview
      ? "Cloud-bound sends require review before PilotBell transmits the prompt."
      : contextItems.length > 0
        ? "Attachment context is queued for this send."
        : "Review this send before continuing.";

  return {
    title: "Prompt context review",
    helperText: "This is the exact prompt body that will be sent once approved.",
    contextTitle: "Attachments",
    emptyContextMessage: "No local attachment context is queued for this send.",
    approveLabel: requiresExplicitOptIn ? "I understand, send anyway" : "Send reviewed prompt",
    preparedPrompt,
    providerLabel: `${provider.name} / ${provider.model || "model not set"}`,
    providerEndpoint: provider.endpoint,
    providerHost,
    providerRisk: {
      tone: endpointRisk.tone,
      summary: providerIsCloud(provider.kind)
        ? `Cloud provider. ${endpointRisk.message}`
        : `Local provider. ${endpointRisk.message}`,
    },
    contextItems,
    warnings,
    estimatedChars: preparedPrompt.length,
    requiresCloudReview,
    requiresReview,
    requiresExplicitOptIn,
    secretWillBeUsed: providerRequiresApiKey(provider.kind),
    storedSecretAvailable:
      providerRequiresApiKey(provider.kind) && provider.hasSecret,
    reviewReason,
  };
}

function buildDocumentPrompt(context: DocumentReviewContext) {
  const normalizedMarkdown = redactDocumentLocalPaths(
    context.markdownContent.replace(/\r\n/g, "\n").trim(),
  );
  const includedMarkdown = normalizedMarkdown.slice(0, MAX_DOCUMENT_CONTEXT_CHARS);
  const textTruncated = normalizedMarkdown.length > MAX_DOCUMENT_CONTEXT_CHARS;
  const omittedCharCount = Math.max(0, normalizedMarkdown.length - includedMarkdown.length);
  const templateLabel = getDocumentTemplateLabel(context.selectedTemplate);
  const promptSections = [
    "You are revising a PilotBell-generated Markdown review report for clarity and final wording.",
    "Preserve all factual content, headings, bullet structure, warnings, uncertainty, and explicit limitations from the source.",
    "Do not invent facts, figures, conclusions, or source details that are not present in the provided Markdown.",
    "Return Markdown only.",
    "",
    `Selected template: ${templateLabel} (${context.selectedTemplate})`,
    `Source file: ${context.fileName}`,
    "",
    "PilotBell-generated Markdown review draft:",
    includedMarkdown,
  ];

  return {
    preparedPrompt: promptSections.join("\n"),
    includedMarkdown,
    sourceCharCount: normalizedMarkdown.length,
    omittedCharCount,
    textTruncated,
  };
}

function redactDocumentLocalPaths(markdown: string) {
  return markdown.replace(/^(\s*-\s*Path:\s*)`[^`\n]*`/gim, `$1\`${REDACTED_LOCAL_PATH}\``);
}

export function buildDocumentContextPreview(
  context: DocumentReviewContext,
  provider: ProviderConfig,
): PromptContextPreview {
  const prompt = buildDocumentPrompt(context);
  const { endpointRisk, providerHost, requiresCloudReview, requiresExplicitOptIn } =
    describeProvider(provider);
  const contextItems: PromptContextPreviewItem[] = [
    {
      id: context.jobId,
      name: `${context.fileName} review draft`,
      detail: `${prompt.sourceCharCount.toLocaleString()} source characters / markdown report draft`,
      excerpt: prompt.includedMarkdown,
      note: prompt.textTruncated
        ? `Document review Markdown was truncated by ${prompt.omittedCharCount.toLocaleString()} characters before provider submission.`
        : "Full generated Markdown is included in this provider send.",
      textTruncated: prompt.textTruncated,
      includedCharCount: prompt.includedMarkdown.length,
    },
  ];
  const warnings = buildPreviewWarnings(contextItems);
  const reviewReason = requiresExplicitOptIn
    ? "Advanced endpoint opt-in is required before PilotBell sends document-derived context."
    : requiresCloudReview
      ? "Cloud-bound sends require review before PilotBell transmits document-derived context."
      : "Document-derived Markdown is queued for this send.";

  return {
    title: "Document context review",
    helperText: "This provider payload is built from the same helper that prepares the real document-wording prompt.",
    contextTitle: "Document context",
    emptyContextMessage: "No reviewable document context is queued for this send.",
    approveLabel: requiresExplicitOptIn ? "I understand, send anyway" : "Send reviewed wording prompt",
    preparedPrompt: prompt.preparedPrompt,
    providerLabel: `${provider.name} / ${provider.model || "model not set"}`,
    providerEndpoint: provider.endpoint,
    providerHost,
    providerRisk: {
      tone: endpointRisk.tone,
      summary: providerIsCloud(provider.kind)
        ? `Cloud provider. ${endpointRisk.message}`
        : `Local provider. ${endpointRisk.message}`,
    },
    contextItems,
    warnings,
    estimatedChars: prompt.preparedPrompt.length,
    requiresCloudReview,
    requiresReview: true,
    requiresExplicitOptIn,
    secretWillBeUsed: providerRequiresApiKey(provider.kind),
    storedSecretAvailable:
      providerRequiresApiKey(provider.kind) && provider.hasSecret,
    reviewReason,
  };
}

function extensionForFileName(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
}

function isTextAttachment(file: File) {
  const extension = extensionForFileName(file.name);
  return (
    file.type.startsWith("text/") ||
    [
      "md",
      "txt",
      "json",
      "csv",
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "rs",
      "html",
      "css",
      "toml",
      "yaml",
      "yml",
      "xml",
    ].includes(extension)
  );
}

export async function readAttachedPromptFile(file: File): Promise<AttachedPromptFile> {
  const attachment: AttachedPromptFile = {
    id: makeAttachmentId(),
    name: file.name,
    size: file.size,
    type: file.type,
  };

  const extension = extensionForFileName(file.name);
  if (extension === "pdf") {
    attachment.note =
      "PDF attached. Binary intake is wired, but PDF text extraction is not connected to the prompt pipeline yet.";
    return attachment;
  }

  if (!isTextAttachment(file)) {
    attachment.note =
      "Binary attachment added. Metadata is available, but text extraction is not active for this file type yet.";
    return attachment;
  }

  if (file.size > MAX_ATTACHMENT_TEXT_BYTES) {
    attachment.note =
      "Text attachment added, but it is too large for inline prompt injection. Only metadata was attached.";
    return attachment;
  }

  const rawText = (await file.text()).replace(/\r\n/g, "\n").trim();
  if (!rawText) {
    attachment.note = "Attachment was empty after text extraction.";
    return attachment;
  }

  attachment.textContent = rawText.slice(0, MAX_ATTACHMENT_TEXT_CHARS);
  if (rawText.length > MAX_ATTACHMENT_TEXT_CHARS) {
    attachment.textTruncated = true;
    attachment.note = "Attachment text was truncated before prompt injection.";
  }
  return attachment;
}
