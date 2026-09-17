import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import { useAuth } from "./store";
import type { CreditSummary } from "../types";

/**
 * Credit balance for the signed-in account.
 *
 * The balance is fetched once per session and then kept fresh from the browser
 * events the chat layer dispatches:
 *   `fbuddy:credits`         → `{ balance, cost }` after every metered turn,
 *   `fbuddy:credits:refresh` → a hard re-fetch (admin granted credits, purchase).
 *
 * The hook never throws: a failed request leaves `credits = null` and exposes a
 * short Vietnamese `error`, so callers can simply hide when there is no data.
 */

const CREDITS_EVENT = "fbuddy:credits";
const REFRESH_EVENT = "fbuddy:credits:refresh";

export interface CreditsState {
  credits: CreditSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Applies a delta locally (used when a turn reports its cost). */
  applyBalance: (balance: number) => void;
}

/** `fbuddy:credits` payload — the server reports the balance after the turn. */
interface CreditsEventDetail {
  balance?: number;
  cost?: number;
}

function readBalance(detail: unknown): number | null {
  if (!detail || typeof detail !== "object") return null;
  const value = (detail as CreditsEventDetail).balance;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/** Same arithmetic the server uses, so the estimate stays consistent locally. */
function turnsLeft(balance: number, averageCostPerTurn: number): number {
  const average = Number.isFinite(averageCostPerTurn) && averageCostPerTurn > 0 ? averageCostPerTurn : 1;
  return Math.max(0, Math.floor(balance / average));
}

export function useCredits(): CreditsState {
  const { t } = useI18n();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelled = useRef(false);
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!userId) {
      setCredits(null);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await api.credits();
      if (cancelled.current || id !== requestId.current) return;
      setCredits(result.credits);
      setError(null);
    } catch {
      if (cancelled.current || id !== requestId.current) return;
      setCredits(null);
      setError(t("shell.credits.loadBalanceFailed"));
    } finally {
      if (!cancelled.current && id === requestId.current) setLoading(false);
    }
  }, [t, userId]);

  const applyBalance = useCallback((balance: number) => {
    if (!Number.isFinite(balance)) return;
    setCredits((current) => {
      if (!current) return current;
      const next: CreditSummary = {
        ...current,
        balance,
        estimatedTurnsLeft: current.enabled ? turnsLeft(balance, current.averageCostPerTurn) : null,
      };
      return next;
    });
  }, []);

  useEffect(() => {
    cancelled.current = false;
    if (!userId) {
      setCredits(null);
      setLoading(false);
      setError(null);
      return () => {
        cancelled.current = true;
      };
    }
    void reload();
    return () => {
      cancelled.current = true;
    };
  }, [userId, reload]);

  useEffect(() => {
    if (!userId) return;
    const onCredits = (event: Event) => {
      // The turn already told us the new balance — no round trip needed.
      const balance = readBalance((event as CustomEvent<CreditsEventDetail>).detail);
      if (balance !== null) applyBalance(balance);
    };
    const onRefresh = () => {
      void reload();
    };
    window.addEventListener(CREDITS_EVENT, onCredits);
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(CREDITS_EVENT, onCredits);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
    };
  }, [userId, applyBalance, reload]);

  /**
   * While the account has no credit, check again every minute: the owner approves
   * requests from Telegram, and the user should not have to reload the page to
   * find out (that is exactly how "đã duyệt mà vẫn báo hết token" happens).
   */
  useEffect(() => {
    if (!userId) return;
    if (!credits?.enabled) return;
    if (Number(credits.balance) > 0) return;
    const timer = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(timer);
  }, [userId, credits?.enabled, credits?.balance, reload]);

  return useMemo(
    () => ({ credits, loading, error, reload, applyBalance }),
    [credits, loading, error, reload, applyBalance],
  );
}

/** Hard refresh helper for callers that do not hold the hook (admin actions). */
export function requestCreditsRefresh(): void {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}
