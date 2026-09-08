import crypto from "node:crypto";
import QRCode from "qrcode";
import { buildVietQRPayload } from "./vietqr.js";

/**
 * Web payment integration (PayOS) — Vietnamese payments: MoMo wallet +
 * Bank QR (VietQR) with automatic verification via webhook. Covers the
 * "web account" purchase flow for both Android (sideload) and iOS.
 *
 * Config env (on VPS):
 *   PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY, PAYOS_BASE_URL?
 *
 * Plans:
 *   monthly: 100,000 VND / 30 days
 *   yearly : 900,000 VND / 365 days
 */

const PLANS = {
  monthly: { amount: 70000, days: 30, label: "Monthly (70,000 VND / 30 days)" },
  yearly:  { amount: 600000, days: 365, label: "Yearly (600,000 VND / 365 days)" },
};

function payosConfig() {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  const baseUrl = process.env.PAYOS_BASE_URL || "https://api-merchant.payos.vn";
  if (!clientId || !apiKey || !checksumKey) return null;
  return { clientId, apiKey, checksumKey, baseUrl };
}

function payosSignature({ checksumKey, orderCode, amount, description, cancelUrl, returnUrl }) {
  // PayOS v2 signature: hmac sha256 of "amount=$amount&cancelUrl=$cancelUrl&description=$description&orderCode=$orderCode&returnUrl=$returnUrl"
  const payload = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return crypto.createHmac("sha256", checksumKey).update(payload).digest("hex");
}

/**
 * Builds a VietQR (direct bank transfer) as a QR data URL. No merchant
 * registration needed — customer scans with any VN banking app, pays the
 * exact amount, and the note carries the order code for manual/auto matching.
 */
export async function createBankQrDataUrl({ accountNumber, accountName, amount, orderCode }) {
  const payload = buildVietQRPayload({
    accountNumber,
    accountName,
    amount,
    content: String(orderCode),
  });
  const dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 2, errorCorrectionLevel: "M" });
  return dataUrl;
}

/** Returns bank config from env, or null when not configured. */
export function bankQrConfig() {
  const accountNumber = process.env.BANK_QR_ACCOUNT;
  const accountName = process.env.BANK_QR_NAME || "VPNFlow";
  if (!accountNumber) return null;
  return { accountNumber, accountName };
}

/** Creates a PayOS payment link (checkout page) or null on failure. */
export async function createPayosPaymentLink({ orderCode, amount, description, cancelUrl, returnUrl, buyerEmail }) {
  const cfg = payosConfig();
  if (!cfg) return { error: "PAYOS not configured (set PAYOS_CLIENT_ID/API_KEY/CHECKSUM_KEY)" };

  const signature = payosSignature({ checksumKey: cfg.checksumKey, orderCode, amount, description, cancelUrl, returnUrl });
  const body = {
    orderCode,
    amount,
    description,
    buyerEmail,
    cancelUrl,
    returnUrl,
    signature,
  };

  const res = await fetch(`${cfg.baseUrl}/v2/payment-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-client-id": cfg.clientId, "x-api-key": cfg.apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== "00") {
    return { error: json.desc || `PayOS create link failed (${res.status})` };
  }
  return { checkoutUrl: json.data.checkoutUrl, qrCode: json.data.qrCode ?? null };
}

/** Verifies a PayOS webhook signature and returns normalized event. */
export function verifyPayosWebhook(rawBody, signatureHeader) {
  const cfg = payosConfig();
  if (!cfg) return null;
  try {
    const data = JSON.parse(rawBody);
    // PayOS webhook signature: hmac sha256 of sorted data fields
    const keys = Object.keys(data.data || {}).sort();
    const payload = keys.map((k) => `${k}=${data.data[k]}`).join("&");
    const expected = crypto.createHmac("sha256", cfg.checksumKey).update(payload).digest("hex");
    if (signatureHeader !== expected) return null;
    return { orderCode: data.data.orderCode, code: data.code, success: data.code === "00", amount: data.data.amount };
  } catch {
    return null;
  }
}

/** Buy page HTML (VPNFlow dark theme) — email + plan + method picker. */
export function buyPageHTML({ baseUrl }) {
  const plans = PLANS;
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VPNFlow — Mua Premium</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; font-family: -apple-system, "Segoe UI", sans-serif;
      color: #fff; background: linear-gradient(180deg, #051525, #0a1f3a);
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .card {
      width: 100%; max-width: 460px; padding: 28px;
      background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
      border-radius: 18px; backdrop-filter: blur(16px);
    }
    .logo { text-align: center; font-size: 28px; font-weight: 800; margin-bottom: 6px; }
    .logo span { color: #33c773; }
    .sub { text-align: center; color: rgba(255,255,255,.6); font-size: 14px; margin-bottom: 24px; }
    label { display: block; color: rgba(255,255,255,.6); font-size: 13px; margin: 16px 0 7px; }
    input, select {
      width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
      padding: 12px 14px; color: #fff; background: rgba(255,255,255,.08); font: inherit; outline: none;
    }
    input:focus, select:focus { border-color: #33c773; box-shadow: 0 0 0 3px rgba(51,199,115,.18); }
    .plans { display: grid; gap: 10px; margin-top: 6px; }
    .plan {
      padding: 14px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
      background: rgba(255,255,255,.05); cursor: pointer; display: flex; justify-content: space-between; align-items: center;
    }
    .plan.active { border-color: #33c773; background: rgba(51,199,115,.12); }
    .plan .price { color: #33c773; font-weight: 800; }
    .methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-top: 6px; }
    .method {
      padding: 14px 8px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
      background: rgba(255,255,255,.05); cursor: pointer; text-align: center; font-size: 13px;
    }
    .method.active { border-color: #33c773; background: rgba(51,199,115,.12); }
    .method .icon { font-size: 22px; margin-bottom: 6px; }
    button {
      width: 100%; margin-top: 24px; border: 0; border-radius: 12px; padding: 14px;
      color: #06160d; background: #33c773; font: inherit; font-weight: 800; cursor: pointer; font-size: 16px;
    }
    button:disabled { opacity: .55; }
    .status { margin-top: 14px; text-align: center; font-size: 13px; min-height: 18px; }
    .status.err { color: #ff5a6a; }
    .note { margin-top: 16px; text-align: center; color: rgba(255,255,255,.4); font-size: 12px; }

    .dl-section { margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,.1); }
    .dl-title { text-align: center; font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .dl-sub { text-align: center; color: rgba(255,255,255,.5); font-size: 12px; margin-bottom: 14px; }
    .dl-section a { text-decoration: none; display: inline-block; transition: transform .1s; }
    .dl-section a:hover { transform: scale(1.04); }

    .modal-overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,.72); display: none;
      align-items: center; justify-content: center; padding: 20px;
    }
    .modal-overlay.show { display: flex; }
    .modal {
      width: 100%; max-width: 380px; background: #0d1b30;
      border: 1px solid rgba(255,255,255,.14); border-radius: 18px;
      padding: 24px; text-align: center; position: relative;
      box-shadow: 0 24px 60px rgba(0,0,0,.5);
    }
    .modal .close {
      position: absolute; top: 10px; right: 14px; cursor: pointer;
      color: rgba(255,255,255,.6); font-size: 22px; background: none; border: 0; width: 30px; height: 30px;
    }
    .modal .qr-wrap {
      display: inline-block; background: #fff; border-radius: 12px; padding: 8px; margin: 12px 0;
    }
    .modal img { width: 230px; height: 230px; display: block; border-radius: 8px; }
    .modal .amt { font-size: 18px; font-weight: 800; color: #33c773; }
    .modal .oc { color: rgba(255,255,255,.7); font-size: 13px; margin: 8px 0; word-break: break-all; }
    .modal .hint { color: rgba(255,255,255,.55); font-size: 13px; line-height: 1.5; }
    .modal .qstatus { margin-top: 12px; font-size: 13px; min-height: 18px; color: #33c773; }
    .modal .qerr { color: #ff5a6a; }
    .modal button.done { margin-top: 6px; }
    .modal .mini { font-size: 11px; color: rgba(255,255,255,.4); margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">VPN<span>Flow</span> Premium</div>
    <div class="sub">Mở khoá VPN an toàn cho tài khoản của bạn</div>

    <div class="dl-section">
      <div class="dl-title">Tải app VPNFlow</div>
      <div class="dl-sub">Chưa có app? Chọn nền tảng của bạn:</div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center;">
        <a href="https://apps.apple.com/PLACEHOLDER-IOS" target="_blank" rel="noopener" title="Download on the App Store (iOS)">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">App Store</text>
          </svg>
        </a>
        <a href="https://apps.apple.com/PLACEHOLDER-MAC" target="_blank" rel="noopener" title="Download on the Mac App Store">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(14 7) scale(0.078)"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></g>
            <text x="45" y="23" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="9.5" fill="#fff" opacity="0.9">Download on the</text>
            <text x="45" y="37" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Mac App Store</text>
          </svg>
        </a>
        <a href="${'${base}'}/v1/downloads/android" target="_blank" rel="noopener" title="Get it on Google Play — hoặc tải APK trực tiếp tại đây">
          <svg width="150" height="48" viewBox="0 0 170 54" xmlns="http://www.w3.org/2000/svg">
            <rect width="170" height="54" rx="8" fill="#0b0b0d"/>
            <g transform="translate(12 12) scale(0.058)">
              <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
              <path fill="#FBBC04" d="M47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0z"/>
              <path fill="#4285F4" d="M425.2 225.6l-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8z"/>
              <path fill="#34A853" d="M104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/>
            </g>
            <text x="45" y="20" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="8.5" fill="#fff" opacity="0.9">GET IT ON</text>
            <text x="45" y="34" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="600" fill="#fff">Google Play</text>
          </svg>
        </a>
      </div>
    </div>

    <form id="buyForm">
      <label>Email tài khoản VPNFlow</label>
      <input type="email" id="email" placeholder="you@example.com" required>

      <label>Chọn gói</label>
      <div class="plans">
        <div class="plan active" data-plan="monthly">
          <span>Monthly</span><span class="price">${plans.monthly.amount.toLocaleString("vi-VN")} đ / ${plans.monthly.days} ngày</span>
        </div>
        <div class="plan" data-plan="yearly">
          <span>Yearly</span><span class="price">${plans.yearly.amount.toLocaleString("vi-VN")} đ / ${plans.yearly.days} ngày</span>
        </div>
      </div>

      <label>Phương thức thanh toán</label>
      <div class="methods">
        <div class="method active" data-method="bankqr">
          <div class="icon">🏦</div>Ngân hàng VN<br><small>Quét QR TPBank</small>
        </div>
        <div class="method" data-method="wechat">
          <div class="icon">💚</div>WeChat Pay<br><small>Quét QR</small>
        </div>
        <div class="method" data-method="alipay">
          <div class="icon">🔵</div>Alipay<br><small>Quét QR</small>
        </div>
        <div class="method" data-method="payos">
          <div class="icon">💳</div>Cổng PayOS<br><small>MoMo / QR / thẻ</small>
        </div>
      </div>

      <button type="submit" id="payBtn">Tạo mã thanh toán</button>
      <div class="status" id="status"></div>
      <div class="note">Sau khi chuyển tiền, premium sẽ được kích hoạt cho email này.</div>
    </form>

  </div>

  <div class="modal-overlay" id="qrModal">
    <div class="modal">
      <button class="close" id="qrClose">&times;</button>
      <div style="font-size:15px;font-weight:700;">Quét QR để thanh toán</div>
      <div class="qr-wrap"><img id="qrImg" alt="QR thanh toán"></div>
      <div class="amt" id="qrAmt"></div>
      <div class="oc" id="qrOrder"></div>
      <div class="hint" id="qrHint"></div>
      <div class="qstatus" id="qrStatus"></div>
      <button type="button" class="done" id="qrCloseBtn">Đóng</button>
      <div class="mini">Giữ mã đơn để đối chiếu. Premium tự kích hoạt sau khi xác nhận.</div>
    </div>
  </div>

  <script>
    const base = ${JSON.stringify(baseUrl)};
    let plan = "monthly";
    let method = "bankqr";

    document.querySelectorAll(".plan").forEach(el => {
      el.onclick = () => {
        document.querySelectorAll(".plan").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        plan = el.dataset.plan;
      };
    });
    document.querySelectorAll(".method").forEach(el => {
      if (el.style.cursor === "not-allowed") return;
      el.onclick = () => {
        document.querySelectorAll(".method").forEach(x => x.classList.remove("active"));
        el.classList.add("active");
        method = el.dataset.method;
      };
    });

    const statusEl = document.getElementById("status");
    const btn = document.getElementById("payBtn");
    const qrModal = document.getElementById("qrModal");
    const qrImg = document.getElementById("qrImg");
    const qrAmt = document.getElementById("qrAmt");
    const qrOrder = document.getElementById("qrOrder");
    const qrHint = document.getElementById("qrHint");
    const qrStatus = document.getElementById("qrStatus");
    function showQr() { qrModal.classList.add("show"); }
    function hideQr() { qrModal.classList.remove("show"); if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
    document.getElementById("qrClose").onclick = hideQr;
    document.getElementById("qrCloseBtn").onclick = hideQr;
    qrModal.onclick = (e) => { if (e.target === qrModal) hideQr(); };

    document.getElementById("buyForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      if (!email) { statusEl.className = "status err"; statusEl.textContent = "Nhập email tài khoản."; return; }
      btn.disabled = true;
      statusEl.className = "status";
      statusEl.textContent = "Đang tạo mã thanh toán...";
      try {
        const res = await fetch(base + "/v1/payments/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, plan, method }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          statusEl.className = "status err";
          statusEl.textContent = data.error || "Lỗi tạo thanh toán.";
          btn.disabled = false;
          return;
        }
        if (data.qrDataUrl || data.qrImageUrl) {
          statusEl.className = "status";
          statusEl.textContent = "";
          qrImg.src = data.qrDataUrl || (base + data.qrImageUrl);
          qrAmt.textContent = (data.amount.toLocaleString("vi-VN")) + " đ";
          qrOrder.textContent = "Mã đơn: " + data.orderCode;
          const labels = {
            bankqr: "Mở app ngân hàng quét QR và nhập đúng số tiền.",
            wechat: "Mở WeChat quét QR, nhập đúng số tiền.",
            alipay: "Mở Alipay quét QR, nhập đúng số tiền."
          };
          qrHint.textContent = labels[data.method] || "Quét QR bằng app thanh toán.";
          qrStatus.textContent = "Đang chờ xác nhận thanh toán...";
          qrStatus.className = "qstatus";
          showQr();
          startPoll(data.orderCode);
        } else if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          statusEl.className = "status err";
          statusEl.textContent = "Không tạo được mã thanh toán.";
          btn.disabled = false;
        }
      } catch (err) {
        statusEl.className = "status err";
        statusEl.textContent = "Không kết nối được máy chủ. Thử lại.";
        btn.disabled = false;
      }
    };

    // Poll trạng thái đơn tới khi được xác nhận (chuyển khoản / PayOS webhook).
    let pollTimer = null;
    function startPoll(orderCode) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(base + "/v1/payments/status/" + orderCode);
          const data = await res.json();
          if (data.paid) {
            clearInterval(pollTimer);
            qrStatus.textContent = "✅ Đã nhận thanh toán! Premium đã kích hoạt. Mở app VPNFlow để dùng.";
            qrStatus.className = "qstatus";
          } else {
            qrStatus.textContent = "Đang chờ xác nhận... (" + (data.elapsed_sec || "") + "s)";
            qrStatus.className = "qstatus";
          }
        } catch (e) { /* keep polling */ }
      }, 5000);
    }
  </script>
</body>
</html>`;
}

export function paymentSuccessPageHTML() {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VPNFlow — Thanh toán thành công</title>
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.card{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}.check{font-size:52px;color:#33c773}h1{font-size:22px;margin:12px 0}p{color:rgba(255,255,255,.6);font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><div class="check">✓</div><h1>Thanh toán thành công!</h1><p>Premium đã được kích hoạt cho tài khoản của bạn. Mở lại app VPNFlow — bạn sẽ thấy vương miện vàng ngay.</p></div></body></html>`;
}

export function paymentCancelPageHTML() {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VPNFlow — Đã huỷ thanh toán</title>
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,"Segoe UI",sans-serif;color:#fff;background:linear-gradient(180deg,#051525,#0a1f3a)}.card{max-width:420px;padding:32px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:18px;text-align:center}h1{font-size:22px;margin:12px 0}p{color:rgba(255,255,255,.6);font-size:14px;line-height:1.5}</style></head>
<body><div class="card"><h1>Thanh toán đã huỷ</h1><p>Không có khoản phí nào bị trừ. Quay lại trang mua để thử lại.</p></div></body></html>`;
}

export const PLANS_PUBLIC = PLANS;
