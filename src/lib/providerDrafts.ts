import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  LLAMA_CPP_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderDraft,
} from "../domain/provider";

export const DEFAULT_PROVIDER_DRAFT: ProviderDraft = {
  kind: DEFAULT_PROVIDER_KIND,
  name: "OpenAI",
  endpoint: "https://api.openai.com/v1/responses",
  apiKey: "",
  model: "",
  advancedEndpoint: false,
};

export const OLLAMA_PROVIDER_DRAFT: ProviderDraft = {
  kind: OLLAMA_PROVIDER_KIND,
  name: "Ollama",
  endpoint: "http://127.0.0.1:11434/api/generate",
  apiKey: "",
  model: "llama3.2",
  advancedEndpoint: false,
};

export const ANTHROPIC_PROVIDER_DRAFT: ProviderDraft = {
  kind: ANTHROPIC_PROVIDER_KIND,
  name: "Anthropic",
  endpoint: "https://api.anthropic.com/v1/messages",
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  advancedEndpoint: false,
};

export const LLAMA_CPP_PROVIDER_DRAFT: ProviderDraft = {
  kind: LLAMA_CPP_PROVIDER_KIND,
  name: "llama.cpp",
  endpoint: "http://127.0.0.1:8080/v1/chat/completions",
  apiKey: "",
  model: "local-llama",
  advancedEndpoint: false,
};
