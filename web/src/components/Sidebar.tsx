import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Brain,
  FileSpreadsheet,
  Image as ImageIcon,
  MessageSquarePlus,
  Moon,
  MoreHorizontal,
  Pin,
  Presentation,
  Search,
  Settings,
  Store,
  Sun,
  Table2,
  Trash2,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth, useData, useToast } from "../state/store";
import { IS_CONSOLE } from "../console";
import { useChat } from "../state/chat";
import { useI18n } from "../i18n";
import { ConfirmDialog, EmptyState } from "./ui";
import { CreditsBadge } from "./CreditsBadge";
import { ProfileMenu } from "./ProfileMenu";
import type { Conversation, SkillId } from "../types";

export type View = "chat" | "studio" | "hub" | "topup" | "settings";

const SKILL_ICONS: Record<SkillId, JSX.Element> = {
  auto: <Brain size={15} />,
  chat: <Brain size={15} />,
  image: <ImageIcon size={15} />,
  ppt: <Presentation size={15} />,
  excel: <FileSpreadsheet size={15} />,
  data: <Table2 size={15} />,
};

export function Sidebar({
  view,
  onView,
  open,
  onClose,
}: {
  view: View;
  onView: (view: View) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { user, meta, theme, toggleTheme } = useAuth();
  const { conversations, reloadConversations, removeConversation, formatRelativeTime } = useData();
  const { conversationId, openConversation, startNewChat } = useChat();
  const { push } = useToast();

  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.searchConversations(query.trim());
        // Search results replace the list only while the query is active.
        onSearchResults(result.items);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const onSearchResults = setSearchResults;

  const items = useMemo(() => {
    if (query.trim() && searchResults) return searchResults;
    return conversations.filter((conversation) => conversation.archived === showArchived);
  }, [conversations, query, searchResults, showArchived]);

  const pinned = items.filter((item) => item.pinned);
  const rest = items.filter((item) => !item.pinned);

  const select = async (id: string) => {
    onView("chat");
    await openConversation(id);
    onClose();
  };

  const togglePin = async (conversation: Conversation) => {
    try {
      await api.updateConversation(conversation.id, { pinned: !conversation.pinned });
      await reloadConversations();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("shell.sidebar.updateFailed"), "error");
    }
    setMenuFor(null);
  };

  const toggleArchive = async (conversation: Conversation) => {
    try {
      await api.updateConversation(conversation.id, { archived: !conversation.archived });
      if (conversation.id === conversationId) startNewChat();
      await reloadConversations();
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("shell.sidebar.updateFailed"), "error");
    }
    setMenuFor(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.deleteConversation(pendingDelete.id);
      removeConversation(pendingDelete.id);
      if (pendingDelete.id === conversationId) startNewChat();
      push(t("shell.sidebar.deleted"), "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : t("shell.sidebar.deleteFailed"), "error");
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  };

  const renderConversation = (conversation: Conversation) => (
    <div
      key={conversation.id}
      className={`nav-item conv-item${conversation.id === conversationId && view === "chat" ? " active" : ""}`}
      onClick={() => select(conversation.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === "Enter" && select(conversation.id)}
    >
      <span className="nav-icon">{SKILL_ICONS[conversation.skill] ?? SKILL_ICONS.auto}</span>
      <span className="conv-body">
        <span className="conv-title">{conversation.title}</span>
        <span className="conv-preview">
          {conversation.lastMessagePreview ?? formatRelativeTime(conversation.updatedAt)}
        </span>
      </span>
      <span className="conv-actions">
        <button
          className="btn btn-ghost btn-icon btn-sm"
          title={t("shell.actionMenu")}
          onClick={(event) => {
            event.stopPropagation();
            setMenuFor(menuFor === conversation.id ? null : conversation.id);
          }}
          type="button"
        >
          <MoreHorizontal size={15} />
        </button>
      </span>
      {menuFor === conversation.id && (
        <div className="card" style={{ position: "absolute", right: 8, zIndex: 30, padding: 6, minWidth: 190 }} onClick={(e) => e.stopPropagation()}>
          <button className="nav-item" onClick={() => togglePin(conversation)} type="button">
            <Pin size={14} /> {conversation.pinned ? t("shell.sidebar.unpin") : t("shell.sidebar.pin")}
          </button>
          <button className="nav-item" onClick={() => toggleArchive(conversation)} type="button">
            <Archive size={14} /> {conversation.archived ? t("shell.sidebar.unarchive") : t("shell.sidebar.archive")}
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setPendingDelete(conversation);
              setMenuFor(null);
            }}
            type="button"
          >
            <Trash2 size={14} /> {t("shell.sidebar.deleteConversation")}
          </button>
        </div>
      )}
    </div>
  );

  // Console (console.meetflowai.site) — chỉ là admin panel, không có chat/studio/hub.
  if (IS_CONSOLE) {
    return (
      <>
        {open && <div className="sidebar-backdrop" onClick={onClose} />}
        <aside className={`sidebar${open ? " open" : ""}`}>
          <div className="sidebar-head">
            <div className="brand grow">
              <span className="brand-mark">
                <img src="/brand-mark.png?v=culi2" alt="FlowTech" />
              </span>
              <span className="brand-text">
                <span className="brand-word">{meta?.appName ?? "fBuddy"}</span>
                <small>{t("shell.brandTagline")}</small>
              </span>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title={t("shell.theme.toggle")} type="button">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
          <nav className="sidebar-scroll">
            <button className={`nav-item${view === "settings" ? " active" : ""}`} onClick={() => onView("settings")} type="button">
              <span className="nav-icon"><Settings size={16} /></span>
              <span className="nav-label">{t("shell.sidebar.settings")}</span>
            </button>
          </nav>
          <ProfileMenu onOpenTopup={() => onView("topup")} />
        </aside>
      </>
    );
  }

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-head">
          <div className="brand grow">
            <span className="brand-mark">
              <img src="/brand-mark.png?v=culi2" alt="FlowTech" />
            </span>
            <span className="brand-text">
              <span className="brand-word">{meta?.appName ?? "fBuddy"}</span>
              <small>{t("shell.brandTagline")}</small>
            </span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title={t("shell.theme.toggle")} type="button">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>

        <div className="sidebar-head">
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              startNewChat();
              onView("chat");
              onClose();
            }}
            type="button"
          >
            <MessageSquarePlus size={16} /> {t("shell.sidebar.newChat")}
          </button>
        </div>

        <div style={{ padding: "0 12px 8px" }}>
          <div className="row" style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 10, color: "var(--text-faint)" }} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder={t("shell.sidebar.searchPlaceholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!event.target.value.trim()) setSearchResults(null);
              }}
            />
          </div>
        </div>

        <nav className="sidebar-scroll">
          <button className={`nav-item${view === "studio" ? " active" : ""}`} onClick={() => onView("studio")} type="button">
            <span className="nav-icon"><Presentation size={16} /></span>
            <span className="nav-label">{t("shell.sidebar.studio")}</span>
          </button>
          <button className={`nav-item${view === "hub" ? " active" : ""}`} onClick={() => onView("hub")} type="button">
            <span className="nav-icon"><Store size={16} /></span>
            <span className="nav-label">{t("shell.sidebar.hub")}</span>
          </button>
          <button className={`nav-item${view === "topup" ? " active" : ""}`} onClick={() => onView("topup")} type="button">
            <span className="nav-icon"><Wallet size={16} /></span>
            <span className="nav-label">{t("shell.sidebar.topup")}</span>
          </button>
          {user?.isAdmin && (
            <button className={`nav-item${view === "settings" ? " active" : ""}`} onClick={() => onView("settings")} type="button">
              <span className="nav-icon"><Settings size={16} /></span>
              <span className="nav-label">{t("shell.sidebar.settings")}</span>
            </button>
          )}

          {pinned.length > 0 && <div className="section-title">{t("shell.sidebar.pinned")}</div>}
          {pinned.map(renderConversation)}

          <div className="section-title row" style={{ justifyContent: "space-between" }}>
            <span>{t("shell.sidebar.conversations")}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowArchived((value) => !value);
                setQuery("");
                setSearchResults(null);
              }}
              type="button"
            >
              {showArchived ? t("shell.sidebar.viewingArchived") : t("shell.sidebar.archived")}
            </button>
          </div>

          {!items.length && (
            <EmptyState
              title={
                query
                  ? t("shell.sidebar.empty.search")
                  : showArchived
                    ? t("shell.sidebar.empty.archived")
                    : t("shell.sidebar.empty.none")
              }
              hint={query ? t("shell.sidebar.empty.searchHint") : t("shell.sidebar.empty.noneHint")}
            />
          )}
          {rest.map(renderConversation)}
        </nav>

        <CreditsBadge onOpenTopup={() => onView("topup")} />

        <ProfileMenu onOpenTopup={() => onView("topup")} />

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title={t("shell.sidebar.deleteTitle")}
          message={t("shell.sidebar.deleteMessage", { title: pendingDelete?.title ?? "" })}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          busy={busy}
        />
      </aside>
    </>
  );
}
