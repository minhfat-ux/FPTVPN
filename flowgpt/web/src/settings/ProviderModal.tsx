import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { Field, Modal, Switch } from "../components/ui";
import type { Provider, ProviderKind, ProviderKindInfo } from "../types";

/** Create/edit dialog for one AI provider, driven by /settings/provider-kinds. */
export function ProviderModal({
  open,
  kinds,
  provider,
  onClose,
  onSaved,
}: {
  open: boolean;
  kinds: ProviderKindInfo[];
  provider: Provider | null;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [modelsText, setModelsText] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(provider);
  const info = kinds.find((k) => k.id === kind);
  const models = parseModels(modelsText);

  useEffect(() => {
    if (!open) return;
    if (provider) {
      setName(provider.name);
      setKind(provider.kind);
      setBaseUrl(provider.baseUrl ?? "");
      setModelsText(provider.models.join("\n"));
      setDefaultModel(provider.defaultModel ?? "");
      setImageModel(provider.imageModel ?? "");
      setEnabled(provider.enabled);
    } else {
      const first = kinds[0];
      setName("");
      setKind(first?.id ?? "openai");
      setBaseUrl(first?.defaultBaseUrl ?? "");
      setModelsText((first?.suggestedModels ?? []).join("\n"));
      setDefaultModel(first?.suggestedModels?.[0] ?? "");
      setImageModel(first?.defaultImageModel ?? "");
      setEnabled(true);
    }
    setApiKey("");
    setClearKey(false);
    setSaving(false);
  }, [open, provider, kinds]);

  const onKindChange = (next: ProviderKind) => {
    setKind(next);
    if (isEdit) return;
    const meta = kinds.find((k) => k.id === next);
    setBaseUrl(meta?.defaultBaseUrl ?? "");
    const suggested = meta?.suggestedModels ?? [];
    setModelsText(suggested.join("\n"));
    setDefaultModel(suggested[0] ?? "");
    setImageModel(meta?.defaultImageModel ?? "");
  };

  const appendModel = (model: string) => {
    if (models.includes(model)) return;
    setModelsText([...models, model].join("\n"));
    if (!defaultModel) setDefaultModel(model);
  };

  const save = async () => {
    if (!name.trim()) {
      push("Nhập tên nhà cung cấp", "error");
      return;
    }
    const payload: Record<string, unknown> = {
      name: name.trim(),
      kind,
      baseUrl: baseUrl.trim(),
      models,
      defaultModel: defaultModel || models[0] || null,
      enabled,
    };
    if (kind !== "mock" && !isEdit) payload.apiKey = apiKey.trim();
    if (isEdit) {
      if (clearKey) payload.apiKey = "";
      else if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (info?.supportsImages) payload.imageModel = imageModel.trim() || null;
    } else if (info?.supportsImages) {
      payload.imageModel = imageModel.trim() || info?.defaultImageModel || null;
    }

    setSaving(true);
    try {
      if (isEdit && provider) {
        await api.updateProvider(provider.id, payload);
        await onSaved(`Đã cập nhật nhà cung cấp ${payload.name}`);
      } else {
        await api.createProvider(payload);
        await onSaved(`Đã thêm nhà cung cấp ${payload.name}`);
      }
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không lưu được nhà cung cấp", "error");
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? `Sửa nhà cung cấp — ${provider?.name ?? ""}` : "Thêm nhà cung cấp AI"}
      description="Key chỉ được lưu ở backend dưới dạng mã hoá; giao diện không bao giờ hiển thị key đầy đủ."
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Thêm nhà cung cấp"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Tên nhà cung cấp" hint="Tên hiển thị trong danh sách chọn model khi chat.">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ví dụ: OpenAI công ty"
          />
        </Field>

        <Field label="Loại nhà cung cấp" hint={isEdit ? undefined : "Chọn loại để tự điền Base URL và model gợi ý."}>
          <select className="select" value={kind} onChange={(event) => onKindChange(event.target.value as ProviderKind)}>
            {kinds.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        {kind !== "mock" && (
          <Field label="Base URL" hint={info?.keyHint}>
            <input
              className="input input-mono"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={info?.defaultBaseUrl ?? "https://…"}
            />
          </Field>
        )}

        {kind !== "mock" && (
          <Field
            label="API key"
            hint={isEdit ? undefined : info?.keyHint}
          >
            <input
              className="input input-mono"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              disabled={clearKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={isEdit ? "Để trống nếu không đổi key" : "sk-…"}
            />
          </Field>
        )}

        {isEdit && kind !== "mock" && (
          <div className="stack gap-2 mb-3">
            <span className="hint">
              Đã lưu: <span className="mono">{provider?.apiKeyPreview ?? "chưa có key"}</span> — để trống nếu không đổi.
            </span>
            <Switch
              checked={clearKey}
              onChange={(value) => {
                setClearKey(value);
                if (value) setApiKey("");
              }}
              label="Xoá key đã lưu"
            />
          </div>
        )}

        <Field label="Model" hint="Mỗi dòng một model. Bấm chip gợi ý bên dưới để thêm nhanh.">
          <textarea
            className="textarea input-mono"
            rows={5}
            value={modelsText}
            onChange={(event) => setModelsText(event.target.value)}
            placeholder={"gpt-4o-mini\ngpt-4o"}
          />
        </Field>

        {(info?.suggestedModels?.length ?? 0) > 0 && (
          <div className="mb-3">
            <div className="hint mb-2">Model gợi ý cho {info?.label}:</div>
            <div className="chip-list">
              {info?.suggestedModels.map((model) => (
                <button
                  key={model}
                  type="button"
                  className={`chip${models.includes(model) ? " chip-added" : ""}`}
                  onClick={() => appendModel(model)}
                  title={models.includes(model) ? "Đã có trong danh sách" : "Thêm model này"}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-2">
          <Field label="Model mặc định" hint="Dùng khi người dùng không chọn model khác.">
            <select className="select" value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)}>
              <option value="">— Chưa chọn (dùng model đầu tiên) —</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </Field>

          {info?.supportsImages ? (
            <Field label="Model tạo ảnh" hint="Dùng cho kỹ năng tạo/sửa ảnh. Có thể để trống.">
              <input
                className="input input-mono"
                value={imageModel}
                onChange={(event) => setImageModel(event.target.value)}
                placeholder={info?.defaultImageModel ?? "ví dụ: gpt-image-1"}
              />
            </Field>
          ) : (
            <div />
          )}
        </div>

        <Switch checked={enabled} onChange={setEnabled} label="Bật nhà cung cấp này" />
        {defaultModel && !models.includes(defaultModel) && (
          <div className="error-text mt-2 row gap-2">
            <TriangleAlert size={14} /> Model mặc định không nằm trong danh sách model — hãy thêm hoặc chọn lại.
          </div>
        )}
      </div>
    </Modal>
  );
}

function parseModels(value: string): string[] {
  const seen = new Set<string>();
  for (const line of value.split("\n")) {
    const model = line.trim();
    if (model) seen.add(model);
  }
  return Array.from(seen);
}
