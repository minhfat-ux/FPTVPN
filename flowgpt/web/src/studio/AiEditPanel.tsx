import { useMemo, useState } from "react";
import { ImageDown, Send, Sparkles } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { FileRef } from "../types";
import { Field, Spinner } from "../components/ui";
import { useChat } from "../state/chat";
import { useData, useToast } from "../state/store";

const PRESETS = [
  "Xoá phông nền",
  "Đổi nền thành studio ánh sáng mềm",
  "Làm nét ảnh",
  "Xoá vật thể không mong muốn",
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
  const { models } = useData();
  const { push } = useToast();
  const { send, sending, pendingArtifacts, streaming } = useChat();

  const [instruction, setInstruction] = useState(PRESETS[0]);
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
      push("Hãy nạp một ảnh trước khi sửa bằng AI", "error");
      return;
    }
    if (!instruction.trim()) {
      push("Nhập yêu cầu chỉnh sửa cho AI", "error");
      return;
    }
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Không đọc được ảnh từ canvas");
      const result = await api.uploadBlob(blob, `studio-${Date.now()}.png`);
      setUploaded(result.file);
      const chosen = modelsForProvider.find((item) => item.model === model) ?? modelsForProvider[0];
      await send({
        content: `${instruction.trim()}. Giữ nguyên bố cục chính của ảnh đính kèm.`,
        attachments: [result.file],
        skill: "image",
        providerId: chosen?.providerId ?? null,
        model: chosen?.model ?? null,
      });
      push("Đã gửi yêu cầu sửa ảnh — xem kết quả ở khung chat", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không gửi được yêu cầu sửa ảnh", "error");
    }
  }

  if (!imageModels.length) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">Sửa ảnh bằng AI</div>
            <div className="card-desc">Chưa có nhà cung cấp AI nào hỗ trợ tạo ảnh.</div>
          </div>
        </div>
        <button className="btn btn-primary btn-block" type="button" disabled>
          <Sparkles size={16} /> Sửa bằng AI
        </button>
        <div className="hint mt-2">
          Vào <span className="bold">Cài đặt → Nhà cung cấp AI</span> để bật một nhà cung cấp có hỗ trợ ảnh, sau đó quay lại đây.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="grow">
          <div className="card-title">Sửa ảnh bằng AI</div>
          <div className="card-desc">Mô tả điều bạn muốn thay đổi trên ảnh đang mở.</div>
        </div>
      </div>

      <Field label="Yêu cầu chỉnh sửa">
        <textarea
          className="textarea"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Ví dụ: xoá phông nền và thay bằng nền trắng"
        />
      </Field>

      <div className="row row-wrap gap-1 mb-3">
        {PRESETS.map((preset) => (
          <button key={preset} className="btn btn-sm" type="button" onClick={() => setInstruction(preset)}>
            {preset}
          </button>
        ))}
      </div>

      <div className="grid grid-2">
        <Field label="Nhà cung cấp">
          <select
            className="select"
            value={providerId}
            onChange={(event) => {
              setProviderId(event.target.value);
              setModel("");
            }}
          >
            <option value="">Tự động</option>
            {providers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mô hình">
          <select className="select" value={model} onChange={(event) => setModel(event.target.value)}>
            <option value="">Mặc định</option>
            {modelsForProvider.map((item) => (
              <option key={`${item.providerId}:${item.model}`} value={item.model}>
                {item.model}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button className="btn btn-primary btn-block" type="button" onClick={run} disabled={sending}>
        {sending ? <Spinner label="Đang xử lý…" /> : <><Sparkles size={16} /> Sửa bằng AI</>}
      </button>

      <div className="hint mt-2">
        Kết quả do AI tạo sẽ xuất hiện ở <span className="bold">khung chat</span>
        {onOpenChat ? " — bấm “Mở chat” để xem." : "."}
        {uploaded && <> Ảnh gửi đi: <span className="mono">{uploaded.name}</span>.</>}
      </div>

      {onOpenChat && (
        <button className="btn btn-sm btn-ghost mt-2" type="button" onClick={onOpenChat}>
          <Send size={14} /> Mở chat
        </button>
      )}

      {produced.map((artifact) => (
        <div key={artifact.id} className="artifact-card">
          <div className="artifact-icon">IMG</div>
          <div className="grow">
            <div className="truncate bold small">Ảnh AI tạo — {artifact.name}</div>
            <div className="tiny faint">{(artifact.size / 1024).toFixed(0)} KB</div>
          </div>
          <a className="btn btn-sm" href={api.fileUrl(artifact.id)} download>
            <ImageDown size={14} /> Tải về
          </a>
        </div>
      ))}
    </div>
  );
}
