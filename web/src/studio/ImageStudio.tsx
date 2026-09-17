import { useMemo } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { api } from "../api/client";
import { Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { AiEditPanel } from "./AiEditPanel";
import { CanvasStage } from "./CanvasStage";
import { ToolPanels } from "./ToolPanels";
import { useImageEditor } from "./useImageEditor";

type Tool = "crop" | "rotate" | "resize" | "adjust" | "filters" | "text" | "brush" | "shape";

const TOOLS: { id: Tool; labelKey: string }[] = [
  { id: "crop", labelKey: "studio.image.tool.crop" },
  { id: "rotate", labelKey: "studio.image.tool.rotate" },
  { id: "resize", labelKey: "studio.image.tool.resize" },
  { id: "adjust", labelKey: "studio.image.tool.adjust" },
  { id: "filters", labelKey: "studio.image.tool.filters" },
  { id: "text", labelKey: "studio.image.tool.text" },
  { id: "brush", labelKey: "studio.image.tool.brush" },
  { id: "shape", labelKey: "studio.image.tool.shape" },
];

/** Trình sửa ảnh Canvas 2D: cắt, xoay, màu sắc, chữ, vẽ tay, hình khối và xuất tệp. */
export function ImageStudio({ onOpenChat }: { onOpenChat?: () => void }) {
  const { t, n } = useI18n();
  const editor = useImageEditor();
  const imageArtifacts = useMemo(
    () => editor.pendingArtifacts.filter((item) => item.kind === "image"),
    [editor.pendingArtifacts],
  );

  const crosshair = editor.tool === "text" || editor.tool === "crop" || editor.tool === "brush" || editor.tool === "shape";
  const cropReady = Boolean(editor.crop && Math.abs(editor.crop.width) >= 8 && Math.abs(editor.crop.height) >= 8);

  const statusText = !editor.loaded
    ? t("studio.image.status.noImage")
    : editor.tool === "crop"
      ? t("studio.image.status.crop")
      : editor.tool === "brush" || editor.tool === "shape"
        ? t("studio.image.status.draw")
        : editor.tool === "text"
          ? t("studio.image.status.text")
          : null;

  return (
    <div className="studio">
      <div className="stack">
        <div className="card">
          <div className="card-title mb-2">{t("studio.image.toolsTitle")}</div>
          <div className="stack gap-1">
            {TOOLS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn ${editor.tool === item.id ? "btn-primary" : ""}`}
                onClick={() => editor.setTool(item.id)}
                disabled={!editor.loaded}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <div className="divider" />
          <div className="row gap-2">
            <button className="btn btn-sm grow" type="button" onClick={editor.undo} disabled={!editor.history.length} title="Ctrl+Z">
              <Undo2 size={14} /> {t("studio.image.undo")}
            </button>
            <button className="btn btn-sm grow" type="button" onClick={editor.redo} disabled={!editor.future.length} title="Ctrl+Shift+Z">
              <RotateCcw size={14} /> {t("studio.image.redo")}
            </button>
          </div>
          <button className="btn btn-sm btn-block mt-2" type="button" onClick={editor.reset} disabled={!editor.loaded}>
            {t("studio.image.reset")}
          </button>
          <div className="hint mt-2">{t("studio.image.hotkeyHint")}</div>
        </div>

        <ToolPanels
          tool={editor.tool}
          loaded={editor.loaded}
          size={editor.size}
          target={editor.target}
          setTarget={editor.setTarget}
          lockRatio={editor.lockRatio}
          setLockRatio={editor.setLockRatio}
          adjust={editor.adjust}
          setAdjust={editor.setAdjust}
          text={editor.text}
          setText={editor.setText}
          textPos={editor.textPos}
          brush={editor.brush}
          setBrush={editor.setBrush}
          shape={editor.shape}
          setShape={editor.setShape}
          cropReady={cropReady}
          quality={editor.quality}
          setQuality={editor.setQuality}
          saved={editor.saved}
          busy={editor.busy}
          sending={editor.sending}
          onAction={editor.onAction}
          onApplyCrop={editor.applyCrop}
          onCancelCrop={() => editor.setCrop(null)}
          onApplyResize={editor.applyResize}
          onBakeAdjust={editor.bakeAdjust}
          onBakeText={editor.bakeText}
          onExport={editor.exportBlob}
          onSave={editor.saveToFlowGpt}
        />
      </div>

      <div className="stack">
        {!editor.loaded && (
          <div
            className={`dropzone ${editor.over ? "over" : ""}`}
            onClick={() => document.getElementById("image-studio-file")?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              editor.setOver(true);
            }}
            onDragLeave={() => editor.setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              editor.setOver(false);
              const file = event.dataTransfer.files[0];
              if (file) void editor.loadFile(file);
            }}
          >
            <div className="bold">{t("studio.image.dropTitle")}</div>
            <div className="small mt-1">{t("studio.image.dropHint")}</div>
          </div>
        )}

        <div className="card">
          <div className="row gap-2 mb-2">
            <div className="grow truncate small bold">{editor.fileName || t("studio.image.noImage")}</div>
            <button className="btn btn-sm" type="button" onClick={() => document.getElementById("image-studio-file")?.click()}>
              {editor.loaded ? t("studio.image.changeImage") : t("studio.image.pickImage")}
            </button>
            {editor.loaded && (
              <span className="badge">
                {t("studio.image.sizeBadge", { width: n(editor.size.width), height: n(editor.size.height) })}
              </span>
            )}
          </div>

          <CanvasStage
            canvasRef={editor.canvasRef}
            loaded={editor.loaded}
            over={editor.over}
            crosshair={crosshair}
            crop={editor.crop}
            sourceSize={editor.size}
            text={editor.textPos ? { ...editor.text, x: editor.textPos.x, y: editor.textPos.y } : null}
            statusText={statusText}
            onPointerDown={editor.onPointerDown}
            onPointerMove={editor.onPointerMove}
            onPointerUp={editor.onPointerUp}
            dropHandlers={{
              onOver: editor.setOver,
              onDropFile: (file) => void editor.loadFile(file),
              onPick: () => document.getElementById("image-studio-file")?.click(),
            }}
          />

          {editor.sending && (
            <div className="mt-2">
              <Spinner label={t("studio.image.aiWorking")} />
            </div>
          )}
        </div>

        <AiEditPanel getCanvas={() => editor.canvasRef.current} onOpenChat={onOpenChat} />

        {imageArtifacts.length > 0 && (
          <div className="card">
            <div className="card-title mb-2">{t("studio.image.sessionArtifacts")}</div>
            {imageArtifacts.map((file) => (
              <div key={file.id} className="artifact-card">
                <div className="artifact-icon">IMG</div>
                <div className="grow truncate small">{file.name}</div>
                <a className="btn btn-sm" href={api.fileUrl(file.id)} download>
                  {t("studio.action.download")}
                </a>
              </div>
            ))}
          </div>
        )}

        <input
          id="image-studio-file"
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void editor.loadFile(file);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
