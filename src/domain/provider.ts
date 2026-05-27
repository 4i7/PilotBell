export type ProviderConfig = {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
};

export type ProviderDraft = Omit<ProviderConfig, "id">;

export function makeProviderId() {
  return `provider-${crypto.randomUUID()}`;
}

export function normalizeProviderDraft(draft: ProviderDraft): ProviderDraft {
  return {
    name: draft.name.trim(),
    endpoint: draft.endpoint.trim(),
    apiKey: draft.apiKey.trim(),
    model: draft.model.trim(),
  };
}

export function isProviderDraftValid(draft: ProviderDraft) {
  return Boolean(draft.name && draft.endpoint && draft.apiKey && draft.model);
}
