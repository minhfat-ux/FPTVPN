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

/**
 * One signed-in device. Several can exist for the same account at once:
 * signing in on the phone never signs the laptop out, and either can be revoked.
 */
export interface AuthSession {
  id: string;
  label: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  /** True for the device making the request. */
  current: boolean;
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
  /** Options the user can tap (e.g. what to put into the Excel built from a photo). */
  choices?: Choice[];
}

/** One tappable option attached to an assistant turn. */
export interface Choice {
  id: string;
  label: string;
  hint?: string;
  /** Sent as the next user message when tapped. */
  value: string;
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
  choices?: Choice[];
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
  voiceEnabled: boolean;
  // --- credits ---
  creditsEnabled: boolean;
  signupCredits: number;
  creditsPerToken: number;
  /** Selling price of one credit in VND (packages derive from it). */
  vndPerCredit: number;
  creditBuyUrl: string;
  promoReminderMinutes: number;
  promoCreditSnoozeMinutes: number;
  /** Packages on the top-up page; `priceVnd: null` = derive from vndPerCredit. */
  topupPackages?: TopupPackageSetting[];
  /** Public model names (vendor ids stay internal). */
  modelAliases: Record<string, string>;
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
  /** Public fBuddy name shown in the picker (never the vendor's model id). */
  label?: string;
  isDefault: boolean;
  hasKey?: boolean;
  isAppDefaultProvider?: boolean;
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
  /** Present when the server advertises the credit policy on the public meta. */
  credits?: { signupCredits?: number };
  /** Master switch giọng nói (ẩn mic + chế độ nói khi false). */
  voice?: { enabled?: boolean };
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
  | { event: "notice"; data: { message: string } }
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
  /** Options to render under the answer (e.g. confirm the plan for a file). */
  choices?: Choice[];
  /** Set when the turn was metered: how much it cost and the new balance. */
  credits?: { cost: number; balance: number } | null;
}

// ------------------------------------------------------------------ credits

export interface CreditLedgerEntry {
  id: string;
  delta: number;
  reason: string;
  ref: string | null;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
}

export interface CreditSummary {
  enabled: boolean;
  balance: number;
  granted: number;
  spent: number;
  entries: number;
  /** Credits charged per token (1 = one credit per token, input + output). */
  perToken: number;
  averageCostPerTurn: number;
  estimatedTurnsLeft: number | null;
  buyUrl: string;
  recent: CreditLedgerEntry[];
}

/** A skill sold in the Skill Hub (prompt pack, priced in VND). */
export interface HubSkill {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  /** Money price in VND — the stored, authoritative price of the skill. */
  priceVnd: number;
  /** Same price in credits at today's credit price (derived server-side). */
  price: number;
  state: "published" | "coming_soon" | "hidden";
  installs: number;
  sortOrder?: number;
  owned: boolean;
  installed: boolean;
  createdAt: string;
  /** Admin-only (`GET /api/admin/hub`): the stored prompt pack, for prefilling the edit form. */
  instructions?: string;
  tools?: string[];
}

export interface HubPurchaseResult {
  skill: HubSkill;
  balance: number;
  alreadyOwned: boolean;
  installed: boolean;
  pricePaid: number;
  pricePaidVnd: number;
}

/** Một kết quả tìm trên Tencent SkillHub (rút gọn các trường cần cho UI). */
export interface SkillHubSearchItem {
  slug: string;
  name?: string;
  displayName?: string;
  category?: string;
  version?: string;
  downloads?: number;
  description?: string;
  description_zh?: string;
  labels?: Record<string, string> | null;
}

/** Bản nháp ghép từ SkillHub sang định dạng chợ kỹ năng (kèm cảnh báo). */
export interface SkillHubDraft {
  slug: string;
  skillhubSlug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  priceVnd: number;
  state: HubSkill["state"];
  instructions: string;
  instructionsTruncated: boolean;
  originalLength: number;
  version: string | null;
  tools: string[];
  warnings: string[];
  needsApiKey: boolean;
  downloads: number;
}

export interface SkillHubImportResult {
  skill: HubSkill;
  updated: boolean;
  warnings: string[];
  source: { slug: string; version: string | null };
}

export interface HubListing {
  items: HubSkill[];
  categories: string[];
  balance: number;
  currency: string;
  ownedCount: number;
}

// -------------------------------------------------------------------- top-up

/** A token package the user can buy by bank transfer. */
export interface TopupPackage {
  id: string;
  name: string;
  tokens: number;
  bonusTokens: number;
  totalTokens: number;
  priceVnd: number;
  /** `package` when the price is set on the tier, `vndPerCredit` when derived. */
  priceSource?: "package" | "vndPerCredit";
  vndPerCredit?: number;
  note: string | null;
}

/** One tier as stored in app settings (admin editor). `priceVnd: null` = auto. */
export interface TopupPackageSetting {
  id: string;
  name: string;
  tokens: number;
  bonusTokens: number;
  priceVnd: number | null;
  note?: string | null;
}

/** The owner's receiving bank account (public fields only). */
export interface BankInfo {
  bankId: string;
  account: string;
  accountName: string;
  notePrefix: string;
}

export interface TopupOrder {
  id: string;
  userId: string;
  email: string | null;
  packageId: string | null;
  packageName: string;
  tokens: number;
  amountVnd: number;
  transferNote: string;
  status: "pending" | "awaiting_confirmation" | "paid" | "cancelled";
  paidAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  qrUrl: string | null;
  bank: BankInfo;
}

export interface TopupListing {
  packages: TopupPackage[];
  bank: BankInfo | null;
  orders: TopupOrder[];
  balance: number;
  credits: CreditSummary;
}

/** A user asking the owner for more tokens; the owner approves in Telegram or in Settings. */
export interface CreditRequest {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  amount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  grantedAmount: number | null;
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
  /** Machine code of the last error (e.g. `insufficient_credits`). */
  errorCode?: string | null;
  /** Mid-turn explanation, e.g. the provider was swapped because it ran out of credit. */
  notice?: string | null;
  /** Options the server wants the user to choose from (e.g. confirm the file plan). */
  choices?: Choice[];
  done: boolean;
  providerName?: string;
  model?: string;
}
