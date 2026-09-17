import { Field, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import { DEFAULT_ADJUST, formatFilter } from "./canvasLib";
import type { SavedFile } from "./imageExport";
import { BrushPanel, ExportPanel, ShapePanel, TextPanel } from "./ToolPanelsExtra";
import type { BrushState, CanvasAction, ShapeState, TextState, Tool } from "./useImageEditor";

const SLIDERS = [
  ["brightness", "studio.image.adjust.brightness", 0, 200],
  ["contrast", "studio.image.adjust.contrast", 0, 200],
  ["saturate", "studio.image.adjust.saturate", 0, 200],
  ["blur", "studio.image.adjust.blur", 0, 20],
] as const;

const PRESETS: { id: CanvasAction; labelKey: string }[] = [
  { id: "grayscale", labelKey: "studio.image.filter.grayscale" },
  { id: "sepia", labelKey: "studio.image.filter.sepia" },
  { id: "invert", labelKey: "studio.image.filter.invert" },
];

const ROTATIONS: { id: CanvasAction; labelKey: string }[] = [
  { id: "rotate-left", labelKey: "studio.image.rotate.left" },
  { id: "rotate-right", labelKey: "studio.image.rotate.right" },
  { id: "flip-h", labelKey: "studio.image.rotate.flipH" },
  { id: "flip-v", labelKey: "studio.image.rotate.flipV" },
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
  const { t, n } = useI18n();
  const { tool, loaded, size, target, setTarget, lockRatio, setLockRatio, adjust, setAdjust, cropReady } = props;
  const { onAction, onApplyCrop, onCancelCrop, onApplyResize, onBakeAdjust } = props;

  if (tool === "crop") {
    return (
      <div className="card">
        <div className="card-title mb-2">{t("studio.image.crop.title")}</div>
        <div className="hint">{t("studio.image.crop.hint")}</div>
        <div className="row gap-2 mt-3">
          <button className="btn btn-primary btn-sm grow" type="button" onClick={onApplyCrop} disabled={!cropReady}>
            {t("studio.image.crop.apply")}
          </button>
          <button className="btn btn-sm" type="button" onClick={onCancelCrop} disabled={!cropReady}>
            {t("studio.image.cancel")}
          </button>
        </div>
      </div>
    );
  }

  if (tool === "rotate") {
    return (
      <div className="card">
        <div className="card-title mb-2">{t("studio.image.rotate.title")}</div>
        <div className="grid grid-2">
          {ROTATIONS.map((item) => (
            <button key={item.id} className="btn btn-sm" type="button" disabled={!loaded} onClick={() => onAction(item.id)}>
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (tool === "resize") {
    return (
      <div className="card">
        <div className="card-title mb-2">{t("studio.image.resize.title")}</div>
        <div className="grid grid-2">
          <Field label={t("studio.image.resize.width")}>
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
          <Field label={t("studio.image.resize.height")}>
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
        <Switch checked={lockRatio} onChange={setLockRatio} label={t("studio.image.resize.lock")} />
        <button className="btn btn-primary btn-block mt-3" type="button" onClick={onApplyResize} disabled={!loaded}>
          {t("studio.image.apply")}
        </button>
        <div className="hint mt-2">
          {t("studio.image.resize.current", { width: n(size.width), height: n(size.height) })}
        </div>
      </div>
    );
  }

  if (tool === "adjust") {
    return (
      <div className="card">
        <div className="card-title mb-2">{t("studio.image.adjust.title")}</div>
        {SLIDERS.map(([key, labelKey, min, max]) => (
          <div className="field" key={key}>
            <span className="label">
              {t(labelKey)}: {adjust[key]}
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
            {t("studio.image.adjust.bake")}
          </button>
          <button className="btn btn-sm" type="button" onClick={() => setAdjust(DEFAULT_ADJUST)}>
            {t("studio.image.adjust.reset")}
          </button>
        </div>
        <div className="hint mt-2">{t("studio.image.adjust.preview", { filter: formatFilter(adjust) })}</div>
      </div>
    );
  }

  if (tool === "filters") {
    return (
      <div className="card">
        <div className="card-title mb-2">{t("studio.image.filters.title")}</div>
        <div className="stack gap-2">
          {PRESETS.map((item) => (
            <button key={item.id} className="btn btn-sm" type="button" disabled={!loaded} onClick={() => onAction(item.id)}>
              {t(item.labelKey)}
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
