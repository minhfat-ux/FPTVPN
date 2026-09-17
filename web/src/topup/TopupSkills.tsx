import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, ShoppingBag, Store } from "lucide-react";
import { api, ApiError } from "../api/client";
import { EmptyState, Spinner } from "../components/ui";
import { useI18n } from "../i18n";
import { hubIcon } from "../hub/icons";
import { isOwned } from "../hub/hubFormat";
import { useData, useToast } from "../state/store";
import type { HubSkill } from "../types";

/** Server status for "the balance does not cover this purchase". */
const INSUFFICIENT_CREDITS = 402;

/**
 * Section B of the top-up page: a compact store of the skills on sale, paid
 * with the same tokens. It owns its own `api.hub()` call; a purchase or an
 * install asks the page to refresh the token balance.
 */
export function TopupSkills({
  onBalanceChanged,
  onBuyPackage,
  onRequestCredits,
  onOpenHub,
}: {
  /** Called after a purchase or an install so the page re-reads the balance. */
  onBalanceChanged: () => void;
  /** Scrolls back to the token packages (section A). */
  onBuyPackage: () => void;
  onRequestCredits: () => void;
  onOpenHub?: () => void;
}) {
  const { t, n } = useI18n();
  const { push } = useToast();
  const { skills, reloadSkills } = useData();

  const [items, setItems] = useState<HubSkill[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [shortfall, setShortfall] = useState<string | null>(null);

  const load = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setLoading(true);
    try {
      const result = await api.hub();
      setItems(result.items.filter((skill) => skill.state !== "hidden"));
      setBalance(result.balance);
      setFailed(false);
    } catch (err) {
      setFailed(true);
      if (!options.quiet) push(err instanceof ApiError ? err.message : t("topup.skills.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = async (skill: HubSkill) => {
    setBuyingId(skill.id);
    setShortfall(null);
    try {
      const result = await api.buyHubSkill(skill.id);
      push(
        result.alreadyOwned
          ? t("topup.skills.alreadyOwned")
          : t("topup.skills.bought", { name: result.skill?.name ?? skill.name }),
        result.alreadyOwned ? "info" : "success",
      );
      // The purchase moved tokens and touched the quick list: refresh both.
      await Promise.all([load({ quiet: true }), reloadSkills()]);
      onBalanceChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === INSUFFICIENT_CREDITS) {
        // The server message already spells out how many tokens are missing.
        setShortfall(err.message);
      } else {
        push(err instanceof ApiError ? err.message : t("topup.skills.buyFailed"), "error");
      }
    } finally {
      setBuyingId(null);
    }
  };

  const use = async (skill: HubSkill) => {
    setUsingId(skill.id);
    try {
      const current = skills.map((item) => item.id);
      const next = current.includes(skill.id) ? current : [...current, skill.id];
      await api.setInstalledSkills(next);
      await reloadSkills();
      push(t("topup.skills.used", { name: skill.name }), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("topup.skills.useFailed"), "error");
    } finally {
      setUsingId(null);
    }
  };

  return (
    <section className="topup-section" id="topup-skills">
      <div className="topup-head">
        <div className="grow">
          <div className="row gap-2">
            <Store size={18} />
            <span className="card-title">{t("topup.skills.title")}</span>
          </div>
          <div className="card-desc mt-1">{t("topup.skills.hint")}</div>
        </div>
        <span className="topup-skill-balance">
          <span className="tiny faint">{t("topup.skills.balance")}</span>
          <span className="bold">{n(balance)}</span>
        </span>
        <button className="btn btn-sm" type="button" onClick={() => void load()} aria-label={t("common.reload")}>
          <RefreshCw size={14} />
        </button>
        <button
          className="btn btn-sm"
          type="button"
          onClick={onOpenHub}
          disabled={!onOpenHub}
          title={onOpenHub ? t("topup.skills.openHub") : t("topup.skills.openHubDisabled")}
        >
          <ShoppingBag size={14} /> {t("topup.skills.openHub")}
        </button>
      </div>

      {shortfall && (
        <div className="card topup-shortfall" role="alert">
          <div className="bold">{t("topup.skills.insufficient")}</div>
          <div className="small muted mt-1">{shortfall}</div>
          <div className="small muted">{t("topup.skills.insufficientHint")}</div>
          <div className="row gap-2 mt-2">
            <button className="btn btn-primary btn-sm" type="button" onClick={onBuyPackage}>
              {t("topup.skills.buyPackage")}
            </button>
            <button className="btn btn-sm" type="button" onClick={onRequestCredits}>
              {t("topup.balance.request")}
            </button>
          </div>
        </div>
      )}

      {loading && !items.length && <Spinner label={t("common.loading")} />}

      {!loading && !items.length && (
        <div className="card">
          <EmptyState
            icon={failed ? "⚠️" : "🛍️"}
            title={failed ? t("topup.skills.loadFailed") : t("topup.skills.empty")}
            hint={failed ? undefined : t("topup.skills.emptyHint")}
          />
          {failed && (
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn btn-sm" type="button" onClick={() => void load()}>
                <RefreshCw size={14} /> {t("common.retry")}
              </button>
            </div>
          )}
        </div>
      )}

      {Boolean(items.length) && (
        <div className="grid grid-2">
          {items.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              buying={buyingId === skill.id}
              using={usingId === skill.id}
              onBuy={() => void buy(skill)}
              onUse={() => void use(skill)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** One compact store row — name, tagline, category and its buy/use action. */
function SkillCard({
  skill,
  buying,
  using,
  onBuy,
  onUse,
}: {
  skill: HubSkill;
  buying: boolean;
  using: boolean;
  onBuy: () => void;
  onUse: () => void;
}) {
  const { t, n } = useI18n();
  const owned = isOwned(skill);
  const free = !skill.priceVnd;
  const comingSoon = skill.state === "coming_soon";

  return (
    <div className="card topup-skill-card">
      <div className="row gap-2">
        <span className="topup-skill-icon">{hubIcon(skill.icon, 18)}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold truncate">{skill.name}</div>
          <div className="tiny faint truncate">{skill.tagline}</div>
        </div>
        <span className="badge">{skill.category}</span>
      </div>

      <div className="row gap-2 mt-2">
        <span className="topup-skill-price">
          {free ? t("topup.skills.free") : t("topup.skills.price", { amount: n(skill.priceVnd) })}
        </span>
        {skill.installed && owned && <span className="badge badge-ok">{t("topup.skills.installedBadge")}</span>}
        {owned && !skill.installed && <span className="badge badge-accent">{t("topup.skills.ownedBadge")}</span>}
        <span className="grow" />
        <SkillAction
          skill={skill}
          owned={owned}
          free={free}
          comingSoon={comingSoon}
          buying={buying}
          using={using}
          onBuy={onBuy}
          onUse={onUse}
        />
      </div>
    </div>
  );
}

function SkillAction({
  skill,
  owned,
  free,
  comingSoon,
  buying,
  using,
  onBuy,
  onUse,
}: {
  skill: HubSkill;
  owned: boolean;
  free: boolean;
  comingSoon: boolean;
  buying: boolean;
  using: boolean;
  onBuy: () => void;
  onUse: () => void;
}) {
  const { t, n } = useI18n();

  if (comingSoon) {
    return (
      <button className="btn btn-sm" type="button" disabled>
        {t("topup.skills.comingSoon")}
      </button>
    );
  }
  if (owned && skill.installed) {
    return (
      <button className="btn btn-sm" type="button" disabled>
        <Check size={13} /> {t("topup.skills.inUse")}
      </button>
    );
  }
  if (owned) {
    return (
      <button className="btn btn-primary btn-sm" type="button" disabled={using} onClick={onUse}>
        {using ? <Loader2 size={13} className="topup-spin" /> : <Check size={13} />}
        {using ? t("topup.skills.using") : t("topup.skills.useNow")}
      </button>
    );
  }
  return (
    <button className="btn btn-primary btn-sm" type="button" disabled={buying} onClick={onBuy}>
      {buying && <Loader2 size={13} className="topup-spin" />}
      {buying
        ? t("topup.skills.buying")
        : free
          ? t("topup.skills.getFree")
          : t("topup.skills.buyWithPrice", { amount: n(skill.priceVnd) })}
    </button>
  );
}
