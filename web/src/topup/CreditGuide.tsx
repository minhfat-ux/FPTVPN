import { useEffect, useState } from "react";
import { ChevronDown, HelpCircle, Landmark, Plus, ShoppingBag } from "lucide-react";
import { api } from "../api/client";
import { useI18n } from "../i18n";
import type { TopupListing } from "../types";

/**
 * "Credit được tính thế nào" — two readable cards above the packages: how a turn
 * is metered, and the two ways to get more credit. Every figure comes from the
 * listing (or the public meta when the server advertises it) — never hardcoded.
 */

type GuideCard = "calc" | "ways";

export function CreditGuide({ listing, balance }: { listing: TopupListing | null; balance: number }) {
  const { t, n } = useI18n();
  const [open, setOpen] = useState<GuideCard | null>("calc");
  const [signupCredits, setSignupCredits] = useState<number | null>(null);

  // The sign-up grant is public metadata; when the server does not send it, the
  // line is simply left out instead of showing a guessed number.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const meta = await api.meta();
        if (!active) return;
        const value = meta.credits?.signupCredits;
        setSignupCredits(typeof value === "number" && Number.isFinite(value) ? value : null);
      } catch {
        /* the rest of the guide stands on its own */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const credits = listing?.credits;
  const perToken = credits?.perToken ?? 1;
  const turns = credits?.estimatedTurnsLeft ?? null;
  const average = credits?.averageCostPerTurn ?? 0;
  const hasAverage = average > 0;

  const toggle = (card: GuideCard) => setOpen((current) => (current === card ? null : card));

  return (
    <div className="grid grid-2 topup-guide">
      <div className="card topup-guide-card">
        <button className="topup-guide-head" type="button" onClick={() => toggle("calc")} aria-expanded={open === "calc"}>
          <HelpCircle size={17} />
          <span className="grow">{t("topup.guide.calc.title")}</span>
          <ChevronDown size={16} className={`topup-guide-chevron${open === "calc" ? " open" : ""}`} />
        </button>

        {open === "calc" && (
          <div className="topup-guide-body">
            <p className="mb-0 small muted">{t("topup.guide.calc.intro")}</p>

            <div className="topup-guide-formula">
              <div className="row gap-2">
                <span className="topup-guide-tag">{t("topup.guide.calc.formulaTag")}</span>
                <code className="mono">
                  {t("topup.guide.calc.formula", { per: n(perToken) })}
                </code>
              </div>
              <div className="row gap-2">
                <span className="topup-guide-tag">{t("topup.guide.calc.balanceTag")}</span>
                <code className="mono">{t("topup.guide.calc.balanceFormula", { pow: n(perToken) })}</code>
              </div>
            </div>

            <div className="stack gap-1 topup-guide-facts">
              <div className="small">
                <span className="faint">{t("topup.guide.calc.perToken")}: </span>
                <span className="bold">{t("topup.guide.calc.perTokenValue", { per: n(perToken) })}</span>
              </div>
              <div className="small">
                <span className="faint">{t("topup.guide.calc.balance")}: </span>
                <span className="bold">{t("topup.guide.calc.tokens", { amount: n(balance) })}</span>
              </div>
              <div className="small">
                <span className="faint">{t("topup.guide.calc.average")}: </span>
                <span className="bold">
                  {hasAverage ? t("topup.guide.calc.averageValue", { amount: n(average) }) : t("topup.guide.calc.averageUnknown")}
                </span>
              </div>
              {turns !== null && (
                <div className="small">
                  <span className="faint">{t("topup.guide.calc.turnsLeft", { turns: n(turns) })}</span>
                </div>
              )}
            </div>

            <p className="mb-0 small muted">{t("topup.guide.calc.turnNote")}</p>
            {signupCredits !== null && (
              <p className="mb-0 small">{t("topup.guide.calc.signup", { amount: n(signupCredits) })}</p>
            )}
            <p className="mb-0 small muted">{t("topup.guide.calc.noFree")}</p>
            <p className="mb-0 small muted">{t("topup.guide.calc.chip")}</p>
          </div>
        )}
      </div>

      <div className="card topup-guide-card">
        <button className="topup-guide-head" type="button" onClick={() => toggle("ways")} aria-expanded={open === "ways"}>
          <Plus size={17} />
          <span className="grow">{t("topup.guide.ways.title")}</span>
          <ChevronDown size={16} className={`topup-guide-chevron${open === "ways" ? " open" : ""}`} />
        </button>

        {open === "ways" && (
          <div className="topup-guide-body">
            <div className="topup-guide-block">
              <div className="row gap-2">
                <Plus size={14} />
                <span className="bold small">{t("topup.guide.ways.askTitle")}</span>
              </div>
              <ol className="topup-guide-steps">
                <li>{t("topup.guide.ways.ask1")}</li>
                <li>{t("topup.guide.ways.ask2")}</li>
                <li>{t("topup.guide.ways.ask3")}</li>
                <li>{t("topup.guide.ways.ask4")}</li>
              </ol>
            </div>

            <div className="topup-guide-block">
              <div className="row gap-2">
                <Landmark size={14} />
                <span className="bold small">{t("topup.guide.ways.byBankTitle")}</span>
              </div>
              <p className="mb-0 small muted">{t("topup.guide.ways.byBankNote")}</p>
              <ol className="topup-guide-steps">
                <li>{t("topup.guide.ways.buy1")}</li>
                <li>{t("topup.guide.ways.buy2")}</li>
                <li>{t("topup.guide.ways.buy3")}</li>
                <li>{t("topup.guide.ways.buy4")}</li>
                <li>{t("topup.guide.ways.buy5")}</li>
                <li>{t("topup.guide.ways.buy6")}</li>
              </ol>
            </div>

            <div className="topup-guide-block">
              <div className="row gap-2">
                <ShoppingBag size={14} />
                <span className="bold small">{t("topup.guide.ways.skillsTitle")}</span>
              </div>
              <p className="mb-0 small muted">{t("topup.guide.ways.skillsNote")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
