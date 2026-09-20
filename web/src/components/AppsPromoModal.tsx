import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./ui";
import { useAuth } from "../state/store";
import { useI18n } from "../i18n";
import type { PromoApp } from "../types";
import { hubIcon } from "../hub/icons";

/** Khoá lưu "đã xem lúc nào" — để không réo người dùng ở mọi lần mở trang. */
const SEEN_KEY = "fbuddy.appsPromoSeenAt";
/** Nhắc lại sau 7 ngày; bấm "để sau" thì tính từ lúc đó. */
const REPEAT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function seenRecently(): boolean {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return false;
    const at = Date.parse(raw);
    return Number.isFinite(at) && Date.now() - at < REPEAT_AFTER_MS;
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    /* trình duyệt chặn localStorage thì thôi */
  }
}

/**
 * Popup giới thiệu các app khác trong hệ sinh thái FlowTech.
 *
 * Quy tắc (theo yêu cầu): CHỈ hiện khi ĐÃ ĐĂNG NHẬP — khách chưa có tài khoản thì không quảng cáo
 * làm gì, vừa phiền vừa không đo được. Và không réo lại trong 7 ngày.
 *
 * Danh sách lấy từ `/api/apps` (nguồn là `PUBLISHED_APPS` phía server) nên nội dung quảng cáo
 * luôn khớp với thứ trợ lý nói về hệ sinh thái.
 */
export function AppsPromoGate() {
  const { t } = useI18n();
  const { user, ready } = useAuth();
  const [apps, setApps] = useState<PromoApp[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Chưa đăng nhập (hoặc chưa biết trạng thái) thì KHÔNG tải, KHÔNG hiện.
    if (!ready || !user) {
      setOpen(false);
      return;
    }
    if (seenRecently()) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.apps();
        if (cancelled) return;
        const items = (result.items ?? []).filter((app) => app.url || Object.keys(app.links ?? {}).length);
        if (!items.length) return;
        setApps(items);
        setOpen(true);
      } catch {
        /* quảng cáo lỗi thì im lặng, không được làm phiền người dùng */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const close = () => {
    markSeen();
    setOpen(false);
  };

  if (!open || !apps.length) return null;

  return (
    <Modal
      open={open}
      wide
      title={t("appsPromo.title")}
      description={t("appsPromo.description")}
      onClose={close}
      footer={
        <>
          <button className="btn" type="button" onClick={close}>
            {t("appsPromo.later")}
          </button>
        </>
      }
    >
      <div className="apps-promo">
        {apps.map((app) => {
          const link = app.url ?? Object.values(app.links ?? {})[0] ?? "#";
          return (
            <a className="apps-promo-card" key={app.id} href={link} target="_blank" rel="noopener noreferrer">
              <span className="apps-promo-head">
                <span className="apps-promo-title">
                  <span
                    className="apps-promo-icon"
                    style={app.accent ? { color: app.accent, background: `${app.accent}22`, borderColor: `${app.accent}55` } : undefined}
                  >
                    {hubIcon(app.icon ?? "sparkles", 18)}
                  </span>
                  <span className="bold">{app.name}</span>
                </span>
                <ExternalLink size={14} />
              </span>
              {app.kind ? <span className="tiny faint">{app.kind}</span> : null}
              <span className="small apps-promo-summary">{app.summary}</span>
            </a>
          );
        })}
      </div>
      <div className="tiny faint">{t("appsPromo.footnote")}</div>
    </Modal>
  );
}
