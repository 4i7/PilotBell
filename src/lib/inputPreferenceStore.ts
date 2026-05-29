import {
  DEFAULT_PROMPT_INPUT_PREFERENCES,
  normalizePromptInputPreferences,
  type PromptInputPreferences,
} from "../domain/inputPreferences";

const STORAGE_KEY = "pilotbell.inputPreferences";

export function loadPromptInputPreferences(): PromptInputPreferences {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_PROMPT_INPUT_PREFERENCES };
  }

  try {
    return normalizePromptInputPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PROMPT_INPUT_PREFERENCES };
  }
}

export function savePromptInputPreferences(
  preferences: PromptInputPreferences,
) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
