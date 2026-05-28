export const DEFAULT_PROVIDER_KIND = "openai-responses" as const;
export const ANTHROPIC_PROVIDER_KIND = "anthropic-messages" as const;
export const OLLAMA_PROVIDER_KIND = "ollama" as const;
export const LLAMA_CPP_PROVIDER_KIND = "llama-cpp" as const;

export type ProviderKind =
  | typeof DEFAULT_PROVIDER_KIND
  | typeof ANTHROPIC_PROVIDER_KIND
  | typeof OLLAMA_PROVIDER_KIND
  | typeof LLAMA_CPP_PROVIDER_KIND;

export type ProviderCapability = {
  label: string;
  detail: string;
};

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

export function isProviderKind(value: unknown): value is ProviderKind {
  return (
    value === DEFAULT_PROVIDER_KIND ||
    value === ANTHROPIC_PROVIDER_KIND ||
    value === OLLAMA_PROVIDER_KIND ||
    value === LLAMA_CPP_PROVIDER_KIND
  );
}

export function providerRequiresApiKey(kind: ProviderKind) {
  return kind === DEFAULT_PROVIDER_KIND || kind === ANTHROPIC_PROVIDER_KIND;
}

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

export function isProviderDraftValid(
  draft: ProviderDraft,
  options: { requireApiKey?: boolean } = { requireApiKey: true },
) {
  return Boolean(
    draft.name &&
      draft.endpoint &&
      draft.model &&
      (options.requireApiKey === false || draft.apiKey),
  );
}

export function getProviderCapabilities(kind: ProviderKind): ProviderCapability[] {
  switch (kind) {
    case DEFAULT_PROVIDER_KIND:
      return [
        {
          label: "Hosted",
          detail: "Calls a remote HTTPS endpoint from the Tauri backend.",
        },
        {
          label: "Secure key",
          detail: "Requires an API key stored in the OS credential store.",
        },
        {
          label: "Responses API",
          detail: "Uses the OpenAI Responses request and response shape.",
        },
      ];
    case ANTHROPIC_PROVIDER_KIND:
      return [
        {
          label: "Hosted",
          detail: "Calls Anthropic's hosted Messages API over HTTPS from the Tauri backend.",
        },
        {
          label: "Secure key",
          detail: "Requires an API key stored in the OS credential store.",
        },
        {
          label: "Messages API",
          detail: "Uses the Anthropic Messages request and response shape.",
        },
      ];
    case OLLAMA_PROVIDER_KIND:
      return [
        {
          label: "Local",
          detail: "Calls a local Ollama server from the Tauri backend.",
        },
        {
          label: "No API key",
          detail: "Uses local HTTP without storing a provider secret.",
        },
        {
          label: "Ollama generate",
          detail: "Uses the /api/generate request and response shape.",
        },
      ];
    case LLAMA_CPP_PROVIDER_KIND:
      return [
        {
          label: "Local",
          detail: "Calls a local llama.cpp server from the Tauri backend.",
        },
        {
          label: "No API key",
          detail: "Uses local HTTP without storing a provider secret.",
        },
        {
          label: "Chat completions",
          detail: "Uses llama.cpp's OpenAI-compatible /v1/chat/completions shape.",
        },
      ];
  }
}
