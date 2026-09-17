import { useEffect, useRef, useState } from "react";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StageText {
  value: string;
  size: number;
  color: string;
  bold: boolean;
  x: number;
  y: number;
}

/**
 * Vùng canvas + lớp phủ (khung cắt, vị trí chữ). Kích thước hiển thị được đo
 * bằng ResizeObserver để mọi lớp phủ luôn khớp đúng ảnh.
 */
export function CanvasStage({
  canvasRef,
  loaded,
  over,
  crosshair,
  crop,
  sourceSize,
  text,
  statusText,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  dropHandlers,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  loaded: boolean;
  over: boolean;
  crosshair: boolean;
  crop: Rect | null;
  sourceSize: { width: number; height: number };
  text: StageText | null;
  statusText?: string | null;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: () => void;
  dropHandlers: {
    onOver: (value: boolean) => void;
    onDropFile: (file: File) => void;
    onPick: () => void;
  };
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setViewport({ width: node.clientWidth, height: node.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = viewport.height > 0 && sourceSize.height > 0 ? viewport.height / sourceSize.height : 1;
  const box = crop
    ? {
        left: Math.min(crop.x, crop.x + crop.width),
        top: Math.min(crop.y, crop.y + crop.height),
        width: Math.abs(crop.width),
        height: Math.abs(crop.height),
      }
    : null;

  return (
    <div
      className={`canvas-wrap ${over ? "over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        dropHandlers.onOver(true);
      }}
      onDragLeave={() => dropHandlers.onOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        dropHandlers.onOver(false);
        const file = event.dataTransfer.files[0];
        if (file) dropHandlers.onDropFile(file);
      }}
      onClick={() => {
        if (!loaded) dropHandlers.onPick();
      }}
    >
      <div className="canvas-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          width={1}
          height={1}
          className={`edit-canvas${crosshair ? " crosshair" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {box && (
          <div
            className="crop-overlay"
            style={{
              left: `${(box.left / Math.max(1, sourceSize.width)) * 100}%`,
              top: `${(box.top / Math.max(1, sourceSize.height)) * 100}%`,
              width: `${(box.width / Math.max(1, sourceSize.width)) * 100}%`,
              height: `${(box.height / Math.max(1, sourceSize.height)) * 100}%`,
            }}
          />
        )}
        {text && (
          <div
            className="text-marker"
            style={{
              left: `${(text.x / Math.max(1, sourceSize.width)) * 100}%`,
              top: `${(text.y / Math.max(1, sourceSize.height)) * 100}%`,
              color: text.color,
              fontSize: `${Math.max(11, text.size * scale)}px`,
              fontWeight: text.bold ? 700 : 500,
            }}
          >
            {text.value}
          </div>
        )}
      </div>
      {statusText && <div className="hint mt-2">{statusText}</div>}
    </div>
  );
}
