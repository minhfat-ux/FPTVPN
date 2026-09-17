import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth, useToast } from "../state/store";

type Step = "email" | "code";

export function LoginPage() {
  const { completeLogin, login, meta } = useAuth();
  const { push } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const passwordEnabled = meta?.authMethods?.password ?? true;
  const mailerReady = meta?.mailer?.configured ?? false;
  const ttl = meta?.loginTokenTtlMin ?? 15;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const normalisedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    setDevCode(null);
    try {
      const result = await api.requestLoginToken(normalisedEmail);
      setStep("code");
      setCode("");
      setResendIn(60);
      if (result.devCode) {
        setDevCode(result.devCode);
        setInfo("Chưa cấu hình email nên mã hiển thị ngay bên dưới (bật Resend trong Cài đặt để gửi thật).");
      } else if (result.delivered) {
        setInfo(`Đã gửi mã tới ${normalisedEmail}. Mã có hiệu lực ${result.expiresInMin} phút.`);
      } else {
        setInfo(result.message ?? "Nếu email hợp lệ, mã đăng nhập sẽ được gửi tới hộp thư.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi được mã, thử lại sau");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event?: React.FormEvent, explicitCode?: string) => {
    event?.preventDefault();
    // `explicitCode` avoids reading `code` from a stale closure (the auto-submit
    // below runs in the same tick as the last keystroke).
    const value = String(explicitCode ?? code).trim();
    if (value.length !== 6) {
      setError("Mã gồm 6 chữ số trong email. Anh kiểm tra lại giúp em nhé.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await api.verifyLoginToken(normalisedEmail, value);
      await completeLogin(session);
      push("Đăng nhập thành công", "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Mã không đúng, thử lại");
      // Keep what was typed so the user can fix a single digit instead of retyping.
      codeRef.current?.focus();
      codeRef.current?.select();
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(normalisedEmail, password);
      push("Đăng nhập thành công", "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không đăng nhập được");
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      // Auto-submit, passing the digits explicitly — never rely on the state
      // value here, it has not been committed yet.
      void submitCode(undefined, digits);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/brand-mark.png" alt="FlowTech" width={44} height={44} style={{ display: "block" }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
              <span className="brand-word">FlowGpt</span>
            </div>
            <div className="tiny muted">FlowTech · MeetFlow AI</div>
          </div>
        </div>

        {!usePassword && (
          <>
            {step === "email" ? (
              <form onSubmit={requestCode}>
                <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                  Đăng nhập bằng email
                </h1>
                <p className="muted small" style={{ marginTop: 0 }}>
                  Nhập email công ty, em sẽ gửi một mã dùng một lần. Không cần mật khẩu.
                </p>
                <label className="field">
                  <span className="label">Email</span>
                  <input
                    className="input"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="ban@congty.vn"
                    autoComplete="email"
                  />
                </label>
                {error && <div className="error-text mb-3">{error}</div>}
                <button className="btn btn-primary btn-block" type="submit" disabled={busy || !normalisedEmail}>
                  {busy ? (
                    <>
                      <Loader2 size={16} className="spinner" /> Đang gửi mã…
                    </>
                  ) : (
                    <>
                      <Mail size={16} /> Gửi mã đăng nhập
                    </>
                  )}
                </button>
                {meta?.firstUserIsAdmin && (
                  <div className="hint mt-3 row gap-1">
                    <ShieldCheck size={14} /> Đây là lần thiết lập đầu tiên — email đăng nhập đầu tiên sẽ trở thành
                    quản trị viên.
                  </div>
                )}
              </form>
            ) : (
              <form onSubmit={submitCode}>
                <button className="btn btn-ghost btn-sm mb-2" type="button" onClick={() => setStep("email")}>
                  <ArrowLeft size={14} /> Đổi email khác
                </button>
                <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Nhập mã đăng nhập</h1>
                <p className="muted small" style={{ marginTop: 0 }}>
                  {mailerReady ? (
                    <>
                      Mã 6 chữ số đã gửi tới <span className="bold">{normalisedEmail}</span>. Hiệu lực {ttl} phút.
                    </>
                  ) : (
                    <>
                      Mã đăng nhập cho <span className="bold">{normalisedEmail}</span>.
                    </>
                  )}
                </p>

                <label className="field">
                  <span className="label">Mã đăng nhập</span>
                  <input
                    ref={codeRef}
                    className="input input-mono"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => onCodeChange(event.target.value)}
                    placeholder="••••••"
                    style={{ letterSpacing: "0.4em", fontSize: 22, textAlign: "center" }}
                  />
                </label>

                {devCode && (
                  <div className="card mb-3" style={{ background: "var(--bg-elevated)" }}>
                    <div className="tiny faint">Mã dùng ngay (chưa cấu hình email)</div>
                    <div
                      className="mono bold"
                      style={{ fontSize: 26, letterSpacing: "0.3em", color: "var(--accent)" }}
                    >
                      {devCode}
                    </div>
                  </div>
                )}

                {info && !error && <div className="hint mb-3">{info}</div>}
                {error && <div className="error-text mb-3">{error}</div>}

                <button className="btn btn-primary btn-block" type="submit" disabled={busy || code.length < 4}>
                  {busy ? (
                    <>
                      <Loader2 size={16} className="spinner" /> Đang kiểm tra…
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} /> Đăng nhập
                    </>
                  )}
                </button>

                <div className="auth-switch">
                  {resendIn > 0 ? (
                    <span className="tiny faint">Gửi lại mã sau {resendIn}s</span>
                  ) : (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => requestCode()} disabled={busy}>
                      Gửi lại mã
                    </button>
                  )}
                </div>
              </form>
            )}
          </>
        )}

        {usePassword && (
          <form onSubmit={submitPassword}>
            <button className="btn btn-ghost btn-sm mb-2" type="button" onClick={() => setUsePassword(false)}>
              <ArrowLeft size={14} /> Về đăng nhập bằng email
            </button>
            <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Đăng nhập bằng mật khẩu</h1>
            <p className="muted small" style={{ marginTop: 0 }}>
              Dành cho tài khoản do quản trị viên tạo trực tiếp.
            </p>
            <label className="field">
              <span className="label">Email</span>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span className="label">Mật khẩu</span>
              <input
                className="input"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && <div className="error-text mb-3">{error}</div>}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="spinner" /> : null} Đăng nhập
            </button>
          </form>
        )}

        <div className="divider" />

        <div className="stack">
          <div className="tiny faint">Sắp bổ sung</div>
          <div className="row gap-2">
            <button className="btn btn-sm grow" type="button" disabled title="Sẽ dùng Firebase Authentication">
              Google / Firebase
            </button>
            <button className="btn btn-sm grow" type="button" disabled title="Sẽ dùng Facebook Login">
              Facebook
            </button>
          </div>
          {passwordEnabled && !usePassword && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setUsePassword(true)}>
              Dùng mật khẩu (dự phòng)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
