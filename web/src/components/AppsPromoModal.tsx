import { useEffect, useState } from "react";
import { Apple, AppWindow, BookOpen, Download, ExternalLink, ShoppingCart, Smartphone } from "lucide-react";
import { api } from "../api/client";
import { Modal } from "./ui";
import { useAuth } from "../state/store";
import { useI18n } from "../i18n";
import type { PromoApp } from "../types";
import { hubIcon } from "../hub/icons";
import { detectPlatform } from "../ecosystem";

/** Khoá lưu "đã xem lúc nào" — để không réo người dùng ở mọi lần mở trang. */
const SEEN_KEY = "fbuddy.appsPromoSeenAt";
/** Nhắc lại sau 7 ngày; bấm "để sau" thì tính từ lúc đó. */
const REPEAT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Nút tải theo nền tảng (thứ tự ưu tiên) rồi mới tới nút mua/hướng dẫn. */
const PLATFORM_KEYS = ["windows", "macos", "ios", "android"];
const EXTRA_KEYS = ["buy", "guide", "app", "support"];

/** Icon cho từng nút — nhìn là biết bấm ra bản nào. */
function linkIcon(key: string) {
  if (key === "macos" || key === "ios") return <Apple size={12} />;
  if (key === "windows") return <AppWindow size={12} />;
  if (key === "android") return <Smartphone size={12} />;
  if (key === "buy") return <ShoppingCart size={12} />;
  if (key === "guide" || key === "support") return <BookOpen size={12} />;
  return <Download size={12} />;
}

/**
 * Các nút của một app: bản cài theo nền tảng TRƯỚC (bản của thiết bị đang dùng lên đầu để bấm là
 * tải đúng), rồi mới tới "xem gói & mua" / "hướng dẫn cài". Trước 21/09/2026 thẻ chỉ có MỘT link
 * nên bản Windows/macOS của MeetFlow AI không hiện ra (lỗi chủ dự án báo).
 */
function linkKeys(app: PromoApp): string[] {
  const links = app.links ?? {};
  const platform = detectPlatform();
  const platforms = PLATFORM_KEYS.filter((key) => links[key]);
  const index = platforms.indexOf(platform);
  if (index > 0) platforms.unshift(platforms.splice(index, 1)[0]);
  const keys = [...platforms, ...EXTRA_KEYS.filter((key) => links[key])];
  // Cùng một link cho nhiều nền tảng (App Store dùng chung iPhone/iPad/Mac) thì chỉ hiện một nút.
  const seen = new Set<string>();
  return keys.filter((key) => {
    if (seen.has(links[key])) return false;
    seen.add(links[key]);
    return true;
  });
}

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
  /** Ảnh icon nào tải lỗi — để rơi về icon vector thay vì ô trống. */
  const [brokenIcons, setBrokenIcons] = useState<Record<string, boolean>>({});

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
          const keys = linkKeys(app);
          return (
            <div className="apps-promo-card" key={app.id}>
              <a className="apps-promo-head" href={link} target="_blank" rel="noopener noreferrer">
                <span className="apps-promo-title">
                  <span
                    className="apps-promo-icon"
                    style={app.accent ? { color: app.accent, background: `${app.accent}22`, borderColor: `${app.accent}55` } : undefined}
                  >
                    {/* Ảnh icon thật của app; ảnh lỗi thì rơi về icon vector cùng bộ với chợ. */}
                    {app.iconUrl && !brokenIcons[app.id] ? (
                      <img
                        src={app.iconUrl}
                        alt=""
                        loading="lazy"
                        onError={() => setBrokenIcons((current) => ({ ...current, [app.id]: true }))}
                      />
                    ) : (
                      hubIcon(app.icon ?? "sparkles", 18)
                    )}
                  </span>
                  <span className="bold">{app.name}</span>
                </span>
                <ExternalLink size={14} />
              </a>
              {app.kind ? <span className="tiny faint">{app.kind}</span> : null}
              <span className="small apps-promo-summary">{app.summary}</span>
              {keys.length ? (
                <span className="apps-promo-links">
                  {keys.map((key) => (
                    <a
                      className="apps-promo-link"
                      key={key}
                      href={app.links[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {linkIcon(key)}
                      {t(`appsPromo.platform.${key}`)}
                    </a>
                  ))}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="tiny faint">{t("appsPromo.footnote")}</div>
    </Modal>
  );
}
