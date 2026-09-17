import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Volume2, WandSparkles } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth, useToast } from "../state/store";
import { Field, Spinner, Switch } from "../components/ui";
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
};

const LANGUAGES = [
  { value: "vi-VN", label: "Tiếng Việt (vi-VN)" },
  { value: "en-US", label: "Tiếng Anh (en-US)" },
];

const SAMPLE_TEXT =
  "Xin chào, tôi là FlowGpt. Tôi có thể trò chuyện, tạo ảnh, làm slide và phân tích dữ liệu cho anh chị.";

/** Settings → Giọng nói: free browser path by default, provider path optional. */
export function VoiceTab() {
  const { user } = useAuth();
  const { push } = useToast();
  const { reload, config, vietnameseVoices, speak } = useVoice();
  const synthesis = useSpeechSynthesis();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<VoiceSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.appSettings();
      setSettings(pickVoice(result.settings));
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không tải được cấu hình giọng nói", "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  if (user && !user.isAdmin) {
    return <div className="muted small">Chỉ quản trị viên cấu hình được giọng nói.</div>;
  }

  if (loading && !settings) return <Spinner label="Đang tải cấu hình giọng nói…" />;
  if (!settings) return <div className="muted small">Không đọc được cấu hình giọng nói.</div>;

  const patch = (value: Partial<VoiceSettings>) =>
    setSettings((current) => (current ? { ...current, ...value } : current));

  const sttOptions = config.options.filter((option) => option.supportsStt);
  const ttsOptions = config.options.filter((option) => option.supportsTts);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveAppSettings({ ...settings } as Partial<AppSettings>);
      await reload();
      push("Đã lưu cấu hình giọng nói", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không lưu được cấu hình giọng nói", "error");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      if (settings.voiceSttProviderId && config.stt.mode === "server") {
        const result = await api.testVoice(SAMPLE_TEXT);
        if (!result.ok) {
          push(result.message, "error");
          return;
        }
        const url = URL.createObjectURL(result.blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.onerror = () => URL.revokeObjectURL(url);
        await audio.play().catch(() => undefined);
        push(`${result.message} · ${result.provider} · ${result.latencyMs}ms`, "success");
        return;
      }
      if (!synthesis.supported) {
        push("Trình duyệt này không đọc được văn bản.", "error");
        return;
      }
      await synthesis.speak(SAMPLE_TEXT, {
        rate: settings.voiceSpeakRate,
        voiceName: settings.voiceTtsVoice,
      });
      push("Đã đọc thử bằng giọng của trình duyệt", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Đọc thử thất bại", "error");
    } finally {
      setTesting(false);
    }
  };

  const sampleVoice = vietnameseVoices[0]?.name ?? null;

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">Mặc định miễn phí: trình duyệt tự nhận dạng và đọc</div>
            <div className="card-desc">
              Microsoft Edge có sẵn giọng tiếng Việt natural (Hoài My / Nam Minh) — không cần key, không tốn phí.
            </div>
          </div>
          <span className="badge badge-ok">0 đồng</span>
        </div>
        <div className="small muted">
          Chỉ chọn nhà cung cấp khi cần chất lượng cao hơn (Gemini và Groq đều có bậc miễn phí). Nhận dạng bằng
          trình duyệt là Web Speech API, giọng đọc là SpeechSynthesis có sẵn trong máy.
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">Ngôn ngữ &amp; cách đọc</div>
            <div className="card-desc">Áp dụng cho cả micrô, giọng đọc và chế độ trò chuyện bằng giọng nói.</div>
          </div>
        </div>

        <div className="grid grid-2">
          <Field label="Ngôn ngữ" hint="Chọn tiếng Việt để nhận dạng và đọc đúng dấu.">
            <select
              className="select"
              value={settings.voiceLanguage.startsWith("vi") ? "vi-VN" : settings.voiceLanguage}
              onChange={(event) => patch({ voiceLanguage: event.target.value })}
            >
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`Tốc độ đọc: ${settings.voiceSpeakRate.toFixed(2)}×`} hint="Từ 0.5× (chậm) đến 2× (nhanh).">
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

        <Switch
          checked={settings.voiceAutoRead}
          onChange={(value) => patch({ voiceAutoRead: value })}
          label="Tự đọc mọi câu trả lời"
        />
      </div>

      <EndpointCard
        title="Nhận dạng giọng nói (STT)"
        description="Chuyển lời nói thành văn bản để gửi vào ô chat."
        half="stt"
        mode={settings.voiceSttProviderId ? "server" : "browser"}
        providerId={settings.voiceSttProviderId}
        model={settings.voiceSttModel}
        voice={null}
        options={sttOptions}
        onMode={(mode) => {
          if (mode === "browser") patch({ voiceSttProviderId: null });
          else patch({ voiceSttProviderId: settings.voiceSttProviderId ?? sttOptions[0]?.id ?? null });
        }}
        onProvider={(providerId) => {
          const option = sttOptions.find((item) => item.id === providerId);
          patch({ voiceSttProviderId: providerId, voiceSttModel: option?.defaultSttModel ?? null });
        }}
        onModel={(model) => patch({ voiceSttModel: model })}
        onVoice={() => undefined}
      />

      <EndpointCard
        title="Giọng đọc (TTS)"
        description="Đọc câu trả lời của trợ lý thành tiếng."
        half="tts"
        mode={settings.voiceTtsProviderId ? "server" : "browser"}
        providerId={settings.voiceTtsProviderId}
        model={settings.voiceTtsModel}
        voice={settings.voiceTtsVoice}
        options={ttsOptions}
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
        onModel={(model) => patch({ voiceTtsModel: model })}
        onVoice={(voice) => patch({ voiceTtsVoice: voice })}
      />

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">Giọng tiếng Việt có sẵn trên máy</div>
            <div className="card-desc">Chỉ có tác dụng khi dùng chế độ “Trình duyệt (miễn phí)”.</div>
          </div>
          <span className={`badge ${vietnameseVoices.length ? "badge-ok" : "badge-warn"}`}>
            {vietnameseVoices.length ? `${vietnameseVoices.length} giọng` : "Chưa có giọng"}
          </span>
        </div>

        {vietnameseVoices.length === 0 ? (
          <div className="banner banner-compact">
            <div className="grow small">
              Chrome chưa có giọng tiếng Việt — cài gói giọng nói trong Windows hoặc dùng Microsoft Edge.
            </div>
          </div>
        ) : (
          <Field label="Giọng đọc của trình duyệt" hint="Giọng natural của Edge được ưu tiên tự động.">
            <select
              className="select"
              value={settings.voiceTtsVoice ?? ""}
              onChange={(event) => patch({ voiceTtsVoice: event.target.value || null })}
            >
              <option value="">— Tự chọn giọng tiếng Việt tốt nhất —</option>
              {vietnameseVoices.map((item) => (
                <option key={`${item.name}-${item.lang}`} value={item.name}>
                  {item.name} ({item.lang})
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="row row-wrap gap-2 mt-2">
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? "Đang lưu…" : "Lưu"}
          </button>
          <button className="btn" type="button" onClick={test} disabled={testing}>
            {testing ? <Loader2 size={15} className="spin" /> : <Volume2 size={15} />} Đọc thử
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void speak(toSpeakableText(SAMPLE_TEXT), { rate: settings.voiceSpeakRate })}
          >
            <WandSparkles size={15} /> Đọc bằng cấu hình đang lưu
          </button>
          {sampleVoice && <span className="hint">Gợi ý: {sampleVoice}</span>}
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
  };
}

/** One half of the pipeline: free browser engine or a configured provider. */
function EndpointCard({
  title,
  description,
  half,
  mode,
  providerId,
  model,
  voice,
  options,
  onMode,
  onProvider,
  onModel,
  onVoice,
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
        {options.length === 0 && <span className="badge badge-warn">Chưa có nhà cung cấp</span>}
      </div>

      <div className="stack gap-2">
        <label className="row gap-2">
          <input type="radio" name={`voice-${half}-mode`} checked={mode === "browser"} onChange={() => onMode("browser")} />
          <span>Trình duyệt (miễn phí)</span>
        </label>
        <label className="row gap-2">
          <input
            type="radio"
            name={`voice-${half}-mode`}
            checked={mode === "server"}
            onChange={() => onMode("server")}
            disabled={options.length === 0}
          />
          <span>Nhà cung cấp {options.length === 0 ? "(chưa có nhà cung cấp phù hợp)" : ""}</span>
        </label>
      </div>

      {mode === "server" && (
        <div className="grid grid-2 mt-3">
          <Field label="Nhà cung cấp" hint="Chỉ hiện nhà cung cấp đang bật và hỗ trợ phần này.">
            <select
              className="select"
              value={providerId ?? ""}
              onChange={(event) => onProvider(event.target.value)}
            >
              <option value="">— Chọn nhà cung cấp —</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.kind})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Model" hint={defaultModel ? `Mặc định: ${defaultModel}` : "Nhập model của nhà cung cấp."}>
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
          label="Giọng của nhà cung cấp"
          hint={selected?.defaultTtsVoice ? `Mặc định: ${selected.defaultTtsVoice}` : "Ví dụ: Kore, alloy…"}
        >
          <input
            className="input"
            value={voice ?? ""}
            onChange={(event) => onVoice(event.target.value || null)}
            placeholder={selected?.defaultTtsVoice ?? "alloy"}
          />
        </Field>
      )}
    </div>
  );
}
