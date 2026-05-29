import type { ComponentType, SVGProps } from "react";

type ChromeActionsProps = {
  onOpenSettings: () => void;
  SettingsIcon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function ChromeActions({
  onOpenSettings,
  SettingsIcon,
}: ChromeActionsProps) {
  return (
    <div className="chrome-actions">
      <button
        type="button"
        className="window-icon-button chrome-action-button"
        onClick={onOpenSettings}
        aria-label="Open settings"
      >
        <SettingsIcon />
      </button>
    </div>
  );
}
