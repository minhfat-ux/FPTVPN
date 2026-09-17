import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Brain,
  FileSpreadsheet,
  Image as ImageIcon,
  LogOut,
  MessageSquarePlus,
  Moon,
  MoreHorizontal,
  Pin,
  Presentation,
  Search,
  Settings,
  Shield,
  Sun,
  Table2,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { api, ApiError } from "../api/client";
import { formatRelativeTime, useAuth, useData, useToast } from "../state/store";
import { useChat } from "../state/chat";
import { ConfirmDialog, EmptyState } from "./ui";
import type { Conversation, SkillId } from "../types";

export type View = "chat" | "studio" | "settings";

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
  const { user, logout, meta, theme, toggleTheme } = useAuth();
  const { conversations, reloadConversations, removeConversation } = useData();
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
      push(err instanceof ApiError ? err.message : "Không cập nhật được", "error");
    }
    setMenuFor(null);
  };

  const toggleArchive = async (conversation: Conversation) => {
    try {
      await api.updateConversation(conversation.id, { archived: !conversation.archived });
      if (conversation.id === conversationId) startNewChat();
      await reloadConversations();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không cập nhật được", "error");
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
      push("Đã xoá hội thoại", "success");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Không xoá được", "error");
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
          title="Thêm"
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
            <Pin size={14} /> {conversation.pinned ? "Bỏ ghim" : "Ghim lên đầu"}
          </button>
          <button className="nav-item" onClick={() => toggleArchive(conversation)} type="button">
            <Archive size={14} /> {conversation.archived ? "Bỏ lưu trữ" : "Lưu trữ"}
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setPendingDelete(conversation);
              setMenuFor(null);
            }}
            type="button"
          >
            <Trash2 size={14} /> Xoá hội thoại
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-head">
          <div className="brand grow">
            <span className="brand-mark">
              <img src="/brand-mark.png" alt="FlowTech" />
            </span>
            <span className="brand-text">
              <span className="brand-word">{meta?.appName ?? "FlowGpt"}</span>
              <small>FlowTech · MeetFlow AI</small>
            </span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Đổi sáng/tối" type="button">
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
            <MessageSquarePlus size={16} /> Hội thoại mới
          </button>
        </div>

        <div style={{ padding: "0 12px 8px" }}>
          <div className="row" style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 10, color: "var(--text-faint)" }} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder="Tìm hội thoại…"
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
            <span className="nav-label">Studio: Ảnh · PPT · Excel · Dữ liệu</span>
          </button>
          {user?.isAdmin && (
            <button className={`nav-item${view === "settings" ? " active" : ""}`} onClick={() => onView("settings")} type="button">
              <span className="nav-icon"><Settings size={16} /></span>
              <span className="nav-label">Cài đặt & MCP</span>
            </button>
          )}

          {pinned.length > 0 && <div className="section-title">Đã ghim</div>}
          {pinned.map(renderConversation)}

          <div className="section-title row" style={{ justifyContent: "space-between" }}>
            <span>Hội thoại</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowArchived((value) => !value);
                setQuery("");
                setSearchResults(null);
              }}
              type="button"
            >
              {showArchived ? "Đang xem lưu trữ" : "Lưu trữ"}
            </button>
          </div>

          {!items.length && (
            <EmptyState
              title={query ? "Không tìm thấy hội thoại" : showArchived ? "Chưa có hội thoại lưu trữ" : "Chưa có hội thoại"}
              hint={query ? "Thử từ khoá khác" : "Bắt đầu bằng nút “Hội thoại mới”"}
            />
          )}
          {rest.map(renderConversation)}
        </nav>

        <div className="sidebar-foot">
          <div className="row">
            <div className="msg-avatar" style={{ flex: "0 0 30px", width: 30, height: 30 }}>
              <UserIcon size={15} />
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small bold truncate">{user?.name || user?.email}</div>
              <div className="tiny faint row gap-1">
                {user?.isAdmin ? <Shield size={11} /> : null}
                {user?.isAdmin ? "Quản trị viên" : "Người dùng"}
              </div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => logout()} title="Đăng xuất" type="button">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Xoá hội thoại?"
          message={`Toàn bộ tin nhắn của “${pendingDelete?.title ?? ""}” sẽ bị xoá vĩnh viễn.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          busy={busy}
        />
      </aside>
    </>
  );
}
