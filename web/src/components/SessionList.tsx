import { useCallback, useEffect, useState } from "react";
import { Laptop, RefreshCw, Smartphone } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth, useToast } from "../state/store";
import { useI18n } from "../i18n";
import { ConfirmDialog } from "./ui";
import type { AuthSession } from "../types";

/**
 * "Thiết bị đang đăng nhập" — one row per signed-in device.
 *
 * Several devices can be signed in with the same email at once (that is the
 * whole point of per-device sessions): signing in on the phone never signs the
 * laptop out. From here the user can kick a single device, or all the others
 * while keeping the one in their hand.
 */
export function SessionList() {
  const { t, d } = useI18n();
  const { sessionId, logout } = useAuth();
  const { push } = useToast();
  const [items, setItems] = useState<AuthSession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmKick, setConfirmKick] = useState<AuthSession | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.sessions();
      setItems(result.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      push(err instanceof ApiError ? err.message : t("shell.sessions.loadFailed"), "error");
    }
  }, [push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (session: AuthSession) => {
      setBusy(true);
      try {
        const result = await api.revokeSession(session.id);
        if (result.current || session.id === sessionId) {
          await logout();
          return;
        }
        push(t("shell.sessions.revoked", { device: deviceName(session, t) }), "success");
        await load();
      } catch (err) {
        push(err instanceof ApiError ? err.message : t("shell.sessions.revokeFailed"), "error");
      } finally {
        setBusy(false);
        setConfirmKick(null);
      }
    },
    [load, logout, push, sessionId, t],
  );

  const revokeOthers = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api.revokeOtherSessions();
      setItems(result.items);
      push(
        result.revoked
          ? t("shell.sessions.othersRevoked", { count: result.revoked })
          : t("shell.sessions.noOthers"),
        "success",
      );
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("shell.sessions.revokeFailed"), "error");
    } finally {
      setBusy(false);
      setConfirmOthers(false);
    }
  }, [push, t]);

  const others = (items ?? []).filter((session) => !(session.current || session.id === sessionId)).length;

  return (
    <div className="session-block">
      <div className="row gap-2 mb-2">
        <Laptop size={15} />
        <span className="bold small">{t("shell.sessions.title")}</span>
        <span className="grow" />
        <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => void load()} title={t("common.reload")}>
          <RefreshCw size={13} />
        </button>
      </div>
      <p className="tiny faint mb-2">{t("shell.sessions.hint")}</p>

      {items === null ? (
        <div className="row gap-2 tiny muted">
          <span className="spinner" /> {t("common.loading")}
        </div>
      ) : (
        <div className="session-list">
          {items.map((session) => {
            const current = session.current || session.id === sessionId;
            return (
              <div key={session.id} className="session-item">
                <span className="session-icon">
                  {/Android|iOS/.test(session.label ?? "") ? <Smartphone size={15} /> : <Laptop size={15} />}
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="row gap-2">
                    <span className="small bold truncate">{deviceName(session, t)}</span>
                    {current && <span className="badge badge-accent">{t("shell.sessions.current")}</span>}
                  </span>
                  <span className="tiny faint" style={{ display: "block" }}>
                    {session.ip ? `${session.ip} · ` : ""}
                    {t("shell.sessions.lastSeen", { time: d(session.lastSeenAt) })}
                  </span>
                </span>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmKick(session)}
                >
                  {current ? t("shell.sessions.logoutHere") : t("shell.sessions.revoke")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        className="btn btn-sm mt-2"
        type="button"
        disabled={busy || others === 0}
        onClick={() => setConfirmOthers(true)}
      >
        {t("shell.sessions.revokeOthers", { count: others })}
      </button>

      <ConfirmDialog
        open={Boolean(confirmKick)}
        title={t("shell.sessions.confirmTitle")}
        message={t("shell.sessions.confirmBody", { device: confirmKick ? deviceName(confirmKick, t) : "" })}
        confirmLabel={t("shell.sessions.confirmAction")}
        onCancel={() => setConfirmKick(null)}
        onConfirm={() => confirmKick && void revoke(confirmKick)}
      />
      <ConfirmDialog
        open={confirmOthers}
        title={t("shell.sessions.confirmOthersTitle")}
        message={t("shell.sessions.confirmOthersBody", { count: others })}
        confirmLabel={t("shell.sessions.confirmOthersAction")}
        onCancel={() => setConfirmOthers(false)}
        onConfirm={() => void revokeOthers()}
      />
    </div>
  );
}

/** Falls back to a localized label when the user agent was unrecognisable. */
function deviceName(session: AuthSession, t: (key: string, vars?: Record<string, string | number>) => string) {
  return session.label || t("shell.sessions.unknownDevice");
}
