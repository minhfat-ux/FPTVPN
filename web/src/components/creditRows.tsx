import { useI18n } from "../i18n";
import type { CreditLedgerEntry } from "../types";
import { makeCreditFormatters } from "./creditLabels";

/**
 * One row of the credit ledger, plus the small stat tile used by the credit
 * panel. Shared by the sidebar chip and the profile modal so the two lists can
 * never drift apart; the labels come from the active locale.
 */
export function CreditHistoryRow({ entry }: { entry: CreditLedgerEntry }) {
  const i18n = useI18n();
  const { reasonLabel, formatDelta, formatLedgerTime } = makeCreditFormatters(i18n);
  const positive = entry.delta > 0;
  return (
    <li className="credit-history-row">
      <span className="grow truncate">
        {reasonLabel(entry.reason)}
        <span className="tiny faint"> · {formatLedgerTime(entry.createdAt)}</span>
      </span>
      <span className={`bold nowrap ${positive ? "credit-plus" : "credit-minus"}`}>
        {formatDelta(entry.delta)}
      </span>
    </li>
  );
}

export function CreditStat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="stat">
      <div className={`stat-value${danger ? " credit-danger" : ""}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
