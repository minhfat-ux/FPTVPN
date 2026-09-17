import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { useAuth, useToast } from "../state/store";

type Step = "email" | "code";

export function LoginPage() {
  const { t } = useI18n();
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
      setError(err instanceof ApiError ? err.message : t("auth.login.failed"));
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
          <img src="/brand-mark.png?v=culi1" alt="FlowTech" width={44} height={44} style={{ display: "block" }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>
              <span className="brand-word">fBuddy</span>
            </div>
            <div className="tiny muted">FlowTech · MeetFlow AI</div>
          </div>
        </div>

        {!usePassword && (
          <>
            {step === "email" ? (
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
              </form>
            ) : (
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
                    onChange={(event) => onCodeChange(event.target.value)}
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
          </>
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
  );
}
