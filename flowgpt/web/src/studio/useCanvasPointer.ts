import { useCallback, useRef } from "react";
import { render, type AdjustmentValues, type CanvasSource, type ShapeKind, type StrokeShape } from "./canvasLib";
import type { Rect, Tool } from "./useImageEditor";

interface PointerOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  tool: Tool;
  source: CanvasSource | null;
  loaded: boolean;
  adjust: AdjustmentValues;
  shapeKind: Exclude<ShapeKind, "brush">;
  shapeColor: string;
  shapeWidth: number;
  brushColor: string;
  brushWidth: number;
  setCrop: React.Dispatch<React.SetStateAction<Rect | null>>;
  setTextPos: (next: { x: number; y: number } | null) => void;
  /** Ghi nét vẽ/hình khối vừa hoàn thành vào ảnh nguồn. */
  onStroke: (stroke: StrokeShape) => void;
}

/**
 * Xử lý chuột trên canvas: chọn vùng cắt, đặt vị trí chữ, vẽ tay và vẽ hình.
 * Toạ độ được quy đổi từ CSS pixel sang pixel canvas qua getBoundingClientRect.
 */
export function useCanvasPointer(options: PointerOptions) {
  const draggingRef = useRef(false);
  const strokeRef = useRef<StrokeShape | null>(null);

  const toCanvas = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = options.canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      return {
        x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY)),
      };
    },
    [options.canvasRef],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!options.loaded) return;
    const point = toCanvas(event);
    if (options.tool === "text") {
      options.setTextPos(point);
      return;
    }
    if (options.tool === "crop") {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      options.setCrop({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }
    if (options.tool === "brush" || options.tool === "shape") {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      strokeRef.current = {
        kind: options.tool === "brush" ? "brush" : options.shapeKind,
        color: options.tool === "brush" ? options.brushColor : options.shapeColor,
        width: options.tool === "brush" ? options.brushWidth : options.shapeWidth,
        x1: point.x,
        y1: point.y,
        x2: point.x,
        y2: point.y,
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!options.loaded || !draggingRef.current) return;
    const point = toCanvas(event);
    if (options.tool === "crop") {
      options.setCrop((current) => (current ? { ...current, width: point.x - current.x, height: point.y - current.y } : current));
      return;
    }
    const active = strokeRef.current;
    const canvas = options.canvasRef.current;
    if (!active || !canvas || !options.source) return;
    const next: StrokeShape = { ...active, x2: point.x, y2: point.y };
    strokeRef.current = next;
    // Một lần vẽ lại cho mỗi sự kiện: ảnh nguồn + nét đang kéo (chỉ O(số pixel)).
    render(canvas, options.source, undefined, { adjust: options.adjust, strokes: [next] });
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const active = strokeRef.current;
    strokeRef.current = null;
    if (active) options.onStroke(active);
  };

  return { onPointerDown, onPointerMove, onPointerUp };
}
