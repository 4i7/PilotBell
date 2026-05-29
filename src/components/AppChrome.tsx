import type { ComponentType, MouseEvent, SVGProps } from "react";
import { ChromeActions } from "./ChromeActions";
import { WindowControls } from "./WindowControls";

type AppChromeProps = {
  title?: string;
  showSettingsButton?: boolean;
  isMaximized: boolean;
  onOpenSettings: () => void;
  onStartDrag: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  SettingsIcon: ComponentType<SVGProps<SVGSVGElement>>;
  MinusIcon: ComponentType<SVGProps<SVGSVGElement>>;
  MaximizeIcon: ComponentType<SVGProps<SVGSVGElement>>;
  RestoreIcon: ComponentType<SVGProps<SVGSVGElement>>;
  CloseIcon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function AppChrome({
  title = "PilotBell",
  showSettingsButton = true,
  isMaximized,
  onOpenSettings,
  onStartDrag,
  onMinimize,
  onToggleMaximize,
  onClose,
  SettingsIcon,
  MinusIcon,
  MaximizeIcon,
  RestoreIcon,
  CloseIcon,
}: AppChromeProps) {
  function handleDragMouseDown(event: MouseEvent<HTMLElement>) {
    if (event.button !== 0) {
      return;
    }

    onStartDrag();
  }

  return (
    <header className="app-chrome">
      <div
        className="app-chrome__brand"
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
      >
        <span className="window-badge">{title}</span>
      </div>

      <div
        className="app-chrome__drag-spacer"
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
      />

      <div className="app-chrome__actions">
        {showSettingsButton ? (
          <ChromeActions onOpenSettings={onOpenSettings} SettingsIcon={SettingsIcon} />
        ) : null}
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
      </div>
    </header>
  );
}
