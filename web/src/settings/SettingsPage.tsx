import { useState } from "react";
import { Bot, Mic, Server, SlidersHorizontal, Store, Users } from "lucide-react";
import { ProvidersTab } from "./ProvidersTab";
import { McpTab } from "./McpTab";
import { AppTab } from "./AppTab";
import { UsersTab } from "./UsersTab";
import { VoiceTab } from "./VoiceTab";
import { HubAdminPanel } from "../hub/HubAdminPanel";
import { useI18n } from "../i18n";
import "./settings.css";

type TabId = "providers" | "mcp" | "app" | "users" | "voice" | "hub";

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: "providers", label: "settings.page.tabProviders", icon: Bot },
  { id: "mcp", label: "settings.page.tabMcp", icon: Server },
  { id: "app", label: "settings.page.tabApp", icon: SlidersHorizontal },
  { id: "users", label: "settings.page.tabUsers", icon: Users },
  { id: "voice", label: "settings.page.tabVoice", icon: Mic },
  { id: "hub", label: "settings.page.tabHub", icon: Store },
];

/**
 * Admin console. Every tab loads its own data the first time it is opened so
 * a slow provider test or MCP refresh never blocks the rest of the page.
 */
export function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("providers");

  return (
    <div className="page">
      <div className="page-inner settings-page">
        <div className="settings-head">
          <img src="/brand-mark.png?v=culi2" alt="" />
          <div>
            <div className="settings-title">{t("settings.page.title")}</div>
            <div className="card-desc">{t("settings.page.subtitle")}</div>
          </div>
        </div>

        <div className="tabs" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`tab${tab === id ? " active" : ""}`}
              role="tab"
              aria-selected={tab === id}
              type="button"
              onClick={() => setTab(id)}
            >
              <span className="row gap-2">
                <Icon size={15} />
                {t(label)}
              </span>
            </button>
          ))}
        </div>

        {tab === "providers" && <ProvidersTab />}
        {tab === "mcp" && <McpTab />}
        {tab === "app" && <AppTab />}
        {tab === "users" && <UsersTab />}
        {tab === "voice" && <VoiceTab />}
        {tab === "hub" && <HubAdminPanel />}
      </div>
    </div>
  );
}
