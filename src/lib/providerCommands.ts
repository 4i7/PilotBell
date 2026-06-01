import { invoke } from "@tauri-apps/api/core";

import type { ProviderConfig } from "../domain/provider";

export type AssistantReply = {
  content: string;
  provider: string;
  model: string;
};

export type ProviderErrorKind =
  | "validation"
  | "secret_store"
  | "timeout"
  | "network"
  | "provider"
  | "response_format"
  | "internal";

export type ProviderCommandError = {
  kind: ProviderErrorKind;
  message: string;
  statusCode?: number | null;
  retryable: boolean;
  details?: string | null;
};

export type ProviderHealth = {
  message: string;
};

export type ProviderSecretStatus = {
  providerId: string;
  message: string;
};

export type ProviderSecretDiagnosis = {
  providerId: string;
  hasSecret: boolean;
  message: string;
};

export type CommandResult<T> =
  | {
      status: "success";
      data: T;
    }
  | {
      status: "error";
      error: ProviderCommandError;
    };

export function storeProviderSecret(providerId: string, apiKey: string) {
  return invoke<CommandResult<ProviderSecretStatus>>("store_provider_secret", {
    input: {
      providerId,
      apiKey,
    },
  });
}

export function deleteProviderSecret(providerId: string) {
  return invoke<CommandResult<ProviderSecretStatus>>("delete_provider_secret", {
    providerId,
  });
}

export function diagnoseProviderSecret(providerId: string) {
  return invoke<CommandResult<ProviderSecretDiagnosis>>("diagnose_provider_secret", {
    providerId,
  });
}

export function testProviderConnection(provider: ProviderConfig) {
  return invoke<CommandResult<ProviderHealth>>("test_provider", {
    provider,
  });
}

export function sendProviderPrompt(prompt: string, provider: ProviderConfig) {
  return invoke<CommandResult<AssistantReply>>("handle_prompt", {
    prompt,
    provider,
  });
}
