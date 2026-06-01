import { useMemo, useState } from "react";

import {
  DIRECTORY_SOURCE_KIND,
  type LocalSource,
  type LocalSourceDraft,
  isLocalSourceDraftValid,
  makeLocalSourceId,
  normalizeLocalSourceDraft,
} from "../domain/source";
import { loadLocalSources, saveLocalSources } from "../lib/sourceStore";

type InlineStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message: string;
};

const DEFAULT_LOCAL_SOURCE_DRAFT: LocalSourceDraft = {
  kind: DIRECTORY_SOURCE_KIND,
  name: "",
  path: "",
  notes: "",
};

export function useLocalSources(openSourceSettings: () => void) {
  const [sourceStatus, setSourceStatus] = useState<InlineStatus | null>(null);
  const [localSources, setLocalSources] = useState<LocalSource[]>(() => loadLocalSources());
  const [editingSourceId, setEditingSourceId] = useState("");
  const [removingSourceId, setRemovingSourceId] = useState("");
  const [sourceDraft, setSourceDraft] = useState<LocalSourceDraft>({
    ...DEFAULT_LOCAL_SOURCE_DRAFT,
  });

  const editingSource = useMemo(
    () => localSources.find((source) => source.id === editingSourceId) ?? null,
    [localSources, editingSourceId],
  );
  const isSourceActionsDisabled = removingSourceId.length > 0;

  function persistLocalSources(next: LocalSource[]) {
    setLocalSources(next);
    saveLocalSources(next);
  }

  function resetSourceDraft() {
    setEditingSourceId("");
    setSourceDraft({ ...DEFAULT_LOCAL_SOURCE_DRAFT });
  }

  function beginEditSource(source: LocalSource) {
    setEditingSourceId(source.id);
    setSourceDraft({
      kind: source.kind,
      name: source.name,
      path: source.path,
      notes: source.notes ?? "",
    });
    setSourceStatus({
      tone: "neutral",
      message: `Editing ${source.name}. Update the path metadata and save when ready.`,
    });
    openSourceSettings();
  }

  function cancelSourceEdit() {
    resetSourceDraft();
    setSourceStatus({
      tone: "neutral",
      message: "Source editing cancelled.",
    });
  }

  function saveSource() {
    const normalized = normalizeLocalSourceDraft(sourceDraft);
    if (!isLocalSourceDraftValid(normalized)) {
      setSourceStatus({
        tone: "warning",
        message: "Source registration failed: name and path are required.",
      });
      return;
    }

    const nextSource: LocalSource = {
      id: editingSource?.id ?? makeLocalSourceId(),
      kind: normalized.kind,
      name: normalized.name,
      path: normalized.path,
      notes: normalized.notes || undefined,
    };

    if (editingSource) {
      persistLocalSources(
        localSources.map((source) => (source.id === nextSource.id ? nextSource : source)),
      );
      setSourceStatus({
        tone: "success",
        message: `Updated ${nextSource.name}. Source registration is deprecated for new document workflows.`,
      });
    } else {
      persistLocalSources([nextSource, ...localSources]);
      setSourceStatus({
        tone: "success",
        message: `Registered ${nextSource.name}. New document workflows use selected files instead of a persistent index.`,
      });
    }

    resetSourceDraft();
  }

  function removeSource(id: string) {
    setRemovingSourceId(id);
    const next = localSources.filter((source) => source.id !== id);
    persistLocalSources(next);
    if (editingSourceId === id) {
      resetSourceDraft();
    }
    setSourceStatus({
      tone: "neutral",
      message: "Local source registration removed.",
    });
    setRemovingSourceId("");
  }

  return {
    localSources,
    sourceDraft,
    setSourceDraft,
    editingSource,
    sourceStatus,
    setSourceStatus,
    isSourceActionsDisabled,
    removingSourceId,
    saveSource,
    cancelSourceEdit,
    beginEditSource,
    removeSource,
  };
}
