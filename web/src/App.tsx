import { useEffect, useState } from "react";
import { Menu, PanelRightOpen } from "lucide-react";
import { api, ApiError } from "./api/client";
import { useAuth, useData, useToast } from "./state/store";
import { useChat } from "./state/chat";
import { LocaleSwitcher, useI18n } from "./i18n";
import { Sidebar, type View } from "./components/Sidebar";
import { Toaster } from "./components/ui";
import { LoginPage } from "./auth/LoginPage";
import { ChatPage } from "./chat/ChatPage";
import { StudioPage } from "./studio/StudioPage";
import { SettingsPage } from "./settings/SettingsPage";
import { SkillHubPage } from "./hub/SkillHubPage";
import { TopupPage } from "./topup/TopupPage";

/** Initial view, so the server's `?view=topup` link opens this page directly. */
function initialView(): View {
  try {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "topup" || requested === "hub" || requested === "studio" || requested === "chat") {
      return requested;
    }
  } catch {
    /* ignore */
  }
  return "chat";
}

export function App() {
  const { t } = useI18n();
  const { user, ready, meta, completeLogin } = useAuth();
  const { skills } = useData();
  const { toasts, dismiss, push } = useToast();
  const { conversation } = useChat();
  const [view, setView] = useState<View>(initialView);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Topbar copy per view. Kept in one place so sibling views stay additive.
  const topbar = (() => {
    if (view === "studio") {
      return { title: t("shell.view.studio.title"), subtitle: t("shell.view.studio.subtitle") };
    }
    if (view === "hub") {
      return { title: t("shell.view.hub.title"), subtitle: t("shell.view.hub.subtitle") };
    }
    if (view === "topup") {
      return { title: t("shell.view.topup.title"), subtitle: t("shell.view.topup.subtitle") };
    }
    if (view === "settings") {
      return { title: t("shell.view.settings.title"), subtitle: t("shell.view.settings.subtitle") };
    }
    return {
      title: conversation?.title ?? t("shell.view.chat.newTitle"),
      subtitle: conversation
        ? conversation.skill === "auto"
          ? t("shell.view.chat.auto")
          : t("shell.view.chat.skill", {
              skill: skills.find((skill) => skill.id === conversation.skill)?.label ?? conversation.skill,
            })
        : t("shell.view.chat.pick"),
    };
  })();

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
        push(t("shell.auth.loginSuccess", { email: session.user.email }), "success");
      })
      .catch((err) => {
        push(err instanceof ApiError ? err.message : t("shell.auth.loginFailed"), "error");
      });
  }, [completeLogin, push, t]);

  // Leaving an admin-only view after a role change must not strand the user.
  useEffect(() => {
    if (view === "settings" && user && !user.isAdmin) setView("chat");
  }, [view, user]);

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="row gap-2">
          <span className="spinner" />
          <span className="muted">{t("shell.loadingApp", { app: meta?.appName ?? "FlowGpt" })}</span>
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
            aria-label={t("shell.openConversations")}
            type="button"
          >
            <Menu size={18} />
          </button>
          <div className="grow">
            <div className="topbar-title">{topbar.title}</div>
            <div className="topbar-sub">{topbar.subtitle}</div>
          </div>
          {/* The language switcher lives right next to the Studio shortcut: users
              found it too hidden inside the account menu. */}
          <div className="topbar-locale">
            <LocaleSwitcher compact />
          </div>
          {view !== "studio" && view !== "hub" && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setView("studio")}
              title={t("shell.openStudio")}
              type="button"
            >
              <PanelRightOpen size={16} /> <span className="topbar-btn-label">{t("shell.studio")}</span>
            </button>
          )}
        </header>

        {view === "chat" && <ChatPage onOpenHub={() => setView("hub")} onOpenTopup={() => setView("topup")} />}
        {view === "studio" && <StudioPage />}
        {view === "hub" && <SkillHubPage />}
        {view === "topup" && <TopupPage onOpenHub={() => setView("hub")} />}
        {view === "settings" && <SettingsPage />}
      </div>

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
