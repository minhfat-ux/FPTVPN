import { Download, Loader } from "lucide-react";
import { api } from "../api/client";
import { Field, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import type { SavedFile } from "./imageExport";
import type { BrushState, ShapeState, TextState } from "./useImageEditor";

const SHAPES: { id: ShapeState["kind"]; labelKey: string }[] = [
  { id: "rect", labelKey: "studio.image.shape.rect" },
  { id: "ellipse", labelKey: "studio.image.shape.ellipse" },
  { id: "arrow", labelKey: "studio.image.shape.arrow" },
];

export interface TextPanelProps {
  loaded: boolean;
  text: TextState;
  setText: (next: TextState) => void;
  textPos: { x: number; y: number } | null;
  onBakeText: () => void;
}

export function TextPanel({ loaded, text, setText, textPos, onBakeText }: TextPanelProps) {
  const { t, n } = useI18n();
  return (
    <div className="card">
      <div className="card-title mb-2">{t("studio.image.text.title")}</div>
      <Field label={t("studio.image.text.content")}>
        <textarea className="textarea" value={text.value} onChange={(event) => setText({ ...text, value: event.target.value })} />
      </Field>
      <div className="grid grid-2">
        <Field label={t("studio.image.text.size")}>
          <input
            className="input"
            type="number"
            min={8}
            value={text.size}
            onChange={(event) => setText({ ...text, size: Math.max(8, Number(event.target.value) || 8) })}
          />
        </Field>
        <Field label={t("studio.image.text.color")}>
          <input
            className="input color-input"
            type="color"
            value={text.color}
            onChange={(event) => setText({ ...text, color: event.target.value })}
          />
        </Field>
      </div>
      <Switch checked={text.bold} onChange={(value) => setText({ ...text, bold: value })} label={t("studio.image.text.bold")} />
      <button className="btn btn-primary btn-block mt-3" type="button" onClick={onBakeText} disabled={!loaded}>
        {t("studio.image.apply")}
      </button>
      <div className="hint mt-2">
        {textPos
          ? t("studio.image.text.position", { x: n(Math.round(textPos.x)), y: n(Math.round(textPos.y)) })
          : t("studio.image.text.pickPos")}
      </div>
    </div>
  );
}

export function BrushPanel({ brush, setBrush }: { brush: BrushState; setBrush: (next: BrushState) => void }) {
  const { t, n } = useI18n();
  return (
    <div className="card">
      <div className="card-title mb-2">{t("studio.image.brush.title")}</div>
      <Field label={t("studio.image.brush.width", { width: n(brush.width) })}>
        <input
          className="slider"
          type="range"
          min={1}
          max={60}
          value={brush.width}
          onChange={(event) => setBrush({ ...brush, width: Number(event.target.value) })}
        />
      </Field>
      <Field label={t("studio.image.brush.color")}>
        <input
          className="input color-input"
          type="color"
          value={brush.color}
          onChange={(event) => setBrush({ ...brush, color: event.target.value })}
        />
      </Field>
      <div className="hint">{t("studio.image.brush.hint")}</div>
    </div>
  );
}

export function ShapePanel({ shape, setShape }: { shape: ShapeState; setShape: (next: ShapeState) => void }) {
  const { t, n } = useI18n();
  return (
    <div className="card">
      <div className="card-title mb-2">{t("studio.image.shape.title")}</div>
      <div className="stack gap-1">
        {SHAPES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`btn btn-sm ${shape.kind === item.id ? "btn-primary" : ""}`}
            onClick={() => setShape({ ...shape, kind: item.id })}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
      <Field label={t("studio.image.shape.width", { width: n(shape.width) })}>
        <input
          className="slider"
          type="range"
          min={1}
          max={40}
          value={shape.width}
          onChange={(event) => setShape({ ...shape, width: Number(event.target.value) })}
        />
      </Field>
      <Field label={t("studio.image.shape.color")}>
        <input
          className="input color-input"
          type="color"
          value={shape.color}
          onChange={(event) => setShape({ ...shape, color: event.target.value })}
        />
      </Field>
      <div className="hint">{t("studio.image.shape.hint")}</div>
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
  const { t } = useI18n();
  return (
    <div className="card">
      <div className="card-title mb-2">{t("studio.image.export.title")}</div>
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
          {busy ? <Loader size={14} /> : t("studio.image.export.save")}
        </button>
      </div>
      <div className="field mt-3">
        <span className="label">{t("studio.image.export.quality", { percent: Math.round(quality * 100) })}</span>
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
      {sending && <div className="hint mt-2">{t("studio.image.aiWorking")}</div>}
      {saved.map((file) => (
        <div key={file.id} className="row gap-2 mt-2">
          <span className="badge badge-ok">{t("studio.image.export.saved")}</span>
          <a className="grow truncate small" href={api.fileUrl(file.id)} download>
            {file.name}
          </a>
        </div>
      ))}
    </div>
  );
}
