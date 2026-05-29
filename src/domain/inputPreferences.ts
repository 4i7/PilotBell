export type SubmitShortcutMode =
  | "enter"
  | "mod-enter"
  | "shift-enter"
  | "ctrl-enter"
  | "disabled";

export type PromptInputPreferences = {
  submitShortcut: SubmitShortcutMode;
  clearOnSubmit: boolean;
  focusAfterSubmit: boolean;
  allowSubmitWhileSending: boolean;
  autoResize: boolean;
};

export const DEFAULT_PROMPT_INPUT_PREFERENCES: PromptInputPreferences = {
  submitShortcut: "mod-enter",
  clearOnSubmit: false,
  focusAfterSubmit: true,
  allowSubmitWhileSending: false,
  autoResize: true,
};

function isSubmitShortcutMode(value: unknown): value is SubmitShortcutMode {
  return (
    value === "enter" ||
    value === "mod-enter" ||
    value === "shift-enter" ||
    value === "ctrl-enter" ||
    value === "disabled"
  );
}

export function normalizePromptInputPreferences(
  value: unknown,
): PromptInputPreferences {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PROMPT_INPUT_PREFERENCES };
  }

  const item = value as Record<string, unknown>;

  return {
    submitShortcut: isSubmitShortcutMode(item.submitShortcut)
      ? item.submitShortcut
      : DEFAULT_PROMPT_INPUT_PREFERENCES.submitShortcut,
    clearOnSubmit:
      typeof item.clearOnSubmit === "boolean"
        ? item.clearOnSubmit
        : DEFAULT_PROMPT_INPUT_PREFERENCES.clearOnSubmit,
    focusAfterSubmit:
      typeof item.focusAfterSubmit === "boolean"
        ? item.focusAfterSubmit
        : DEFAULT_PROMPT_INPUT_PREFERENCES.focusAfterSubmit,
    allowSubmitWhileSending:
      typeof item.allowSubmitWhileSending === "boolean"
        ? item.allowSubmitWhileSending
        : DEFAULT_PROMPT_INPUT_PREFERENCES.allowSubmitWhileSending,
    autoResize:
      typeof item.autoResize === "boolean"
        ? item.autoResize
        : DEFAULT_PROMPT_INPUT_PREFERENCES.autoResize,
  };
}
