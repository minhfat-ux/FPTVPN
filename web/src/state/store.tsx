import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, getToken, setToken, RegisterResult} from "../api/client";
import { useI18n } from "../i18n";
import type { Conversation, Meta, ModelOption, SkillDescriptor, User } from "../types";

// ---------------------------------------------------------------- utilities

export interface Toast {
  id: string;
  kind: "info" | "success" | "error";
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (message: string, kind?: Toast["kind"]) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast phải nằm trong <AppProvider>");
  return ctx;
}

type Theme = "light" | "dark";

interface AuthContextValue {
  user: User | null;
  meta: Meta | null;
  ready: boolean;
  /** Session id of THIS device (used to mark it in the device list). */
  sessionId: string | null;
  /** Conversation this account was last working on — resumes on any device. */
  lastConversationId: string | null;
  setLastConversationId: (id: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  /**
   * Đăng ký tài khoản. Trả về kết quả thô: khi tài khoản phải XÁC THỰC EMAIL thì server không
   * trả token (kết quả có `pendingVerification`) và người gọi phải mở bước nhập mã kích hoạt.
   */
  register: (email: string, password: string, name?: string) => Promise<RegisterResult>;
  /** Adopts the session returned by any login flow (email token, SSO later). */
  completeLogin: (session: { user: User; token: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMeta: () => Promise<void>;
  theme: Theme;
  toggleTheme: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong <AppProvider>");
  return ctx;
}

interface DataContextValue {
  conversations: Conversation[];
  models: ModelOption[];
  /** Installed skills, in the user's order — the quick dropdown shows these. */
  skills: SkillDescriptor[];
  /** Everything that exists, including what the skill marketplace will add. */
  skillCatalog: SkillDescriptor[];
  maxSelectableSkills: number;
  loadingConversations: boolean;
  reloadConversations: () => Promise<void>;
  reloadModels: () => Promise<void>;
  reloadSkills: () => Promise<void>;
  /** "3 phút trước" / "3 minutes ago" — locale-aware conversation timestamps. */
  formatRelativeTime: (iso: string) => string;
  /** Adopts the list returned after the picker saves, without a round trip. */
  applyInstalledSkills: (items: SkillDescriptor[]) => void;
  upsertConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData phải nằm trong <AppProvider>");
  return ctx;
}

// ------------------------------------------------------------------ provider

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { t, n, d } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastConversationId, setLastConversationId] = useState<string | null>(null);
  // FlowTech Harness is dark-first — that is the default until the user chooses.
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("fbuddy.theme");
    if (stored === "light" || stored === "dark") return stored;
    return "dark";
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [skills, setSkills] = useState<SkillDescriptor[]>([]);
  const [skillCatalog, setSkillCatalog] = useState<SkillDescriptor[]>([]);
  const [maxSelectableSkills, setMaxSelectableSkills] = useState(10);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const push = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fbuddy.theme", theme);
  }, [theme]);

  const refreshMeta = useCallback(async () => {
    try {
      setMeta(await api.meta());
    } catch {
      setMeta(null);
    }
  }, []);

  const reloadConversations = useCallback(async () => {
    if (!getToken()) return;
    setLoadingConversations(true);
    try {
      const result = await api.listConversations();
      setConversations(result.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const reloadModels = useCallback(async () => {
    try {
      setModels((await api.models()).items);
    } catch {
      setModels([]);
    }
  }, []);

  const reloadSkills = useCallback(async () => {
    try {
      const result = await api.skills();
      setSkills(result.items);
      setSkillCatalog(result.catalog ?? result.items);
      setMaxSelectableSkills(result.maxSelectable ?? 10);
    } catch {
      setSkills([]);
      setSkillCatalog([]);
    }
  }, []);

  const applyInstalledSkills = useCallback((items: SkillDescriptor[]) => {
    if (Array.isArray(items) && items.length) setSkills(items);
  }, []);

  // Boot: meta first (login screen needs it), then the session.
  useEffect(() => {
    (async () => {
      await refreshMeta();
      // Luôn thử `me()` kể cả khi máy này CHƯA có token trong localStorage: phiên có thể đang nằm
      // ở cookie dùng chung miền (đăng nhập ở fbuddy.meetflowai.site rồi mở flowgpt.meetflowai.site
      // là vào luôn, không phải đăng nhập lại). Trước đây chỉ gọi khi có token nên link kia hiện ra
      // như khách chưa đăng nhập — chợ kỹ năng yêu cầu đăng nhập nên trông như "mất hết kỹ năng".
      try {
        const result = await api.me();
        setUser(result.user);
        setSessionId(result.sessionId ?? null);
        setLastConversationId(result.lastConversationId ?? null);
      } catch {
        if (getToken()) setToken(null);
        setUser(null);
      }
      setReady(true);
    })();
  }, [refreshMeta]);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setModels([]);
      setSkills([]);
      setSkillCatalog([]);
      return;
    }
    reloadConversations();
    reloadModels();
    reloadSkills();
  }, [user, reloadConversations, reloadModels, reloadSkills]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login({ email, password });
      setToken(result.token);
      setUser(result.user);
      await refreshMeta();
    },
    [refreshMeta],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const result = await api.register({ email, password, name });
      // Chưa xác thực email ⇒ chưa có token ⇒ KHÔNG mở phiên; màn đăng ký tự chuyển sang bước xác thực.
      if (!result.token) return result;
      setToken(result.token);
      setUser(result.user);
      await refreshMeta();
      return result;
    },
    [refreshMeta],
  );

  const completeLogin = useCallback(
    async (session: { user: User; token: string }) => {
      setToken(session.token);
      setUser(session.user);
      await refreshMeta();
    },
    [refreshMeta],
  );

  const logout = useCallback(async () => {
    // Revokes only THIS device's session server-side; other devices stay signed in.
    await api.logout().catch(() => undefined);
    setToken(null);
    setUser(null);
    setSessionId(null);
    setLastConversationId(null);
  }, []);

  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations((current) => {
      const exists = current.some((c) => c.id === conversation.id);
      const next = exists
        ? current.map((c) => (c.id === conversation.id ? conversation : c))
        : [conversation, ...current];
      return next.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    });
  }, []);

  const removeConversation = useCallback((id: string) => {
    setConversations((current) => current.filter((c) => c.id !== id));
  }, []);

  /** Shared by the sidebar list; rebuilt whenever the locale changes. */
  const formatRelativeTime = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "—";
      const minutes = Math.round((Date.now() - date.getTime()) / 60000);
      if (minutes < 1) return t("shell.relative.justNow");
      if (minutes < 60) return t("shell.relative.minutes", { count: n(minutes) });
      const hours = Math.round(minutes / 60);
      if (hours < 24) return t("shell.relative.hours", { count: n(hours) });
      const days = Math.round(hours / 24);
      if (days < 30) return t("shell.relative.days", { count: n(days) });
      return d(date, { dateStyle: "short" });
    },
    [d, n, t],
  );

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      meta,
      ready,
      sessionId,
      lastConversationId,
      setLastConversationId,
      login,
      register,
      completeLogin,
      logout,
      refreshMeta,
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    }),
    [
      user,
      meta,
      ready,
      sessionId,
      lastConversationId,
      login,
      register,
      completeLogin,
      logout,
      refreshMeta,
      theme,
    ],
  );

  const dataValue = useMemo<DataContextValue>(
    () => ({
      conversations,
      models,
      skills,
      skillCatalog,
      maxSelectableSkills,
      loadingConversations,
      reloadConversations,
      reloadModels,
      reloadSkills,
      formatRelativeTime,
      applyInstalledSkills,
      upsertConversation,
      removeConversation,
    }),
    [
      conversations,
      models,
      skills,
      skillCatalog,
      maxSelectableSkills,
      loadingConversations,
      reloadConversations,
      reloadModels,
      reloadSkills,
      formatRelativeTime,
      applyInstalledSkills,
      upsertConversation,
      removeConversation,
    ],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      <AuthContext.Provider value={authValue}>
        <DataContext.Provider value={dataValue}>{children}</DataContext.Provider>
      </AuthContext.Provider>
    </ToastContext.Provider>
  );
}

/** Debounced value helper used by the conversation search box. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<number>();
  useEffect(() => {
    timer.current = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer.current);
  }, [value, delay]);
  return debounced;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

