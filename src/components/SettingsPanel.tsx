import type { ComponentType, MouseEvent, ReactElement, ReactNode, RefObject, SVGProps } from "react";
import { WindowControls } from "./WindowControls";
import type {
  ResolvedTheme,
  ThemePreference,
} from "../lib/themeStore";

type SettingsSection = "providers" | "documents" | "sources";

type ThemeOption = {
  value: ThemePreference;
  label: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
};

type SettingsPanelProps = {
  isOpen: boolean;
  mode?: "overlay" | "window";
  shouldPromptInitialSetup: boolean;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  onStartDrag?: () => void;
  onMinimize?: () => void;
  onToggleMaximize?: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
  isMaximized?: boolean;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  themeOptions: ThemeOption[];
  onThemeChange: (theme: ThemePreference) => void;
  MinusIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  MaximizeIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  RestoreIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  CloseIcon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
};

export function SettingsPanel({
  isOpen,
  mode = "overlay",
  shouldPromptInitialSetup,
  activeSection,
  onSectionChange,
  onClose,
  onStartDrag,
  onMinimize,
  onToggleMaximize,
  panelRef,
  isMaximized = false,
  themePreference,
  resolvedTheme,
  themeOptions,
  onThemeChange,
  MinusIcon,
  MaximizeIcon,
  RestoreIcon,
  CloseIcon,
  children,
}: SettingsPanelProps) {
  if (!isOpen) {
    return null;
  }

  function handleDragMouseDown(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    onStartDrag?.();
  }

  const panel = (
    <div className="settings-panel" ref={panelRef}>
      {mode === "window" ? (
        <header className="settings-window-chrome">
          <div
            className="settings-window-title"
            data-tauri-drag-region
            onMouseDown={handleDragMouseDown}
          >
            <span className="window-badge">PilotBell Settings</span>
          </div>
          {MinusIcon && MaximizeIcon && RestoreIcon && onMinimize && onToggleMaximize ? (
            <WindowControls
              isMaximized={isMaximized}
              onMinimize={onMinimize}
              onToggleMaximize={onToggleMaximize}
              onClose={onClose}
              MinusIcon={MinusIcon}
              MaximizeIcon={MaximizeIcon}
              RestoreIcon={RestoreIcon}
              CloseIcon={CloseIcon}
            />
          ) : (
            <button
              type="button"
              className="window-icon-button danger"
              onClick={onClose}
              aria-label="Close settings"
            >
              <CloseIcon />
            </button>
          )}
        </header>
      ) : null}
      <div className="settings-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>{shouldPromptInitialSetup ? "First run setup" : "PilotBell settings"}</h2>
          <p className="helper">
            {shouldPromptInitialSetup
              ? "PilotBell detected no proven-ready provider yet. Save and test one provider to move into the compact prompt-only surface."
              : "Provider and document workflow controls stay here so the main surface can remain focused."}
          </p>
        </div>

        <div className="settings-header-actions">
          <div className="theme-switcher" role="group" aria-label="Theme">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={option.value === themePreference ? "theme-option active" : "theme-option"}
                  onClick={() => onThemeChange(option.value)}
                  aria-pressed={option.value === themePreference}
                  title={
                    option.value === "system"
                      ? `Follow system theme. Current: ${resolvedTheme}.`
                      : `${option.label} theme`
                  }
                >
                  <Icon />
                </button>
              );
            })}
          </div>

          {mode === "overlay" && !shouldPromptInitialSetup ? (
              <button
                type="button"
                className="window-icon-button"
                onClick={onClose}
                aria-label="Close settings"
              >
                <CloseIcon />
              </button>
          ) : null}
        </div>
      </div>

      <div className="settings-tabs">
        <button
          type="button"
          className={activeSection === "providers" ? "settings-tab active" : "settings-tab"}
          onClick={() => onSectionChange("providers")}
        >
          Providers
        </button>
        <button
          type="button"
          className={activeSection === "documents" ? "settings-tab active" : "settings-tab"}
          onClick={() => onSectionChange("documents")}
        >
          Documents
        </button>
        <button
          type="button"
          className={activeSection === "sources" ? "settings-tab active" : "settings-tab"}
          onClick={() => onSectionChange("sources")}
        >
          Sources
        </button>
      </div>

      {children}
    </div>
  );

  if (mode === "window") {
    return <main className="settings-window-page">{panel}</main>;
  }

  return <div className="settings-overlay">{panel}</div>;
}
