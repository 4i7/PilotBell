import { type RefObject, useEffect } from "react";

type UseAutoResizeTextareaOptions = {
  enabled: boolean;
  value: string;
  minRows?: number;
  maxRows?: number;
  maxHeightVh?: number;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

function resizeTextarea({
  enabled,
  textareaRef,
  minRows = 2,
  maxRows = 8,
  maxHeightVh = 35,
}: Omit<UseAutoResizeTextareaOptions, "value">) {
  const textarea = textareaRef.current;
  if (!textarea) {
    return;
  }

  if (!enabled) {
    textarea.style.height = "";
    textarea.style.overflowY = "";
    return;
  }

  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
  const borderHeight =
    (Number.parseFloat(styles.borderTopWidth) || 0) +
    (Number.parseFloat(styles.borderBottomWidth) || 0);
  const paddingHeight =
    (Number.parseFloat(styles.paddingTop) || 0) +
    (Number.parseFloat(styles.paddingBottom) || 0);

  const minHeight = lineHeight * minRows + borderHeight + paddingHeight;
  const maxRowsHeight = lineHeight * maxRows + borderHeight + paddingHeight;
  const viewportHeight = window.innerHeight * (maxHeightVh / 100);
  const maxHeight = Math.min(maxRowsHeight, viewportHeight);

  textarea.style.height = "auto";
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > nextHeight ? "auto" : "hidden";
}

export function useAutoResizeTextarea({
  enabled,
  value,
  minRows = 2,
  maxRows = 8,
  maxHeightVh = 35,
  textareaRef,
}: UseAutoResizeTextareaOptions) {
  useEffect(() => {
    resizeTextarea({ enabled, textareaRef, minRows, maxRows, maxHeightVh });
  }, [enabled, maxHeightVh, maxRows, minRows, textareaRef, value]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onResize = () =>
      resizeTextarea({ enabled, textareaRef, minRows, maxRows, maxHeightVh });

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled, maxHeightVh, maxRows, minRows, textareaRef]);
}
