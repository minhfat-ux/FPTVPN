import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useChat } from "../state/chat";
import { useToast } from "../state/store";
import { useCanvasPointer } from "./useCanvasPointer";
import { useEditorHotkeys } from "./useEditorHotkeys";
import { useUndoStack } from "./useUndoStack";
import { bake, downloadCanvas, errorMessage, uploadCanvas, type SavedFile } from "./imageExport";
import { normalizeBox, runAction, type CanvasAction } from "./imageOps";
import {
  DEFAULT_ADJUST,
  cropImage,
  drawShape,
  render,
  resizeImage,
  sourceSize,
  type AdjustmentValues,
  type CanvasSource,
  type DrawText,
  type ShapeKind,
  type StrokeShape,
} from "./canvasLib";

export type Tool = "crop" | "rotate" | "resize" | "adjust" | "filters" | "text" | "brush" | "shape";
export type Rect = { x: number; y: number; width: number; height: number };
export type { CanvasAction };

export interface TextState {
  value: string;
  size: number;
  color: string;
  bold: boolean;
}

export interface BrushState {
  color: string;
  width: number;
}

export interface ShapeState {
  kind: Exclude<ShapeKind, "brush">;
  color: string;
  width: number;
}

/**
 * Màu mặc định của "mực" vẽ lên ảnh (không phải màu giao diện).
 * Lấy từ biến CSS để theo đúng theme, kèm giá trị dự phòng khi chưa kịp nạp.
 */
function inkColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

/** Toàn bộ logic của Image Studio: nạp ảnh, hoàn tác, thao tác canvas, xuất và lưu tệp. */
export function useImageEditor() {
  const { t } = useI18n();
  const { conversationId, sending, pendingArtifacts } = useChat();
  const { push } = useToast();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoRef = useRef<() => void>(() => undefined);
  const redoRef = useRef<() => void>(() => undefined);

  const [source, setSource] = useState<CanvasSource | null>(null);
  const [fileName, setFileName] = useState("");
  const [tool, setTool] = useState<Tool>("crop");
  const [adjust, setAdjust] = useState<AdjustmentValues>(DEFAULT_ADJUST);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [target, setTarget] = useState({ width: 0, height: 0 });
  const [lockRatio, setLockRatio] = useState(true);
  const [text, setText] = useState<TextState>(() => ({ value: t("studio.image.textDefault"), size: 42, color: "#ffffff", bold: true }));
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [brush, setBrush] = useState<BrushState>(() => ({ color: inkColor("--danger", "#f25a5a"), width: 8 }));
  const [shape, setShape] = useState<ShapeState>(() => ({ kind: "rect", color: inkColor("--accent", "#33c773"), width: 4 }));
  const [quality, setQuality] = useState(0.92);
  const [saved, setSaved] = useState<SavedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const loaded = source !== null && size.width > 1;

  /** Khôi phục một mốc ảnh đã lưu trong ngăn xếp hoàn tác. */
  const restore = useCallback((next: CanvasSource) => {
    setSource(next);
    const dims = sourceSize(next);
    setSize(dims);
    setTarget(dims);
    setCrop(null);
  }, []);

  const { past, future, push: pushHistory, undo, redo, clear, currentRef } = useUndoStack<CanvasSource>(restore);
  undoRef.current = undo;
  redoRef.current = redo;
  currentRef.current = source;

  /** Ghi trạng thái mới vào ảnh nguồn kèm mốc hoàn tác. */
  const commit = useCallback(
    (next: CanvasSource, previous: CanvasSource | null) => {
      if (previous) pushHistory(previous);
      setSource(next);
      const dims = sourceSize(next);
      setSize(dims);
      setTarget(dims);
      setCrop(null);
      setTextPos(null);
    },
    [pushHistory],
  );

  // Vẽ lại canvas mỗi khi ảnh nguồn hoặc thông số màu thay đổi.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    render(canvas, source, undefined, { adjust });
  }, [source, adjust]);

  const loadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        push(t("studio.image.imageOnly"), "error");
        return;
      }
      const url = URL.createObjectURL(file);
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const node = new Image();
          node.onload = () => resolve(node);
          node.onerror = () => reject(new Error("Không đọc được ảnh"));
          node.src = url;
        });
        clear();
        setAdjust(DEFAULT_ADJUST);
        commit(image, null);
        setFileName(file.name);
        push(t("studio.image.loaded"), "success");
      } catch {
        push(t("studio.image.loadFailed"), "error");
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [clear, commit, push, t],
  );

  useEditorHotkeys({ onPasteImage: (file) => void loadFile(file), onUndo: () => undoRef.current(), onRedo: () => redoRef.current() });

  const reset = useCallback(() => {
    const original = past[0];
    if (!original) {
      setAdjust(DEFAULT_ADJUST);
      setCrop(null);
      setTextPos(null);
      return;
    }
    clear();
    setSource(original);
    setSize(sourceSize(original));
    setTarget(sourceSize(original));
    setAdjust(DEFAULT_ADJUST);
    setCrop(null);
    setTextPos(null);
  }, [clear, past]);

  /** Ghi nét vẽ/hình khối vừa kéo vào ảnh nguồn để không mất khi vẽ tiếp. */
  const commitStroke = useCallback(
    (stroke: StrokeShape) => {
      if (!source) return;
      const flat = bake(source, adjust);
      const ctx = flat.getContext("2d");
      if (!ctx) return;
      drawShape(ctx, stroke);
      pushHistory(source);
      setSource(flat);
    },
    [adjust, pushHistory, source],
  );

  const { onPointerDown, onPointerMove, onPointerUp } = useCanvasPointer({
    canvasRef,
    tool,
    source,
    loaded,
    adjust,
    shapeKind: shape.kind,
    shapeColor: shape.color,
    shapeWidth: shape.width,
    brushColor: brush.color,
    brushWidth: brush.width,
    setCrop,
    setTextPos,
    onStroke: commitStroke,
  });

  const onAction = (action: CanvasAction) => {
    if (!source) return;
    commit(runAction(source, action), source);
  };

  const applyCrop = () => {
    if (!source || !crop) return;
    const box = normalizeBox(crop);
    if (box.width < 8 || box.height < 8) {
      push(t("studio.image.cropTooSmall"), "error");
      return;
    }
    commit(cropImage(source, box), source);
    push(t("studio.image.cropped"), "success");
  };

  const applyResize = () => {
    if (!source) return;
    const width = Math.max(1, Math.round(target.width));
    const height = Math.max(1, Math.round(target.height));
    if (width === size.width && height === size.height) {
      push(t("studio.image.sizeUnchanged"), "info");
      return;
    }
    commit(resizeImage(source, width, height), source);
    push(t("studio.image.resized"), "success");
  };

  const bakeAdjust = () => {
    if (!source) return;
    commit(bake(source, adjust), source);
    setAdjust(DEFAULT_ADJUST);
    push(t("studio.image.adjustBaked"), "success");
  };

  const bakeText = () => {
    if (!source || !textPos) {
      push(t("studio.image.needTextPos"), "error");
      return;
    }
    const payload: DrawText = { text: text.value, x: textPos.x, y: textPos.y, size: text.size, color: text.color, bold: text.bold };
    commit(bake(source, adjust, payload), source);
    push(t("studio.image.textAdded"), "success");
  };

  const exportBlob = async (format: "png" | "jpeg" | "webp") => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    try {
      await downloadCanvas(canvas, fileName, format, quality);
    } catch {
      push(t("studio.image.exportFailed"), "error");
    }
  };

  const saveToFlowGpt = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    setBusy(true);
    try {
      const file = await uploadCanvas(canvas, conversationId);
      setSaved((list) => [{ id: file.id, name: file.name }, ...list].slice(0, 6));
      push(t("studio.image.savedToFlowGpt"), "success");
    } catch (error) {
      push(errorMessage(error, t("studio.image.saveFailed")), "error");
    } finally {
      setBusy(false);
    }
  };

  return {
    canvasRef,
    source,
    fileName,
    tool,
    setTool,
    adjust,
    setAdjust,
    crop,
    setCrop,
    size,
    target,
    setTarget,
    lockRatio,
    setLockRatio,
    text,
    setText,
    textPos,
    brush,
    setBrush,
    shape,
    setShape,
    quality,
    setQuality,
    saved,
    busy,
    over,
    setOver,
    history: past,
    future,
    loaded,
    sending,
    pendingArtifacts,
    loadFile,
    undo,
    redo,
    reset,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onAction,
    applyCrop,
    applyResize,
    bakeAdjust,
    bakeText,
    exportBlob,
    saveToFlowGpt,
  };
}
