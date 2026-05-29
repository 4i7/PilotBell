import { type RefObject, useEffect, useRef } from "react";
import type { SubmitShortcutMode } from "../domain/inputPreferences";

type UsePromptSubmitHotkeyOptions = {
  mode: SubmitShortcutMode;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: () => void;
};

function shouldSubmit(event: KeyboardEvent, mode: SubmitShortcutMode) {
  if (event.key !== "Enter") {
    return false;
  }

  switch (mode) {
    case "enter":
      return !event.shiftKey;
    case "mod-enter":
      return event.metaKey || event.ctrlKey;
    case "shift-enter":
      return event.shiftKey;
    case "ctrl-enter":
      return event.ctrlKey;
    case "disabled":
      return false;
  }
}

export function usePromptSubmitHotkey({
  mode,
  textareaRef,
  onSubmit,
}: UsePromptSubmitHotkeyOptions) {
  const isComposingRef = useRef(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const onCompositionStart = () => {
      isComposingRef.current = true;
    };

    const onCompositionEnd = () => {
      isComposingRef.current = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (mode === "disabled") {
        return;
      }

      if (event.isComposing || isComposingRef.current) {
        return;
      }

      if (!shouldSubmit(event, mode)) {
        return;
      }

      event.preventDefault();
      onSubmit();
    };

    textarea.addEventListener("compositionstart", onCompositionStart);
    textarea.addEventListener("compositionend", onCompositionEnd);
    textarea.addEventListener("keydown", onKeyDown);

    return () => {
      textarea.removeEventListener("compositionstart", onCompositionStart);
      textarea.removeEventListener("compositionend", onCompositionEnd);
      textarea.removeEventListener("keydown", onKeyDown);
    };
  }, [mode, onSubmit, textareaRef]);
}
