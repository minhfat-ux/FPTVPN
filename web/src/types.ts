/** Shared types — mirror of docs/API_CONTRACT.md. */

export type Role = "admin" | "user";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isAdmin: boolean;
  createdAt: string;
}

export type SkillId = "auto" | "chat" | "image" | "ppt" | "excel" | "data";

export interface SkillDescriptor {
  id: Exclude<SkillId, "auto"> | string;
  label: string;
  icon: string;
  description: string;
  starterPrompts: string[];
  /** Where the skill came from — built-ins today, the marketplace later. */
  category?: string;
  state?: "ready" | "coming_soon";
  builtin?: boolean;
}

export interface SkillCatalogResponse {
  /** Installed skills, in the user's order — this is the quick dropdown. */
  items: SkillDescriptor[];
  installed: string[];
  /** Everything that exists, including entries the marketplace will sell later. */
  catalog: SkillDescriptor[];
  maxSelectable: number;
  tools: { name: string; label: string; skill: string; description: string }[];
}

export interface FileRef {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "document" | "data" | "text" | "pdf" | "pptx" | "xlsx" | string;
  origin?: string;
  createdAt?: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export type Artifact = FileRef;

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  source: "builtin" | "mcp" | "unknown";
  serverId?: string;
}

export interface ToolResult {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
  data: Record<string, any>;
  artifacts: Artifact[];
  error: string | null;
  durationMs?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments?: FileRef[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  artifacts?: Artifact[];
  providerId?: string | null;
  model?: string | null;
  usage?: { in: number; out: number } | null;
  error?: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  skill: SkillId;
  providerId: string | null;
  model: string | null;
  pinned: boolean;
  archived: boolean;
  messageCount: number;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProviderKind = "openai" | "anthropic" | "gemini" | "openai-compatible" | "mock";

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string | null;
  models: string[];
  defaultModel: string | null;
  imageModel: string | null;
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  supportsImages: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderKindInfo {
  id: ProviderKind;
  label: string;
  defaultBaseUrl: string | null;
  suggestedModels: string[];
  defaultImageModel: string | null;
  supportsImages: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  keyHint: string;
}

export interface SecretEntry {
  key: string;
  hasValue: boolean;
  preview: string | null;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServer {
  id: string;
  name: string;
  slug: string;
  transport: "stdio" | "http" | "sse";
  command: string | null;
  args: string[];
  url: string | null;
  env: SecretEntry[];
  headers: SecretEntry[];
  enabled: boolean;
  autoApprove: boolean;
  timeoutMs: number;
  status: "connected" | "error" | "disabled" | "unknown";
  toolCount: number;
  tools: McpTool[];
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualifiedTool extends McpTool {
  serverId: string;
  serverName: string;
  serverSlug: string;
  qualifiedName: string;
}

export interface AppSettings {
  systemPrompt: string;
  defaultProviderId: string | null;
  defaultModel: string | null;
  defaultSkill: SkillId;
  maxToolIterations: number;
  maxUploadMb: number;
  allowSignup: boolean;
  appName: string;
  imageModel: string | null;
  // --- login by emailed token ---
  loginTokenTtlMin: number;
  passwordLoginEnabled: boolean;
  autoCreateUserOnLogin: boolean;
  showLoginCodeWhenNoMailer: boolean;
  mailerFrom: string;
  mailerFromName: string;
  /** Read-only: whether a Resend key is stored (never the key itself). */
  hasResendKey?: boolean;
  resendKeyPreview?: string | null;
  // --- voice ---
  voiceSttProviderId: string | null;
  voiceSttModel: string | null;
  voiceTtsProviderId: string | null;
  voiceTtsModel: string | null;
  voiceTtsVoice: string | null;
  voiceLanguage: string;
  voiceAutoRead: boolean;
  voiceSpeakRate: number;
}

export interface MailerStatus {
  configured: boolean;
  provider: string | null;
  from: string | null;
  fromName: string | null;
}

export interface ModelOption {
  providerId: string;
  providerName: string;
  kind: ProviderKind;
  model: string;
  isDefault: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsImages: boolean;
}

// ------------------------------------------------------------------- voice

/** One half of the voice pipeline: browser APIs by default, provider if set. */
export interface VoiceEndpointConfig {
  mode: "browser" | "server";
  providerId: string | null;
  providerName: string | null;
  model: string | null;
  voice?: string | null;
}

export interface VoiceProviderOption {
  id: string;
  name: string;
  kind: ProviderKind;
  models: string[];
  supportsStt: boolean;
  supportsTts: boolean;
  defaultSttModel: string | null;
  defaultTtsModel: string | null;
  defaultTtsVoice: string | null;
}

export interface VoiceConfig {
  language: string;
  autoRead: boolean;
  speakRate: number;
  stt: VoiceEndpointConfig;
  tts: VoiceEndpointConfig;
  options: VoiceProviderOption[];
}

export interface VoiceConfigResponse {
  config: VoiceConfig;
  browserHint: string;
}

export interface VoiceTranscript {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
}

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface Meta {
  appName: string;
  version: string;
  allowSignup: boolean;
  firstUserIsAdmin: boolean;
  hasProvider: boolean;
  hasUsers: boolean;
  authMethods?: {
    emailToken: boolean;
    password: boolean;
    /** Firebase / Facebook SSO are wired but disabled for now. */
    sso: { firebase: boolean; facebook: boolean };
  };
  mailer?: MailerStatus;
  loginTokenTtlMin?: number;
}

export interface ChartPoint {
  x: string | number;
  y: number;
}

export interface ChartSpec {
  type: "bar" | "line" | "pie" | "scatter" | "area";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  series: { name: string; points: ChartPoint[] }[];
}

export interface DataTable {
  name: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
  note?: string;
}

export interface AnalysisPayload {
  file: { id: string; name: string };
  rowCount: number;
  columnCount: number;
  truncated: boolean;
  columns: string[];
  tables: DataTable[];
  chart: ChartSpec | null;
  notes: string[];
}

/** SSE events emitted by POST /api/chat/stream. */
export type ChatEvent =
  | { event: "start"; data: StartEvent }
  | { event: "status"; data: { stage: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "reasoning"; data: { text: string } }
  | { event: "tool_call"; data: ToolCall }
  | { event: "tool_result"; data: ToolResult }
  | { event: "artifact"; data: Artifact }
  | { event: "usage"; data: { in: number; out: number } }
  | { event: "done"; data: DoneEvent }
  | { event: "error"; data: { code: string; message: string } };

export interface StartEvent {
  conversationId: string;
  messageId: string | null;
  userMessageId: string;
  userMessage: Message;
  conversation: Conversation;
  providerId: string;
  providerName: string;
  model: string;
  skill: SkillId;
  title: string;
  /** Set when the configured default provider was skipped (e.g. missing API key). */
  notice?: string | null;
}

export interface DoneEvent {
  messageId: string;
  finishReason: string;
  iterations: number;
  durationMs?: number;
  usage?: { in: number; out: number } | null;
  artifacts?: Artifact[];
}

/** Live assistant turn rendered while the stream is open. */
export interface StreamingTurn {
  conversationId: string;
  messageId: string | null;
  userMessage: Message;
  content: string;
  reasoning: string;
  status: string | null;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  artifacts: Artifact[];
  usage: { in: number; out: number } | null;
  error: string | null;
  done: boolean;
  providerName?: string;
  model?: string;
}
