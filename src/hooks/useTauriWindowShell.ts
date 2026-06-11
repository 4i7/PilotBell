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
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";

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

const CHAT_SIZE_STORAGE_KEY = "pilotbell.mainWindow.chatSize.v1";
const WORK_AREA_MARGIN = 24; // logical px

type StoredChatSize = { width: number; height: number };

function loadStoredChatSize(): StoredChatSize | null {
  try {
    const raw = localStorage.getItem(CHAT_SIZE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const { width, height } = parsed as Partial<StoredChatSize>;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < MAIN_WINDOW_LAYOUTS.chat.minWidth ||
      height < 256
    ) {
      return null;
    }

    return { width, height };
  } catch {
    return null;
  }
}

function saveStoredChatSize(size: StoredChatSize): void {
  try {
    localStorage.setItem(CHAT_SIZE_STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Ignore storage failures (quota, privacy mode, etc.).
  }
}

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
  const isApplyingLayoutRef = useRef(false);
  const saveChatSizeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reportedBrowserPreview = useRef(false);

  async function hidePaletteWindow() {
    return invoke("hide_palette_window");
  }

  function dismissGlobalShortcutNotice() {
    localStorage.setItem(GLOBAL_SHORTCUT_NOTICE_STORAGE_KEY, "true");
    setIsGlobalShortcutNoticeHidden(true);
    setChatStatus((current) => (current?.dismissKey === "global-shortcut" ? null : current));
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

      if (
        !isSettingsWindow &&
        appliedMainWindowLayout.current === "chat" &&
        !isApplyingLayoutRef.current
      ) {
        clearTimeout(saveChatSizeTimerRef.current);
        saveChatSizeTimerRef.current = setTimeout(async () => {
          if (await currentWindow.isMaximized()) {
            return; // Never persist the maximized size.
          }

          const size = await currentWindow.innerSize();
          const scale = await currentWindow.scaleFactor();
          saveStoredChatSize({
            width: Math.round(size.width / scale),
            height: Math.round(size.height / scale),
          });
        }, 250); // Debounce continuous writes during drag-resize.
      }
    }).then((unlisten) => {
      unlistenResize = unlisten;
    });

    return () => {
      cancelled = true;
      unlistenResize?.();
      clearTimeout(saveChatSizeTimerRef.current);
    };
  }, [isSettingsWindow, isTauriRuntime]);

  useEffect(() => {
    if (!isTauriRuntime || isSettingsWindow) {
      return;
    }

    const layoutName = hasExpandedMainSurface ? "chat" : "compact";
    if (appliedMainWindowLayout.current === layoutName) {
      return;
    }

    appliedMainWindowLayout.current = layoutName;
    const currentWindow = getCurrentWindow();

    async function applyMainWindowLayout() {
      const layout = MAIN_WINDOW_LAYOUTS[layoutName];
      const monitor = await currentMonitor();

      // Decide the target size in logical pixels (stored chat size included).
      let width: number = layout.width;
      let height: number = layout.height;
      let minWidth: number = layout.minWidth;
      let minHeight: number = layout.minHeight;
      if (layoutName === "chat") {
        const stored = loadStoredChatSize();
        if (stored) {
          ({ width, height } = stored);
        }
      }
      if (monitor) {
        const scale = monitor.scaleFactor;
        const workAreaLogicalWidth = monitor.workArea.size.width / scale;
        const workAreaLogicalHeight = monitor.workArea.size.height / scale;
        const maxWidth = Math.floor(workAreaLogicalWidth - WORK_AREA_MARGIN);
        const maxHeight = Math.floor(workAreaLogicalHeight - WORK_AREA_MARGIN);
        width = Math.min(width, maxWidth);
        height = Math.min(height, maxHeight);
        // Cap min size too, otherwise setMinSize > setSize forces overflow.
        minWidth = Math.min(minWidth, maxWidth);
        minHeight = Math.min(minHeight, maxHeight);
      }

      await currentWindow.setMinSize(new LogicalSize(minWidth, minHeight));

      if (await currentWindow.isMaximized()) {
        return;
      }

      isApplyingLayoutRef.current = true;
      try {
        await currentWindow.setSize(new LogicalSize(width, height));

        if (monitor) {
          // Keep the window where the user left it; only push it back into
          // the work area if the resize made it overflow. All physical px.
          const pos = await currentWindow.outerPosition();
          const size = await currentWindow.outerSize();
          const wa = monitor.workArea;
          const clampedX = Math.max(
            wa.position.x,
            Math.min(pos.x, wa.position.x + wa.size.width - size.width),
          );
          const clampedY = Math.max(
            wa.position.y,
            Math.min(pos.y, wa.position.y + wa.size.height - size.height),
          );
          if (clampedX !== pos.x || clampedY !== pos.y) {
            await currentWindow.setPosition(
              new PhysicalPosition(Math.round(clampedX), Math.round(clampedY)),
            );
          }
        } else {
          await currentWindow.center();
        }
      } finally {
        // The onResized event from setSize arrives late; release the guard
        // after it has had a chance to fire.
        setTimeout(() => {
          isApplyingLayoutRef.current = false;
        }, 200);
      }
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
      if (reportedBrowserPreview.current) {
        return;
      }

      reportedBrowserPreview.current = true;
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
    toggleMaximizeWindow,
  };
}
