/**
 * The FlowTech app ecosystem shown inside fBuddy (banner) — same links as the
 * pre-login promo popup (`web/public/promo.js`), kept here so React can render them.
 */

export type EcosystemPlatform = "windows" | "macos" | "ios" | "android" | "other";

export interface EcosystemApp {
  id: "vpnflow" | "meetflow";
  name: string;
  tag: string;
  pitchKey: string;
  icon: string;
  links: Partial<Record<EcosystemPlatform, string>> & { buy: string };
}

export const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    id: "vpnflow",
    name: "VPNFlow",
    tag: "VPN",
    pitchKey: "shell.ecosystem.vpnflowPitch",
    icon: "/app-icons/vpnflow.png", // icon nội bộ — CSP `img-src 'self'` chặn ảnh ngoài
    links: {
      buy: "https://meetflowai.site/buy",
      windows: "https://meetflowai.site/dl/VPNFlow-Setup-latest.exe",
      macos: "https://meetflowai.site/install/mac",
      ios: "https://meetflowai.site/install/ios",
      android: "https://meetflowai.site/v1/downloads/android",
    },
  },
  {
    id: "meetflow",
    name: "MeetFlow AI",
    tag: "AI",
    pitchKey: "shell.ecosystem.meetflowPitch",
    icon: "/app-icons/meetflow.png",
    links: {
      buy: "https://meetflowai.site/ai/guide",
      ios: "https://apps.apple.com/vn/app/meetflow-ai/id6765590042",
      // App Store là bản dùng chung iPhone/iPad/Mac — trang chủ FlowTech ghi "App Store (macOS)"
      // cho đúng id này, nên bản macOS trỏ về đó (không bịa link .dmg không tồn tại).
      macos: "https://apps.apple.com/vn/app/meetflow-ai/id6765590042",
      windows: "https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip",
      android: "https://api.meetflowai.site/v1/ai/downloads/android",
    },
  },
];

/** Which OS the visitor is on, so the first button is the right build. */
export function detectPlatform(): EcosystemPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  return "other";
}

/** The download link for this device, falling back to the store/guide page. */
export function primaryLink(app: EcosystemApp, platform: EcosystemPlatform): string {
  return app.links[platform] ?? app.links.buy;
}

/** Extra links worth showing on a phone/desktop, minus the primary one. */
export function secondaryPlatforms(app: EcosystemApp, platform: EcosystemPlatform): EcosystemPlatform[] {
  const all: EcosystemPlatform[] = ["windows", "macos", "ios", "android"];
  return all.filter((item) => app.links[item] && item !== platform);
}

const STORAGE_KEY = "fbuddy.ecosystem.banner";
/** "Để sau" hides the banner for a week; "không hiện lại" is permanent. */
export const BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function bannerSnoozed(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw) as { never?: boolean; until?: number };
    if (state.never) return true;
    return Boolean(state.until && now < state.until);
  } catch {
    return false;
  }
}

export function snoozeBanner(permanent = false): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(permanent ? { never: true } : { until: Date.now() + BANNER_SNOOZE_MS }),
    );
  } catch {
    /* private mode: banner simply shows again next time */
  }
}
