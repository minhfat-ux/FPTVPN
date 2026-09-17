import { useEffect, useState } from "react";
import { Send, Wallet } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useToast } from "../state/store";
import { useI18n } from "../i18n";
import type { CreditRequest } from "../types";

/**
 * "Xin thêm token" — the user asks the owner for credit; the owner approves in
 * Telegram or in Settings → Người dùng. One pending request per account.
 */

export const REQUEST_AMOUNTS = [10000, 50000, 100000] as const;

/** Server code for "you already have a pending request". */
const ALREADY_PENDING = "already_pending";

export function RequestCreditsForm({
  currentBalance,
  collapsible = false,
  onOpenTopup,
}: {
  currentBalance: number;
  /** The profile modal reveals the form with its own button, so the heading goes. */
  collapsible?: boolean;
  /** Present when the page can switch to the top-up view in place. */
  onOpenTopup?: () => void;
}) {
  const { t, n, d } = useI18n();
  const { push } = useToast();
  const [amount, setAmount] = useState<number>(REQUEST_AMOUNTS[0]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CreditRequest | null>(null);
  const [telegramSent, setTelegramSent] = useState(true);
  // Filled in when a previous request is still waiting for approval.
  const [pending, setPending] = useState<CreditRequest | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api.myCreditRequests();
        if (!active) return;
        setPending(result.items.find((item) => item.status === "pending") ?? null);
      } catch {
        /* the form still works without the pending lookup */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const send = async () => {
    setSending(true);
    try {
      const result = await api.requestCredits({ amount, note: note.trim() || undefined });
      setTelegramSent(result.telegram?.sent !== false);
      setSent(result.request);
      setPending(result.request);
      setNote("");
      push(t("chat.request.sentToast"), "success");
    } catch (err) {
      if (err instanceof ApiError && isAlreadyPending(err)) {
        push(t("chat.request.alreadyPending"), "info");
        await refreshPending(setPending);
      } else {
        push(err instanceof ApiError ? err.message : t("chat.request.sendFailed"), "error");
      }
    } finally {
      setSending(false);
    }
  };

  const waiting = sent ?? pending;
  if (waiting) {
    return (
      <div className="credit-request">
        <div className="small bold credit-request-ok">{t("chat.request.waitingTitle")}</div>
        <div className="tiny muted">
          {t("chat.request.waitingMeta", { amount: n(waiting.amount), time: d(waiting.createdAt) })}
        </div>
        <div className="tiny faint">{t("chat.request.approveHint")}</div>
        {!telegramSent && (
          <div className="tiny faint">{t("chat.request.telegramFailed")}</div>
        )}
      </div>
    );
  }

  return (
    <div className="credit-request">
      {!collapsible && (
        <>
          <div className="small bold">{t("chat.request.title")}</div>
          <div className="tiny muted">
            {t("chat.request.balanceHint", { balance: n(currentBalance) })}
          </div>
        </>
      )}
      <div className="credit-request-row">
        <div className="chip-row">
          {REQUEST_AMOUNTS.map((value) => (
            <button
              key={value}
              className={`chip${value === amount ? " active" : ""}`}
              type="button"
              onClick={() => setAmount(value)}
            >
              {n(value)}
            </button>
          ))}
        </div>
        <input
          className="input credit-request-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("chat.request.notePlaceholder")}
          maxLength={200}
        />
        <button className="btn btn-primary btn-sm" type="button" onClick={send} disabled={sending}>
          <Send size={14} /> {sending ? t("chat.request.sending") : t("chat.request.submit")}
        </button>
        {onOpenTopup && (
          <button className="btn btn-sm" type="button" onClick={onOpenTopup}>
            <Wallet size={14} /> {t("chat.request.topUp")}
          </button>
        )}
      </div>
    </div>
  );
}

function isAlreadyPending(error: ApiError): boolean {
  if (error.code === ALREADY_PENDING || error.status === 409) return true;
  // The exact code is not contractual yet: fall back to the Vietnamese message.
  return /đang chờ|đã có yêu cầu/i.test(error.message);
}

async function refreshPending(setter: (value: CreditRequest | null) => void) {
  try {
    const result = await api.myCreditRequests();
    setter(result.items.find((item) => item.status === "pending") ?? null);
  } catch {
    /* keep the previous state */
  }
}
