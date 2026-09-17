import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Coins, Gift, Loader2, Sparkles, Wallet } from "lucide-react";
import { api, ApiError } from "../api/client";
import { RequestCreditsForm } from "../chat/RequestCreditsForm";
import { EmptyState, Modal, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { useToast } from "../state/store";
import type { TopupListing, TopupOrder, TopupPackage } from "../types";
import { PaymentModal } from "./PaymentModal";
import { CreditGuide } from "./CreditGuide";
import { TopupSkills } from "./TopupSkills";
import "./topup.css";

/** Order states that still need the owner, so the page keeps checking. */
const OPEN_STATUSES: TopupOrder["status"][] = ["pending", "awaiting_confirmation"];

/**
 * "Nạp token" — one page for both ways of getting more out of the account:
 * a bank transfer in section A and extra skills bought with tokens in B.
 * The page owns the listing; the sections own their own requests.
 */
export function TopupPage({ onOpenHub }: { onOpenHub?: () => void }) {
  const { t, n, d } = useI18n();
  const { push } = useToast();

  const [listing, setListing] = useState<TopupListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<TopupOrder | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const mounted = useRef(true);
  const requestId = useRef(0);
  const packagesRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const load = useCallback(async (options: { quiet?: boolean } = {}) => {
    const id = ++requestId.current;
    if (!options.quiet) setLoading(true);
    try {
      const result = await api.topup();
      if (!mounted.current || id !== requestId.current) return null;
      setListing(result);
      setError(null);
      return result;
    } catch (err) {
      if (mounted.current && id === requestId.current) {
        setError(err instanceof ApiError ? err.message : t("topup.packages.loadFailed"));
      }
      return null;
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Re-reads the listing and, when asked, hands the fresh order to the modal. */
  const refresh = useCallback(
    async (options: { syncActive?: boolean } = {}) => {
      const result = await load({ quiet: true });
      if (result && options.syncActive && activeOrder) {
        setActiveOrder(result.orders.find((order) => order.id === activeOrder.id) ?? activeOrder);
      }
      return result;
    },
    [load, activeOrder],
  );

  const buyPackage = async (pkg: TopupPackage) => {
    setCreatingId(pkg.id);
    try {
      const result = await api.createTopupOrder(pkg.id);
      setActiveOrder(result.order);
      await refresh();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("topup.packages.loadFailed"), "error");
    } finally {
      setCreatingId(null);
    }
  };

  const markTransferred = async (orderId: string, bankTxnRef: string) => {
    try {
      const result = await api.markTopupTransferred(orderId, bankTxnRef || undefined);
      return { telegramSent: result.telegram?.sent !== false };
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("topup.pay.markFailed"), "error");
      return null;
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await api.cancelTopupOrder(orderId);
      push(t("topup.pay.cancelled"), "success");
      return true;
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("topup.pay.cancelFailed"), "error");
      return false;
    } finally {
      await refresh();
    }
  };

  const scrollToPackages = () => packagesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const credits = listing?.credits;
  const balance = listing?.balance ?? credits?.balance ?? 0;
  const packages = listing?.packages ?? [];
  const orders = listing?.orders ?? [];

  return (
    <div className="page">
      <div className="page-inner">
        {/* ------------------------------------------------- A. Nạp token */}
        <section className="topup-section">
          <div className="card topup-balance-card">
            <div className="topup-balance">
              <div className="tiny faint">{t("topup.balance.label")}</div>
              <div className="topup-balance-value">
                {n(balance)} <span className="topup-balance-unit">{t("topup.balance.unit")}</span>
              </div>
              <div className="small muted">
                {credits?.estimatedTurnsLeft === null || credits?.estimatedTurnsLeft === undefined
                  ? t("topup.balance.turnsUnknown")
                  : t("topup.balance.turns", { count: n(credits.estimatedTurnsLeft) })}
              </div>
              <div className="tiny faint">{t("topup.balance.rate")}</div>
            </div>
            <div className="topup-balance-actions">
              <button className="btn btn-primary" type="button" onClick={() => setRequestOpen(true)}>
                <Gift size={15} /> {t("topup.balance.request")}
              </button>
            </div>
          </div>

          <div className="topup-head">
            <div className="grow">
              <div className="row gap-2">
                <Wallet size={18} />
                <span className="card-title">{t("topup.section.topup")}</span>
              </div>
              <div className="card-desc mt-1">{t("topup.section.topupHint")}</div>
            </div>
            {loading && <Loader2 size={16} className="topup-spin" />}
          </div>

          {error && (
            <div className="card topup-error" role="alert">
              <div className="row gap-2">
                <CircleAlert size={16} />
                <span className="grow">{error}</span>
                <button className="btn btn-sm" type="button" onClick={() => void load()}>
                  {t("common.retry")}
                </button>
              </div>
            </div>
          )}

          {loading && !listing && <Spinner label={t("common.loading")} />}

          <div ref={packagesRef} className="topup-packages">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                busy={creatingId === pkg.id}
                onBuy={() => void buyPackage(pkg)}
              />
            ))}
          </div>

          {!loading && listing && !packages.length && (
            <div className="card">
              <EmptyState
                icon="💳"
                title={t("topup.packages.empty")}
                hint={t("topup.packages.emptyHint")}
              />
            </div>
          )}

          {/* ------------------------------------- Cách tính credit + cách nạp */}
          <CreditGuide listing={listing} balance={balance} />

          <div className="card topup-orders">
            <div className="card-title mb-2">{t("topup.orders.title")}</div>
            {orders.length ? (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("topup.orders.time")}</th>
                      <th>{t("topup.orders.package")}</th>
                      <th>{t("topup.orders.tokens")}</th>
                      <th>{t("topup.orders.amount")}</th>
                      <th>{t("topup.orders.note")}</th>
                      <th>{t("topup.orders.status")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td className="nowrap">{d(order.createdAt)}</td>
                        <td>{order.packageName}</td>
                        <td className="nowrap">{n(order.tokens)}</td>
                        <td className="nowrap">{t("topup.package.price", { amount: n(order.amountVnd) })}</td>
                        <td>
                          <code className="mono">{order.transferNote}</code>
                        </td>
                        <td>
                          <StatusBadge status={order.status} label={t(`topup.status.${order.status}`)} />
                        </td>
                        <td>
                          {OPEN_STATUSES.includes(order.status) && (
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => setActiveOrder(order)}
                            >
                              {t("topup.orders.reopen")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="🧾" title={t("topup.orders.empty")} hint={t("topup.orders.emptyHint")} />
            )}
          </div>
        </section>

        {/* ------------------------------------------- B. Mua thêm kỹ năng */}
        <TopupSkills
          onBalanceChanged={() => void refresh()}
          onBuyPackage={scrollToPackages}
          onRequestCredits={() => setRequestOpen(true)}
          onOpenHub={onOpenHub}
        />
      </div>

      <PaymentModal
        order={activeOrder}
        onClose={() => setActiveOrder(null)}
        onRefresh={async () => {
          const result = await refresh({ syncActive: true });
          return result?.orders.find((order) => order.id === activeOrder?.id) ?? activeOrder;
        }}
        onMarkTransferred={markTransferred}
        onCancelOrder={cancelOrder}
      />

      <Modal
        open={requestOpen}
        title={t("topup.balance.request")}
        onClose={() => setRequestOpen(false)}
        footer={
          <button className="btn" type="button" onClick={() => setRequestOpen(false)}>
            {t("common.close")}
          </button>
        }
      >
        <RequestCreditsForm currentBalance={balance} />
      </Modal>
    </div>
  );
}

/** One token package: name, tokens (+bonus), price, note and the buy button. */
function PackageCard({ pkg, busy, onBuy }: { pkg: TopupPackage; busy: boolean; onBuy: () => void }) {
  const { t, n } = useI18n();
  const free = pkg.priceVnd <= 0;
  const highlight = Boolean(pkg.note);

  return (
    <div className={`card topup-package${highlight ? " topup-package-featured" : ""}`}>
      {/* `note` is free copy from the owner, e.g. "Phổ biến nhất". */}
      {highlight && (
        <span className="badge badge-accent topup-package-note">
          <Sparkles size={11} /> {pkg.note}
        </span>
      )}
      <div className="topup-package-name">{pkg.name}</div>
      <div className="topup-package-tokens">
        {t("topup.package.total", { count: n(pkg.totalTokens) })}
        {pkg.bonusTokens > 0 && (
          <span className="badge badge-ok topup-package-bonus">
            <Coins size={11} /> {t("topup.package.bonus", { count: n(pkg.bonusTokens) })}
          </span>
        )}
      </div>
      <div className="topup-package-price">
        {free ? t("topup.package.free") : t("topup.package.price", { amount: n(pkg.priceVnd) })}
      </div>
      <button className="btn btn-primary btn-block" type="button" onClick={onBuy} disabled={busy}>
        {busy && <Loader2 size={15} className="topup-spin" />}
        {busy ? t("topup.package.buying") : t("topup.package.buy")}
      </button>
    </div>
  );
}

function StatusBadge({ status, label }: { status: TopupOrder["status"]; label: string }) {
  const className =
    status === "paid" ? "badge badge-ok" : status === "cancelled" ? "badge" : "badge badge-warn";
  return <span className={className}>{label}</span>;
}
