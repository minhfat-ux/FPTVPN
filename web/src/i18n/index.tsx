import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setApiLang } from "../api/client";
import { useAuth } from "../state/store";
import { common as commonVi } from "./locales/vi/common";
import { common as commonEn } from "./locales/en/common";
import { common as commonZh } from "./locales/zh/common";
import { auth as authVi } from "./locales/vi/auth";
import { auth as authEn } from "./locales/en/auth";
import { auth as authZh } from "./locales/zh/auth";
import { shell as shellVi } from "./locales/vi/shell";
import { shell as shellEn } from "./locales/en/shell";
import { shell as shellZh } from "./locales/zh/shell";
import { chat as chatVi } from "./locales/vi/chat";
import { chat as chatEn } from "./locales/en/chat";
import { chat as chatZh } from "./locales/zh/chat";
import { settings as settingsVi } from "./locales/vi/settings";
import { settings as settingsEn } from "./locales/en/settings";
import { settings as settingsZh } from "./locales/zh/settings";
import { studio as studioVi } from "./locales/vi/studio";
import { studio as studioEn } from "./locales/en/studio";
import { studio as studioZh } from "./locales/zh/studio";
import { voice as voiceVi } from "./locales/vi/voice";
import { voice as voiceEn } from "./locales/en/voice";
import { voice as voiceZh } from "./locales/zh/voice";
import { hub as hubVi } from "./locales/vi/hub";
import { hub as hubEn } from "./locales/en/hub";
import { hub as hubZh } from "./locales/zh/hub";
import { topup as topupVi } from "./locales/vi/topup";
import { topup as topupEn } from "./locales/en/topup";
import { topup as topupZh } from "./locales/zh/topup";
import type { Dict } from "./types";

export type { Dict };

/**
 * Tiny i18n layer: flat dot-keys, three locales, `{var}` interpolation and a
 * Vietnamese fallback so a missing key never renders as an empty string.
 *
 * Adding a string: put it in `locales/vi/<namespace>.ts` first (that is the
 * source of truth), then in `en` and `zh`. `npm run i18n:check` style audits are
 * not automated, but `missingKeys()` lists what a locale still lacks.
 */

export const LOCALES = [
  { id: "vi", label: "Tiếng Việt", short: "VI", htmlLang: "vi", intl: "vi-VN" },
  { id: "en", label: "English", short: "EN", htmlLang: "en", intl: "en-US" },
  { id: "zh", label: "中文", short: "ZH", htmlLang: "zh", intl: "zh-CN" },
] as const;

export type LocaleId = (typeof LOCALES)[number]["id"];

const BUNDLES: Record<LocaleId, Dict> = {
  vi: { ...commonVi, ...authVi, ...shellVi, ...chatVi, ...settingsVi, ...studioVi, ...voiceVi, ...hubVi, ...topupVi },
  en: { ...commonEn, ...authEn, ...shellEn, ...chatEn, ...settingsEn, ...studioEn, ...voiceEn, ...hubEn, ...topupEn },
  zh: { ...commonZh, ...authZh, ...shellZh, ...chatZh, ...settingsZh, ...studioZh, ...voiceZh, ...hubZh, ...topupZh },
};

const STORAGE_KEY = "fbuddy.locale";

export function localeMeta(locale: LocaleId) {
  return LOCALES.find((entry) => entry.id === locale) ?? LOCALES[0];
}

function detectLocale(): LocaleId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALES.some((entry) => entry.id === stored)) return stored as LocaleId;
  } catch {
    /* private mode */
  }
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("lang");
    if (fromQuery && LOCALES.some((entry) => entry.id === fromQuery)) return fromQuery as LocaleId;
  } catch {
    /* ignore */
  }
  // System language decides; anything that is not Vietnamese or Chinese falls back
  // to English rather than Vietnamese (the product is used outside Vietnam too).
  const candidates = [navigator.languages?.[0], navigator.language].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const value = String(candidate).toLowerCase();
    if (value.startsWith("vi")) return "vi";
    if (value.startsWith("zh")) return "zh";
  }
  return "en";
}

export type TranslateVars = Record<string, string | number>;

export interface I18nValue {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  /** Look up a key; `{name}` placeholders come from `vars`. */
  t: (key: string, vars?: TranslateVars) => string;
  /** Number in the active locale (1.000 / 1,000 / 1,000). */
  n: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  /** Date-time in the active locale. */
  d: (value: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  /** Keys the active locale does not define (dev aid). */
  missingKeys: () => string[];
}

const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n phải nằm trong <I18nProvider>");
  return ctx;
}

/** Convenience for components that only need the translator. */
export function useT() {
  return useI18n().t;
}

function interpolate(template: string, vars?: TranslateVars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}

export function translate(locale: LocaleId, key: string, vars?: TranslateVars) {
  const dict = BUNDLES[locale] ?? BUNDLES.vi;
  const value = dict[key] ?? BUNDLES.vi[key] ?? key;
  return interpolate(value, vars);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(() => detectLocale());

  // Tên/mô tả kỹ năng nằm trong CSDL (có bản dịch vi/en/zh) nên API phải biết ngôn ngữ
  // đang chọn; đồng thời lưu lên tài khoản để lượt chat lấy đúng bản chỉ dẫn.
  const { user } = useAuth();
  useEffect(() => {
    setApiLang(locale);
    // Lưu lên tài khoản để LƯỢT CHAT lấy đúng bản chỉ dẫn kỹ năng (server đọc users.locale).
    if (user) void api.updateMe({ locale }).catch(() => undefined);
  }, [locale, user]);

  useEffect(() => {
    const meta = localeMeta(locale);
    document.documentElement.lang = meta.htmlLang;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* private mode */
    }
    // Keep the URL shareable with the chosen language.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("lang") !== locale) {
        url.searchParams.set("lang", locale);
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* ignore */
    }
  }, [locale]);

  const setLocale = useCallback((next: LocaleId) => {
    if (LOCALES.some((entry) => entry.id === next)) setLocaleState(next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const meta = localeMeta(locale);
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      n: (input, options) => {
        const number = Number(input ?? 0);
        if (!Number.isFinite(number)) return "0";
        return new Intl.NumberFormat(meta.intl, options).format(number);
      },
      d: (input, options) => {
        if (input === null || input === undefined || input === "") return "";
        const date = input instanceof Date ? input : new Date(input);
        if (Number.isNaN(date.getTime())) return "";
        return new Intl.DateTimeFormat(meta.intl, options ?? { dateStyle: "short", timeStyle: "short" }).format(date);
      },
      missingKeys: () => Object.keys(BUNDLES.vi).filter((key) => !(key in BUNDLES[locale])),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Language switcher used in the profile menu and Settings → Hệ thống. */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className="locale-switcher" role="group" aria-label="Ngôn ngữ / Language / 语言">
      {LOCALES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`locale-chip${locale === entry.id ? " active" : ""}`}
          onClick={() => setLocale(entry.id)}
          title={entry.label}
          aria-pressed={locale === entry.id}
        >
          {compact ? entry.short : entry.label}
        </button>
      ))}
    </div>
  );
}
