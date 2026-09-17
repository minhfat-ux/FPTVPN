import { Check, Loader2, ShoppingBag } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useI18n } from "../i18n";
import type { HubSkill } from "../types";
import { hubIcon } from "./icons";
import { bullets, formatBuyLabel, formatInstalls, formatPrice, formatStateBadge, isOwned } from "./hubFormat";

/**
 * The marketplace card and the "what you get" body of its detail modal.
 * Both are pure: the page owns every request and passes the handlers down.
 */

export function HubSkillCard({
  skill,
  buying,
  using,
  onOpen,
  onBuy,
  onUse,
}: {
  skill: HubSkill;
  buying: boolean;
  using: boolean;
  onOpen: () => void;
  onBuy: () => void;
  onUse: () => void;
}) {
  const { t, n } = useI18n();
  const badge = formatStateBadge(skill, t);
  return (
    <div
      className="card hub-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
    >
      <div className="hub-card-top">
        <span className="hub-card-icon">{hubIcon(skill.icon, 20)}</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="hub-card-name">{skill.name}</div>
          <div className="tiny faint">{formatInstalls(skill.installs, t, n)}</div>
        </div>
      </div>
      <div className="hub-card-tagline">{skill.tagline}</div>
      <div className="row row-wrap gap-2">
        <span className="badge">{skill.category}</span>
        {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
        <span className="grow" />
        <span className="hub-card-price">{formatPrice(skill.priceVnd, t, n)}</span>
      </div>
      <div className="hub-card-foot">{renderHubAction(skill, { buying, using, onBuy, onUse })}</div>
    </div>
  );
}

/** The buy / use button. `block` is used by the detail modal footer. */
export function renderHubAction(
  skill: HubSkill,
  {
    buying,
    using,
    onBuy,
    onUse,
    block = false,
  }: { buying: boolean; using: boolean; onBuy: () => void; onUse: () => void; block?: boolean },
) {
  const { t, n } = useI18n();
  const size = block ? 15 : 13;
  if (skill.state === "coming_soon") {
    return (
      <button className={block ? "btn btn-block" : "btn btn-sm"} type="button" disabled>
        {t("hub.card.comingSoon")}
      </button>
    );
  }
  const className = block ? "btn btn-primary btn-block" : "btn btn-primary btn-sm";
  if (isOwned(skill) && !skill.installed) {
    return (
      <button className={className} type="button" disabled={using} onClick={stop(onUse)}>
        {using ? <Loader2 size={size} className="hub-spin" /> : <Check size={size} />}
        {t("hub.card.useNow")}
      </button>
    );
  }
  if (isOwned(skill)) {
    return (
      <button className={block ? "btn btn-block" : "btn btn-sm"} type="button" disabled>
        {t("hub.card.inUse")}
      </button>
    );
  }
  return (
    <button className={className} type="button" disabled={buying} onClick={stop(onBuy)}>
      {buying && <Loader2 size={size} className="hub-spin" />}
      {buying ? t("hub.card.buying") : formatBuyLabel(skill.priceVnd, t, n)}
    </button>
  );
}

/** Card clicks open the detail modal, so an action click must not bubble. */
function stop(handler: () => void) {
  return (event: ReactMouseEvent) => {
    event.stopPropagation();
    handler();
  };
}

/** Body of the detail modal: full description, bullets, pricing note. */
export function HubSkillDetailBody({ skill }: { skill: HubSkill }) {
  const { t } = useI18n();
  const lines = bullets(skill.description);
  const badge = formatStateBadge(skill, t);
  return (
    <div className="stack gap-3">
      <div className="row gap-3">
        <span className="hub-card-icon">{hubIcon(skill.icon, 22)}</span>
        <div className="grow">
          <div className="hub-card-name">{skill.name}</div>
          <div className="small muted">{skill.tagline}</div>
        </div>
        {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
      </div>

      {skill.description && <p className="mb-0">{skill.description}</p>}

      {lines.length > 0 && (
        <div>
          <div className="card-title mb-2">{t("hub.detail.bulletsTitle")}</div>
          <ul className="hub-bullets">
            {lines.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="hub-detail-note">
        <ShoppingBag size={15} />
        <span className="grow small">{t("hub.detail.priceNote")}</span>
      </div>
    </div>
  );
}
