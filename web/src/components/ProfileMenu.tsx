import { useCallback, useEffect, useState } from "react";
import { Coins, ExternalLink, LogOut, RefreshCw, Shield } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useCredits } from "../state/credits";
import { useAuth, useToast } from "../state/store";
import { RequestCreditsForm } from "../chat/RequestCreditsForm";
import { LocaleSwitcher, useI18n } from "../i18n";
import { Modal } from "./ui";
import { SessionList } from "./SessionList";
import { recentEntries } from "./creditLabels";
import { CreditHistoryRow, CreditStat } from "./creditRows";
import { isInternalTopupUrl } from "../topup/links";
import type { CreditLedgerEntry } from "../types";

/**
 * Sidebar footer: the profile row itself is the button that opens the full
 * "Tài khoản & token" modal. The logout icon keeps its own behaviour.
 */
export function ProfileMenu({ onOpenTopup }: { onOpenTopup?: () => void } = {}) {
  const { t, n, d } = useI18n();
  const { user, logout } = useAuth();
  const { credits, loading } = useCredits();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [full, setFull] = useState<CreditLedgerEntry[] | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  const displayName = user?.name || user?.email || "";
  const initial = (displayName.trim()[0] ?? "?").toUpperCase();
  const enabled = Boolean(credits?.enabled);
  // The top-up page can be opened in-app when the owner points the URL at it.
  const internalTopup = Boolean(onOpenTopup) && isInternalTopupUrl(credits?.buyUrl);

  // Reopen the modal with a clean slate each time.
  useEffect(() => {
    if (!open) {
      setFull(null);
      setRequestOpen(false);
    }
  }, [open]);

  const showAll = useCallback(async () => {
    setLoadingFull(true);
    try {
      const result = await api.creditLedger(50);
      setFull(result.items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("shell.credits.loadHistoryFailed"), "error");
    } finally {
      setLoadingFull(false);
    }
  }, [push, t]);

  const rows = full ?? (credits ? recentEntries(credits, 8) : []);

  return (
    <>
      <div className="sidebar-foot profile-row">
        <button className="profile-open" type="button" onClick={() => setOpen(true)} title={t("shell.profile.title")}>
          <span className="msg-avatar profile-avatar">{initial}</span>
          <span className="profile-id">
            <span className="small bold truncate">{displayName}</span>
            <span className="tiny faint row gap-1">
              {user?.isAdmin ? <Shield size={11} /> : null}
              {user?.isAdmin ? t("shell.profile.roleAdmin") : t("shell.profile.roleUser")}
            </span>
          </span>
        </button>
        <button
          className="btn btn-ghost btn-icon"
          onClick={(event) => {
            event.stopPropagation();
            void logout();
          }}
          title={t("shell.profile.logout")}
          type="button"
        >
          <LogOut size={16} />
        </button>
      </div>

      <Modal
        open={open}
        title={t("shell.profile.title")}
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <button className="btn btn-danger" type="button" onClick={() => void logout()}>
              <LogOut size={15} /> {t("shell.profile.logout")}
            </button>
            <button className="btn" type="button" onClick={() => setOpen(false)}>
              {t("common.close")}
            </button>
          </>
        }
      >
        <div className="profile-body">
          <div className="profile-card">
            <span className="msg-avatar profile-avatar-lg">{initial}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="bold truncate">{displayName}</div>
              <div className="tiny muted truncate">{user?.email}</div>
              <div className="row gap-2 mt-1">
                <span className={`badge ${user?.isAdmin ? "badge-accent" : ""}`}>
                  {user?.isAdmin ? t("shell.profile.roleAdmin") : t("shell.profile.roleUser")}
                </span>
                {user?.createdAt && (
                  <span className="tiny faint">
                    {t("shell.profile.memberSince", { date: d(user.createdAt, { dateStyle: "long" }) })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {enabled && credits && (
            <>
              <div className="profile-token">
                <div className="tiny faint">{t("shell.profile.balanceLabel")}</div>
                <div className={`profile-balance${credits.balance <= 0 ? " credit-danger" : ""}`}>
                  {n(credits.balance)}
                </div>
                <div className="small muted">
                  {credits.estimatedTurnsLeft === null
                    ? t("shell.profile.turnsUnknown")
                    : t("shell.profile.turnsLeft", { turns: n(credits.estimatedTurnsLeft) })}
                </div>
                <div className="tiny faint">{t("shell.profile.rateNote")}</div>
              </div>

              <div className="grid grid-3">
                <CreditStat label={t("shell.profile.statGranted")} value={n(credits.granted)} />
                <CreditStat label={t("shell.profile.statSpent")} value={n(credits.spent)} />
                <CreditStat label={t("shell.profile.statEntries")} value={n(credits.entries)} />
              </div>

              <div className="profile-actions">
                {credits.buyUrl ? (
                  internalTopup ? (
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpenTopup?.();
                      }}
                    >
                      <Coins size={15} /> {t("shell.profile.buyTokens")}
                    </button>
                  ) : (
                    <a className="btn btn-primary" href={credits.buyUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} /> {t("shell.profile.buyTokens")}
                    </a>
                  )
                ) : null}
                {!requestOpen && (
                  <button className="btn" type="button" onClick={() => setRequestOpen(true)}>
                    {t("shell.profile.requestTokens")}
                  </button>
                )}
              </div>

              {requestOpen && <RequestCreditsForm currentBalance={credits.balance} collapsible />}
            </>
          )}

          {user && (
            <div className="credit-history">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="tiny faint">
                  {full ? t("shell.profile.fullHistory") : t("shell.profile.recentHistory")}
                </span>
                {enabled && !full && (
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => void showAll()} disabled={loadingFull}>
                    <RefreshCw size={13} /> {loadingFull ? t("common.loading") : t("shell.profile.viewAll")}
                  </button>
                )}
              </div>
              {rows.length ? (
                <ul className="credit-history-list">
                  {rows.map((entry) => (
                    <CreditHistoryRow entry={entry} key={entry.id} />
                  ))}
                </ul>
              ) : (
                <div className="small muted">
                  {loading ? t("shell.profile.historyLoading") : t("shell.profile.historyEmpty")}
                </div>
              )}
            </div>
          )}

          <div className="stack">
            <div className="tiny faint">{t("shell.profile.languageLabel")}</div>
            <LocaleSwitcher compact />
          </div>

          {user && <SessionList />}
        </div>
      </Modal>
    </>
  );
}
