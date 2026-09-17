import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw, Save, Send } from "lucide-react";
import { api, ApiError } from "../api/client";
import { requestCreditsRefresh } from "../state/credits";
import { useAuth, useToast } from "../state/store";
import { ConfirmDialog, Field, Spinner, Switch } from "../components/ui";
import { LocaleSwitcher, useI18n } from "../i18n";
import { CreditPricingCard } from "./CreditPricingCard";
import type { AppSettings, ModelOption, Provider, SkillId } from "../types";

/** App settings extended with the passwordless-login / mailer fields. */
type FullAppSettings = AppSettings & {
  mailerFrom: string;
  mailerFromName: string;
  hasResendKey: boolean;
  resendKeyPreview: string | null;
  loginTokenTtlMin: number;
  passwordLoginEnabled: boolean;
  autoCreateUserOnLogin: boolean;
  showLoginCodeWhenNoMailer: boolean;
};

type MailerTestResult = { ok: boolean; message: string };

const STAT_LABELS: { key: string; label: string }[] = [
  { key: "users", label: "settings.app.statUsers" },
  { key: "conversations", label: "settings.app.statConversations" },
  { key: "messages", label: "settings.app.statMessages" },
  { key: "files", label: "settings.app.statFiles" },
  { key: "providers", label: "settings.app.statProviders" },
  { key: "mcpServers", label: "settings.app.statMcpServers" },
];

const SKILLS: { id: SkillId; label: string }[] = [
  { id: "auto", label: "settings.app.skillAuto" },
  { id: "chat", label: "settings.app.skillChat" },
  { id: "image", label: "settings.app.skillImage" },
  { id: "ppt", label: "settings.app.skillPpt" },
  { id: "excel", label: "settings.app.skillExcel" },
  { id: "data", label: "settings.app.skillData" },
];

/** Settings → Hệ thống: thống kê, cấu hình mặc định và đăng nhập bằng email. */
export function AppTab() {
  const { user } = useAuth();
  const { push } = useToast();
  const { t, n } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [settings, setSettings] = useState<FullAppSettings | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [resendApiKey, setResendApiKey] = useState("");
  const [clearResendKey, setClearResendKey] = useState(false);
  const [mailTo, setMailTo] = useState(user?.email ?? "");
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResult, statsResult, providerResult, modelResult] = await Promise.all([
        api.appSettings(),
        api.adminStats(),
        api.providers(),
        api.models().catch(() => ({ items: [] as ModelOption[] })),
      ]);
      setSettings(settingsResult.settings as FullAppSettings);
      setStats(statsResult);
      setProviders(providerResult.items);
      setModels(modelResult.items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.app.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (value: Partial<FullAppSettings>) =>
    setSettings((current) => (current ? { ...current, ...value } : current));

  const modelChoices = useMemo(() => {
    if (!settings?.defaultProviderId) return models;
    const filtered = models.filter((item) => item.providerId === settings.defaultProviderId);
    return filtered.length ? filtered : models;
  }, [models, settings?.defaultProviderId]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    // hasResendKey / resendKeyPreview are derived server-side: never send them back.
    const { hasResendKey, resendKeyPreview, ...writable } = settings;
    void hasResendKey;
    void resendKeyPreview;
    try {
      const payload: Record<string, unknown> = { ...writable };
      if (clearResendKey) payload.resendApiKey = "";
      else if (resendApiKey.trim()) payload.resendApiKey = resendApiKey.trim();
      const result = await api.saveAppSettings(payload as Partial<AppSettings>);
      setSettings(result.settings as FullAppSettings);
      setResendApiKey("");
      setClearResendKey(false);
      // Pricing/limits may have just changed: every open badge should re-read.
      requestCreditsRefresh();
      push(t("settings.app.saved"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.app.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const sendTestMail = async () => {
    if (!mailTo.trim()) {
      push(t("settings.app.testMailNoAddress"), "error");
      return;
    }
    setSendingMail(true);
    try {
      const testMailer = api as unknown as (typeof api) & {
        testMailer?: (body: { to: string }) => Promise<MailerTestResult>;
      };
      if (!testMailer.testMailer) {
        push(t("settings.app.testMailUnsupported"), "error");
        return;
      }
      const result = await testMailer.testMailer({ to: mailTo.trim() });
      const fallback = result.ok ? t("settings.app.testMailSent") : t("settings.app.testMailFailed");
      push(result.message || fallback, result.ok ? "success" : "error");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.app.testMailFailed"), "error");
    } finally {
      setSendingMail(false);
    }
  };

  if (loading && !settings) return <Spinner label={t("settings.app.loading")} />;
  if (!settings) return <div className="muted small">{t("settings.app.loadError")}</div>;

  const providerModels = models.filter((item) => item.providerId === settings.defaultProviderId);

  return (
    <div className="stack gap-3">
      <div className="grid grid-3">
        {STAT_LABELS.map((item) => (
          <div className="stat" key={item.key}>
            <div className="stat-value">{n(stats[item.key] ?? 0)}</div>
            <div className="stat-label">{t(item.label)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("settings.app.generalTitle")}</div>
            <div className="card-desc">{t("settings.app.generalDesc")}</div>
          </div>
          <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> {t("common.reload")}
          </button>
        </div>

        <Field label={t("settings.app.appNameLabel")} hint={t("settings.app.appNameHint")}>
          <input className="input" value={settings.appName} onChange={(event) => patch({ appName: event.target.value })} />
        </Field>

        <Field label={t("settings.app.systemPromptLabel")} hint={t("settings.app.systemPromptHint")}>
          <textarea className="textarea" rows={8} value={settings.systemPrompt} onChange={(event) => patch({ systemPrompt: event.target.value })} />
        </Field>

        <div className="grid grid-2">
          <Field label={t("settings.app.defaultProviderLabel")} hint={t("settings.app.defaultProviderHint")}>
            <select className="select" value={settings.defaultProviderId ?? ""} onChange={(event) => patch({ defaultProviderId: event.target.value || null, defaultModel: null })}>
              <option value="">{t("settings.app.defaultProviderAuto")}</option>
              {providers.filter((provider) => provider.enabled).map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </Field>

          <Field
            label={t("settings.app.defaultModelLabel")}
            hint={settings.defaultProviderId && !providerModels.length ? t("settings.app.defaultModelNoModels") : t("settings.app.defaultModelHint")}
          >
            <select className="select" value={settings.defaultModel ?? ""} onChange={(event) => patch({ defaultModel: event.target.value || null })}>
              <option value="">{t("settings.app.defaultModelAuto")}</option>
              {modelChoices.map((item) => (
                <option key={`${item.providerId}:${item.model}`} value={item.model}>{item.providerName} · {item.model}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-2">
          <Field label={t("settings.app.defaultSkillLabel")} hint={t("settings.app.defaultSkillHint")}>
            <select className="select" value={settings.defaultSkill} onChange={(event) => patch({ defaultSkill: event.target.value as SkillId })}>
              {SKILLS.map((skill) => (
                <option key={skill.id} value={skill.id}>{t(skill.label)}</option>
              ))}
            </select>
          </Field>

          <Field label={t("settings.app.imageModelLabel")} hint={t("settings.app.imageModelHint")}>
            <input className="input input-mono" value={settings.imageModel ?? ""} onChange={(event) => patch({ imageModel: event.target.value || null })} placeholder={t("settings.app.imageModelPlaceholder")} />
          </Field>
        </div>

        <div className="num-row">
          <Field label={t("settings.app.maxToolIterationsLabel")} hint={t("settings.app.maxToolIterationsHint")}>
            <input className="input w-num" type="number" min={1} max={12} value={settings.maxToolIterations}
              onChange={(event) => patch({ maxToolIterations: clamp(Number(event.target.value), 1, 12, 6) })} />
          </Field>
          <Field label={t("settings.app.maxUploadLabel")} hint={t("settings.app.maxUploadHint")}>
            <input className="input w-num" type="number" min={1} max={100} value={settings.maxUploadMb}
              onChange={(event) => patch({ maxUploadMb: clamp(Number(event.target.value), 1, 100, 25) })} />
          </Field>
        </div>

        <Switch checked={settings.allowSignup} onChange={(value) => patch({ allowSignup: value })} label={t("settings.app.allowSignup")} />

        <div className="row row-wrap gap-2 mt-2">
          <div className="grow">
            <div className="label">{t("settings.app.languageLabel")}</div>
            <div className="hint">{t("settings.app.languageHint")}</div>
          </div>
          <LocaleSwitcher />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("settings.app.mailTitle")}</div>
            <div className="card-desc">{t("settings.app.mailDesc")}</div>
          </div>
          <span className={`badge ${settings.hasResendKey ? "badge-ok" : "badge-warn"}`}>
            {settings.hasResendKey ? t("settings.app.hasResendKey") : t("settings.app.noResendKey")}
          </span>
        </div>

        {!settings.hasResendKey && (
          <div className="banner banner-compact mb-3">
            <div className="grow small">{t("settings.app.noResendBanner")}</div>
          </div>
        )}

        <div className="grid grid-2">
          <Field label={t("settings.app.mailerFromLabel")} hint={t("settings.app.mailerFromHint")}>
            <input className="input input-mono" value={settings.mailerFrom} onChange={(event) => patch({ mailerFrom: event.target.value })} placeholder="no-reply@meetflowai.site" />
          </Field>
          <Field label={t("settings.app.mailerFromNameLabel")} hint={t("settings.app.mailerFromNameHint")}>
            <input className="input" value={settings.mailerFromName} onChange={(event) => patch({ mailerFromName: event.target.value })} placeholder="FlowGpt" />
          </Field>
        </div>

        <Field
          label={t("settings.app.resendKeyLabel")}
          hint={settings.hasResendKey ? t("settings.app.resendKeySaved", { preview: settings.resendKeyPreview ?? "••••" }) : t("settings.app.resendKeyEmpty")}
        >
          <input className="input input-mono" type="password" autoComplete="new-password" value={resendApiKey} disabled={clearResendKey}
            onChange={(event) => setResendApiKey(event.target.value)} placeholder="re_…" />
        </Field>
        {settings.hasResendKey && (
          <Switch checked={clearResendKey} onChange={(value) => { setClearResendKey(value); if (value) setResendApiKey(""); }} label={t("settings.app.clearResendKey")} />
        )}

        <div className="divider" />

        <div className="row row-wrap gap-2">
          <Field label={t("settings.app.testMailToLabel")} hint={t("settings.app.testMailToHint")}>
            <input className="input" type="email" value={mailTo} onChange={(event) => setMailTo(event.target.value)} placeholder={t("settings.app.testMailPlaceholder")} />
          </Field>
          <button className="btn btn-inline" type="button" onClick={sendTestMail} disabled={sendingMail}>
            <Send size={15} /> {sendingMail ? t("common.sending") : t("settings.app.sendTestMail")}
          </button>
        </div>
        <div className="hint">{t("settings.app.testMailNote")}</div>

        <div className="num-row mt-2">
          <Field label={t("settings.app.loginTtlLabel")} hint={t("settings.app.loginTtlHint")}>
            <input className="input w-num" type="number" min={5} max={60} value={settings.loginTokenTtlMin}
              onChange={(event) => patch({ loginTokenTtlMin: clamp(Number(event.target.value), 5, 60, 15) })} />
          </Field>
        </div>

        <div className="stack gap-2 mt-2">
          <Switch checked={settings.passwordLoginEnabled} onChange={(value) => patch({ passwordLoginEnabled: value })} label={t("settings.app.passwordLogin")} />
          <Switch checked={settings.autoCreateUserOnLogin} onChange={(value) => patch({ autoCreateUserOnLogin: value })} label={t("settings.app.autoCreateUser")} />
          <Switch checked={settings.showLoginCodeWhenNoMailer} onChange={(value) => patch({ showLoginCodeWhenNoMailer: value })} label={t("settings.app.showLoginCode")} />
        </div>
      </div>

      <CreditPricingCard settings={settings} onPatch={patch} />

      <div className="card">
        <div className="row row-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? t("common.saving") : t("settings.app.save")}
          </button>
          <button className="btn" type="button" onClick={() => setConfirmReset(true)} disabled={saving}>
            <RotateCcw size={15} /> {t("settings.app.reset")}
          </button>
          <span className="hint">{t("settings.app.resetHint")}</span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={t("settings.app.resetTitle")}
        message={t("settings.app.resetMessage")}
        confirmLabel={t("settings.app.resetConfirm")}
        busy={loading}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          await load();
          push(t("settings.app.reloaded"), "info");
        }}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
