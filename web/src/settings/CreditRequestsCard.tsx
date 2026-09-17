import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { api, ApiError } from "../api/client";
import { requestCreditsRefresh } from "../state/credits";
import { useAuth, useToast } from "../state/store";
import { useI18n } from "../i18n";
import type { CreditRequest } from "../types";

/**
 * Settings → Người dùng: pending "xin thêm token" requests.
 * The same request is also delivered to Telegram with one-tap approve/reject
 * links, so a request answered there simply disappears from this list.
 */
export function CreditRequestsCard() {
  const { user } = useAuth();
  const { push } = useToast();
  const { t, n, d } = useI18n();
  const [items, setItems] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await api.pendingCreditRequests()).items);
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.creditRequests.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (request: CreditRequest, approve: boolean) => {
    setBusyId(request.id);
    try {
      await api.decideCreditRequest(request.id, { approve });
      const amount = n(request.amount);
      push(
        approve
          ? t("settings.creditRequests.approved", { amount, email: request.email })
          : t("settings.creditRequests.rejected", { email: request.email }),
        approve ? "success" : "info",
      );
      if (approve && request.userId === user?.id) requestCreditsRefresh();
      setItems((current) => current.filter((item) => item.id !== request.id));
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("settings.creditRequests.decideFailed"), "error");
      void load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="grow">
          <div className="card-title">
            {t("settings.creditRequests.title")}
            {items.length > 0 && (
              <span className="badge badge-warn badge-inline">
                {t("settings.creditRequests.pendingBadge", { count: n(items.length) })}
              </span>
            )}
          </div>
          <div className="card-desc">{t("settings.creditRequests.desc")}</div>
        </div>
        <button className="btn btn-sm" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> {t("common.reload")}
        </button>
      </div>

      {loading && !items.length && <div className="hint">{t("settings.creditRequests.loading")}</div>}
      {!loading && !items.length && <div className="hint">{t("settings.creditRequests.empty")}</div>}

      {items.length > 0 && (
        <div className="credit-requests">
          {items.map((request) => (
            <div className="request-row" key={request.id}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="bold truncate">{request.email}</div>
                <div className="tiny muted">
                  {t(
                    request.name ? "settings.creditRequests.metaNamed" : "settings.creditRequests.meta",
                    { name: request.name ?? "", amount: n(request.amount), at: d(request.createdAt) },
                  )}
                </div>
                {request.note && (
                  <div className="tiny faint">{t("settings.creditRequests.noteQuoted", { note: request.note })}</div>
                )}
              </div>
              <div className="request-actions">
                <button
                  className="btn btn-sm btn-primary"
                  type="button"
                  onClick={() => void decide(request, true)}
                  disabled={busyId === request.id}
                >
                  <Check size={14} /> {t("settings.creditRequests.approve")}
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  type="button"
                  onClick={() => void decide(request, false)}
                  disabled={busyId === request.id}
                >
                  <X size={14} /> {t("settings.creditRequests.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
