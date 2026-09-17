import { useCallback, useEffect } from "react";

/**
 * Phím tắt và dán ảnh từ clipboard cho Image Studio:
 * Ctrl+Z hoàn tác, Ctrl+Shift+Z (hoặc Ctrl+Y) làm lại, Ctrl+V dán ảnh.
 */
export function useEditorHotkeys({
  onPasteImage,
  onUndo,
  onRedo,
}: {
  onPasteImage: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const paste = useCallback(
    (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) onPasteImage(file);
    },
    [onPasteImage],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("paste", paste);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("paste", paste);
      window.removeEventListener("keydown", onKey);
    };
  }, [paste, onUndo, onRedo]);
}
