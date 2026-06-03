import type { PromptInputPreferences, SubmitShortcutMode } from "../../domain/inputPreferences";
import { SUBMIT_SHORTCUT_OPTIONS } from "./options";

type PromptInputSettingsProps = {
  inputPreferences: PromptInputPreferences;
  updateInputPreferences: (
    updater: (current: PromptInputPreferences) => PromptInputPreferences,
  ) => void;
};

export function PromptInputSettings({
  inputPreferences,
  updateInputPreferences,
}: PromptInputSettingsProps) {
  return (
    <div className="settings-summary-card">
      <div className="section-heading">
        <div>
          <h3>Prompt input</h3>
          <p>Composer behavior stays here so the main surface remains focused on the next prompt.</p>
        </div>
      </div>

      <div className="settings-grid settings-grid-single">
        <select
          value={inputPreferences.submitShortcut}
          onChange={(event) =>
            updateInputPreferences((current) => ({
              ...current,
              submitShortcut: event.currentTarget.value as SubmitShortcutMode,
            }))
          }
        >
          {SUBMIT_SHORTCUT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-checkbox-list">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={inputPreferences.clearOnSubmit}
            onChange={(event) =>
              updateInputPreferences((current) => ({
                ...current,
                clearOnSubmit: event.currentTarget.checked,
              }))
            }
          />
          Clear prompt after a successful send
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={inputPreferences.focusAfterSubmit}
            onChange={(event) =>
              updateInputPreferences((current) => ({
                ...current,
                focusAfterSubmit: event.currentTarget.checked,
              }))
            }
          />
          Return focus to the prompt after submit
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={inputPreferences.allowSubmitWhileSending}
            onChange={(event) =>
              updateInputPreferences((current) => ({
                ...current,
                allowSubmitWhileSending: event.currentTarget.checked,
              }))
            }
          />
          Allow a new send while a response is still running
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={inputPreferences.autoResize}
            onChange={(event) =>
              updateInputPreferences((current) => ({
                ...current,
                autoResize: event.currentTarget.checked,
              }))
            }
          />
          Auto-resize the prompt field
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={inputPreferences.reviewCloudBeforeSend}
            onChange={(event) =>
              updateInputPreferences((current) => ({
                ...current,
                reviewCloudBeforeSend: event.currentTarget.checked,
              }))
            }
          />
          Require review before cloud sends
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={inputPreferences.reviewAdvancedEndpointsBeforeSend}
            onChange={(event) =>
              updateInputPreferences((current) => ({
                ...current,
                reviewAdvancedEndpointsBeforeSend: event.currentTarget.checked,
              }))
            }
          />
          Require explicit opt-in before advanced endpoint sends
        </label>
      </div>
    </div>
  );
}
