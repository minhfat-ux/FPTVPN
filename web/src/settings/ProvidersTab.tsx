import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Pencil, Trash2, Plug, Info, Star, AlertTriangle } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { ConfirmDialog, EmptyState, Spinner, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import { ProviderModal } from "./ProviderModal";
import type { Provider, ProviderKindInfo } from "../types";

export interface ProviderTestState {
  ok: boolean;
  message: string;
  latencyMs?: number;
  models?: string[] | null;
  loading?: boolean;
}

/** Settings → Nhà cung cấp AI. */
export function ProvidersTab() {
  const { push } = useToast();
  const { t, n } = useI18n();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [kinds, setKinds] = useState<ProviderKindInfo[]>([]);
  const [appDefault, setAppDefault] = useState<{ providerId: string | null; model: string | null }>({ providerId: null, model: null });
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<Record<string, ProviderTestState>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [providerResult, kindResult, settingsResult] = await Promise.all([api.providers(), api.providerKinds(), api.appSettings()]);
      setProviders(providerResult.items);
      setKinds(kindResult.items);
      setAppDefault({ providerId: settingsResult.settings.defaultProviderId, model: settingsResult.settings.defaultModel });
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.providers.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    load();
  }, [load]);

  /** Makes a provider the app default — the key must be present or chat falls back. */
  const setAsDefault = async (provider: Provider) => {
    try {
      const result = await api.saveAppSettings({
        defaultProviderId: provider.id,
        defaultModel: provider.defaultModel ?? provider.models[0] ?? null,
      });
      setAppDefault({ providerId: result.settings.defaultProviderId, model: result.settings.defaultModel });
      push(
        provider.hasApiKey ? t("settings.providers.defaultSet", { name: provider.name }) : t("settings.providers.defaultNoKey", { name: provider.name }),
        provider.hasApiKey ? "success" : "info",
      );
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.providers.setDefaultFailed"), "error");
    }
  };

  const defaultProvider = providers.find((p) => p.id === appDefault.providerId) ?? null;
  const workingProvider = providers.find((p) => p.enabled && p.hasApiKey) ?? null;

  const toggleEnabled = async (provider: Provider, enabled: boolean) => {
    setProviders((current) => current.map((p) => (p.id === provider.id ? { ...p, enabled } : p)));
    try {
      const result = await api.updateProvider(provider.id, { enabled });
      setProviders((current) => current.map((p) => (p.id === provider.id ? result.provider : p)));
    } catch (err) {
      setProviders((current) => current.map((p) => (p.id === provider.id ? { ...p, enabled: !enabled } : p)));
      push(err instanceof ApiError ? err.message : t("settings.providers.updateFailed"), "error");
    }
  };

  const test = async (provider: Provider) => {
    setTests((current) => ({ ...current, [provider.id]: { ok: true, message: "", loading: true } }));
    try {
      const result = await api.testProvider(provider.id, { listModels: true });
      const state = { ok: result.ok, message: result.message, latencyMs: result.latencyMs, models: result.models };
      setTests((current) => ({ ...current, [provider.id]: state }));
      push(t("settings.providers.testResult", { name: provider.name, message: result.message }), result.ok ? "success" : "error");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("settings.providers.testFailed");
      setTests((current) => ({ ...current, [provider.id]: { ok: false, message } }));
      push(message, "error");
    }
  };

  const saveModels = async (provider: Provider, models: string[]) => {
    const merged = Array.from(new Set([...provider.models, ...models]));
    try {
      const result = await api.updateProvider(provider.id, { models: merged });
      setProviders((current) => current.map((p) => (p.id === provider.id ? result.provider : p)));
      const count = n(merged.length - provider.models.length);
      push(t("settings.providers.modelsAdded", { count, name: provider.name }), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.providers.saveModelsFailed"), "error");
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.deleteProvider(removing.id);
      setProviders((current) => current.filter((p) => p.id !== removing.id));
      push(t("settings.providers.removed", { name: removing.name }), "success");
      setRemoving(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.providers.removeFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack gap-3">
      <div className="banner">
        <Info size={18} />
        <div className="grow">
          <div className="banner-title">{t("settings.providers.noKeyTitle")}</div>
          <div className="small">{t("settings.providers.noKeyBody")}</div>
        </div>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus size={15} /> {t("settings.providers.add")}
        </button>
      </div>

      {/* The default provider without a key would silently fall back mid-chat —
          say so here, where it can be fixed. */}
      {!loading && defaultProvider && !defaultProvider.hasApiKey && (
        <div className="banner" style={{ borderColor: "color-mix(in srgb, var(--warn) 45%, transparent)" }}>
          <AlertTriangle size={18} />
          <div className="grow">
            <div className="banner-title">{t("settings.providers.defaultMissingKeyTitle", { name: defaultProvider.name })}</div>
            <div className="small">
              {t(
                workingProvider ? "settings.providers.defaultMissingKeyBody" : "settings.providers.defaultMissingKeyBodyNone",
                { fallback: workingProvider?.name ?? t("settings.providers.otherProvider"), name: defaultProvider.name },
              )}
            </div>
          </div>
          <button className="btn btn-sm" type="button" onClick={() => { setEditing(defaultProvider); setModalOpen(true); }}>
            <Pencil size={14} /> {t("settings.providers.pasteKey")}
          </button>
        </div>
      )}

      {!loading && defaultProvider && defaultProvider.hasApiKey && (
        <div className="banner">
          <Star size={18} />
          <div className="grow">
            <div className="banner-title">{t("settings.providers.usingDefault", { name: defaultProvider.name })}</div>
            <div className="small">
              {t("settings.providers.usingDefaultHint", { model: appDefault.model ?? defaultProvider.defaultModel ?? "" })}
            </div>
          </div>
        </div>
      )}

      <div className="row">
        <div className="grow">
          <div className="card-title">{t("settings.providers.configuredTitle")}</div>
          <div className="card-desc">{t("settings.providers.configuredDesc")}</div>
        </div>
        <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {t("common.reload")}
        </button>
      </div>

      {loading && <Spinner label={t("settings.providers.loading")} />}

      {!loading && !providers.length && (
        <EmptyState icon="🔌" title={t("settings.providers.emptyTitle")} hint={t("settings.providers.emptyHint")} />
      )}

      <div className="stack gap-3">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            kind={kinds.find((k) => k.id === provider.kind)}
            test={tests[provider.id]}
            isAppDefault={provider.id === appDefault.providerId}
            onToggle={toggleEnabled}
            onTest={test}
            onSaveModels={saveModels}
            onSetDefault={() => setAsDefault(provider)}
            onEdit={() => { setEditing(provider); setModalOpen(true); }}
            onDelete={() => setRemoving(provider)}
          />
        ))}
      </div>

      <ProviderModal
        open={modalOpen}
        kinds={kinds}
        provider={editing}
        onClose={() => setModalOpen(false)}
        onSaved={async (message) => {
          setModalOpen(false);
          push(message, "success");
          await load();
        }}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        title={t("settings.providers.deleteTitle")}
        message={t("settings.providers.deleteMessage", { name: removing?.name ?? "" })}
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </div>
  );
}

function ProviderCard({
  provider,
  kind,
  test,
  isAppDefault,
  onToggle,
  onTest,
  onSaveModels,
  onSetDefault,
  onEdit,
  onDelete,
}: {
  provider: Provider;
  kind?: ProviderKindInfo;
  test?: ProviderTestState;
  isAppDefault: boolean;
  onToggle: (provider: Provider, enabled: boolean) => void;
  onTest: (provider: Provider) => void;
  onSaveModels: (provider: Provider, models: string[]) => void;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, n } = useI18n();
  const fresh = (test?.models ?? []).filter((model) => !provider.models.includes(model));

  return (
    <div className="card">
      <div className="entity-head">
        <div className="grow">
          <div className="row row-wrap gap-2">
            <span className="entity-name">{provider.name}</span>
            <span className="badge badge-accent">{kind?.label ?? provider.kind}</span>
            {isAppDefault && <span className="badge badge-ok"><Star size={11} /> {t("common.default")}</span>}
            {provider.hasApiKey === false && <span className="badge">{t("settings.providers.badgeNoKey")}</span>}
            {provider.enabled && provider.hasApiKey === false && provider.kind !== "mock" && (
              <span className="badge badge-warn"><AlertTriangle size={11} /> {t("settings.providers.badgeMissingKey")}</span>
            )}
          </div>
          <div className="meta-line">
            <span className="meta-pill">{t("settings.providers.modelCount", { count: n(provider.models.length) })}</span>
            {provider.defaultModel && <span className="meta-pill">{t("settings.providers.defaultModel", { model: provider.defaultModel })}</span>}
            {provider.baseUrl && <span className="truncate">{provider.baseUrl}</span>}
          </div>
          <div className="meta-line">
            <span className="mono key-preview">
              {provider.hasApiKey ? provider.apiKeyPreview ?? "••••" : t("settings.providers.badgeNoKey")}
            </span>
          </div>
          <div className="meta-line">
            {provider.supportsImages && <span className="badge badge-ok">{t("settings.providers.capImages")}</span>}
            {provider.supportsTools && <span className="badge badge-ok">{t("settings.providers.capTools")}</span>}
            {provider.supportsVision && <span className="badge badge-ok">{t("settings.providers.capVision")}</span>}
          </div>
        </div>

        <div className="stack gap-2" style={{ alignItems: "flex-end" }}>
          <Switch checked={provider.enabled} onChange={(value) => onToggle(provider, value)} label={t("common.on")} />
          <div className="row row-wrap gap-2">
            <button className="btn btn-sm" type="button" onClick={() => onTest(provider)} disabled={test?.loading}>
              <Plug size={14} /> {test?.loading ? t("settings.providers.testing") : t("settings.providers.test")}
            </button>
            {!isAppDefault && (
              <button className="btn btn-sm" type="button" onClick={onSetDefault} title={t("settings.providers.setDefaultTitle")}>
                <Star size={14} /> {t("settings.providers.setDefault")}
              </button>
            )}
            <button className="btn btn-sm" type="button" onClick={onEdit}>
              <Pencil size={14} /> {t("common.edit")}
            </button>
            <button className="btn btn-sm btn-danger" type="button" onClick={onDelete}>
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          </div>
        </div>
      </div>

      {test && !test.loading && test.message && (
        <div className="mt-3">
          <div className={`small ${test.ok ? "" : "error-text"}`}>
            <span className={`badge ${test.ok ? "badge-ok" : "badge-err"}`}>
              {test.ok ? t("settings.providers.testOk") : t("settings.providers.testError")}
            </span>{" "}
            {test.message}
            {typeof test.latencyMs === "number" && (
              <span className="muted"> · {t("settings.providers.latency", { ms: n(test.latencyMs) })}</span>
            )}
          </div>

          {test.ok && test.models && test.models.length > 0 && (
            <div className="mt-2">
              <div className="hint">
                {fresh.length
                  ? t("settings.providers.modelsFound", { count: n(test.models.length) })
                  : t("settings.providers.modelsFoundAll", { count: n(test.models.length) })}
              </div>
              <div className="chip-list mt-1">
                {test.models.slice(0, 60).map((model) => {
                  const added = provider.models.includes(model);
                  return (
                    <button
                      key={model}
                      type="button"
                      className={`chip${added ? " chip-added" : ""}`}
                      disabled={added}
                      title={added ? t("settings.providers.chipAdded") : t("settings.providers.chipSave")}
                      onClick={() => onSaveModels(provider, [model])}
                    >
                      {model}
                    </button>
                  );
                })}
              </div>
              {fresh.length > 1 && (
                <button className="btn btn-sm mt-2" type="button" onClick={() => onSaveModels(provider, fresh)}>
                  <Plus size={14} /> {t("settings.providers.saveAll", { count: n(fresh.length) })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
