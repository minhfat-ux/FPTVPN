import { Field, Switch } from "../components/ui";
import { DEFAULT_ADJUST, formatFilter } from "./canvasLib";
import type { SavedFile } from "./imageExport";
import { BrushPanel, ExportPanel, ShapePanel, TextPanel } from "./ToolPanelsExtra";
import type { BrushState, CanvasAction, ShapeState, TextState, Tool } from "./useImageEditor";

const SLIDERS = [
  ["brightness", "Độ sáng", 0, 200],
  ["contrast", "Tương phản", 0, 200],
  ["saturate", "Độ bão hoà", 0, 200],
  ["blur", "Độ mờ", 0, 20],
] as const;

const PRESETS: { id: CanvasAction; label: string }[] = [
  { id: "grayscale", label: "Xám" },
  { id: "sepia", label: "Sepia" },
  { id: "invert", label: "Đảo màu" },
];

const ROTATIONS: { id: CanvasAction; label: string }[] = [
  { id: "rotate-left", label: "Xoay trái 90°" },
  { id: "rotate-right", label: "Xoay phải 90°" },
  { id: "flip-h", label: "Lật ngang" },
  { id: "flip-v", label: "Lật dọc" },
];

export interface ToolPanelsProps {
  tool: Tool;
  loaded: boolean;
  size: { width: number; height: number };
  target: { width: number; height: number };
  setTarget: (next: { width: number; height: number }) => void;
  lockRatio: boolean;
  setLockRatio: (value: boolean) => void;
  adjust: typeof DEFAULT_ADJUST;
  setAdjust: (next: typeof DEFAULT_ADJUST) => void;
  text: TextState;
  setText: (next: TextState) => void;
  textPos: { x: number; y: number } | null;
  brush: BrushState;
  setBrush: (next: BrushState) => void;
  shape: ShapeState;
  setShape: (next: ShapeState) => void;
  cropReady: boolean;
  quality: number;
  setQuality: (value: number) => void;
  saved: SavedFile[];
  busy: boolean;
  sending: boolean;
  onAction: (action: CanvasAction) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onApplyResize: () => void;
  onBakeAdjust: () => void;
  onBakeText: () => void;
  onExport: (format: "png" | "jpeg" | "webp") => void;
  onSave: () => void;
}

/** Panel điều khiển của từng công cụ trong Image Studio. */
export function ToolPanels(props: ToolPanelsProps) {
  const { tool, loaded, size, target, setTarget, lockRatio, setLockRatio, adjust, setAdjust, cropReady } = props;
  const { onAction, onApplyCrop, onCancelCrop, onApplyResize, onBakeAdjust } = props;

  if (tool === "crop") {
    return (
      <div className="card">
        <div className="card-title mb-2">Cắt ảnh</div>
        <div className="hint">Kéo chuột trên ảnh để chọn vùng giữ lại.</div>
        <div className="row gap-2 mt-3">
          <button className="btn btn-primary btn-sm grow" type="button" onClick={onApplyCrop} disabled={!cropReady}>
            Áp dụng cắt
          </button>
          <button className="btn btn-sm" type="button" onClick={onCancelCrop} disabled={!cropReady}>
            Huỷ
          </button>
        </div>
      </div>
    );
  }

  if (tool === "rotate") {
    return (
      <div className="card">
        <div className="card-title mb-2">Xoay &amp; lật</div>
        <div className="grid grid-2">
          {ROTATIONS.map((item) => (
            <button key={item.id} className="btn btn-sm" type="button" disabled={!loaded} onClick={() => onAction(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (tool === "resize") {
    return (
      <div className="card">
        <div className="card-title mb-2">Kích thước</div>
        <div className="grid grid-2">
          <Field label="Chiều rộng (px)">
            <input
              className="input"
              type="number"
              min={1}
              value={target.width || ""}
              onChange={(event) => {
                const width = Math.max(1, Number(event.target.value) || 1);
                setTarget(
                  lockRatio && size.width
                    ? { width, height: Math.max(1, Math.round((width * size.height) / size.width)) }
                    : { ...target, width },
                );
              }}
            />
          </Field>
          <Field label="Chiều cao (px)">
            <input
              className="input"
              type="number"
              min={1}
              value={target.height || ""}
              onChange={(event) => {
                const height = Math.max(1, Number(event.target.value) || 1);
                setTarget(
                  lockRatio && size.height
                    ? { height, width: Math.max(1, Math.round((height * size.width) / size.height)) }
                    : { ...target, height },
                );
              }}
            />
          </Field>
        </div>
        <Switch checked={lockRatio} onChange={setLockRatio} label="Giữ tỉ lệ" />
        <button className="btn btn-primary btn-block mt-3" type="button" onClick={onApplyResize} disabled={!loaded}>
          Áp dụng
        </button>
        <div className="hint mt-2">
          Kích thước hiện tại: {size.width} × {size.height}px
        </div>
      </div>
    );
  }

  if (tool === "adjust") {
    return (
      <div className="card">
        <div className="card-title mb-2">Màu sắc</div>
        {SLIDERS.map(([key, label, min, max]) => (
          <div className="field" key={key}>
            <span className="label">
              {label}: {adjust[key]}
              {key === "blur" ? "px" : "%"}
            </span>
            <input
              className="slider"
              type="range"
              min={min}
              max={max}
              value={adjust[key]}
              onChange={(event) => setAdjust({ ...adjust, [key]: Number(event.target.value) })}
            />
          </div>
        ))}
        <div className="row gap-2">
          <button className="btn btn-primary btn-sm grow" type="button" onClick={onBakeAdjust} disabled={!loaded}>
            Áp dụng vào ảnh
          </button>
          <button className="btn btn-sm" type="button" onClick={() => setAdjust(DEFAULT_ADJUST)}>
            Mặc định
          </button>
        </div>
        <div className="hint mt-2">Xem trước trực tiếp: {formatFilter(adjust)}</div>
      </div>
    );
  }

  if (tool === "filters") {
    return (
      <div className="card">
        <div className="card-title mb-2">Bộ lọc nhanh</div>
        <div className="stack gap-2">
          {PRESETS.map((item) => (
            <button key={item.id} className="btn btn-sm" type="button" disabled={!loaded} onClick={() => onAction(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (tool === "text") {
    return <TextPanel loaded={loaded} text={props.text} setText={props.setText} textPos={props.textPos} onBakeText={props.onBakeText} />;
  }

  if (tool === "brush") {
    return <BrushPanel brush={props.brush} setBrush={props.setBrush} />;
  }

  if (tool === "shape") {
    return <ShapePanel shape={props.shape} setShape={props.setShape} />;
  }

  return (
    <ExportPanel
      loaded={loaded}
      quality={props.quality}
      setQuality={props.setQuality}
      saved={props.saved}
      busy={props.busy}
      sending={props.sending}
      onExport={props.onExport}
      onSave={props.onSave}
    />
  );
}
