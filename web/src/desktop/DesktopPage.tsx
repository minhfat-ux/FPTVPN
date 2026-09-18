import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, KeyRound, Laptop, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { EmptyState, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { useToast } from "../state/store";
import "./desktop.css";

type DesktopStatus = Awaited<ReturnType<typeof api.desktopStatus>>;
type IssuedCode = Awaited<ReturnType<typeof api.desktopCode>>;

/**
 * "Bản Windows" — chỗ khách lấy mã kích hoạt cho app MeetFlow AI trên Windows và
 * xem những máy đã kích hoạt.
 *
 * Vì sao cần trang này: app Windows **không** giữ key Soniox/OpenRouter nữa; nó đổi
 * "mã kích hoạt" (gửi qua email khi đơn thành `paid`) lấy token phiên ở backend riêng.
 * Khách mất email thì vào đây lấy mã mới (mã cũ hết hiệu lực), và thu hồi được máy
 * mình không dùng nữa.
 */
export function DesktopPage({ onOpenTopup }: { onOpenTopup?: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();

  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.desktopStatus();
      if (!mounted.current) return;
      setStatus(result);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err instanceof ApiError ? err.message : t("shell.desktop.loadFailed"));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const getCode = async () => {
    setIssuing(true);
    try {
      const result = await api.desktopCode();
      if (!mounted.current) return;
      setIssued(result);
      push(result.emailed ? t("shell.desktop.codeEmailed") : t("shell.desktop.codeShown"), "success");
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("shell.desktop.codeFailed"), "error");
    } finally {
      if (mounted.current) setIssuing(false);
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await api.revokeDesktopDevice(id);
      push(t("shell.desktop.revoked"), "success");
      await load();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("shell.desktop.revokeFailed"), "error");
    } finally {
      if (mounted.current) setRevoking(null);
    }
  };

  if (loading && !status) {
    return (
      <div className="page">
        <div className="page-inner row gap-2">
          <Spinner />
          <span className="muted">{t("shell.desktop.loading")}</span>
        </div>
      </div>
    );
  }

  const devices = (status?.activations ?? []).filter((device) => !device.revokedAt);

  return (
    <div className="page">
      <div className="page-inner stack">
        <div className="card desktop-hero">
          <div className="row gap-2">
            <span className="desktop-hero-icon">
              <Laptop size={22} />
            </span>
            <div className="grow">
              <div className="desktop-hero-title">{t("shell.desktop.heroTitle")}</div>
              <div className="small muted">{t("shell.desktop.heroSub")}</div>
            </div>
            {status?.downloadUrl && (
              <a className="btn btn-primary" href={status.downloadUrl} target="_blank" rel="noopener noreferrer">
                {t("shell.desktop.download")}
              </a>
            )}
          </div>
          <ol className="desktop-steps small muted">
            <li>{t("shell.desktop.step1")}</li>
            <li>{t("shell.desktop.step2")}</li>
            <li>{t("shell.desktop.step3")}</li>
          </ol>
        </div>

        {error && (
          <div className="card desktop-warn">
            <CircleAlert size={16} />
            <span className="grow small">{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => void load()} type="button">
              <RefreshCw size={14} /> {t("shell.desktop.retry")}
            </button>
          </div>
        )}

        {status && !status.configured && (
          <div className="card desktop-warn">
            <CircleAlert size={16} />
            <span className="grow small">{t("shell.desktop.notConfigured")}</span>
          </div>
        )}

        {status?.configured && !status.healthy && (
          <div className="card desktop-warn">
            <CircleAlert size={16} />
            <span className="grow small">{t("shell.desktop.backendDown")}</span>
          </div>
        )}

        {status && !status.entitled && (
          <div className="card stack">
            <div className="row gap-2">
              <ShieldCheck size={16} />
              <span className="grow">{t("shell.desktop.notEntitled")}</span>
            </div>
            <div className="small muted">{t("shell.desktop.notEntitledHint")}</div>
            {onOpenTopup && (
              <div>
                <button className="btn btn-primary" onClick={onOpenTopup} type="button">
                  {t("shell.desktop.goTopup")}
                </button>
              </div>
            )}
          </div>
        )}

        {status?.entitled && (
          <div className="card stack">
            <div className="row gap-2">
              <KeyRound size={16} />
              <span className="grow">{t("shell.desktop.codeSection")}</span>
            </div>
            <div className="small muted">{t("shell.desktop.codeSectionHint")}</div>
            <div className="row gap-2">
              <button className="btn btn-primary" onClick={() => void getCode()} disabled={issuing} type="button">
                {issuing ? <Loader2 className="spin" size={15} /> : <KeyRound size={15} />}
                {issued ? t("shell.desktop.getCodeAgain") : t("shell.desktop.getCode")}
              </button>
              {status.paidOrder?.packageName && (
                <span className="tiny faint">
                  {t("shell.desktop.paidOrder", { name: status.paidOrder.packageName })}
                </span>
              )}
            </div>
            {issued && (
              <div className="desktop-code">
                <div className="tiny faint">{t("shell.desktop.codeLabel")}</div>
                <div className="desktop-code-value">{issued.code}</div>
                <div className="tiny faint">
                  {issued.expiresAt
                    ? t("shell.desktop.codeExpiry", { date: new Date(issued.expiresAt).toLocaleDateString() })
                    : ""}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="card stack">
          <div className="section-title">{t("shell.desktop.devices")}</div>
          {!devices.length ? (
            <EmptyState title={t("shell.desktop.noDevices")} hint={t("shell.desktop.noDevicesHint")} />
          ) : (
            <div className="stack">
              {devices.map((device) => (
                <div className="row gap-2 desktop-device" key={device.id}>
                  <Laptop size={15} />
                  <div className="grow">
                    <div className="small">{device.deviceLabel ?? t("shell.desktop.unknownDevice")}</div>
                    <div className="tiny faint">
                      {t("shell.desktop.lastSeen", {
                        when: new Date(device.lastSeenAt).toLocaleString(),
                      })}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void revoke(device.id)}
                    disabled={revoking === device.id}
                    type="button"
                  >
                    {revoking === device.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                    {t("shell.desktop.revoke")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="tiny faint">{t("shell.desktop.devicesHint")}</div>
        </div>
      </div>
    </div>
  );
}
