import type { AttachedPromptFile } from "../domain/prompt";
import { formatBytes } from "./formatters";

const MAX_ATTACHMENT_TEXT_BYTES = 200_000;
const MAX_ATTACHMENT_TEXT_CHARS = 8_000;

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
    attachment.note = "Attachment text was truncated before prompt injection.";
  }
  return attachment;
}
