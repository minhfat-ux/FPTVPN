/**
 * Ngôn ngữ giao diện đang chọn, để API trả tên/mô tả kỹ năng đúng thứ tiếng.
 * `I18nProvider` gọi `setApiLang()` mỗi khi người dùng đổi ngôn ngữ.
 */
let apiLang = "vi";
export function setApiLang(lang: string) {
  apiLang = ["vi", "en", "zh"].includes(lang) ? lang : "vi";
}
export function getApiLang() {
  return apiLang;
}

import type { AnalysisPayload, AppSettings, AuthSession, ChatEvent, Conversation, CreditLedgerEntry, CreditRequest, CreditSummary, FileRef, HubListing, HubPurchaseResult, HubAdminListing, PromoApp, HubSkill, McpServer, Message, Meta, ModelOption, Provider, ProviderKindInfo, QualifiedTool, SkillDescriptor, SkillCatalogResponse, SkillHubDraft, SkillHubImportResult, SkillHubSearchItem, TopupListing, TopupOrder, User, VoiceConfigResponse, VoiceTranscript, TemplateItem } from "../types";

/**
 * Thin, typed wrapper over the fBuddy API (see docs/API_CONTRACT.md).
 * The token is kept in localStorage and also sent as a Bearer header so the
 * app works both behind the cookie and in the Vite dev server.
 */

const TOKEN_KEY = "fbuddy.token";
const BASE = "/api";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "internal_error", status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const error = json?.error ?? {};
    throw new ApiError(
      error.message ?? `Lỗi ${response.status}`,
      error.code ?? "internal_error",
      response.status,
    );
  }
  return json as T;
}

export const api = {
  // ---- meta
  meta: () => request<Meta>("GET", "/meta"),
  health: () => request<{ ok: boolean; version: string; uptimeSec: number }>("GET", "/health"),

  // ---- auth
  register: (body: { email: string; password: string; name?: string }) =>
    request<{ user: User; token: string }>("POST", "/auth/register", body),
  login: (body: { email: string; password: string }) =>
    request<{ user: User; token: string }>("POST", "/auth/login", body),
  /** Passwordless login step 1 — emails a one-time code (and a magic link). */
  requestLoginToken: (email: string) =>
    request<{
      ok: boolean;
      delivered: boolean;
      created: boolean;
      expiresInMin: number;
      mailerConfigured: boolean;
      message?: string;
      /** Present only while no mailer is configured (fresh install escape hatch). */
      devCode?: string;
      devLink?: string;
    }>("POST", "/auth/request-token", { email }),
  /** Passwordless login step 2 — redeems the code or the magic-link token. */
  verifyLoginToken: (email: string, token: string) =>
    request<{ user: User; token: string }>("POST", "/auth/verify-token", { email, token }),
  logout: () => request<{ ok: boolean }>("POST", "/auth/logout", {}),
  me: () =>
    request<{ user: User; sessionId?: string | null; lastConversationId?: string | null }>("GET", "/auth/me"),
  /** Signed-in devices for this account (several can be active at once). */
  sessions: () => request<{ items: AuthSession[] }>("GET", "/auth/sessions"),
  revokeSession: (id: string) =>
    request<{ ok: boolean; current: boolean; revoked: boolean }>("DELETE", `/auth/sessions/${id}`),
  revokeOtherSessions: () =>
    request<{ ok: boolean; revoked: number; items: AuthSession[] }>("POST", "/auth/sessions/revoke-others", {}),
  updateMe: (body: { name?: string; locale?: string; currentPassword?: string; password?: string }) =>
    request<{ user: User }>("PATCH", "/auth/me", body),
  testMailer: (body: { to: string }) =>
    request<{ ok: boolean; message: string }>("POST", "/settings/mailer/test", body),

  // ---- voice
  voiceConfig: () => request<VoiceConfigResponse>("GET", "/voice/config"),
  /** Server-side speech-to-text (only used when the config says mode === "server"). */
  transcribeAudio: async (blob: Blob, options: { language?: string; hint?: string } = {}) => {
    const form = new FormData();
    form.append("audio", blob, `speech.${(blob.type || "audio/webm").includes("wav") ? "wav" : "webm"}`);
    if (options.language) form.append("language", options.language);
    if (options.hint) form.append("hint", options.hint);
    const token = getToken();
    const response = await fetch(`${BASE}/voice/transcribe`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(json?.error?.message ?? "Nhận dạng giọng nói thất bại", json?.error?.code, response.status);
    }
    return json as VoiceTranscript;
  },
  /** Server-side text-to-speech; returns playable audio (wav/mp3). */
  speakText: async (text: string, voice?: string | null): Promise<Blob> => {
    const token = getToken();
    const response = await fetch(`${BASE}/voice/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, voice: voice ?? undefined }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      throw new ApiError(json?.error?.message ?? "Đọc văn bản thất bại", json?.error?.code, response.status);
    }
    return response.blob();
  },
  /** Admin: synthesize a sample sentence and report the provider latency. */
  testVoice: async (text?: string) => {
    const token = getToken();
    const response = await fetch(`${BASE}/settings/voice/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const json = await response.json().catch(() => null);
      return { ok: false as const, message: json?.message ?? json?.error?.message ?? "Không đọc được" };
    }
    return {
      ok: true as const,
      blob: await response.blob(),
      provider: decodeURIComponent(response.headers.get("X-Voice-Provider") ?? ""),
      latencyMs: Number(response.headers.get("X-Voice-Latency-Ms") ?? 0),
      message: "Đọc thử thành công",
    };
  },

  // ---- conversations
  listConversations: (archived = false) =>
    request<{ items: Conversation[] }>("GET", `/conversations${archived ? "?archived=1" : ""}`),
  searchConversations: (q: string) =>
    request<{ items: Conversation[] }>("GET", `/conversations/search?q=${encodeURIComponent(q)}`),
  createConversation: (body: Partial<Pick<Conversation, "title" | "skill" | "providerId" | "model">>) =>
    request<{ conversation: Conversation }>("POST", "/conversations", body),
  getConversation: (id: string, since?: string | null) =>
    request<{ conversation: Conversation; messages: Message[]; partial?: boolean }>(
      "GET",
      `/conversations/${id}${since ? `?since=${encodeURIComponent(since)}` : ""}`,
    ),
  /** Remembers this thread for the whole account, so another device resumes it. */
  activateConversation: (id: string) =>
    request<{ ok: boolean; lastConversationId: string | null }>("POST", `/conversations/${id}/active`, {}),
  clearActiveConversation: () =>
    request<{ ok: boolean; lastConversationId: null }>("DELETE", "/conversations/active"),
  updateConversation: (id: string, body: Partial<Conversation>) =>
    request<{ conversation: Conversation }>("PATCH", `/conversations/${id}`, body),
  deleteConversation: (id: string) => request<{ ok: boolean }>("DELETE", `/conversations/${id}`),
  duplicateConversation: (id: string) =>
    request<{ conversation: Conversation }>("POST", `/conversations/${id}/duplicate`, {}),

  // ---- files
  upload: async (file: File, conversationId?: string | null): Promise<{ file: FileRef }> => {
    const form = new FormData();
    form.append("file", file);
    if (conversationId) form.append("conversationId", conversationId);
    const token = getToken();
    const response = await fetch(`${BASE}/files`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(json?.error?.message ?? "Tải tệp thất bại", json?.error?.code, response.status);
    }
    return json;
  },
  /** Uploads a canvas Blob (Image Studio export) as a new artifact. */
  uploadBlob: async (blob: Blob, name: string, conversationId?: string | null) => {
    const file = new File([blob], name, { type: blob.type || "image/png" });
    return api.upload(file, conversationId);
  },
  listArtifacts: () => request<{ items: FileRef[] }>("GET", "/artifacts"),
  deleteFile: (id: string) => request<{ ok: boolean }>("DELETE", `/files/${id}`),
  fileUrl: (id: string, inline = false) => `${BASE}/files/${id}/content${inline ? "?inline=1" : ""}`,
  async fetchFileBlob(id: string): Promise<Blob> {
    const token = getToken();
    const response = await fetch(api.fileUrl(id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new ApiError("Không tải được tệp", "not_found", response.status);
    return response.blob();
  },

  // ---- skills & models
  skills: () => request<SkillCatalogResponse>("GET", `/skills?lang=${apiLang}`),
  /** Saves the user's quick-list (the "Thêm kỹ năng" picker / future marketplace). */
  setInstalledSkills: (ids: string[]) =>
    request<{ installed: string[]; items: SkillDescriptor[] }>("PUT", "/skills/installed", { ids }),
  models: () => request<{ items: ModelOption[] }>("GET", "/models"),

  // ---- settings (admin)
  appSettings: () => request<{ settings: AppSettings; defaults: AppSettings }>("GET", "/settings/app"),
  saveAppSettings: (settings: Partial<AppSettings>) =>
    request<{ settings: AppSettings }>("PUT", "/settings/app", { settings }),
  providerKinds: () => request<{ items: ProviderKindInfo[] }>("GET", "/settings/provider-kinds"),
  providers: () => request<{ items: Provider[] }>("GET", "/settings/providers"),
  createProvider: (body: Record<string, unknown>) =>
    request<{ provider: Provider }>("POST", "/settings/providers", body),
  updateProvider: (id: string, body: Record<string, unknown>) =>
    request<{ provider: Provider }>("PATCH", `/settings/providers/${id}`, body),
  deleteProvider: (id: string) => request<{ ok: boolean }>("DELETE", `/settings/providers/${id}`),
  testProvider: (id: string, body: { model?: string; listModels?: boolean } = {}) =>
    request<{ ok: boolean; model: string; models?: string[] | null; latencyMs?: number; message: string }>(
      "POST",
      `/settings/providers/${id}/test`,
      body,
    ),

  mcpServers: () => request<{ items: McpServer[] }>("GET", "/settings/mcp"),
  createMcpServer: (body: Record<string, unknown>) =>
    request<{ server: McpServer }>("POST", "/settings/mcp", body),
  updateMcpServer: (id: string, body: Record<string, unknown>) =>
    request<{ server: McpServer }>("PATCH", `/settings/mcp/${id}`, body),
  deleteMcpServer: (id: string) => request<{ ok: boolean }>("DELETE", `/settings/mcp/${id}`),
  testMcpServer: (id: string, override?: Record<string, unknown>) =>
    request<{ ok: boolean; tools: McpServer["tools"]; latencyMs?: number; message: string }>(
      "POST",
      `/settings/mcp/${id}/test`,
      { override },
    ),
  refreshMcpServer: (id: string) =>
    request<{ server: McpServer | null }>("POST", `/settings/mcp/${id}/refresh`, {}),
  mcpTools: () => request<{ items: QualifiedTool[] }>("GET", "/mcp/tools"),

  /** Thư viện mẫu Word/Excel/PPT của người dùng. */
  templates: () => request<{ items: TemplateItem[] }>("GET", "/templates"),
  uploadTemplate: async (file: File, meta: { name?: string; description?: string; shared?: boolean } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (meta.name) form.append("name", meta.name);
    if (meta.description) form.append("description", meta.description);
    if (meta.shared) form.append("shared", "true");
    const token = getToken();
    const response = await fetch(`${BASE}/templates`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(json?.error?.message ?? "Tải mẫu lên thất bại", json?.error?.code, response.status);
    }
    return json as { template: TemplateItem };
  },
  deleteTemplate: (id: string) => request<{ ok: boolean }>("DELETE", `/templates/${id}`),

  adminUsers: () =>
    request<{
      items: (User & {
        conversationCount: number;
        creditBalance: number;
        /** Tổng credit đã tiêu thụ (burn) — cột của console. */
        creditBurned: number;
        creditGranted: number;
        creditEntries: number;
        creditLastAt: string | null;
      })[];
    }>("GET", "/admin/users"),

  // ---- credits
  credits: () => request<{ credits: CreditSummary }>("GET", "/credits"),
  creditLedger: (limit = 30) =>
    request<{ items: CreditLedgerEntry[]; balance: number; credits: CreditSummary }>(
      "GET",
      `/credits/ledger?limit=${limit}`,
    ),
  /** Admin: positive adds credits, negative takes them back. */
  grantCredits: (body: { email?: string; userId?: string; amount: number; note?: string }) =>
    request<{ user: User; balance: number; credits: CreditSummary }>("POST", "/admin/credits", body),

  // ---- asking the owner for more tokens (approved in Telegram or in Settings)
  requestCredits: (body: { amount?: number; note?: string } = {}) =>
    request<{ request: CreditRequest; telegram: { sent: boolean; message?: string } }>(
      "POST",
      "/credits/request",
      body,
    ),
  myCreditRequests: () => request<{ items: CreditRequest[] }>("GET", "/credits/requests"),
  pendingCreditRequests: () => request<{ items: CreditRequest[] }>("GET", "/admin/credit-requests?status=pending"),
  decideCreditRequest: (id: string, body: { approve: boolean; amount?: number; note?: string }) =>
    request<{ request: CreditRequest; balance: number }>("POST", `/admin/credit-requests/${id}/decide`, body),

  // ---- top-up (bank transfer, confirmed by the owner)
  topup: () => request<TopupListing>("GET", "/topup"),
  createTopupOrder: (packageId: string) =>
    request<{ order: TopupOrder; reused: boolean }>("POST", "/topup/orders", { packageId }),
  markTopupTransferred: (orderId: string, bankTxnRef?: string) =>
    request<{ order: TopupOrder; telegram: { sent: boolean; message?: string } }>(
      "POST",
      `/topup/orders/${orderId}/transferred`,
      { bankTxnRef },
    ),
  cancelTopupOrder: (orderId: string) =>
    request<{ order: TopupOrder }>("POST", `/topup/orders/${orderId}/cancel`, {}),
  adminTopupOrders: (status?: string) =>
    request<{ items: TopupOrder[] }>("GET", `/admin/topup-orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  confirmTopupOrder: (id: string, tokens?: number) =>
    request<{ order: TopupOrder; balance: number; alreadyPaid?: boolean }>(
      "POST",
      `/admin/topup-orders/${id}/confirm`,
      { tokens },
    ),

  // ---- skill hub (marketplace, paid with tokens)
  hub: () => request<HubListing>("GET", `/hub?lang=${apiLang}`),
  hubSkill: (id: string) => request<{ skill: HubSkill; balance: number }>("GET", `/hub/${id}?lang=${apiLang}`),
  buyHubSkill: (id: string) => request<HubPurchaseResult>("POST", `/hub/${id}/purchase`, {}),
  adminHub: () => request<HubAdminListing>("GET", `/admin/hub?lang=${apiLang}`),
  /** App khác trong hệ sinh thái — dùng cho popup quảng cáo sau khi đăng nhập. */
  apps: () => request<{ items: PromoApp[] }>("GET", "/apps"),
  createHubSkill: (body: Record<string, unknown>) =>
    request<{ skill: HubSkill }>("POST", "/admin/hub", body),
  updateHubSkill: (id: string, body: Record<string, unknown>) =>
    request<{ skill: HubSkill }>("PATCH", `/admin/hub/${id}`, body),
  deleteHubSkill: (id: string) => request<{ ok: boolean }>("DELETE", `/admin/hub/${id}`),

  // ---- nhập kỹ năng từ Tencent SkillHub. Server làm proxy nên khoá `X-API-Key`
  // không bao giờ ra trình duyệt; server ở vùng IP bị chặn thì API trả 502 kèm
  // hướng dẫn chạy `node ops/skillhub-import.mjs` từ máy có đường sang Trung Quốc.
  /** `freeOnly` = chỉ lấy skill miễn phí (bỏ qua skill phải mua/đòi API key riêng). */
  skillhubSearch: (keyword: string, limit = 12, freeOnly = false) =>
    request<{ total: number; items: SkillHubSearchItem[] }>(
      "GET",
      `/admin/skillhub/search?q=${encodeURIComponent(keyword)}` +
        `&limit=${Math.min(30, Math.max(1, Math.trunc(limit) || 12))}${freeOnly ? "&free=1" : ""}`,
    ),
  skillhubPreview: (slug: string, priceVnd = 0) =>
    request<{ draft: SkillHubDraft }>(
      "GET",
      `/admin/skillhub/preview?slug=${encodeURIComponent(slug)}&priceVnd=${Math.max(0, Math.trunc(priceVnd) || 0)}`,
    ),
  skillhubImport: (body: { slug: string; priceVnd?: number; state?: string; translate?: string[] }) =>
    request<SkillHubImportResult>("POST", "/admin/skillhub/import", body),

  createUser: (body: { email: string; password: string; name?: string; role?: string }) =>
    request<{ user: User }>("POST", "/admin/users", body),
  deleteUser: (id: string) => request<{ ok: boolean }>("DELETE", `/admin/users/${id}`),
  adminStats: () =>
    request<Record<string, number>>("GET", "/admin/stats"),
};

// ------------------------------------------------------------------ chat SSE

export interface ChatRequest {
  content: string;
  conversationId?: string | null;
  attachments?: string[];
  skill?: string;
  providerId?: string | null;
  model?: string | null;
  toolMode?: "auto" | "off" | "required";
  /** Mẫu (thư viện template) dùng cho lượt này. */
  templateId?: string | null;
}

/**
 * Streams one assistant turn. Returns an abort function; events are delivered
 * through the callbacks so the caller can render deltas as they arrive.
 */
export function streamChat(
  body: ChatRequest,
  handlers: {
    onEvent: (event: ChatEvent) => void;
    onError?: (error: ApiError) => void;
    onClose?: () => void;
  },
  signal?: AbortSignal,
): () => void {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal) signal.addEventListener("abort", abort, { once: true });

  (async () => {
    const token = getToken();
    let response: Response;
    try {
      response = await fetch(`${BASE}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError?.(new ApiError((err as Error).message, "network_error", 0));
      }
      handlers.onClose?.();
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      handlers.onError?.(
        new ApiError(parsed?.error?.message ?? `Lỗi ${response.status}`, parsed?.error?.code, response.status),
      );
      handlers.onClose?.();
      return;
    }
    if (!response.body) {
      handlers.onError?.(new ApiError("Máy chủ không trả về stream", "stream_error", 500));
      handlers.onClose?.();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf("\n\n");
        while (index !== -1) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const parsed = parseSseBlock(block);
          if (parsed) handlers.onEvent(parsed as ChatEvent);
          index = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError?.(new ApiError((err as Error).message, "stream_error", 0));
      }
    } finally {
      handlers.onClose?.();
    }
  })();

  return abort;
}

function parseSseBlock(block: string): { event: string; data: any } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

export type { AnalysisPayload };
