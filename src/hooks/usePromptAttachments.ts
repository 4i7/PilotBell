import { type ChangeEvent, type DragEvent, useState } from "react";

import type { AttachedPromptFile } from "../domain/prompt";
import { readAttachedPromptFile } from "../lib/promptAttachments";

type UsePromptAttachmentsOptions = {
  onAttachmentsAdded: (count: number) => void;
};

export function usePromptAttachments({ onAttachmentsAdded }: UsePromptAttachmentsOptions) {
  const [attachedFiles, setAttachedFiles] = useState<AttachedPromptFile[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  function clearAttachments() {
    setAttachedFiles([]);
  }

  async function handleAttachFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList);
    if (nextFiles.length === 0) {
      return;
    }

    const loaded = await Promise.all(nextFiles.map((file) => readAttachedPromptFile(file)));
    setAttachedFiles((current) => [...current, ...loaded]);
    onAttachmentsAdded(loaded.length);
  }

  async function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!event.currentTarget.files) {
      return;
    }

    await handleAttachFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  function removeAttachment(id: string) {
    setAttachedFiles((current) => current.filter((file) => file.id !== id));
  }

  function onComposerDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDraggingFiles(true);
  }

  function onComposerDragLeave(event: DragEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFiles(false);
    }
  }

  async function onComposerDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDraggingFiles(false);
    if (event.dataTransfer.files.length === 0) {
      return;
    }

    await handleAttachFiles(event.dataTransfer.files);
  }

  return {
    attachedFiles,
    isDraggingFiles,
    clearAttachments,
    onFileInputChange,
    onComposerDragOver,
    onComposerDragLeave,
    onComposerDrop,
    removeAttachment,
  };
}
