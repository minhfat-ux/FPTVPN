import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { Field, Modal, Switch } from "../components/ui";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
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
      push(t("settings.providerModal.nameRequired"), "error");
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
        await onSaved(t("settings.providerModal.updated", { name: String(payload.name) }));
      } else {
        await api.createProvider(payload);
        await onSaved(t("settings.providerModal.created", { name: String(payload.name) }));
      }
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.providerModal.saveFailed"), "error");
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      wide
      title={isEdit ? t("settings.providerModal.editTitle", { name: provider?.name ?? "" }) : t("settings.providerModal.createTitle")}
      description={t("settings.providerModal.desc")}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : isEdit ? t("common.saveChanges") : t("settings.providerModal.createSubmit")}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("settings.providerModal.nameLabel")} hint={t("settings.providerModal.nameHint")}>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("settings.providerModal.namePlaceholder")}
          />
        </Field>

        <Field
          label={t("settings.providerModal.kindLabel")}
          hint={isEdit ? undefined : t("settings.providerModal.kindHint")}
        >
          <select className="select" value={kind} onChange={(event) => onKindChange(event.target.value as ProviderKind)}>
            {kinds.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        {kind !== "mock" && (
          <Field label={t("settings.providerModal.baseUrlLabel")} hint={info?.keyHint}>
            <input
              className="input input-mono"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={info?.defaultBaseUrl ?? "https://…"}
            />
          </Field>
        )}

        {kind !== "mock" && (
          <Field label={t("settings.providerModal.apiKeyLabel")} hint={isEdit ? undefined : info?.keyHint}>
            <input
              className="input input-mono"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              disabled={clearKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={isEdit ? t("settings.providerModal.apiKeyKeepPlaceholder") : "sk-…"}
            />
          </Field>
        )}

        {isEdit && kind !== "mock" && (
          <div className="stack gap-2 mb-3">
            <span className="hint">
              {t("settings.providerModal.keySaved", { preview: provider?.apiKeyPreview ?? t("settings.providerModal.noKey") })}
            </span>
            <Switch
              checked={clearKey}
              onChange={(value) => {
                setClearKey(value);
                if (value) setApiKey("");
              }}
              label={t("settings.providerModal.clearKey")}
            />
          </div>
        )}

        <Field label={t("settings.providerModal.modelsLabel")} hint={t("settings.providerModal.modelsHint")}>
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
            <div className="hint mb-2">{t("settings.providerModal.suggestedFor", { name: info?.label ?? "" })}</div>
            <div className="chip-list">
              {info?.suggestedModels.map((model) => (
                <button
                  key={model}
                  type="button"
                  className={`chip${models.includes(model) ? " chip-added" : ""}`}
                  onClick={() => appendModel(model)}
                  title={models.includes(model) ? t("settings.providerModal.chipAdded") : t("settings.providerModal.chipAdd")}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-2">
          <Field label={t("settings.providerModal.defaultModelLabel")} hint={t("settings.providerModal.defaultModelHint")}>
            <select className="select" value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)}>
              <option value="">{t("settings.providerModal.defaultModelNone")}</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </Field>

          {info?.supportsImages ? (
            <Field label={t("settings.providerModal.imageModelLabel")} hint={t("settings.providerModal.imageModelHint")}>
              <input
                className="input input-mono"
                value={imageModel}
                onChange={(event) => setImageModel(event.target.value)}
                placeholder={info?.defaultImageModel ?? t("settings.providerModal.imageModelPlaceholder")}
              />
            </Field>
          ) : (
            <div />
          )}
        </div>

        <Switch checked={enabled} onChange={setEnabled} label={t("settings.providerModal.enable")} />
        {defaultModel && !models.includes(defaultModel) && (
          <div className="error-text mt-2 row gap-2">
            <TriangleAlert size={14} /> {t("settings.providerModal.defaultModelMissing")}
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
