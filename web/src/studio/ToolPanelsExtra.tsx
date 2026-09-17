import { Download, Loader } from "lucide-react";
import { api } from "../api/client";
import { Field, Switch } from "../components/ui";
import type { SavedFile } from "./imageExport";
import type { BrushState, ShapeState, TextState } from "./useImageEditor";

const SHAPES: { id: ShapeState["kind"]; label: string }[] = [
  { id: "rect", label: "Chữ nhật" },
  { id: "ellipse", label: "Elip" },
  { id: "arrow", label: "Mũi tên" },
];

export interface TextPanelProps {
  loaded: boolean;
  text: TextState;
  setText: (next: TextState) => void;
  textPos: { x: number; y: number } | null;
  onBakeText: () => void;
}

export function TextPanel({ loaded, text, setText, textPos, onBakeText }: TextPanelProps) {
  return (
    <div className="card">
      <div className="card-title mb-2">Chữ</div>
      <Field label="Nội dung">
        <textarea className="textarea" value={text.value} onChange={(event) => setText({ ...text, value: event.target.value })} />
      </Field>
      <div className="grid grid-2">
        <Field label="Cỡ chữ">
          <input
            className="input"
            type="number"
            min={8}
            value={text.size}
            onChange={(event) => setText({ ...text, size: Math.max(8, Number(event.target.value) || 8) })}
          />
        </Field>
        <Field label="Màu chữ">
          <input
            className="input color-input"
            type="color"
            value={text.color}
            onChange={(event) => setText({ ...text, color: event.target.value })}
          />
        </Field>
      </div>
      <Switch checked={text.bold} onChange={(value) => setText({ ...text, bold: value })} label="In đậm" />
      <button className="btn btn-primary btn-block mt-3" type="button" onClick={onBakeText} disabled={!loaded}>
        Áp dụng
      </button>
      <div className="hint mt-2">
        {textPos ? `Vị trí: ${Math.round(textPos.x)}, ${Math.round(textPos.y)}px` : "Bấm vào ảnh để chọn vị trí."}
      </div>
    </div>
  );
}

export function BrushPanel({ brush, setBrush }: { brush: BrushState; setBrush: (next: BrushState) => void }) {
  return (
    <div className="card">
      <div className="card-title mb-2">Vẽ tay</div>
      <Field label={`Cỡ cọ: ${brush.width}px`}>
        <input
          className="slider"
          type="range"
          min={1}
          max={60}
          value={brush.width}
          onChange={(event) => setBrush({ ...brush, width: Number(event.target.value) })}
        />
      </Field>
      <Field label="Màu cọ">
        <input
          className="input color-input"
          type="color"
          value={brush.color}
          onChange={(event) => setBrush({ ...brush, color: event.target.value })}
        />
      </Field>
      <div className="hint">Giữ chuột và kéo trên ảnh để vẽ; nét được ghi vào ảnh khi nhả chuột.</div>
    </div>
  );
}

export function ShapePanel({ shape, setShape }: { shape: ShapeState; setShape: (next: ShapeState) => void }) {
  return (
    <div className="card">
      <div className="card-title mb-2">Hình khối</div>
      <div className="stack gap-1">
        {SHAPES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn btn-sm ${shape.kind === item.id ? "btn-primary" : ""}`}
            onClick={() => setShape({ ...shape, kind: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Field label={`Nét: ${shape.width}px`}>
        <input
          className="slider"
          type="range"
          min={1}
          max={40}
          value={shape.width}
          onChange={(event) => setShape({ ...shape, width: Number(event.target.value) })}
        />
      </Field>
      <Field label="Màu nét">
        <input
          className="input color-input"
          type="color"
          value={shape.color}
          onChange={(event) => setShape({ ...shape, color: event.target.value })}
        />
      </Field>
      <div className="hint">Kéo chuột trên ảnh để vẽ hình.</div>
    </div>
  );
}

export function ExportPanel({
  loaded,
  quality,
  setQuality,
  saved,
  busy,
  sending,
  onExport,
  onSave,
}: {
  loaded: boolean;
  quality: number;
  setQuality: (value: number) => void;
  saved: SavedFile[];
  busy: boolean;
  sending: boolean;
  onExport: (format: "png" | "jpeg" | "webp") => void;
  onSave: () => void;
}) {
  return (
    <div className="card">
      <div className="card-title mb-2">Xuất ảnh</div>
      <div className="grid grid-2">
        <button className="btn btn-sm" type="button" disabled={!loaded} onClick={() => onExport("png")}>
          <Download size={14} /> PNG
        </button>
        <button className="btn btn-sm" type="button" disabled={!loaded} onClick={() => onExport("jpeg")}>
          <Download size={14} /> JPEG
        </button>
        <button className="btn btn-sm" type="button" disabled={!loaded} onClick={() => onExport("webp")}>
          <Download size={14} /> WebP
        </button>
        <button className="btn btn-sm btn-primary" type="button" disabled={!loaded || busy} onClick={onSave}>
          {busy ? <Loader size={14} /> : "Lưu vào FlowGpt"}
        </button>
      </div>
      <div className="field mt-3">
        <span className="label">Chất lượng nén: {Math.round(quality * 100)}%</span>
        <input
          className="slider"
          type="range"
          min={0.3}
          max={1}
          step={0.01}
          value={quality}
          onChange={(event) => setQuality(Number(event.target.value))}
        />
      </div>
      {sending && <div className="hint mt-2">AI đang xử lý yêu cầu sửa ảnh…</div>}
      {saved.map((file) => (
        <div key={file.id} className="row gap-2 mt-2">
          <span className="badge badge-ok">Đã lưu</span>
          <a className="grow truncate small" href={api.fileUrl(file.id)} download>
            {file.name}
          </a>
        </div>
      ))}
    </div>
  );
}
