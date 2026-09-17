import { Field, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import type { AppSettings } from "../types";

/** The credit fields this card owns — a slice of AppSettings. */
export type CreditSettingsSlice = Pick<
  AppSettings,
  | "creditsEnabled"
  | "signupCredits"
  | "creditsPerToken"
  | "creditBuyUrl"
  | "promoReminderMinutes"
  | "promoCreditSnoozeMinutes"
>;

/**
 * Settings → Hệ thống: "Credit & giá". Values are edited in the shared settings
 * draft and persisted by that tab's "Lưu cấu hình" button.
 */
export function CreditPricingCard({
  settings,
  onPatch,
}: {
  settings: CreditSettingsSlice;
  onPatch: (value: Partial<CreditSettingsSlice>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="card">
      <div className="card-head">
        <div className="grow">
          <div className="card-title">{t("settings.credits.title")}</div>
          <div className="card-desc">{t("settings.credits.desc")}</div>
        </div>
        <span className={`badge ${settings.creditsEnabled ? "badge-ok" : "badge-warn"}`}>
          {settings.creditsEnabled ? t("common.enabled") : t("common.disabled")}
        </span>
      </div>

      <Switch
        checked={settings.creditsEnabled}
        onChange={(value) => onPatch({ creditsEnabled: value })}
        label={t("settings.credits.enable")}
      />

      <div className="grid grid-2 mt-2">
        <Field label={t("settings.credits.signupLabel")} hint={t("settings.credits.signupHint")}>
          <input
            className="input w-num"
            type="number"
            min={0}
            value={settings.signupCredits}
            onChange={(event) => onPatch({ signupCredits: intOr(event.target.value, settings.signupCredits, 0) })}
          />
        </Field>
        <Field label={t("settings.credits.perTokenLabel")} hint={t("settings.credits.perTokenHint")}>
          <input
            className="input w-num"
            type="number"
            min={0}
            value={settings.creditsPerToken}
            onChange={(event) => onPatch({ creditsPerToken: intOr(event.target.value, settings.creditsPerToken, 1) })}
          />
        </Field>
      </div>

      <Field label={t("settings.credits.buyUrlLabel")} hint={t("settings.credits.buyUrlHint")}>
        <input
          className="input input-mono"
          value={settings.creditBuyUrl}
          onChange={(event) => onPatch({ creditBuyUrl: event.target.value })}
          placeholder="https://…"
        />
      </Field>

      <div className="grid grid-2">
        <Field label={t("settings.credits.reminderLabel")} hint={t("settings.credits.reminderHint")}>
          <input
            className="input w-num"
            type="number"
            min={1}
            value={settings.promoReminderMinutes}
            onChange={(event) =>
              onPatch({ promoReminderMinutes: intOr(event.target.value, settings.promoReminderMinutes, 5) })
            }
          />
        </Field>
        <Field label={t("settings.credits.snoozeLabel")} hint={t("settings.credits.snoozeHint")}>
          <input
            className="input w-num"
            type="number"
            min={1}
            value={settings.promoCreditSnoozeMinutes}
            onChange={(event) =>
              onPatch({ promoCreditSnoozeMinutes: intOr(event.target.value, settings.promoCreditSnoozeMinutes, 1440) })
            }
          />
        </Field>
      </div>
    </div>
  );
}

/** Number input kept empty while typing: fall back instead of writing NaN. */
function intOr(raw: string, fallback: number, min: number): number {
  const value = Math.trunc(Number(raw));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}
