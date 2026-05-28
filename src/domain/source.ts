export const DIRECTORY_SOURCE_KIND = "directory" as const;
export const FILE_SOURCE_KIND = "file" as const;

export type LocalSourceKind = typeof DIRECTORY_SOURCE_KIND | typeof FILE_SOURCE_KIND;

export type LocalSource = {
  id: string;
  kind: LocalSourceKind;
  name: string;
  path: string;
  notes?: string;
};

export type LocalSourceDraft = {
  kind: LocalSourceKind;
  name: string;
  path: string;
  notes: string;
};

export type IndexedSourceChunk = {
  id: string;
  sourceId: string;
  sourceName: string;
  path: string;
  snippet: string;
  text: string;
};

export type LocalSourceIndexSnapshot = {
  builtAt: string;
  sourceCount: number;
  documentCount: number;
  chunkCount: number;
  chunks: IndexedSourceChunk[];
};

export function isLocalSourceKind(value: unknown): value is LocalSourceKind {
  return value === DIRECTORY_SOURCE_KIND || value === FILE_SOURCE_KIND;
}

export function makeLocalSourceId() {
  return `source-${crypto.randomUUID()}`;
}

export function normalizeLocalSourceDraft(draft: LocalSourceDraft): LocalSourceDraft {
  return {
    kind: draft.kind,
    name: draft.name.trim(),
    path: draft.path.trim(),
    notes: draft.notes.trim(),
  };
}

export function isLocalSourceDraftValid(draft: LocalSourceDraft) {
  return Boolean(draft.name && draft.path);
}
