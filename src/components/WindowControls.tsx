import type { ComponentType, SVGProps } from "react";

type WindowControlsProps = {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  MinusIcon: ComponentType<SVGProps<SVGSVGElement>>;
  MaximizeIcon: ComponentType<SVGProps<SVGSVGElement>>;
  RestoreIcon: ComponentType<SVGProps<SVGSVGElement>>;
  CloseIcon: ComponentType<SVGProps<SVGSVGElement>>;
};

export function WindowControls({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  MinusIcon,
  MaximizeIcon,
  RestoreIcon,
  CloseIcon,
}: WindowControlsProps) {
  const ToggleIcon = isMaximized ? RestoreIcon : MaximizeIcon;

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-icon-button"
        onClick={onMinimize}
        aria-label="Minimize window"
      >
        <MinusIcon />
      </button>
      <button
        type="button"
        className="window-icon-button"
        onClick={onToggleMaximize}
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
      >
        <ToggleIcon />
      </button>
      <button
        type="button"
        className="window-icon-button danger"
        onClick={onClose}
        aria-label="Close window"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
