import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Pencil, Trash2, Plug, Info, Star, AlertTriangle } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { ConfirmDialog, EmptyState, Spinner, Switch } from "../components/ui";
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
  const [providers, setProviders] = useState<Provider[]>([]);
  const [kinds, setKinds] = useState<ProviderKindInfo[]>([]);
  const [appDefault, setAppDefault] = useState<{ providerId: string | null; model: string | null }>({
    providerId: null,
    model: null,
  });
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<Record<string, ProviderTestState>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [providerResult, kindResult, settingsResult] = await Promise.all([
        api.providers(),
        api.providerKinds(),
        api.appSettings(),
      ]);
      setProviders(providerResult.items);
      setKinds(kindResult.items);
      setAppDefault({
        providerId: settingsResult.settings.defaultProviderId,
        model: settingsResult.settings.defaultModel,
      });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không tải được nhà cung cấp", "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

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
        provider.hasApiKey
          ? `Đã đặt ${provider.name} làm mặc định`
          : `${provider.name} là mặc định nhưng chưa có API key — chat sẽ tạm dùng nhà cung cấp khác`,
        provider.hasApiKey ? "success" : "info",
      );
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không đặt được mặc định", "error");
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
      push(err instanceof ApiError ? err.message : "Không cập nhật được nhà cung cấp", "error");
    }
  };

  const test = async (provider: Provider) => {
    setTests((current) => ({ ...current, [provider.id]: { ok: true, message: "", loading: true } }));
    try {
      const result = await api.testProvider(provider.id, { listModels: true });
      setTests((current) => ({
        ...current,
        [provider.id]: { ok: result.ok, message: result.message, latencyMs: result.latencyMs, models: result.models },
      }));
      push(result.ok ? `${provider.name}: ${result.message}` : `${provider.name}: ${result.message}`, result.ok ? "success" : "error");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Kiểm tra thất bại";
      setTests((current) => ({ ...current, [provider.id]: { ok: false, message } }));
      push(message, "error");
    }
  };

  const saveModels = async (provider: Provider, models: string[]) => {
    const merged = Array.from(new Set([...provider.models, ...models]));
    try {
      const result = await api.updateProvider(provider.id, { models: merged });
      setProviders((current) => current.map((p) => (p.id === provider.id ? result.provider : p)));
      push(`Đã thêm ${merged.length - provider.models.length} model vào ${provider.name}`, "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không lưu được model", "error");
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.deleteProvider(removing.id);
      setProviders((current) => current.filter((p) => p.id !== removing.id));
      push(`Đã xoá nhà cung cấp ${removing.name}`, "success");
      setRemoving(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không xoá được nhà cung cấp", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack gap-3">
      <div className="banner">
        <Info size={18} />
        <div className="grow">
          <div className="banner-title">Chưa có key?</div>
          <div className="small">
            Bật nhà cung cấp <b>Demo</b> để thử toàn bộ luồng chat và công cụ mà không cần API key.
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus size={15} /> Thêm nhà cung cấp
        </button>
      </div>

      {/* The default provider without a key would silently fall back mid-chat —
          say so here, where it can be fixed. */}
      {!loading && defaultProvider && !defaultProvider.hasApiKey && (
        <div className="banner" style={{ borderColor: "color-mix(in srgb, var(--warn) 45%, transparent)" }}>
          <AlertTriangle size={18} />
          <div className="grow">
            <div className="banner-title">Mặc định “{defaultProvider.name}” chưa có API key</div>
            <div className="small">
              Chat sẽ tạm dùng <b>{workingProvider?.name ?? "một nhà cung cấp khác"}</b> cho tới khi anh dán key vào{" "}
              {defaultProvider.name}
              {workingProvider ? "" : " — hiện chưa có nhà cung cấp nào dùng được"}.
            </div>
          </div>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              setEditing(defaultProvider);
              setModalOpen(true);
            }}
          >
            <Pencil size={14} /> Dán key
          </button>
        </div>
      )}

      {!loading && defaultProvider && defaultProvider.hasApiKey && (
        <div className="banner">
          <Star size={18} />
          <div className="grow">
            <div className="banner-title">Đang dùng mặc định: {defaultProvider.name}</div>
            <div className="small">
              Model {appDefault.model ?? defaultProvider.defaultModel} · đổi mặc định bằng nút “Đặt mặc định” ở từng nhà
              cung cấp bên dưới.
            </div>
          </div>
        </div>
      )}

      <div className="row">
        <div className="grow">
          <div className="card-title">Nhà cung cấp đã cấu hình</div>
          <div className="card-desc">
            Key được mã hoá ở backend và chỉ hiển thị dạng rút gọn. Model ở đây là những model được phép chọn khi chat.
          </div>
        </div>
        <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {loading && <Spinner label="Đang tải nhà cung cấp…" />}

      {!loading && !providers.length && (
        <EmptyState
          icon="🔌"
          title="Chưa có nhà cung cấp AI nào"
          hint="Thêm OpenAI, Gemini, Anthropic, một gateway OpenAI-compatible… hoặc bật Demo để dùng thử ngay."
        />
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
            onEdit={() => {
              setEditing(provider);
              setModalOpen(true);
            }}
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
        title="Xoá nhà cung cấp"
        message={`Xoá "${removing?.name ?? ""}"? Hội thoại cũ vẫn giữ nguyên nhưng model của nhà cung cấp này sẽ không còn chọn được.`}
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
  const fresh = (test?.models ?? []).filter((model) => !provider.models.includes(model));

  return (
    <div className="card">
      <div className="entity-head">
        <div className="grow">
          <div className="row row-wrap gap-2">
            <span className="entity-name">{provider.name}</span>
            <span className="badge badge-accent">{kind?.label ?? provider.kind}</span>
            {isAppDefault && <span className="badge badge-ok"><Star size={11} /> Mặc định</span>}
            {provider.hasApiKey === false && <span className="badge">Không cần key</span>}
            {provider.enabled && provider.hasApiKey === false && provider.kind !== "mock" && (
              <span className="badge badge-warn"><AlertTriangle size={11} /> Thiếu key</span>
            )}
          </div>
          <div className="meta-line">
            <span className="meta-pill">{provider.models.length} model</span>
            {provider.defaultModel && <span className="meta-pill">mặc định: {provider.defaultModel}</span>}
            {provider.baseUrl && <span className="truncate">{provider.baseUrl}</span>}
          </div>
          <div className="meta-line">
            <span className="mono key-preview">
              {provider.hasApiKey ? provider.apiKeyPreview ?? "••••" : "Không cần key"}
            </span>
          </div>
          <div className="meta-line">
            {provider.supportsImages && <span className="badge badge-ok">Ảnh</span>}
            {provider.supportsTools && <span className="badge badge-ok">Công cụ</span>}
            {provider.supportsVision && <span className="badge badge-ok">Vision</span>}
          </div>
        </div>

        <div className="stack gap-2" style={{ alignItems: "flex-end" }}>
          <Switch checked={provider.enabled} onChange={(value) => onToggle(provider, value)} label="Bật" />
          <div className="row row-wrap gap-2">
            <button className="btn btn-sm" type="button" onClick={() => onTest(provider)} disabled={test?.loading}>
              <Plug size={14} /> {test?.loading ? "Đang kiểm tra…" : "Kiểm tra"}
            </button>
            {!isAppDefault && (
              <button className="btn btn-sm" type="button" onClick={onSetDefault} title="Dùng nhà cung cấp này cho mọi lượt chat mới">
                <Star size={14} /> Đặt mặc định
              </button>
            )}
            <button className="btn btn-sm" type="button" onClick={onEdit}>
              <Pencil size={14} /> Sửa
            </button>
            <button className="btn btn-sm btn-danger" type="button" onClick={onDelete}>
              <Trash2 size={14} /> Xoá
            </button>
          </div>
        </div>
      </div>

      {test && !test.loading && test.message && (
        <div className="mt-3">
          <div className={`small ${test.ok ? "" : "error-text"}`}>
            <span className={`badge ${test.ok ? "badge-ok" : "badge-err"}`}>{test.ok ? "OK" : "Lỗi"}</span>{" "}
            {test.message}
            {typeof test.latencyMs === "number" && <span className="muted"> · {test.latencyMs}ms</span>}
          </div>

          {test.ok && test.models && test.models.length > 0 && (
            <div className="mt-2">
              <div className="hint">
                Tìm thấy {test.models.length} model
                {fresh.length ? " — bấm để lưu vào nhà cung cấp:" : " (tất cả đã có trong danh sách)."}
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
                      title={added ? "Đã có trong danh sách" : "Lưu model này"}
                      onClick={() => onSaveModels(provider, [model])}
                    >
                      {model}
                    </button>
                  );
                })}
              </div>
              {fresh.length > 1 && (
                <button className="btn btn-sm mt-2" type="button" onClick={() => onSaveModels(provider, fresh)}>
                  <Plus size={14} /> Lưu tất cả {fresh.length} model mới
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
