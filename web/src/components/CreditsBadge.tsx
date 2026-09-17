import { useState } from "react";
import { Coins, ExternalLink, RefreshCw } from "lucide-react";
import { useI18n } from "../i18n";
import { useCredits } from "../state/credits";
import { Modal } from "./ui";
import { CreditHistoryRow, CreditStat } from "./creditRows";
import { isInternalTopupUrl } from "../topup/links";

/**
 * Sidebar credit pill: `Credit: 100.000` plus a rough "how many turns left".
 * The whole feature is invisible while it is turned off or still unknown.
 */
export function CreditsBadge({ onOpenTopup }: { onOpenTopup?: () => void } = {}) {
  const { t, n } = useI18n();
  const { credits, loading, reload } = useCredits();
  const [open, setOpen] = useState(false);

  // A disabled (or not-yet-loaded) feature renders nothing at all.
  if (!credits || !credits.enabled) return null;

  const empty = credits.balance <= 0;
  const estimate = credits.estimatedTurnsLeft;
  // The top-up page can be opened in-app when the owner points the URL at it.
  const internalTopup = Boolean(onOpenTopup) && isInternalTopupUrl(credits.buyUrl);

  return (
    <>
      <button
        className={`credit-badge${empty ? " credit-badge-empty" : ""}`}
        type="button"
        onClick={() => setOpen(true)}
        title={t("shell.credits.title")}
      >
        <span className="credit-badge-row">
          <Coins size={13} />
          <span>{t("shell.credits.chip", { balance: n(credits.balance) })}</span>
        </span>
        {estimate !== null && (
          <span className="credit-badge-sub">
            {t("shell.credits.turnsLeftShort", { turns: n(estimate) })}
          </span>
        )}
      </button>

      <Modal
        open={open}
        title={t("shell.credits.title")}
        onClose={() => setOpen(false)}
        wide
        footer={
          <>
            <button className="btn" type="button" onClick={() => void reload()} disabled={loading}>
              <RefreshCw size={15} /> {loading ? t("common.loading") : t("shell.credits.reload")}
            </button>
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
                  <Coins size={15} /> {t("shell.credits.topupMore")}
                </button>
              ) : (
                <a className="btn btn-primary" href={credits.buyUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} /> {t("shell.credits.topupMore")}
                </a>
              )
            ) : null}
          </>
        }
      >
        <div className="credit-panel">
          <p className="mb-0 small muted">
            {t("shell.credits.panelIntro", { per: n(credits.perToken) })}
          </p>

          <div className="grid grid-4">
            <CreditStat label={t("shell.profile.balanceLabel")} value={n(credits.balance)} danger={empty} />
            <CreditStat label={t("shell.credits.granted")} value={n(credits.granted)} />
            <CreditStat label={t("shell.credits.spent")} value={n(credits.spent)} />
            <CreditStat
              label={t("shell.credits.turnsLeftLabel")}
              value={estimate === null ? "—" : n(estimate)}
            />
          </div>

          <div className="credit-history">
            <div className="tiny faint">{t("shell.credits.recent")}</div>
            {credits.recent.length ? (
              <ul className="credit-history-list">
                {credits.recent.map((entry) => (
                  <CreditHistoryRow entry={entry} key={entry.id} />
                ))}
              </ul>
            ) : (
              <div className="small muted">{t("shell.credits.emptyEntries")}</div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
