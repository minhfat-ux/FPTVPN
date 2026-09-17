import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, Clock, Landmark, Loader2, RefreshCw, Send, Wallet, X } from "lucide-react";
import { api } from "../api/client";
import { CopyButton, ConfirmDialog, Modal } from "../components/ui";
import { useI18n } from "../i18n";
import type { TopupOrder } from "../types";

/**
 * Payment panel for one top-up order: the exact transfer note, the receiving
 * account (or the owner's QR image) and the "I have transferred" report.
 * The page owns the data; this component owns its own request state and, on
 * failure, hands the error to the page so a single layer reports it.
 */

/** While the modal is open the order is re-checked on this cadence. */
const POLL_MS = 20_000;

export function PaymentModal({
  order,
  onClose,
  onRefresh,
  onMarkTransferred,
  onCancelOrder,
}: {
  order: TopupOrder | null;
  onClose: () => void;
  /** Re-reads the listing; resolves to the refreshed order (or null). */
  onRefresh: () => Promise<TopupOrder | null>;
  /** Reports the transfer; resolves to `null` when the request failed. */
  onMarkTransferred: (orderId: string, bankTxnRef: string) => Promise<{ telegramSent: boolean } | null>;
  /** Cancels the order; resolves to false when the request failed. */
  onCancelOrder: (orderId: string) => Promise<boolean>;
}) {
  const { t, n, d } = useI18n();
  const [txnRef, setTxnRef] = useState("");
  const [marking, setMarking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [done, setDone] = useState(false);
  const [telegramFailed, setTelegramFailed] = useState(false);

  const open = Boolean(order);
  const id = order?.id ?? "";
  const status = order?.status ?? "pending";
  const registered = done || status === "awaiting_confirmation";

  // A different order starts from a clean slate.
  useEffect(() => {
    setTxnRef("");
    setDone(false);
    setTelegramFailed(false);
    setConfirmCancel(false);
  }, [id]);

  // The owner confirms from Telegram, so poll while the modal is still waiting.
  useEffect(() => {
    if (!open || status === "paid" || status === "cancelled") return;
    const timer = window.setInterval(() => void onRefresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, status, onRefresh]);

  if (!order) return null;

  const markTransferred = async () => {
    setMarking(true);
    try {
      const result = await onMarkTransferred(order.id, txnRef.trim());
      if (result) {
        setDone(true);
        setTelegramFailed(!result.telegramSent);
      }
      await onRefresh();
    } finally {
      setMarking(false);
    }
  };

  const cancelOrder = async () => {
    setCancelling(true);
    try {
      const cancelled = await onCancelOrder(order.id);
      setConfirmCancel(false);
      if (cancelled) onClose();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={t("topup.pay.title")}
        description={`${order.packageName} · ${d(order.createdAt)}`}
        onClose={onClose}
        footer={
          <>
            <button className="btn" type="button" onClick={onClose}>
              {t("common.close")}
            </button>
            {status !== "paid" && status !== "cancelled" && (
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => setConfirmCancel(true)}
                disabled={cancelling}
              >
                <X size={15} /> {cancelling ? t("topup.pay.cancelling") : t("topup.pay.cancelOrder")}
              </button>
            )}
            {status !== "paid" && (
              <button className="btn" type="button" onClick={() => void onRefresh()}>
                <RefreshCw size={15} /> {t("topup.pay.check")}
              </button>
            )}
            {status !== "paid" && status !== "cancelled" && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void markTransferred()}
                disabled={marking || registered}
              >
                {marking ? <Loader2 size={15} className="topup-spin" /> : <Send size={15} />}
                {marking ? t("topup.pay.sending") : t("topup.pay.transferred")}
              </button>
            )}
          </>
        }
      >
        <div className="topup-pay">
          <div className="grid grid-2">
            <div className="stat">
              <div className="stat-value">{t("topup.package.price", { amount: n(order.amountVnd) })}</div>
              <div className="stat-label">{t("topup.pay.amount")}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{t("topup.package.total", { count: n(order.tokens) })}</div>
              <div className="stat-label">{t("topup.pay.tokens")}</div>
            </div>
          </div>

          <div className="topup-note">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="tiny faint">{t("topup.pay.noteLabel")}</span>
              {registered && <span className="badge badge-accent">{t("topup.status.awaiting_confirmation")}</span>}
            </div>
            <div className="row gap-2">
              <code className="mono grow truncate">{order.transferNote}</code>
              <CopyButton value={order.transferNote} label={t("common.copy")} />
            </div>
            <div className="tiny faint">{t("topup.pay.noteHint")}</div>
          </div>

          {order.qrUrl ? (
            <div className="topup-qr">
              <img src={order.qrUrl} alt={t("topup.pay.qrAlt")} loading="lazy" />
            </div>
          ) : (
            <div className="card topup-qr-hint">
              <div className="row gap-2">
                <Landmark size={16} />
                <span className="bold">{t("topup.pay.noBank")}</span>
              </div>
              <div className="small muted mt-1">{t("topup.pay.noBankHint")}</div>
            </div>
          )}

          <div className="card">
            <div className="card-title mb-2">{t("topup.pay.bankTitle")}</div>
            <BankLine icon={<Landmark size={14} />} label={t("topup.pay.bankName")} value={order.bank.bankId} />
            <BankLine icon={<Wallet size={14} />} label={t("topup.pay.bankAccount")} value={order.bank.account} />
            <BankLine icon={<Check size={14} />} label={t("topup.pay.bankAccountName")} value={order.bank.accountName} />
          </div>

          <label className="field">
            <span className="label">{t("topup.pay.txnRef")}</span>
            <input
              className="input input-mono"
              value={txnRef}
              onChange={(event) => setTxnRef(event.target.value)}
              placeholder={t("topup.pay.txnRefPlaceholder")}
              maxLength={120}
            />
          </label>

          {registered && (
            <div className="status-line topup-success" role="status">
              <Clock size={15} />
              <span className="grow">{t("topup.pay.done")}</span>
            </div>
          )}
          {registered && telegramFailed && <div className="tiny faint">{t("topup.pay.telegramFailed")}</div>}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        title={t("topup.pay.cancelTitle")}
        message={t("topup.pay.cancelMessage", { id: order.id })}
        confirmLabel={t("topup.pay.cancelOrder")}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void cancelOrder()}
        busy={cancelling}
      />
    </>
  );
}

/** One copyable receiving-account field. */
function BankLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="topup-bank-line">
      <span className="topup-bank-icon">{icon}</span>
      <span className="grow truncate">
        <span className="tiny faint">{label}</span>
        <span className="mono block">{value}</span>
      </span>
      <CopyButton value={value} />
    </div>
  );
}
