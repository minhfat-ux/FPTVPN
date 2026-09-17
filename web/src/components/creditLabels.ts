import type { CreditLedgerEntry, CreditSummary } from "../types";
import type { useI18n } from "../i18n";

/**
 * Locale-aware labels for the credit ledger. Shared by the sidebar chip and the
 * profile modal so both always read the same way.
 *
 * The translators are injected (`t` for text, `n` for numbers, `d` for dates) so
 * this module stays pure and framework-free — callers pass the `useI18n()`
 * values through `makeCreditFormatters` or directly.
 */

type I18n = ReturnType<typeof useI18n>;

export interface CreditFormatters {
  reasonLabel: (reason: string) => string;
  formatDelta: (delta: number) => string;
  formatLedgerTime: (iso: string) => string;
}

/** Maps a ledger reason onto `shell.credit.reason.*`; unknown codes pass through. */
export function creditReasonLabel(t: I18n["t"], reason: string): string {
  switch (reason) {
    case "signup":
      return t("shell.credit.reason.signup");
    case "admin_grant":
      return t("shell.credit.reason.adminGrant");
    case "admin_deduct":
      return t("shell.credit.reason.adminDeduct");
    case "chat_usage":
      return t("shell.credit.reason.chatUsage");
    case "request_approved":
      return t("shell.credit.reason.requestApproved");
    default:
      return reason;
  }
}

/** `+10.000` / `-234` — sign first, grouping in the active locale. */
export function formatDelta(n: I18n["n"], t: I18n["t"], delta: number): string {
  return t("shell.credits.delta", {
    sign: delta > 0 ? "+" : "-",
    amount: n(Math.abs(delta)),
  });
}

export function formatLedgerTime(d: I18n["d"], iso: string): string {
  return d(iso, { dateStyle: "short", timeStyle: "short" });
}

/** Binds the three formatters once per render so callers can pass a single prop. */
export function makeCreditFormatters({ t, n, d }: Pick<I18n, "t" | "n" | "d">): CreditFormatters {
  return {
    reasonLabel: (reason) => creditReasonLabel(t, reason),
    formatDelta: (delta) => formatDelta(n, t, delta),
    formatLedgerTime: (iso) => formatLedgerTime(d, iso),
  };
}

/** The last `count` ledger rows; falls back to the ones already in the summary. */
export function recentEntries(credits: CreditSummary, count: number): CreditLedgerEntry[] {
  return credits.recent.slice(0, count);
}
