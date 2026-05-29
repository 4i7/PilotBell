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
  advancedEndpoint: boolean;
};

export type ProviderDraft = {
  kind: ProviderKind;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  advancedEndpoint: boolean;
};

export type LegacyProviderConfig = {
  id: string;
  kind?: ProviderKind;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  hasSecret?: boolean;
  advancedEndpoint?: boolean;
};

export type ProviderEndpointRisk = {
  isAdvanced: boolean;
  tone: "neutral" | "warning";
  message: string;
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
    advancedEndpoint: draft.advancedEndpoint,
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

export function providerIsCloud(kind: ProviderKind) {
  return kind === DEFAULT_PROVIDER_KIND || kind === ANTHROPIC_PROVIDER_KIND;
}

export function officialEndpointForProvider(kind: ProviderKind) {
  switch (kind) {
    case DEFAULT_PROVIDER_KIND:
      return "https://api.openai.com/v1/responses";
    case ANTHROPIC_PROVIDER_KIND:
      return "https://api.anthropic.com/v1/messages";
    case OLLAMA_PROVIDER_KIND:
      return "http://127.0.0.1:11434/api/generate";
    case LLAMA_CPP_PROVIDER_KIND:
      return "http://127.0.0.1:8080/v1/chat/completions";
  }
}

export function isLoopbackEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function classifyProviderEndpoint(kind: ProviderKind, endpoint: string): ProviderEndpointRisk {
  const normalizedEndpoint = endpoint.trim().replace(/\/+$/, "").toLowerCase();
  const official = officialEndpointForProvider(kind).replace(/\/+$/, "").toLowerCase();

  if (providerIsCloud(kind)) {
    if (normalizedEndpoint === official) {
      return {
        isAdvanced: false,
        tone: "neutral",
        message: "Official HTTPS endpoint.",
      };
    }
    return {
      isAdvanced: true,
      tone: "warning",
      message:
        "Custom hosted endpoints are advanced. Cloud API keys may be sent to a non-standard URL.",
    };
  }

  if (isLoopbackEndpoint(endpoint)) {
    return {
      isAdvanced: false,
      tone: "neutral",
      message: "Local loopback endpoint.",
    };
  }

  return {
    isAdvanced: true,
    tone: "warning",
    message: "LAN or external local-provider endpoints are advanced and should be trusted explicitly.",
  };
}

export function getProviderCapabilities(kind: ProviderKind): ProviderCapability[] {
  switch (kind) {
    case DEFAULT_PROVIDER_KIND:
      return [
        {
          label: "Hosted",
          detail: "Uses the official hosted HTTPS endpoint unless advanced endpoint mode is enabled.",
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
          detail: "Uses Anthropic's official hosted Messages endpoint unless advanced endpoint mode is enabled.",
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
          detail: "Calls a loopback Ollama server by default; LAN/external endpoints require advanced mode.",
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
          detail: "Calls a loopback llama.cpp server by default; LAN/external endpoints require advanced mode.",
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
