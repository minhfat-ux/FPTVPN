import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw, Save, Send } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth, useToast } from "../state/store";
import { ConfirmDialog, Field, Spinner, Switch } from "../components/ui";
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
  { key: "users", label: "Người dùng" },
  { key: "conversations", label: "Hội thoại" },
  { key: "messages", label: "Tin nhắn" },
  { key: "files", label: "Tệp" },
  { key: "providers", label: "Nhà cung cấp" },
  { key: "mcpServers", label: "MCP server" },
];

const SKILLS: { id: SkillId; label: string }[] = [
  { id: "auto", label: "Tự động (auto)" },
  { id: "chat", label: "Chat" },
  { id: "image", label: "Tạo ảnh" },
  { id: "ppt", label: "PowerPoint" },
  { id: "excel", label: "Excel" },
  { id: "data", label: "Phân tích dữ liệu" },
];

/** Settings → Hệ thống: thống kê, cấu hình mặc định và đăng nhập bằng email. */
export function AppTab() {
  const { user } = useAuth();
  const { push } = useToast();
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
      push(err instanceof ApiError ? err.message : "Không tải được cấu hình hệ thống", "error");
    } finally {
      setLoading(false);
    }
  }, [push]);

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
      push("Đã lưu cấu hình hệ thống", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không lưu được cấu hình", "error");
    } finally {
      setSaving(false);
    }
  };

  const sendTestMail = async () => {
    if (!mailTo.trim()) {
      push("Nhập địa chỉ email nhận thử", "error");
      return;
    }
    setSendingMail(true);
    try {
      const testMailer = api as unknown as (typeof api) & {
        testMailer?: (body: { to: string }) => Promise<MailerTestResult>;
      };
      if (!testMailer.testMailer) {
        push("Backend chưa hỗ trợ gửi thử email (thiếu api.testMailer)", "error");
        return;
      }
      const result = await testMailer.testMailer({ to: mailTo.trim() });
      push(result.message || (result.ok ? "Đã gửi email thử" : "Gửi email thử thất bại"), result.ok ? "success" : "error");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Gửi email thử thất bại", "error");
    } finally {
      setSendingMail(false);
    }
  };

  if (loading && !settings) return <Spinner label="Đang tải cấu hình hệ thống…" />;
  if (!settings) return <div className="muted small">Không đọc được cấu hình hệ thống.</div>;

  const providerModels = models.filter((item) => item.providerId === settings.defaultProviderId);

  return (
    <div className="stack gap-3">
      <div className="grid grid-3">
        {STAT_LABELS.map((item) => (
          <div className="stat" key={item.key}>
            <div className="stat-value">{stats[item.key] ?? 0}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">Cấu hình chung</div>
            <div className="card-desc">Áp dụng cho mọi người dùng. Nhà cung cấp và model mặc định dùng khi chat chưa chọn.</div>
          </div>
          <button className="btn btn-sm" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Tải lại
          </button>
        </div>

        <Field label="Tên ứng dụng" hint="Hiển thị trên thanh bên, trang đăng nhập và tiêu đề trình duyệt.">
          <input className="input" value={settings.appName} onChange={(event) => patch({ appName: event.target.value })} />
        </Field>

        <Field
          label="System prompt"
          hint="Chỉ dẫn gốc cho mọi hội thoại. Đây là phần được gửi trước tiên và có ảnh hưởng tới toàn bộ câu trả lời."
        >
          <textarea
            className="textarea"
            rows={8}
            value={settings.systemPrompt}
            onChange={(event) => patch({ systemPrompt: event.target.value })}
          />
        </Field>

        <div className="grid grid-2">
          <Field label="Nhà cung cấp mặc định" hint="Chỉ hiện các nhà cung cấp đang bật.">
            <select
              className="select"
              value={settings.defaultProviderId ?? ""}
              onChange={(event) => patch({ defaultProviderId: event.target.value || null, defaultModel: null })}
            >
              <option value="">— Tự động chọn nhà cung cấp đang bật đầu tiên —</option>
              {providers
                .filter((provider) => provider.enabled)
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field
            label="Model mặc định"
            hint={
              settings.defaultProviderId && !providerModels.length
                ? "Nhà cung cấp này chưa có model nào trong danh sách chọn."
                : "Danh sách lọc theo nhà cung cấp mặc định."
            }
          >
            <select
              className="select"
              value={settings.defaultModel ?? ""}
              onChange={(event) => patch({ defaultModel: event.target.value || null })}
            >
              <option value="">— Dùng model mặc định của nhà cung cấp —</option>
              {modelChoices.map((item) => (
                <option key={`${item.providerId}:${item.model}`} value={item.model}>
                  {item.providerName} · {item.model}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-2">
          <Field label="Kỹ năng mặc định" hint="Kỹ năng được chọn sẵn khi mở hội thoại mới.">
            <select
              className="select"
              value={settings.defaultSkill}
              onChange={(event) => patch({ defaultSkill: event.target.value as SkillId })}
            >
              {SKILLS.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Model tạo ảnh (tuỳ chọn)" hint="Ghi đè model tạo ảnh của nhà cung cấp. Để trống để dùng mặc định.">
            <input
              className="input input-mono"
              value={settings.imageModel ?? ""}
              onChange={(event) => patch({ imageModel: event.target.value || null })}
              placeholder="ví dụ: gemini-2.5-flash-image"
            />
          </Field>
        </div>

        <div className="num-row">
          <Field label="Số vòng gọi công cụ tối đa" hint="Từ 1 đến 12. Cao hơn cho phép model gọi nhiều tool liên tiếp.">
            <input
              className="input w-num"
              type="number"
              min={1}
              max={12}
              value={settings.maxToolIterations}
              onChange={(event) => patch({ maxToolIterations: clamp(Number(event.target.value), 1, 12, 6) })}
            />
          </Field>
          <Field label="Giới hạn dung lượng tải lên (MB)" hint="Từ 1 đến 100 MB cho mỗi tệp.">
            <input
              className="input w-num"
              type="number"
              min={1}
              max={100}
              value={settings.maxUploadMb}
              onChange={(event) => patch({ maxUploadMb: clamp(Number(event.target.value), 1, 100, 25) })}
            />
          </Field>
        </div>

        <Switch
          checked={settings.allowSignup}
          onChange={(value) => patch({ allowSignup: value })}
          label="Cho phép người dùng tự đăng ký tài khoản"
        />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="grow">
            <div className="card-title">Email &amp; đăng nhập</div>
            <div className="card-desc">
              Ứng dụng đăng nhập bằng mã một lần gửi qua email (passwordless). Cấu hình Resend để gửi mã thật.
            </div>
          </div>
          <span className={`badge ${settings.hasResendKey ? "badge-ok" : "badge-warn"}`}>
            {settings.hasResendKey ? "Đã có Resend key" : "Chưa có key"}
          </span>
        </div>

        {!settings.hasResendKey && (
          <div className="banner banner-compact mb-3">
            <div className="grow small">
              Chưa cấu hình Resend API key: mã đăng nhập sẽ được hiển thị trực tiếp trên màn hình thay vì gửi qua email.
            </div>
          </div>
        )}

        <div className="grid grid-2">
          <Field label="Email gửi đi (mailerFrom)" hint="Ví dụ: no-reply@meetflowai.site — phải là domain đã xác thực với Resend.">
            <input
              className="input input-mono"
              value={settings.mailerFrom}
              onChange={(event) => patch({ mailerFrom: event.target.value })}
              placeholder="no-reply@meetflowai.site"
            />
          </Field>
          <Field label="Tên người gửi (mailerFromName)" hint="Tên hiển thị trong hộp thư của người dùng.">
            <input
              className="input"
              value={settings.mailerFromName}
              onChange={(event) => patch({ mailerFromName: event.target.value })}
              placeholder="FlowGpt"
            />
          </Field>
        </div>

        <Field
          label="Resend API key"
          hint={
            settings.hasResendKey
              ? `Đang lưu: ${settings.resendKeyPreview ?? "••••"} — để trống nếu không đổi.`
              : "Chưa có key. Dán key từ resend.com/api-keys để bật gửi email thật."
          }
        >
          <input
            className="input input-mono"
            type="password"
            autoComplete="new-password"
            value={resendApiKey}
            disabled={clearResendKey}
            onChange={(event) => setResendApiKey(event.target.value)}
            placeholder="re_…"
          />
        </Field>
        {settings.hasResendKey && (
          <Switch
            checked={clearResendKey}
            onChange={(value) => {
              setClearResendKey(value);
              if (value) setResendApiKey("");
            }}
            label="Xoá Resend key đã lưu"
          />
        )}

        <div className="divider" />

        <div className="row row-wrap gap-2">
          <Field label="Gửi thử tới email" hint="Dùng để kiểm tra cấu hình Resend trước khi phát hành.">
            <input
              className="input"
              type="email"
              value={mailTo}
              onChange={(event) => setMailTo(event.target.value)}
              placeholder="ban@congty.vn"
            />
          </Field>
          <button className="btn btn-inline" type="button" onClick={sendTestMail} disabled={sendingMail}>
            <Send size={15} /> {sendingMail ? "Đang gửi…" : "Gửi thử email"}
          </button>
        </div>
        <div className="hint">Gửi một email thử bằng cấu hình Resend hiện tại (chưa cần lưu biểu mẫu).</div>

        <div className="num-row mt-2">
          <Field label="Hiệu lực mã đăng nhập (phút)" hint="Từ 5 đến 60 phút. Mặc định 15.">
            <input
              className="input w-num"
              type="number"
              min={5}
              max={60}
              value={settings.loginTokenTtlMin}
              onChange={(event) => patch({ loginTokenTtlMin: clamp(Number(event.target.value), 5, 60, 15) })}
            />
          </Field>
        </div>

        <div className="stack gap-2 mt-2">
          <Switch
            checked={settings.passwordLoginEnabled}
            onChange={(value) => patch({ passwordLoginEnabled: value })}
            label="Cho phép đăng nhập bằng mật khẩu (dự phòng)"
          />
          <Switch
            checked={settings.autoCreateUserOnLogin}
            onChange={(value) => patch({ autoCreateUserOnLogin: value })}
            label="Tự tạo tài khoản khi email đăng nhập lần đầu"
          />
          <Switch
            checked={settings.showLoginCodeWhenNoMailer}
            onChange={(value) => patch({ showLoginCodeWhenNoMailer: value })}
            label="Hiện mã đăng nhập trên màn hình khi chưa có mailer"
          />
        </div>
      </div>

      <div className="card">
        <div className="row row-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
          <button className="btn" type="button" onClick={() => setConfirmReset(true)} disabled={saving}>
            <RotateCcw size={15} /> Khôi phục mặc định
          </button>
          <span className="hint">Bỏ các thay đổi chưa lưu và đọc lại giá trị đang áp dụng trên server.</span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Khôi phục cấu hình mặc định"
        message="Tải lại cấu hình hiện có trên server và bỏ mọi thay đổi chưa lưu trong biểu mẫu này?"
        confirmLabel="Tải lại"
        busy={loading}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          await load();
          push("Đã tải lại cấu hình từ server", "info");
        }}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
