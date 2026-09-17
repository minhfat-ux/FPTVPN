import type { HubSkill } from "../types";

/** Translator/number-format signatures shared by the hub label helpers. */
type T = (key: string, vars?: Record<string, string | number>) => string;
type N = (value: number | null | undefined) => string;

/** 0 → "Miễn phí", otherwise "10.000 token". */
export function formatPrice(price: number, t: T, n: N): string {
  const value = Number.isFinite(price) ? Math.trunc(price) : 0;
  return value > 0 ? t("hub.card.price", { amount: n(value) }) : t("hub.card.free");
}

/** Primary button label while the skill is still being bought. */
export function formatBuyLabel(price: number, t: T, n: N): string {
  const value = Number.isFinite(price) ? Math.trunc(price) : 0;
  return value > 0 ? t("hub.card.buy", { amount: n(value) }) : t("hub.card.getFree");
}

/** "12 người dùng" — installs are a plain counter on the server. */
export function formatInstalls(installs: number, t: T, n: N): string {
  const value = Number.isFinite(installs) && installs > 0 ? Math.trunc(installs) : 0;
  return t("hub.card.installs", { count: n(value) });
}

/** Description sentences become the "what you get" bullets in the detail modal. */
export function bullets(description: string): string[] {
  const text = (description ?? "").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?…])\s+/))
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
    .filter((line) => line.length > 1)
    .slice(0, 8);
}

export function isOwned(skill: HubSkill): boolean {
  return skill.owned || skill.price === 0;
}

export function formatStateBadge(skill: HubSkill, t: T): { label: string; className: string } | null {
  if (skill.installed && isOwned(skill)) return { label: t("hub.card.inUse"), className: "badge-ok" };
  if (isOwned(skill)) return { label: t("hub.card.ownedBadge"), className: "badge-accent" };
  if (skill.state === "coming_soon") return { label: t("hub.card.comingSoon"), className: "badge-warn" };
  return null;
}
