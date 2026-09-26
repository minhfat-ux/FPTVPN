import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, KeyRound, Languages, Loader2, Mail, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { useAuth, useToast } from "../state/store";

type Step = "email" | "code" | "register" | "verify";

export function LoginPage() {
  const { t } = useI18n();
  const { completeLogin, login, meta } = useAuth();
  const { push } = useToast();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  // Đăng ký tài khoản mới bằng email + mật khẩu (bắt buộc xác thực email mới active).
  const [name, setName] = useState("");
  const [regPassword, setRegPassword] = useState("");
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
        setInfo(t("auth.login.devCodeInfo"));
      } else if (result.delivered) {
        setInfo(t("auth.login.sent", { email: normalisedEmail, minutes: result.expiresInMin }));
      } else {
        setInfo(result.message ?? t("auth.login.sendFallback"));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.login.sendFailed"));
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
      setError(t("auth.login.codeLength"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await api.verifyLoginToken(normalisedEmail, value);
      await completeLogin(session);
      push(t("auth.login.success"), "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.login.codeWrong"));
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
      push(t("auth.login.success"), "success");
    } catch (err) {
      // Chưa xác thực email = tài khoản chưa active. Server vừa gửi lại mã kích hoạt.
      if (err instanceof ApiError && err.code === "email_not_verified") {
        setStep("verify");
        setCode("");
        setResendIn(60);
        setDevCode((err.details?.devCode as string | undefined) ?? null);
        setInfo((err.details?.message as string | undefined) ?? t("auth.verify.required"));
        return;
      }
      setError(err instanceof ApiError ? err.message : t("auth.login.failed"));
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (
    value: string,
    submit: (event?: React.FormEvent, explicitCode?: string) => Promise<void>,
  ) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      // Auto-submit, passing the digits explicitly — never rely on the state
      // value here, it has not been committed yet.
      void submit(undefined, digits);
    }
  };

  /**
   * Đăng ký: server KHÔNG mở phiên khi tài khoản phải xác thực email — nó trả `pendingVerification`
   * để màn hình chuyển sang bước nhập mã kích hoạt. Máy chưa cấu hình mailer thì được active ngay.
   */
  const submitRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    setDevCode(null);
    try {
      const result = await api.register({
        email: normalisedEmail,
        password: regPassword,
        name: name.trim() || undefined,
      });
      if (result.pendingVerification) {
        setStep("verify");
        setCode("");
        setResendIn(60);
        setDevCode(result.devCode ?? null);
        setInfo(
          result.message ??
            t("auth.verify.sent", { email: normalisedEmail, minutes: result.expiresInMin ?? 30 }),
        );
        return;
      }
      await completeLogin({ user: result.user, token: String(result.token) });
      push(t("auth.login.success"), "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.register.failed"));
    } finally {
      setBusy(false);
    }
  };

  /** Kích hoạt tài khoản bằng mã trong email; thành công là vào app luôn. */
  const submitVerify = async (event?: React.FormEvent, explicitCode?: string) => {
    event?.preventDefault();
    const value = String(explicitCode ?? code).trim();
    if (value.length !== 6) {
      setError(t("auth.login.codeLength"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await api.verifyEmail(normalisedEmail, value);
      await completeLogin(session);
      push(t("auth.verify.success"), "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.verify.wrong"));
      codeRef.current?.focus();
      codeRef.current?.select();
    } finally {
      setBusy(false);
    }
  };

  const resendVerifyCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.resendVerification(normalisedEmail);
      setResendIn(60);
      setDevCode(result.devCode ?? null);
      setInfo(
        result.message ??
          (result.delivered
            ? t("auth.verify.resent", { email: normalisedEmail })
            : t("auth.login.sendFallback")),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.login.sendFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Cột thương hiệu: chỉ là phần giới thiệu, không chứa logic đăng nhập. */}
      <div className="auth-hero">
        <div className="auth-hero__brand">
          <img className="auth-hero__mark" src="/brand-mark.png?v=culi2" alt="FlowTech" />
          <div>
            <div className="auth-hero__word brand-word">fBuddy</div>
            <div className="auth-hero__sub">{t("auth.landing.tagline")}</div>
          </div>
        </div>
        <h1 className="auth-hero__headline">{t("auth.landing.headline")}</h1>
        <p className="auth-hero__pitch">{t("auth.landing.pitch")}</p>
        <ul className="auth-hero__points">
          <li className="auth-hero__point">
            <Sparkles size={18} /> {t("auth.landing.point1")}
          </li>
          <li className="auth-hero__point">
            <Languages size={18} /> {t("auth.landing.point2")}
          </li>
          <li className="auth-hero__point">
            <ShieldCheck size={18} /> {t("auth.landing.point3")}
          </li>
        </ul>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          {!usePassword && step === "email" && (
            <form onSubmit={requestCode}>
              <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                {t("auth.login.emailTitle")}
              </h1>
              <p className="muted small" style={{ marginTop: 0 }}>
                {t("auth.login.emailHint")}
              </p>
              <label className="field">
                <span className="label">{t("auth.login.emailLabel")}</span>
                <input
                  className="input"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("auth.login.emailPlaceholder")}
                  autoComplete="email"
                />
              </label>
              {error && <div className="error-text mb-3">{error}</div>}
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || !normalisedEmail}>
                {busy ? (
                  <>
                    <Loader2 size={16} className="spinner" /> {t("auth.login.sendingCode")}
                  </>
                ) : (
                  <>
                    <Mail size={16} /> {t("auth.login.sendCode")}
                  </>
                )}
              </button>
              {meta?.firstUserIsAdmin && (
                <div className="hint mt-3 row gap-1">
                  <ShieldCheck size={14} /> {t("auth.login.firstUserHint")}
                </div>
              )}
              <div className="auth-switch">
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setStep("register");
                    setError(null);
                    setInfo(null);
                    setDevCode(null);
                  }}
                >
                  <UserPlus size={14} /> {t("auth.register.open")}
                </button>
              </div>
            </form>
          )}

          {!usePassword && step === "code" && (
            <form onSubmit={submitCode}>
              <button className="btn btn-ghost btn-sm mb-2" type="button" onClick={() => setStep("email")}>
                <ArrowLeft size={14} /> {t("auth.login.changeEmail")}
              </button>
              <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{t("auth.login.codeTitle")}</h1>
              <p className="muted small" style={{ marginTop: 0 }}>
                {mailerReady ? (
                  t("auth.login.codeSent", { email: normalisedEmail, minutes: ttl })
                ) : (
                  t("auth.login.codeFor", { email: normalisedEmail })
                )}
              </p>

              <label className="field">
                <span className="label">{t("auth.login.codeLabel")}</span>
                <input
                  ref={codeRef}
                  className="input input-mono"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => onCodeChange(event.target.value, submitCode)}
                  placeholder={t("auth.login.codePlaceholder")}
                  style={{ letterSpacing: "0.4em", fontSize: 22, textAlign: "center" }}
                />
              </label>

              {devCode && (
                <div className="card mb-3" style={{ background: "var(--bg-elevated)" }}>
                  <div className="tiny faint">{t("auth.login.devCodeTitle")}</div>
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
                    <Loader2 size={16} className="spinner" /> {t("auth.login.verifying")}
                  </>
                ) : (
                  <>
                    <KeyRound size={16} /> {t("auth.login.submit")}
                  </>
                )}
              </button>

              <div className="auth-switch">
                {resendIn > 0 ? (
                  <span className="tiny faint">{t("auth.login.resendIn", { seconds: resendIn })}</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => requestCode()} disabled={busy}>
                    {t("auth.login.resend")}
                  </button>
                )}
              </div>
            </form>
          )}

          {step === "register" && (
            <form onSubmit={submitRegister}>
              <button
                className="btn btn-ghost btn-sm mb-2"
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
              >
                <ArrowLeft size={14} /> {t("auth.register.back")}
              </button>
              <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{t("auth.register.title")}</h1>
              <p className="muted small" style={{ marginTop: 0 }}>
                {t("auth.register.hint")}
              </p>
              <label className="field">
                <span className="label">{t("auth.register.nameLabel")}</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("auth.register.namePlaceholder")}
                  autoComplete="name"
                />
              </label>
              <label className="field">
                <span className="label">{t("auth.login.emailLabel")}</span>
                <input
                  className="input"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("auth.login.emailPlaceholder")}
                  autoComplete="email"
                />
              </label>
              <label className="field">
                <span className="label">{t("auth.login.passwordLabel")}</span>
                <input
                  className="input"
                  type="password"
                  required
                  minLength={8}
                  value={regPassword}
                  onChange={(event) => setRegPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <div className="hint mb-3">{t("auth.register.passwordHint")}</div>
              {error && <div className="error-text mb-3">{error}</div>}
              <button
                className="btn btn-primary btn-block"
                type="submit"
                disabled={busy || !normalisedEmail || regPassword.length < 8}
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="spinner" /> {t("auth.register.busy")}
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> {t("auth.register.submit")}
                  </>
                )}
              </button>
            </form>
          )}

          {step === "verify" && (
            <form onSubmit={submitVerify}>
              <button
                className="btn btn-ghost btn-sm mb-2"
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
              >
                <ArrowLeft size={14} /> {t("auth.register.back")}
              </button>
              <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{t("auth.verify.title")}</h1>
              <p className="muted small" style={{ marginTop: 0 }}>
                {t("auth.verify.hint", { email: normalisedEmail })}
              </p>
              <label className="field">
                <span className="label">{t("auth.verify.label")}</span>
                <input
                  ref={codeRef}
                  className="input input-mono"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => onCodeChange(event.target.value, submitVerify)}
                  placeholder={t("auth.login.codePlaceholder")}
                  style={{ letterSpacing: "0.4em", fontSize: 22, textAlign: "center" }}
                />
              </label>
              {devCode && (
                <div className="card mb-3" style={{ background: "var(--bg-elevated)" }}>
                  <div className="tiny faint">{t("auth.verify.devTitle")}</div>
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
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || code.length !== 6}>
                {busy ? (
                  <>
                    <Loader2 size={16} className="spinner" /> {t("auth.verify.busy")}
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} /> {t("auth.verify.submit")}
                  </>
                )}
              </button>
              <div className="auth-switch">
                {resendIn > 0 ? (
                  <span className="tiny faint">{t("auth.login.resendIn", { seconds: resendIn })}</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={resendVerifyCode} disabled={busy}>
                    {t("auth.verify.resend")}
                  </button>
                )}
              </div>
            </form>
          )}

          {usePassword && (
            <form onSubmit={submitPassword}>
              <button className="btn btn-ghost btn-sm mb-2" type="button" onClick={() => setUsePassword(false)}>
                <ArrowLeft size={14} /> {t("auth.login.backToEmail")}
              </button>
              <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{t("auth.login.passwordTitle")}</h1>
              <p className="muted small" style={{ marginTop: 0 }}>
                {t("auth.login.passwordHint")}
              </p>
              <label className="field">
                <span className="label">{t("auth.login.emailLabel")}</span>
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
                <span className="label">{t("auth.login.passwordLabel")}</span>
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
                {busy ? <Loader2 size={16} className="spinner" /> : null} {t("auth.login.submit")}
              </button>
            </form>
          )}

          <div className="divider" />

          <div className="stack">
            <div className="tiny faint">{t("auth.login.comingSoon")}</div>
            <div className="row gap-2">
              <button className="btn btn-sm grow" type="button" disabled title={t("auth.login.googleTitle")}>
                Google / Firebase
              </button>
              <button className="btn btn-sm grow" type="button" disabled title={t("auth.login.facebookTitle")}>
                Facebook
              </button>
            </div>
            {passwordEnabled && !usePassword && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setUsePassword(true)}>
                {t("auth.login.usePassword")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
