import { useMemo, useState } from "react";
import { ImageDown, Send, Sparkles } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { FileRef } from "../types";
import { Field, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { useChat } from "../state/chat";
import { useData, useToast } from "../state/store";

const PRESETS = [
  "studio.image.ai.preset1",
  "studio.image.ai.preset2",
  "studio.image.ai.preset3",
  "studio.image.ai.preset4",
];

/**
 * Bảng "Sửa bằng AI": tải ảnh canvas lên rồi gửi một lượt chat với skill
 * `image`, kết quả do backend tạo sẽ xuất hiện ở khung chat.
 */
export function AiEditPanel({
  getCanvas,
  onOpenChat,
}: {
  getCanvas: () => HTMLCanvasElement | null;
  onOpenChat?: () => void;
}) {
  const { t } = useI18n();
  const { models } = useData();
  const { push } = useToast();
  const { send, sending, pendingArtifacts, streaming } = useChat();

  const [instruction, setInstruction] = useState(() => t("studio.image.ai.preset1"));
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [uploaded, setUploaded] = useState<FileRef | null>(null);

  const imageModels = useMemo(() => models.filter((item) => item.supportsImages), [models]);
  const providers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of imageModels) seen.set(item.providerId, item.providerName);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [imageModels]);

  const modelsForProvider = useMemo(
    () => imageModels.filter((item) => !providerId || item.providerId === providerId),
    [imageModels, providerId],
  );

  const produced = useMemo(() => {
    const list = streaming?.artifacts?.length ? streaming.artifacts : pendingArtifacts;
    return list.filter((item) => item.kind === "image" || item.mime.startsWith("image/"));
  }, [streaming, pendingArtifacts]);

  async function run() {
    const canvas = getCanvas();
    if (!canvas || !canvas.width || canvas.width < 2) {
      push(t("studio.image.ai.needImage"), "error");
      return;
    }
    if (!instruction.trim()) {
      push(t("studio.image.ai.needInstruction"), "error");
      return;
    }
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Không đọc được ảnh từ canvas");
      const result = await api.uploadBlob(blob, `studio-${Date.now()}.png`);
      setUploaded(result.file);
      const chosen = modelsForProvider.find((item) => item.model === model) ?? modelsForProvider[0];
      await send({
        content: `${instruction.trim()}. ${t("studio.image.ai.keepLayout")}`,
        attachments: [result.file],
        skill: "image",
        providerId: chosen?.providerId ?? null,
        model: chosen?.model ?? null,
      });
      push(t("studio.image.ai.sent"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("studio.image.ai.sendFailed"), "error");
    }
  }

  if (!imageModels.length) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("studio.image.ai.title")}</div>
            <div className="card-desc">{t("studio.image.ai.noModels")}</div>
          </div>
        </div>
        <button className="btn btn-primary btn-block" type="button" disabled>
          <Sparkles size={16} /> {t("studio.image.ai.button")}
        </button>
        <div className="hint mt-2">{t("studio.image.ai.settingsHint")}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="grow">
          <div className="card-title">{t("studio.image.ai.title")}</div>
          <div className="card-desc">{t("studio.image.ai.desc")}</div>
        </div>
      </div>

      <Field label={t("studio.image.ai.instruction")}>
        <textarea
          className="textarea"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder={t("studio.image.ai.placeholder")}
        />
      </Field>

      <div className="row row-wrap gap-1 mb-3">
        {PRESETS.map((preset) => (
          <button key={preset} className="btn btn-sm" type="button" onClick={() => setInstruction(t(preset))}>
            {t(preset)}
          </button>
        ))}
      </div>

      <div className="grid grid-2">
        <Field label={t("studio.image.ai.provider")}>
          <select
            className="select"
            value={providerId}
            onChange={(event) => {
              setProviderId(event.target.value);
              setModel("");
            }}
          >
            <option value="">{t("studio.image.ai.providerAuto")}</option>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("studio.image.ai.model")}>
          <select className="select" value={model} onChange={(event) => setModel(event.target.value)}>
            <option value="">{t("studio.image.ai.modelDefault")}</option>
            {modelsForProvider.map((item) => (
              <option key={`${item.providerId}:${item.model}`} value={item.model}>
                {item.model}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button className="btn btn-primary btn-block" type="button" onClick={run} disabled={sending}>
        {sending ? <Spinner label={t("studio.image.ai.processing")} /> : <><Sparkles size={16} /> {t("studio.image.ai.button")}</>}
      </button>

      <div className="hint mt-2">
        {t("studio.image.ai.resultHint")}
        {onOpenChat ? t("studio.image.ai.resultHintOpen") : t("studio.image.ai.resultHintPlain")}
        {uploaded && <> {t("studio.image.ai.uploaded", { name: uploaded.name })}</>}
      </div>

      {onOpenChat && (
        <button className="btn btn-sm btn-ghost mt-2" type="button" onClick={onOpenChat}>
          <Send size={14} /> {t("studio.action.openChat")}
        </button>
      )}

      {produced.map((artifact) => (
        <div key={artifact.id} className="artifact-card">
          <div className="artifact-icon">IMG</div>
          <div className="grow">
            <div className="truncate bold small">{t("studio.image.ai.artifact", { name: artifact.name })}</div>
            <div className="tiny faint">{(artifact.size / 1024).toFixed(0)} KB</div>
          </div>
          <a className="btn btn-sm" href={api.fileUrl(artifact.id)} download>
            <ImageDown size={14} /> {t("studio.action.download")}
          </a>
        </div>
      ))}
    </div>
  );
}
