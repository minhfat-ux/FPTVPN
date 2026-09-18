import { config, openrouterKey, openrouterUrl } from "./config.js";
import { audit } from "./db.js";
import { recordUsage } from "./usage.js";

/**
 * `POST /v1/desktop/summary` — tóm tắt biên bản cuộc họp qua OpenRouter.
 *
 * App Windows gửi NGUYÊN body kiểu OpenAI chat-completions (prompt nằm ở client,
 * đó là nghiệp vụ của app), nhưng:
 *  - key nằm ở server, không bao giờ trả ra;
 *  - `model` do server quyết định (client không tự chọn model đắt tiền);
 *  - trần ký tự + trần token để một request lỗi không đốt hết tiền;
 *  - token tiêu thụ được ghi vào `desk_usage` để tính hạn mức.
 */

const MAX_MESSAGES = 40;

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Kiểm tra + rút gọn body chat-completions của client. Trả `{error}` nếu sai. */
export function sanitizeSummaryRequest(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) return { error: "Thiếu `messages` cho yêu cầu tóm tắt." };
  if (messages.length > MAX_MESSAGES) return { error: `Quá nhiều message (tối đa ${MAX_MESSAGES}).` };

  let total = 0;
  const clean = [];
  for (const message of messages) {
    const role = ["system", "user", "assistant"].includes(String(message?.role)) ? String(message.role) : null;
    const content = typeof message?.content === "string" ? message.content : null;
    if (!role || content === null) return { error: "Mỗi message cần `role` hợp lệ và `content` dạng chuỗi." };
    total += content.length;
    clean.push({ role, content });
  }
  if (total > config.maxSummaryChars) {
    return { error: `Nội dung quá dài (${total} ký tự, tối đa ${config.maxSummaryChars}).` };
  }
  return {
    messages: clean,
    temperature: clamp(body?.temperature, 0, 1, 0.2),
    max_tokens: clamp(body?.max_tokens, 1, 8192, 4096),
    wantJson: body?.json !== false && body?.response_format?.type === "json_object",
    chars: total,
  };
}

export async function summarize({
  body,
  userId,
  activationId = null,
  fetchImpl = fetch,
  url = null,
  key = null,
  model = config.openrouterModel,
}) {
  const endpoint = url ?? openrouterUrl();
  const apiKey = key ?? openrouterKey();
  if (!apiKey) {
    return { ok: false, status: 503, code: "provider_not_configured", message: "Backend bản Windows chưa cấu hình key OpenRouter." };
  }
  const parsed = sanitizeSummaryRequest(body);
  if (parsed.error) return { ok: false, status: 400, code: "bad_request", message: parsed.error };

  const payload = {
    model,
    messages: parsed.messages,
    temperature: parsed.temperature,
    max_tokens: parsed.max_tokens,
    stream: false,
  };
  if (parsed.wantJson) payload.response_format = { type: "json_object" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.summaryTimeoutMs);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "MeetFlowAI 2.0 (flowdesk)",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    audit("summary_failed", { userId, activationId, detail: { reason: "network", message: String(err?.message ?? err) } });
    return { ok: false, status: 502, code: "provider_unreachable", message: `Không gọi được nhà cung cấp: ${err?.message ?? err}` };
  }
  clearTimeout(timer);

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text)?.error?.message ?? detail;
    } catch {
      /* giữ nguyên */
    }
    audit("summary_failed", { userId, activationId, detail: { reason: `http_${response.status}`, detail } });
    return { ok: false, status: response.status === 429 ? 429 : 502, code: `provider_http_${response.status}`, message: detail };
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: 502, code: "provider_bad_json", message: "Nhà cung cấp trả về dữ liệu không đọc được." };
  }

  const content = extractContent(json);
  if (!content) {
    return { ok: false, status: 502, code: "provider_empty", message: "Nhà cung cấp không trả nội dung tóm tắt." };
  }

  const tokens = Number(json?.usage?.total_tokens ?? 0) || 0;
  if (tokens > 0 || parsed.chars > 0) {
    recordUsage({ userId, activationId, kind: "summary", tokens, bytes: parsed.chars });
  }
  audit("summary_ok", { userId, activationId, detail: { model: json?.model ?? model, tokens, chars: parsed.chars } });

  return { ok: true, content, model: json?.model ?? model, usage: { tokens, chars: parsed.chars } };
}

/** OpenRouter trả `content` dạng chuỗi hoặc mảng part — chuẩn hoá về chuỗi. */
export function extractContent(json) {
  const message = json?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}
