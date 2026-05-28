export const DEFAULT_PROVIDER_KIND = "openai-responses" as const;

export type ProviderKind = typeof DEFAULT_PROVIDER_KIND;

export type ProviderConfig = {
  id: string;
  kind: ProviderKind;
  name: string;
  endpoint: string;
  model: string;
  hasSecret: boolean;
};

export type ProviderDraft = {
  kind: ProviderKind;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
};

export type LegacyProviderConfig = {
  id: string;
  kind?: ProviderKind;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  hasSecret?: boolean;
};

export function makeProviderId() {
  return `provider-${crypto.randomUUID()}`;
}

export function normalizeProviderDraft(draft: ProviderDraft): ProviderDraft {
  return {
    kind: draft.kind,
    name: draft.name.trim(),
    endpoint: draft.endpoint.trim(),
    apiKey: draft.apiKey.trim(),
    model: draft.model.trim(),
  };
}

export function isProviderDraftValid(draft: ProviderDraft) {
  return Boolean(draft.name && draft.endpoint && draft.apiKey && draft.model);
}
