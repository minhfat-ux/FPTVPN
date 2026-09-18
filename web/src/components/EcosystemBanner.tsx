import { useState } from "react";
import { Download, ExternalLink, Smartphone, X } from "lucide-react";
import { useI18n } from "../i18n";
import {
  BANNER_SNOOZE_MS,
  ECOSYSTEM_APPS,
  bannerSnoozed,
  detectPlatform,
  primaryLink,
  secondaryPlatforms,
  snoozeBanner,
  type EcosystemApp,
  type EcosystemPlatform,
} from "../ecosystem";

/**
 * fBuddy → banner "Cài app hệ sinh thái FlowTech".
 *
 * The pre-login popup only appears once per browser, so signed-in users never saw
 * the download links again. This banner keeps them one tap away inside the app:
 * OS-aware primary button, other builds behind a second link, dismissible with a
 * session-safe snooze (7 days) or permanently.
 */
export function EcosystemBanner() {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(() => bannerSnoozed());
  const [expanded, setExpanded] = useState(false);
  const platform = detectPlatform();

  if (hidden) return null;

  const close = (permanent: boolean) => {
    snoozeBanner(permanent);
    setHidden(true);
  };

  return (
    <div className="eco-banner" role="region" aria-label={t("shell.ecosystem.title")}>
      <img className="eco-mark" src="/brand-mark.png?v=culi2" alt="" width={26} height={26} />
      <div className="eco-text">
        <div className="eco-title">{t("shell.ecosystem.title")}</div>
        <div className="eco-sub">
          {expanded ? t("shell.ecosystem.subExpanded") : t("shell.ecosystem.sub")}
        </div>
      </div>

      <div className="eco-actions">
        {expanded ? (
          ECOSYSTEM_APPS.map((app) => <AppBlock key={app.id} app={app} platform={platform} />)
        ) : (
          <button className="btn btn-sm btn-primary" type="button" onClick={() => setExpanded(true)}>
            <Download size={14} /> {t("shell.ecosystem.showApps")}
          </button>
        )}
        <a
          className="btn btn-sm btn-ghost"
          href="https://meetflowai.site/buy"
          target="_blank"
          rel="noreferrer noopener"
        >
          <ExternalLink size={13} /> {t("shell.ecosystem.allApps")}
        </a>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title={t("shell.ecosystem.dismiss")}
          aria-label={t("shell.ecosystem.dismiss")}
          onClick={() => close(false)}
        >
          <X size={14} />
        </button>
        <button className="eco-never" type="button" onClick={() => close(true)}>
          {t("shell.ecosystem.never")}
        </button>
      </div>
      {/* Keeps the snooze duration discoverable without cluttering the row. */}
      <span className="eco-note tiny faint">{t("shell.ecosystem.snoozeNote", { days: BANNER_SNOOZE_MS / 86400000 })}</span>
    </div>
  );
}

function AppBlock({ app, platform }: { app: EcosystemApp; platform: EcosystemPlatform }) {
  const { t } = useI18n();
  const others = secondaryPlatforms(app, platform).slice(0, 3);
  return (
    <div className="eco-app">
      <img
        className="eco-app-icon"
        src={app.icon}
        alt=""
        width={30}
        height={30}
        loading="lazy"
        onError={(event) => {
          // A broken external icon must not break the layout.
          (event.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <span className="eco-app-body">
        <span className="eco-app-name">
          {app.name} <span className="badge badge-accent">{app.tag}</span>
        </span>
        <span className="tiny muted eco-app-pitch">{t(app.pitchKey)}</span>
      </span>
      <span className="eco-app-links">
        <a className="btn btn-sm btn-primary" href={primaryLink(app, platform)} target="_blank" rel="noreferrer noopener">
          <Download size={13} /> {t(`shell.ecosystem.download.${platform === "other" ? "other" : platform}`)}
        </a>
        <span className="eco-others">
          <Smartphone size={11} />
          {others.map((item) => (
            <a key={item} href={app.links[item]} target="_blank" rel="noreferrer noopener">
              {t(`shell.ecosystem.download.${item}`)}
            </a>
          ))}
        </span>
      </span>
    </div>
  );
}
