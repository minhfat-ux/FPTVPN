import { useEffect, useState } from "react";
import { Menu, PanelRightOpen } from "lucide-react";
import { api, ApiError } from "./api/client";
import { useAuth, useToast } from "./state/store";
import { useChat } from "./state/chat";
import { Sidebar, type View } from "./components/Sidebar";
import { Toaster } from "./components/ui";
import { LoginPage } from "./auth/LoginPage";
import { ChatPage } from "./chat/ChatPage";
import { StudioPage } from "./studio/StudioPage";
import { SettingsPage } from "./settings/SettingsPage";

export function App() {
  const { user, ready, meta, completeLogin } = useAuth();
  const { toasts, dismiss, push } = useToast();
  const { conversation } = useChat();
  const [view, setView] = useState<View>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // A magic link (?email=…&token=…) is redeemed here rather than inside the
  // login form, so it also works when a session is already open (otherwise it
  // silently kept the old account).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkEmail = params.get("email");
    const linkToken = params.get("token");
    if (!linkEmail || !linkToken) return;
    window.history.replaceState({}, "", window.location.pathname);
    api
      .verifyLoginToken(linkEmail, linkToken)
      .then(async (session) => {
        await completeLogin(session);
        push(`Đăng nhập thành công: ${session.user.email}`, "success");
      })
      .catch((err) => {
        push(err instanceof ApiError ? err.message : "Liên kết đăng nhập không hợp lệ", "error");
      });
  }, [completeLogin, push]);

  // Leaving an admin-only view after a role change must not strand the user.
  useEffect(() => {
    if (view === "settings" && user && !user.isAdmin) setView("chat");
  }, [view, user]);

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="row gap-2">
          <span className="spinner" />
          <span className="muted">Đang tải {meta?.appName ?? "FlowGpt"}…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage />
        <Toaster toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  return (
    <div className="app">
      <Sidebar view={view} onView={setView} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở danh sách hội thoại"
            type="button"
          >
            <Menu size={18} />
          </button>
          <div className="grow">
            <div className="topbar-title">
              {view === "chat" ? conversation?.title ?? "Hội thoại mới" : view === "studio" ? "Studio" : "Cài đặt"}
            </div>
            <div className="topbar-sub">
              {view === "chat"
                ? conversation?.model
                  ? `${conversation.skill === "auto" ? "Tự động" : conversation.skill} · ${conversation.model}`
                  : "Chọn kỹ năng và bắt đầu trò chuyện"
                : view === "studio"
                  ? "Sửa ảnh, tạo PPT, Excel và phân tích dữ liệu"
                  : "Nhà cung cấp AI, MCP server và cấu hình hệ thống"}
            </div>
          </div>
          {view !== "studio" && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setView("studio")}
              title="Mở Studio"
              type="button"
            >
              <PanelRightOpen size={16} /> Studio
            </button>
          )}
        </header>

        {view === "chat" && <ChatPage />}
        {view === "studio" && <StudioPage />}
        {view === "settings" && <SettingsPage />}
      </div>

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
