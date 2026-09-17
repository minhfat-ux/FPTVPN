import { Coins, Plus, Trash2 } from "lucide-react";
import { Field, Switch } from "../components/ui";
import { useI18n } from "../i18n";
import type { AppSettings, TopupPackageSetting } from "../types";

/** The credit fields this card owns — a slice of AppSettings. */
export type CreditSettingsSlice = Pick<
  AppSettings,
  | "creditsEnabled"
  | "signupCredits"
  | "creditsPerToken"
  | "vndPerCredit"
  | "creditBuyUrl"
  | "promoReminderMinutes"
  | "promoCreditSnoozeMinutes"
  | "topupPackages"
>;

/**
 * Tokens in one real turn, measured over 48 production turns (median 3.345,
 * mean 3.483). Mirrors `TYPICAL_TURN_TOKENS` on the server.
 */
const TYPICAL_TURN_TOKENS = 3500;

/**
 * Settings → Hệ thống: "Credit & giá".
 *
 * The owner edits ONE number — `vndPerCredit` — and every package price is derived
 * from it (`credits × vndPerCredit`), so re-pricing the shop is a single field.
 * A tier may still override the price (promo). The card also shows, live, what a
 * chat turn and the sign-up grant are worth in VND, because "20đ/credit" means
 * very different things depending on the token↔credit rate.
 */
export function CreditPricingCard({
  settings,
  onPatch,
  averageTurnCost = null,
}: {
  settings: CreditSettingsSlice;
  onPatch: (value: Partial<CreditSettingsSlice>) => void;
  /** Real average from /api/credits, when the admin has usage history. */
  averageTurnCost?: number | null;
}) {
  const { t, n } = useI18n();
  const packages: TopupPackageSetting[] = settings.topupPackages ?? [];
  const perCredit = Math.max(0, Number(settings.vndPerCredit) || 0);
  const perToken = Math.max(0, Number(settings.creditsPerToken) || 0);
  // Only trust the measured average when there is real history: a fresh account
  // falls back to the typical turn, which is what the server charges in practice.
  const measured = Number(averageTurnCost) > 100 ? Math.round(Number(averageTurnCost)) : null;
  const typicalCredits = Math.max(1, Math.ceil(TYPICAL_TURN_TOKENS * perToken));
  const turnCredits = measured ?? typicalCredits;
  const vnd = (value: number) => `${n(Math.round(value))} đ`;

  const updatePackage = (index: number, patch: Partial<TopupPackageSetting>) => {
    const next = packages.map((entry, position) => (position === index ? { ...entry, ...patch } : entry));
    onPatch({ topupPackages: next });
  };

  const addPackage = () => {
    onPatch({
      topupPackages: [
        ...packages,
        { id: `tier-${Date.now().toString(36)}`, name: t("settings.credits.newPackage"), tokens: 20000, bonusTokens: 0, priceVnd: null, note: null },
      ],
    });
  };

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

      {/* --- the price knob ------------------------------------------------- */}
      <div className="price-panel">
        <div className="price-panel-head">
          <Coins size={16} />
          <span className="bold">{t("settings.credits.priceTitle")}</span>
        </div>
        <div className="grid grid-2">
          <Field label={t("settings.credits.vndPerCreditLabel")} hint={t("settings.credits.vndPerCreditHint")}>
            <input
              className="input w-num"
              type="number"
              min={0}
              step={1}
              value={settings.vndPerCredit}
              onChange={(event) => onPatch({ vndPerCredit: intOr(event.target.value, settings.vndPerCredit, 0) })}
            />
          </Field>
          <Field label={t("settings.credits.turnEstimateLabel")} hint={t("settings.credits.turnEstimateHint")}>
            <div className="price-readout">
              <strong>{n(turnCredits)}</strong> credit ≈ <strong>{vnd(turnCredits * perCredit)}</strong>
              {measured ? <span className="tiny faint"> · {t("settings.credits.fromRealUsage")}</span> : null}
            </div>
          </Field>
        </div>
        <div className="tiny faint">
          {t("settings.credits.signupValue", {
            credits: n(settings.signupCredits),
            value: vnd(settings.signupCredits * perCredit),
          })}
        </div>
      </div>

      {/* --- tiers ---------------------------------------------------------- */}
      <div className="row gap-2 mt-3 mb-2">
        <span className="bold small">{t("settings.credits.packagesTitle")}</span>
        <span className="grow" />
        <button className="btn btn-sm" type="button" onClick={addPackage}>
          <Plus size={13} /> {t("settings.credits.addPackage")}
        </button>
      </div>
      <p className="hint mb-2">{t("settings.credits.packagesHint")}</p>

      <div className="price-tiers">
        {packages.map((entry, index) => {
          const grant = Math.max(0, entry.tokens) + Math.max(0, entry.bonusTokens);
          const auto = Math.round(grant * perCredit);
          const effective = entry.priceVnd && entry.priceVnd > 0 ? entry.priceVnd : auto;
          return (
            <div className="price-tier" key={entry.id}>
              <input
                className="input"
                value={entry.name}
                placeholder={t("settings.credits.packageName")}
                onChange={(event) => updatePackage(index, { name: event.target.value })}
              />
              <input
                className="input w-num"
                type="number"
                min={0}
                value={entry.tokens}
                title={t("settings.credits.packageCredits")}
                onChange={(event) => updatePackage(index, { tokens: intOr(event.target.value, entry.tokens, 0) })}
              />
              <input
                className="input w-num"
                type="number"
                min={0}
                value={entry.bonusTokens}
                title={t("settings.credits.packageBonus")}
                onChange={(event) => updatePackage(index, { bonusTokens: intOr(event.target.value, entry.bonusTokens, 0) })}
              />
              <input
                className="input w-num"
                type="number"
                min={0}
                value={entry.priceVnd ?? ""}
                placeholder={n(auto)}
                title={t("settings.credits.packagePrice")}
                onChange={(event) =>
                  updatePackage(index, { priceVnd: event.target.value === "" ? null : intOr(event.target.value, auto, 0) })
                }
              />
              <span className="tiny faint price-tier-value">
                {entry.priceVnd && entry.priceVnd > 0
                  ? t("settings.credits.priceOverridden")
                  : t("settings.credits.priceAuto", { value: vnd(effective) })}
              </span>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                type="button"
                title={t("common.delete")}
                onClick={() => onPatch({ topupPackages: packages.filter((_, position) => position !== index) })}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        {!packages.length && <div className="small muted">{t("settings.credits.noPackages")}</div>}
      </div>
      <div className="price-tier-head tiny faint">
        <span>{t("settings.credits.packageName")}</span>
        <span>{t("settings.credits.packageCredits")}</span>
        <span>{t("settings.credits.packageBonus")}</span>
        <span>{t("settings.credits.packagePrice")}</span>
      </div>

      {/* --- the rest ------------------------------------------------------- */}
      <div className="grid grid-2 mt-3">
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
            step="0.01"
            value={settings.creditsPerToken}
            onChange={(event) =>
              onPatch({ creditsPerToken: decimalOr(event.target.value, settings.creditsPerToken, 0) })
            }
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

/**
 * Like `intOr` but keeps decimals. `creditsPerToken` is fractional on purpose
 * (0.06 credit/token ≈ 210đ a turn); truncating it here would silently set the
 * rate to 0 and make every chat free.
 */
function decimalOr(raw: string, fallback: number, min: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, value);
}
