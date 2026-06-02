import {
  ANTHROPIC_PROVIDER_KIND,
  DEFAULT_PROVIDER_KIND,
  LLAMA_CPP_PROVIDER_KIND,
  OLLAMA_PROVIDER_KIND,
  type ProviderKind,
} from "../../domain/provider";
import type { SubmitShortcutMode } from "../../domain/inputPreferences";

export const PROVIDER_KIND_OPTIONS: Array<{ value: ProviderKind; label: string }> = [
  { value: DEFAULT_PROVIDER_KIND, label: "OpenAI Responses" },
  { value: ANTHROPIC_PROVIDER_KIND, label: "Anthropic Messages" },
  { value: OLLAMA_PROVIDER_KIND, label: "Ollama" },
  { value: LLAMA_CPP_PROVIDER_KIND, label: "llama.cpp" },
];

export const SUBMIT_SHORTCUT_OPTIONS: Array<{
  value: SubmitShortcutMode;
  label: string;
}> = [
  { value: "mod-enter", label: "Ctrl/Cmd+Enter" },
  { value: "enter", label: "Enter" },
  { value: "shift-enter", label: "Shift+Enter" },
  { value: "ctrl-enter", label: "Ctrl+Enter" },
  { value: "disabled", label: "Disabled" },
];

export function providerKindLabel(kind: ProviderKind) {
  return PROVIDER_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}
