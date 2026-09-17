import { useState } from "react";
import { Bot, Mic, Server, SlidersHorizontal, Users } from "lucide-react";
import { ProvidersTab } from "./ProvidersTab";
import { McpTab } from "./McpTab";
import { AppTab } from "./AppTab";
import { UsersTab } from "./UsersTab";
import { VoiceTab } from "./VoiceTab";
import "./settings.css";

type TabId = "providers" | "mcp" | "app" | "users" | "voice";

const TABS: { id: TabId; label: string; icon: typeof Bot }[] = [
  { id: "providers", label: "Nhà cung cấp AI", icon: Bot },
  { id: "mcp", label: "MCP server", icon: Server },
  { id: "app", label: "Hệ thống", icon: SlidersHorizontal },
  { id: "users", label: "Người dùng", icon: Users },
  { id: "voice", label: "Giọng nói", icon: Mic },
];

/**
 * Admin console. Every tab loads its own data the first time it is opened so
 * a slow provider test or MCP refresh never blocks the rest of the page.
 */
export function SettingsPage() {
  const [tab, setTab] = useState<TabId>("providers");

  return (
    <div className="page">
      <div className="page-inner settings-page">
        <div className="settings-head">
          <img src="/brand-mark.png" alt="" />
          <div>
            <div className="settings-title">Cài đặt hệ thống</div>
            <div className="card-desc">
              Nhà cung cấp AI, MCP server và cấu hình dùng chung — chỉ quản trị viên truy cập được.
            </div>
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
                {label}
              </span>
            </button>
          ))}
        </div>

        {tab === "providers" && <ProvidersTab />}
        {tab === "mcp" && <McpTab />}
        {tab === "app" && <AppTab />}
        {tab === "users" && <UsersTab />}
        {tab === "voice" && <VoiceTab />}
      </div>
    </div>
  );
}
