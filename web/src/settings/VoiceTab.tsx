import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Volume2, WandSparkles } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth, useToast } from "../state/store";
import { Field, Spinner, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import { toSpeakableText, useSpeechSynthesis } from "../voice";
import { useVoice } from "../voice/VoiceProvider";
import type { AppSettings, VoiceProviderOption } from "../types";

type VoiceSettings = Pick<
  AppSettings,
  | "voiceSttProviderId"
  | "voiceSttModel"
  | "voiceTtsProviderId"
  | "voiceTtsModel"
  | "voiceTtsVoice"
  | "voiceLanguage"
  | "voiceAutoRead"
  | "voiceSpeakRate"
  | "voiceEnabled"
>;

const EMPTY: VoiceSettings = {
  voiceSttProviderId: null,
  voiceSttModel: null,
  voiceTtsProviderId: null,
  voiceTtsModel: null,
  voiceTtsVoice: null,
  voiceLanguage: "vi-VN",
  voiceAutoRead: false,
  voiceSpeakRate: 1,
  voiceEnabled: false,
};

const LANGUAGES = [
  { value: "vi-VN", label: "settings.voice.languageVi" },
  { value: "en-US", label: "settings.voice.languageEn" },
];

/** Settings → Giọng nói: free browser path by default, provider path optional. */
export function VoiceTab() {
  const { user } = useAuth();
  const { push } = useToast();
  const { t, n } = useI18n();
  const { reload, config, vietnameseVoices, speak } = useVoice();
  const synthesis = useSpeechSynthesis();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings | null>(null);

  const sampleText = t("settings.voice.sampleText");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.appSettings();
      setSettings(pickVoice(result.settings));
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.voice.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (user && !user.isAdmin) return <div className="muted small">{t("settings.voice.adminOnly")}</div>;
  if (loading && !settings) return <Spinner label={t("settings.voice.loading")} />;
  if (!settings) return <div className="muted small">{t("settings.voice.loadError")}</div>;

  const patch = (value: Partial<VoiceSettings>) =>
    setSettings((current) => (current ? { ...current, ...value } : current));

  const sttOptions = config.options.filter((option) => option.supportsStt);
  const ttsOptions = config.options.filter((option) => option.supportsTts);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveAppSettings({ ...settings } as Partial<AppSettings>);
      await reload();
      push(t("settings.voice.saved"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.voice.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      if (settings.voiceSttProviderId && config.stt.mode === "server") {
        const result = await api.testVoice(sampleText);
        if (!result.ok) {
          push(result.message, "error");
          return;
        }
        const url = URL.createObjectURL(result.blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => URL.revokeObjectURL(url);
        await audio.play().catch(() => undefined);
        const ms = n(result.latencyMs);
        push(t("settings.voice.testResult", { message: result.message, provider: result.provider, ms }), "success");
        return;
      }
      if (!synthesis.supported) {
        push(t("settings.voice.unsupported"), "error");
        return;
      }
      await synthesis.speak(sampleText, { rate: settings.voiceSpeakRate, voiceName: settings.voiceTtsVoice });
      push(t("settings.voice.browserTestOk"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.voice.testFailed"), "error");
    } finally {
      setTesting(false);
    }
  };

  const sampleVoice = vietnameseVoices[0]?.name ?? null;
  const rate = n(settings.voiceSpeakRate, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-3" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div className="grow">
            <div className="card-title">Bật/tắt giọng nói</div>
            <div className="card-desc">Tắt nếu giọng nói chưa ổn định — nút micro và chế độ nói sẽ bị ẩn.</div>
          </div>
          <Switch checked={settings.voiceEnabled} onChange={(value) => patch({ voiceEnabled: value })} label={t("common.on")} />
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("settings.voice.freeTitle")}</div>
            <div className="card-desc">{t("settings.voice.freeDesc")}</div>
          </div>
          <span className="badge badge-ok">{t("settings.voice.freeBadge")}</span>
        </div>
        <div className="small muted">{t("settings.voice.freeNote")}</div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("settings.voice.langTitle")}</div>
            <div className="card-desc">{t("settings.voice.langDesc")}</div>
          </div>
        </div>

        <div className="grid grid-2">
          <Field label={t("settings.voice.languageLabel")} hint={t("settings.voice.languageHint")}>
            <select className="select" value={settings.voiceLanguage.startsWith("vi") ? "vi-VN" : settings.voiceLanguage} onChange={(event) => patch({ voiceLanguage: event.target.value })}>
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>{t(language.label)}</option>
              ))}
            </select>
          </Field>

          <Field label={t("settings.voice.rateLabel", { rate })} hint={t("settings.voice.rateHint")}>
            <input
              className="slider"
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={settings.voiceSpeakRate}
              onChange={(event) => patch({ voiceSpeakRate: Number(event.target.value) || 1 })}
            />
          </Field>
        </div>

        <Switch checked={settings.voiceAutoRead} onChange={(value) => patch({ voiceAutoRead: value })} label={t("settings.voice.autoRead")} />
      </div>

      <EndpointCard
        title={t("settings.voice.sttTitle")} description={t("settings.voice.sttDesc")} half="stt"
        mode={settings.voiceSttProviderId ? "server" : "browser"} providerId={settings.voiceSttProviderId}
        model={settings.voiceSttModel} voice={null} options={sttOptions}
        onMode={(mode) => {
          if (mode === "browser") patch({ voiceSttProviderId: null });
          else patch({ voiceSttProviderId: settings.voiceSttProviderId ?? sttOptions[0]?.id ?? null });
        }}
        onProvider={(providerId) => {
          const option = sttOptions.find((item) => item.id === providerId);
          patch({ voiceSttProviderId: providerId, voiceSttModel: option?.defaultSttModel ?? null });
        }}
        onModel={(model) => patch({ voiceSttModel: model })} onVoice={() => undefined}
      />

      <EndpointCard
        title={t("settings.voice.ttsTitle")} description={t("settings.voice.ttsDesc")} half="tts"
        mode={settings.voiceTtsProviderId ? "server" : "browser"} providerId={settings.voiceTtsProviderId}
        model={settings.voiceTtsModel} voice={settings.voiceTtsVoice} options={ttsOptions}
        onMode={(mode) => {
          if (mode === "browser") patch({ voiceTtsProviderId: null });
          else patch({ voiceTtsProviderId: settings.voiceTtsProviderId ?? ttsOptions[0]?.id ?? null });
        }}
        onProvider={(providerId) => {
          const option = ttsOptions.find((item) => item.id === providerId);
          patch({
            voiceTtsProviderId: providerId,
            voiceTtsModel: option?.defaultTtsModel ?? null,
            voiceTtsVoice: option?.defaultTtsVoice ?? null,
          });
        }}
        onModel={(model) => patch({ voiceTtsModel: model })} onVoice={(voice) => patch({ voiceTtsVoice: voice })}
      />

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">{t("settings.voice.localTitle")}</div>
            <div className="card-desc">{t("settings.voice.localDesc")}</div>
          </div>
          <span className={`badge ${vietnameseVoices.length ? "badge-ok" : "badge-warn"}`}>
            {vietnameseVoices.length ? t("settings.voice.voiceCount", { count: n(vietnameseVoices.length) }) : t("settings.voice.noVoices")}
          </span>
        </div>

        {vietnameseVoices.length === 0 ? (
          <div className="banner banner-compact">
            <div className="grow small">{t("settings.voice.noVoicesHint")}</div>
          </div>
        ) : (
          <Field label={t("settings.voice.browserVoiceLabel")} hint={t("settings.voice.browserVoiceHint")}>
            <select className="select" value={settings.voiceTtsVoice ?? ""} onChange={(event) => patch({ voiceTtsVoice: event.target.value || null })}>
              <option value="">{t("settings.voice.browserVoiceAuto")}</option>
              {vietnameseVoices.map((item) => (
                <option key={`${item.name}-${item.lang}`} value={item.name}>{item.name} ({item.lang})</option>
              ))}
            </select>
          </Field>
        )}

        <div className="row row-wrap gap-2 mt-2">
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? t("common.saving") : t("common.save")}
          </button>
          <button className="btn" type="button" onClick={test} disabled={testing}>
            {testing ? <Loader2 size={15} className="spin" /> : <Volume2 size={15} />} {t("settings.voice.speakTest")}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void speak(toSpeakableText(sampleText), { rate: settings.voiceSpeakRate })}>
            <WandSparkles size={15} /> {t("settings.voice.speakSaved")}
          </button>
          {sampleVoice && <span className="hint">{t("settings.voice.voiceSuggestion", { name: sampleVoice })}</span>}
        </div>
      </div>
    </div>
  );
}

function pickVoice(settings: AppSettings): VoiceSettings {
  return {
    voiceSttProviderId: settings.voiceSttProviderId ?? null,
    voiceSttModel: settings.voiceSttModel ?? null,
    voiceTtsProviderId: settings.voiceTtsProviderId ?? null,
    voiceTtsModel: settings.voiceTtsModel ?? null,
    voiceTtsVoice: settings.voiceTtsVoice ?? null,
    voiceLanguage: settings.voiceLanguage || "vi-VN",
    voiceAutoRead: Boolean(settings.voiceAutoRead),
    voiceSpeakRate: Number(settings.voiceSpeakRate) || 1,
    voiceEnabled: Boolean(settings.voiceEnabled),
  };
}

/** One half of the pipeline: free browser engine or a configured provider. */
function EndpointCard({
  title, description, half, mode, providerId, model, voice, options, onMode, onProvider, onModel, onVoice,
}: {
  title: string;
  description: string;
  half: "stt" | "tts";
  mode: "browser" | "server";
  providerId: string | null;
  model: string | null;
  voice: string | null;
  options: VoiceProviderOption[];
  onMode: (mode: "browser" | "server") => void;
  onProvider: (providerId: string) => void;
  onModel: (model: string | null) => void;
  onVoice: (voice: string | null) => void;
}) {
  const { t } = useI18n();
  const selected = options.find((option) => option.id === providerId) ?? null;
  const defaultModel = half === "stt" ? selected?.defaultSttModel : selected?.defaultTtsModel;
  const listId = `voice-${half}-models`;

  return (
    <div className="card">
      <div className="card-head">
        <div className="grow">
          <div className="card-title">{title}</div>
          <div className="card-desc">{description}</div>
        </div>
        {options.length === 0 && <span className="badge badge-warn">{t("settings.voice.noProvider")}</span>}
      </div>

      <div className="stack gap-2">
        <label className="row gap-2">
          <input type="radio" name={`voice-${half}-mode`} checked={mode === "browser"} onChange={() => onMode("browser")} />
          <span>{t("settings.voice.modeBrowser")}</span>
        </label>
        <label className="row gap-2">
          <input type="radio" name={`voice-${half}-mode`} checked={mode === "server"} onChange={() => onMode("server")} disabled={options.length === 0} />
          <span>{options.length === 0 ? t("settings.voice.modeProviderUnavailable") : t("settings.voice.modeProvider")}</span>
        </label>
      </div>

      {mode === "server" && (
        <div className="grid grid-2 mt-3">
          <Field label={t("settings.voice.providerLabel")} hint={t("settings.voice.providerHint")}>
            <select className="select" value={providerId ?? ""} onChange={(event) => onProvider(event.target.value)}>
              <option value="">{t("settings.voice.providerSelect")}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>{option.name} ({option.kind})</option>
              ))}
            </select>
          </Field>

          <Field
            label={t("settings.voice.modelLabel")}
            hint={defaultModel ? t("settings.voice.modelDefault", { model: defaultModel }) : t("settings.voice.modelHint")}
          >
            <>
              <input
                className="input input-mono"
                list={listId}
                value={model ?? ""}
                onChange={(event) => onModel(event.target.value || null)}
                placeholder={defaultModel ?? (half === "stt" ? "whisper-large-v3-turbo" : "tts-1")}
              />
              <datalist id={listId}>
                {(selected?.models ?? []).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </>
          </Field>
        </div>
      )}

      {mode === "server" && half === "tts" && (
        <Field
          label={t("settings.voice.voiceLabel")}
          hint={selected?.defaultTtsVoice ? t("settings.voice.modelDefault", { model: selected.defaultTtsVoice }) : t("settings.voice.voiceHint")}
        >
          <input className="input" value={voice ?? ""} onChange={(event) => onVoice(event.target.value || null)} placeholder={selected?.defaultTtsVoice ?? "alloy"} />
        </Field>
      )}
    </div>
  );
}
