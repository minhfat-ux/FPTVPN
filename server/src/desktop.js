import crypto from "node:crypto";
import { config } from "./config.js";
import { all, audit } from "./db.js";
import { BRAND_GREEN, sendDesktopActivation } from "./mailer.js";
import { readAppSettings } from "./settings.js";

/**
 * Cầu nối giữa fBuddy và **flowdesk** — backend riêng của bản Windows.
 *
 * fBuddy không tự phát mã kích hoạt: nó gọi service `flowdesk` (port riêng, key
 * riêng, DB riêng) bằng token admin, rồi gửi mã qua email. Nhờ vậy:
 *  - quyền của bản Windows nằm ở một chỗ, thu hồi được;
 *  - app Windows không bao giờ chạm tới key Soniox/OpenRouter;
 *  - flowdesk có thể chết mà web fBuddy vẫn chạy bình thường (mọi lời gọi ở đây
 *    đều có timeout và không bao giờ ném ra đường xác nhận thanh toán).
 *
 * Cấu hình (env, không lưu vào DB vì đây là bí mật hạ tầng):
 *   FBUDDY_DESK_URL          mặc định http://127.0.0.1:7791
 *   FBUDDY_DESK_ADMIN_TOKEN  phải trùng DESK_ADMIN_TOKEN của flowdesk
 */

export const WINDOWS_DOWNLOAD_URL = "https://meetflowai.site/dl/MeetFlowAI-Overlay-latest-win-x64.zip";
export const DESKTOP_GUIDE_URL = "https://meetflowai.site/#products";

const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DESK_TIMEOUT_MS = 5000;

export function deskSettings() {
  const url = String(process.env.FBUDDY_DESK_URL ?? "http://127.0.0.1:7791").trim().replace(/\/+$/, "");
  const adminToken = String(process.env.FBUDDY_DESK_ADMIN_TOKEN ?? "").trim();
  return { url, adminToken, configured: Boolean(url && adminToken) };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function deskFetch(path, { method = "GET", body = null, timeoutMs = DESK_TIMEOUT_MS } = {}) {
  const { url, adminToken } = deskSettings();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-desk-admin-token": adminToken,
      },
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, ok: response.ok, json: safeJson(text), text };
  } finally {
    clearTimeout(timer);
  }
}

/** Sống/chết của flowdesk — dùng cho trang trạng thái và để chẩn đoán nhanh. */
export async function deskHealth() {
  const settings = deskSettings();
  if (!settings.configured) {
    return { configured: false, healthy: false, error: "Chưa cấu hình FBUDDY_DESK_URL / FBUDDY_DESK_ADMIN_TOKEN" };
  }
  try {
    const response = await fetch(`${settings.url}/v1/desktop/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const json = safeJson(await response.text());
    return { configured: true, healthy: response.ok && json?.ok === true, status: response.status, detail: json ?? null };
  } catch (err) {
    return { configured: true, healthy: false, error: String(err?.message ?? err) };
  }
}

/**
 * Nhờ flowdesk phát (hoặc xoay) mã cho một user. Mã gốc CHỈ có ở đây một lần —
 * phải gửi email ngay, không lưu lại, không ghi log.
 */
export async function issueDesktopCode({ userId, email = null, orderId = null, reason = "issued" }) {
  const settings = deskSettings();
  if (!settings.configured) {
    return {
      ok: false,
      error: "desk_not_configured",
      message: "Chưa cấu hình backend bản Windows (FBUDDY_DESK_URL / FBUDDY_DESK_ADMIN_TOKEN).",
    };
  }
  try {
    const response = await deskFetch("/v1/desktop/invitations", {
      method: "POST",
      body: { userId, email, orderId, reason },
    });
    if (!response.ok || !response.json?.code) {
      return {
        ok: false,
        error: `desk_${response.status}`,
        message: response.json?.error ?? "Backend bản Windows từ chối phát mã.",
        code_detail: response.json?.code ?? null,
      };
    }
    return { ok: true, code: response.json.code, invitation: response.json.invitation, order: response.json.order ?? null };
  } catch (err) {
    return { ok: false, error: "desk_unreachable", message: `Không gọi được backend bản Windows: ${err?.message ?? err}` };
  }
}

export async function listDesktopActivations({ userId }) {
  const settings = deskSettings();
  if (!settings.configured) return { ok: false, error: "desk_not_configured", activations: [] };
  try {
    const response = await deskFetch(`/v1/desktop/activations?userId=${encodeURIComponent(userId)}`);
    return { ok: response.ok, activations: response.json?.activations ?? [] };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err), activations: [] };
  }
}

export async function revokeDesktopActivation({ activationId, reason = "admin_revoked" }) {
  const settings = deskSettings();
  if (!settings.configured) return { ok: false, error: "desk_not_configured" };
  try {
    const response = await deskFetch(`/v1/desktop/activations/${encodeURIComponent(activationId)}/revoke`, {
      method: "POST",
      body: { reason },
    });
    return { ok: response.ok, activation: response.json?.activation ?? null, error: response.ok ? null : response.json?.error };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Liên kết ký HMAC để mở trang lấy lại mã **không cần đăng nhập** (gửi kèm email).
 * Neo vào userId + hạn dùng, nên rò email cũng không mở được mã của người khác.
 */
function signActivationLink({ userId, expiresAt }) {
  return crypto
    .createHmac("sha256", `desktop-link:${config.secret}`)
    .update(`${userId}:${expiresAt}`)
    .digest("base64url");
}

export function activationLink(userId) {
  const expiresAt = Date.now() + LINK_TTL_MS;
  const token = `${expiresAt}.${signActivationLink({ userId, expiresAt })}`;
  const base = String(config.publicUrl ?? "").replace(/\/+$/, "");
  return `${base}/api/desktop?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}

export function verifyActivationLink(userId, token) {
  const [expiresAtRaw, signature] = String(token ?? "").split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!userId || !Number.isFinite(expiresAt) || !signature) return { ok: false, reason: "invalid" };
  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };
  const expected = signActivationLink({ userId, expiresAt });
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return { ok: false, reason: "invalid" };
  return { ok: true };
}

/**
 * Phát mã + gửi email. Dùng ở ba chỗ: đơn vừa `paid`, user bấm "lấy mã" trong
 * web, và trang công khai từ email.
 */
export async function issueAndEmailDesktopCode({ user, orderId = null, reason = "issued" }) {
  const issued = await issueDesktopCode({ userId: user.id, email: user.email, orderId, reason });
  if (!issued.ok) {
    audit(user.id, "desktop.code_failed", orderId, { error: issued.error, reason });
    return issued;
  }
  const link = activationLink(user.id);
  const mail = await sendDesktopActivation({
    settings: readAppSettings(),
    to: user.email,
    code: issued.code,
    expiresAt: issued.invitation?.expiresAt ?? null,
    link,
    orderRef: issued.order?.id ?? orderId ?? null,
  });
  audit(user.id, "desktop.code_issued", issued.invitation?.id ?? null, {
    emailed: Boolean(mail?.sent),
    reason,
    orderId: issued.order?.id ?? orderId ?? null,
  });
  return {
    ...issued,
    emailed: Boolean(mail?.sent),
    mailReason: mail?.sent ? null : (mail?.reason ?? mail?.detail ?? "unknown"),
    link,
  };
}

/**
 * Gọi từ luồng xác nhận thanh toán (Telegram / link ký / SePay webhook / SePay poll).
 *
 * CỐ Ý fire-and-forget: cộng credit cho khách không được phép thất bại chỉ vì
 * service bản Windows đang bận. Mọi lỗi chỉ vào log/audit.
 */
export function queueDesktopActivation({ userId, email, orderId = null }) {
  if (!deskSettings().configured) return;
  setImmediate(() => {
    issueAndEmailDesktopCode({ user: { id: userId, email }, orderId, reason: "order_paid" })
      .then((result) => {
        if (result.ok) {
          console.log(
            `[fbuddy] bản Windows: đã phát mã cho ${email ?? userId} (đơn ${orderId ?? "-"}), email=${result.emailed ? "đã gửi" : `chưa gửi (${result.mailReason})`}`,
          );
        } else {
          console.warn(`[fbuddy] bản Windows: chưa phát được mã cho ${email ?? userId} — ${result.message ?? result.error}`);
        }
      })
      .catch((err) => console.warn("[fbuddy] bản Windows: lỗi phát mã:", err?.message ?? err));
  });
}

/** Trạng thái cho trang `?view=desktop`: quyền + thiết bị + backend có sống không. */
export async function desktopStatusFor({ user }) {
  const paid = all("topup_orders", "user_id = ? AND status = 'paid'", [user.id], {
    order: "COALESCE(paid_at, created_at) DESC",
    limit: 1,
  })[0];
  const health = await deskHealth();
  const activations = health.configured ? await listDesktopActivations({ userId: user.id }) : { ok: false, activations: [] };
  return {
    configured: health.configured,
    healthy: health.healthy,
    healthError: health.error ?? null,
    entitled: Boolean(paid),
    paidOrder: paid ? { id: paid.id, paidAt: paid.paid_at ?? null, packageName: paid.package_name ?? null } : null,
    activations: activations.activations ?? [],
    downloadUrl: WINDOWS_DOWNLOAD_URL,
    guideUrl: DESKTOP_GUIDE_URL,
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Nút "lấy mã mới" trên trang công khai. Phải nhúng `u` + `t` dạng hidden: form
 * GET không có field sẽ gửi lại URL **rỗng query**, làm mất liên kết đã ký.
 */
export function reissueFormHtml({ userId, token, label = "Lấy mã kích hoạt" }) {
  return `<form method="get" action="/api/desktop" style="margin-top:22px">
    <input type="hidden" name="u" value="${escapeHtml(userId)}">
    <input type="hidden" name="t" value="${escapeHtml(token)}">
    <input type="hidden" name="action" value="new">
    <div style="font-size:12.5px;color:rgba(255,255,255,.45);margin-bottom:8px">Không thấy mã trong email? Bấm nút dưới — mã mới hiện ra ngay và mã trong email cũ hết hiệu lực.</div>
    <button type="submit" style="background:${BRAND_GREEN};color:#0A1F3B;font-weight:700;border:0;padding:11px 20px;border-radius:10px;cursor:pointer">${escapeHtml(label)}</button>
  </form>`;
}

/** Trang công khai (mở từ email) — không cần đăng nhập, chỉ cần link ký còn hạn. */
export function desktopPageHtml({ ok, title, code = null, detail, link = null, expiresAt = null, reissueForm = "" }) {
  const colour = ok ? "#33C773" : "#f25a5a";
  const codeBlock = code
    ? `<div style="margin:22px 0 8px;padding:18px;border-radius:12px;background:#123052;text-align:center">
         <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:8px">Mã kích hoạt</div>
         <div style="font-family:Consolas,Menlo,monospace;font-size:26px;font-weight:700;letter-spacing:.14em;color:${colour}">${code}</div>
       </div>
       <div style="font-size:13px;color:rgba(255,255,255,.6)">Nhập mã này vào app MeetFlow AI trên Windows. ${
         expiresAt ? `Mã có hiệu lực đến ${new Date(expiresAt).toLocaleDateString("vi-VN")}.` : ""
       }</div>`
    : "";
  const reissue = reissueForm ?? "";
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1F3B;color:#fff;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:520px;padding:32px 28px">
    <img src="/brand-mark.png?v=culi2" alt="FlowTech" width="48" height="48" style="display:block;margin:0 auto 16px">
    <div style="font-size:22px;font-weight:700;color:${colour};margin-bottom:10px;text-align:center">${title}</div>
    <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,.75)">${detail}</div>
    ${codeBlock}
    ${reissue}
    <a href="${link ?? WINDOWS_DOWNLOAD_URL}" style="display:inline-block;margin-top:22px;background:rgba(255,255,255,.08);color:#fff;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Tải app cho Windows</a>
  </div>
</body></html>`;
}
