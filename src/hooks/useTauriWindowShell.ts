import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

import { isSettingsSection, type SettingsSection } from "../domain/settings";

type ShellStatus = {
  tone: "neutral" | "success" | "warning" | "error";
  message: string;
  dismissKey?: "global-shortcut";
};

type AppShellState = {
  activeShortcut: string;
  usedFallbackShortcut: boolean;
  globalShortcutRegistered: boolean;
  message?: string | null;
};

type UseTauriWindowShellOptions = {
  browserPreviewMessage: string;
  closeSettings: () => void;
  hasExpandedMainSurface: boolean;
  isSettingsOpen: boolean;
  isSettingsWindow: boolean;
  isTauriRuntime: boolean;
  promptRef: RefObject<HTMLTextAreaElement | null>;
  providerMenuOpen: boolean;
  setChatStatus: Dispatch<SetStateAction<ShellStatus | null>>;
  setProviderMenuOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsSection: Dispatch<SetStateAction<SettingsSection>>;
  setSourceStatus: (status: ShellStatus) => void;
};

const FOCUS_PROMPT_EVENT = "pilotbell://focus-prompt";
const SETTINGS_SECTION_EVENT = "pilotbell://settings-section";
const GLOBAL_SHORTCUT_NOTICE_STORAGE_KEY = "pilotbell.hideGlobalShortcutNotice";
const MAIN_WINDOW_LAYOUTS = {
  compact: {
    width: 620,
    height: 190,
    minWidth: 420,
    minHeight: 160,
  },
  chat: {
    width: 760,
    height: 720,
    minWidth: 420,
    minHeight: 620,
  },
} as const;

function loadGlobalShortcutNoticeHidden() {
  return localStorage.getItem(GLOBAL_SHORTCUT_NOTICE_STORAGE_KEY) === "true";
}

export function useTauriWindowShell({
  browserPreviewMessage,
  closeSettings,
  hasExpandedMainSurface,
  isSettingsOpen,
  isSettingsWindow,
  isTauriRuntime,
  promptRef,
  providerMenuOpen,
  setChatStatus,
  setProviderMenuOpen,
  setSettingsSection,
  setSourceStatus,
}: UseTauriWindowShellOptions) {
  const [shellState, setShellState] = useState<AppShellState | null>(null);
  const [isGlobalShortcutNoticeHidden, setIsGlobalShortcutNoticeHidden] = useState(() =>
    loadGlobalShortcutNoticeHidden(),
  );
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const appliedMainWindowLayout = useRef<keyof typeof MAIN_WINDOW_LAYOUTS | null>(null);

  async function hidePaletteWindow() {
    return invoke("hide_palette_window");
  }

  function dismissGlobalShortcutNotice() {
    localStorage.setItem(GLOBAL_SHORTCUT_NOTICE_STORAGE_KEY, "true");
    setIsGlobalShortcutNoticeHidden(true);
    setChatStatus((current) => (current?.dismissKey === "global-shortcut" ? null : current));
  }

  async function startWindowDrag() {
    if (!isTauriRuntime) {
      return;
    }

    await getCurrentWindow().startDragging();
  }

  async function minimizeWindow() {
    await getCurrentWindow().minimize();
  }

  async function toggleMaximizeWindow() {
    const currentWindow = getCurrentWindow();
    await currentWindow.toggleMaximize();
    setIsWindowMaximized(await currentWindow.isMaximized());
  }

  async function closeWindow() {
    const currentWindow = getCurrentWindow();
    if (isSettingsWindow) {
      await currentWindow.setAlwaysOnTop(false);
      await currentWindow.hide();
      return;
    }

    await currentWindow.close();
  }

  useEffect(() => {
    if (!isTauriRuntime) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let unlistenResize: (() => void) | undefined;
    let cancelled = false;

    async function syncWindowState() {
      const maximized = await currentWindow.isMaximized();
      if (!cancelled) {
        setIsWindowMaximized(maximized);
      }
    }

    void syncWindowState();
    void currentWindow.onResized(async () => {
      await syncWindowState();
    }).then((unlisten) => {
      unlistenResize = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenResize?.();
    };
  }, [isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime || isSettingsWindow) {
      return;
    }

    const layoutName = hasExpandedMainSurface ? "chat" : "compact";
    if (appliedMainWindowLayout.current === layoutName) {
      return;
    }

    appliedMainWindowLayout.current = layoutName;
    const layout = MAIN_WINDOW_LAYOUTS[layoutName];
    const currentWindow = getCurrentWindow();

    async function applyMainWindowLayout() {
      await currentWindow.setMinSize(new LogicalSize(layout.minWidth, layout.minHeight));

      if (await currentWindow.isMaximized()) {
        return;
      }

      await currentWindow.setSize(new LogicalSize(layout.width, layout.height));
      await currentWindow.center();
    }

    void applyMainWindowLayout().catch((error) => {
      console.warn("Failed to apply PilotBell main window layout.", error);
    });
  }, [hasExpandedMainSurface, isSettingsWindow, isTauriRuntime]);

  useEffect(() => {
    if (!isSettingsWindow || !isTauriRuntime) {
      return;
    }

    let unlistenSettingsSection: (() => void) | undefined;

    void listen<string>(SETTINGS_SECTION_EVENT, (event) => {
      if (isSettingsSection(event.payload)) {
        setSettingsSection(event.payload);
      }
    }).then((unlisten) => {
      unlistenSettingsSection = unlisten;
    });

    return () => {
      unlistenSettingsSection?.();
    };
  }, [isSettingsWindow, isTauriRuntime, setSettingsSection]);

  useEffect(() => {
    if (isSettingsWindow) {
      return;
    }

    if (!isTauriRuntime) {
      setSourceStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      setChatStatus({
        tone: "warning",
        message: browserPreviewMessage,
      });
      return;
    }

    let cancelled = false;

    async function loadShellState() {
      const nextShellState = await invoke<AppShellState>("get_app_shell_state");
      if (cancelled) {
        return;
      }

      setShellState(nextShellState);

      if (nextShellState.message && !isGlobalShortcutNoticeHidden) {
        setChatStatus({
          tone:
            nextShellState.globalShortcutRegistered && !nextShellState.usedFallbackShortcut
              ? "success"
              : nextShellState.globalShortcutRegistered
                ? "warning"
                : "error",
          message: nextShellState.message,
          dismissKey: "global-shortcut",
        });
      }

      const currentWindow = getCurrentWindow();
      // Keep the window reachable after a normal minimize action.
      await currentWindow.setSkipTaskbar(false);
      await currentWindow.setAlwaysOnTop(nextShellState.globalShortcutRegistered);
      if (nextShellState.globalShortcutRegistered) {
        await currentWindow.setFocus();
        promptRef.current?.focus();
      }
    }

    void loadShellState();

    return () => {
      cancelled = true;
    };
  }, [
    browserPreviewMessage,
    isGlobalShortcutNoticeHidden,
    isSettingsWindow,
    isTauriRuntime,
    promptRef,
    setChatStatus,
    setSourceStatus,
  ]);

  useEffect(() => {
    if (!isTauriRuntime || isSettingsWindow) {
      return;
    }

    const currentWindow = getCurrentWindow();
    let unlistenWindowFocus: (() => void) | undefined;
    let removeEscapeListener: (() => void) | undefined;

    async function bindPaletteWindowBehavior() {
      unlistenWindowFocus = await listen(FOCUS_PROMPT_EVENT, async () => {
        promptRef.current?.focus();
        await currentWindow.setAlwaysOnTop(true);
        await currentWindow.setFocus();
      });

      const handleEscape = async (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key !== "Escape" || !shellState?.globalShortcutRegistered) {
          return;
        }

        if (providerMenuOpen) {
          keyboardEvent.preventDefault();
          setProviderMenuOpen(false);
          return;
        }

        if (isSettingsOpen) {
          keyboardEvent.preventDefault();
          closeSettings();
          return;
        }

        keyboardEvent.preventDefault();
        await hidePaletteWindow();
      };

      window.addEventListener("keydown", handleEscape);
      removeEscapeListener = () => window.removeEventListener("keydown", handleEscape);
    }

    void bindPaletteWindowBehavior();

    return () => {
      unlistenWindowFocus?.();
      removeEscapeListener?.();
    };
  }, [
    closeSettings,
    isSettingsOpen,
    isSettingsWindow,
    isTauriRuntime,
    promptRef,
    providerMenuOpen,
    setProviderMenuOpen,
    shellState,
  ]);

  return {
    isWindowMaximized,
    closeWindow,
    dismissGlobalShortcutNotice,
    minimizeWindow,
    startWindowDrag,
    toggleMaximizeWindow,
  };
}
