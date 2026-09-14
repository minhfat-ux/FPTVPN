#!/usr/bin/env node
/**
 * Gửi email thông báo "có bản mới — vào trang mua để tải" cho TOÀN BỘ user.
 *
 * VÌ SAO CẦN SCRIPT RIÊNG: `mailer.js` chỉ có các hàm gửi theo ngữ cảnh (OTP, hoá đơn, nhắc
 * gia hạn, cảnh báo thanh toán) và hàm gửi chung `deliver()` không được export. Gửi hàng loạt
 * là việc một lần, cần dry-run + resume + đếm lỗi, nên tách ra đây thay vì nhét vào mailer.
 *
 * AN TOÀN (đọc trước khi chạy):
 * - MẶC ĐỊNH LÀ DRY-RUN: không truyền `--send` thì chỉ in ra sẽ gửi cho ai (email đã che) và
 *   nội dung mẫu, KHÔNG gửi gì cả.
 * - `--send` mới gửi thật; gửi tuần tự, có delay (mặc định 900ms) để không dội SMTP của chủ dự án.
 * - Ghi tiến độ vào file state (sha256 của email, KHÔNG ghi email thô) ⇒ chạy lại sẽ bỏ qua
 *   người đã gửi, không spam khách 2 lần.
 * - Không in email thô ra log/báo cáo; chỉ in dạng che `t***@gmail.com`.
 *
 * CÁCH DÙNG (chạy trên node-2, trong /root/flowvpn-cp, cùng env của service):
 *   node scripts/broadcast-release.mjs                       # dry-run cả hai sản phẩm
 *   node scripts/broadcast-release.mjs --product vpn         # dry-run VPNFlow
 *   node scripts/broadcast-release.mjs --sample vi           # in email mẫu tiếng Việt
 *   node scripts/broadcast-release.mjs --send --product vpn  # GỬI THẬT cho user VPNFlow
 *   node scripts/broadcast-release.mjs --send --delay-ms 1500
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { pickMailLang } from "../src/mailer.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");

/** Bản phát hành đang thông báo (chỉ để hiện trong tiêu đề/nút). */
const VPN_VERSION = process.env.BROADCAST_VPN_VERSION || "1.3.3";

/** Thông tin từng sản phẩm: gửi từ địa chỉ nào, khách vào đâu để tải/mua. */
const BRANDS = {
  vpn: {
    key: "vpn",
    app: "VPNFlow",
    from: process.env.FROM_EMAIL || "VPNFlow <no-reply@meetflowai.site>",
    usersFile: "auth.json",
    buyUrl: "https://meetflowai.site/buy",
    // Trang cài OTA: iOS không cài được từ link .ipa trực tiếp, phải qua itms-services.
    iosUrl: "https://meetflowai.site/install/ios",
    androidUrl: "https://api.meetflowai.site/v1/downloads/android",
    termsUrl: "https://meetflowai.site/vpnflow/terms",
    privacyUrl: "https://meetflowai.site/FlowVPNPrivacy.html",
  },
  ai: {
    key: "ai",
    app: "MeetFlow AI",
    from: "MeetFlow AI <no-reply@meetflowai.site>",
    usersFile: "ai-users.json",
    buyUrl: "https://meetflowai.site/ai/buy",
    iosUrl: "https://apps.apple.com/app/id6764725689",
    androidUrl: "https://api.meetflowai.site/v1/ai/downloads/android",
    termsUrl: "https://meetflowai.site/terms",
    privacyUrl: "https://meetflowai.site/privacy",
  },
};

const SUPPORT_EMAIL = "support@meetflowai.site";

/** Địa chỉ KHÔNG gửi: dữ liệu thử, tên miền không tồn tại. */
const SKIP_DOMAINS = ["example.com", "example.org", "localhost", "invalid", "test"];
const SKIP_LOCALPARTS = ["test", "demo", "noreply", "no-reply", "postmaster", "abuse"];

const mask = (email) => String(email).replace(/^(.).*(@.*)$/, "$1***$2");
const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");

/** Nội dung email: 3 ngôn ngữ (vi/en/zh) — đúng bộ ngôn ngữ mailer đang dùng. */
const COPY = {
  vpn: {
    vi: {
      subject: `VPNFlow ${VPN_VERSION} đã sẵn sàng — tải bản mới`,
      title: `VPNFlow ${VPN_VERSION} đã sẵn sàng`,
      intro: "Bản mới nhất của VPNFlow đã phát hành. Bạn tải và cài trực tiếp từ trang mua của chúng tôi:",
      button: "Tải VPNFlow bản mới",
      lines: [
        "iPhone / iPad: tải file IPA (hoặc bấm nút Cập nhật trong app nếu app báo cần cập nhật).",
        "Android: tải file APK và cho phép cài từ nguồn không xác định.",
        "Sau khi cài, đăng nhập bằng đúng email này — Premium tự bật, KHÔNG phải mua lại.",
      ],
      pay: "Gói mua trên web là thanh toán một lần và KHÔNG tự động gia hạn. Muốn dùng tiếp thì vào trang mua để gia hạn.",
      reason: "Bạn nhận được email này vì bạn có tài khoản VPNFlow với địa chỉ email này.",
      stop: "Không muốn nhận thông báo nữa? Trả lời email này hoặc gửi tới support.",
      links: { buy: "Trang mua & tải", ios: "Cài cho iPhone/iPad", android: "Tải APK cho Android", terms: "Điều khoản sử dụng", privacy: "Chính sách quyền riêng tư", support: "Liên hệ hỗ trợ" },
    },
    en: {
      subject: `VPNFlow ${VPN_VERSION} is available — download the new build`,
      title: `VPNFlow ${VPN_VERSION} is available`,
      intro: "The latest VPNFlow build has been released. Download and install it straight from our buy page:",
      button: "Download the new VPNFlow",
      lines: [
        "iPhone / iPad: download the IPA file (or tap Update inside the app if it asks you to).",
        "Android: download the APK and allow installing from unknown sources.",
        "After installing, sign in with this same email — Premium unlocks automatically, you do NOT pay again.",
      ],
      pay: "Plans bought on the website are a one-time payment and do NOT auto-renew. To continue, renew on the buy page.",
      reason: "You received this email because you have a VPNFlow account with this email address.",
      stop: "Do not want these notices? Reply to this email or write to support.",
      links: { buy: "Buy & download", ios: "Install on iPhone/iPad", android: "Download Android APK", terms: "Terms of Use", privacy: "Privacy Policy", support: "Contact support" },
    },
    zh: {
      subject: `VPNFlow ${VPN_VERSION} 已发布 — 请下载新版`,
      title: `VPNFlow ${VPN_VERSION} 已发布`,
      intro: "VPNFlow 最新版本已发布。请直接从我们的购买页面下载安装：",
      button: "下载 VPNFlow 新版",
      lines: [
        "iPhone / iPad：下载 IPA 文件（若应用提示需要更新，也可点应用内的“更新”）。",
        "Android：下载 APK 并允许安装未知来源的应用。",
        "安装后用同一个邮箱登录 — 会员自动开启，无需再次购买。",
      ],
      pay: "网页购买的套餐为一次性付款，不会自动续订。如需继续使用，请在购买页面续费。",
      reason: "您收到此邮件，是因为此邮箱注册了 VPNFlow 账号。",
      stop: "不想再收到通知？回复本邮件或联系客服。",
      links: { buy: "购买与下载", ios: "安装到 iPhone/iPad", android: "下载 Android APK", terms: "使用条款", privacy: "隐私政策", support: "联系客服" },
    },
  },
  ai: {
    vi: {
      subject: "MeetFlow AI — bản mới nhất & link mua",
      title: "MeetFlow AI — bản mới nhất",
      intro: "Ứng dụng MeetFlow AI đã có bản mới nhất. Bạn xem gói và tải ở trang mua:",
      button: "Mở trang mua MeetFlow AI",
      lines: [
        "iPhone / iPad: cập nhật từ App Store.",
        "Android: tải file APK trực tiếp từ trang mua.",
        "Đăng nhập bằng đúng email này để dùng tiếp gói đang có.",
      ],
      pay: "Gói MeetFlow AI Pro 30 ngày là mua một lần, không tự động gia hạn.",
      reason: "Bạn nhận được email này vì bạn đã dùng MeetFlow AI với địa chỉ email này.",
      stop: "Không muốn nhận thông báo nữa? Trả lời email này hoặc gửi tới support.",
      links: { buy: "Trang mua & tải", ios: "App Store", android: "Tải APK cho Android", terms: "Điều khoản sử dụng", privacy: "Chính sách quyền riêng tư", support: "Liên hệ hỗ trợ" },
    },
    en: {
      subject: "MeetFlow AI — latest build & buy page",
      title: "MeetFlow AI — latest build",
      intro: "A new MeetFlow AI build is available. See the plans and download it from the buy page:",
      button: "Open the MeetFlow AI buy page",
      lines: [
        "iPhone / iPad: update from the App Store.",
        "Android: download the APK straight from the buy page.",
        "Sign in with this same email to keep using your current plan.",
      ],
      pay: "The MeetFlow AI Pro 30-day pass is a one-time purchase and does not auto-renew.",
      reason: "You received this email because you have used MeetFlow AI with this email address.",
      stop: "Do not want these notices? Reply to this email or write to support.",
      links: { buy: "Buy & download", ios: "App Store", android: "Download Android APK", terms: "Terms of Use", privacy: "Privacy Policy", support: "Contact support" },
    },
    zh: {
      subject: "MeetFlow AI — 最新版本与购买链接",
      title: "MeetFlow AI — 最新版本",
      intro: "MeetFlow AI 已发布最新版本。请在购买页面查看套餐并下载：",
      button: "打开 MeetFlow AI 购买页面",
      lines: [
        "iPhone / iPad：从 App Store 更新。",
        "Android：直接从购买页面下载 APK。",
        "用同一个邮箱登录，即可继续使用现有套餐。",
      ],
      pay: "MeetFlow AI Pro 30 天套餐为一次性购买，不会自动续订。",
      reason: "您收到此邮件，是因为您曾使用此邮箱登录 MeetFlow AI。",
      stop: "不想再收到通知？回复本邮件或联系客服。",
      links: { buy: "购买与下载", ios: "App Store", android: "下载 Android APK", terms: "使用条款", privacy: "隐私政策", support: "联系客服" },
    },
  },
};

/** HTML email: bảng đơn giản + style inline (nhiều mail client bỏ <style>). */
function renderHtml(brand, lang) {
  const c = COPY[brand.key][lang];
  const b = brand;
  const li = c.lines.map((l) => `<li style="margin:0 0 6px">${l}</li>`).join("");
  const links = [
    [b.buyUrl, c.links.buy],
    [b.iosUrl, c.links.ios],
    [b.androidUrl, c.links.android],
    [b.termsUrl, c.links.terms],
    [b.privacyUrl, c.links.privacy],
    [`mailto:${SUPPORT_EMAIL}`, c.links.support],
  ]
    .map(([href, label]) => `<a href="${href}" style="color:#1a7f4b;text-decoration:none;margin-right:14px;white-space:nowrap">${label}</a>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#12202b">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#1a7f4b;font-weight:700">${b.app}</div>
    <h1 style="font-size:22px;margin:6px 0 12px">${c.title}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${c.intro}</p>
    <p style="margin:0 0 22px">
      <a href="${b.buyUrl}" style="display:inline-block;background:#33c773;color:#05230f;font-weight:700;padding:13px 22px;border-radius:10px;text-decoration:none">${c.button}</a>
    </p>
    <ul style="font-size:14px;line-height:1.6;margin:0 0 18px;padding-left:20px">${li}</ul>
    <p style="font-size:14px;line-height:1.6;margin:0 0 18px;color:#3c4a55">${c.pay}</p>
    <div style="font-size:13px;line-height:1.9;border-top:1px solid #dde3e8;padding-top:14px">${links}</div>
    <p style="font-size:12px;line-height:1.6;color:#6b7a86;margin:20px 0 0">${c.reason}<br>${c.stop}</p>
  </div></body></html>`;
}

const stripTags = (html) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

function renderEmail(brand, lang) {
  const html = renderHtml(brand, lang);
  return { subject: COPY[brand.key][lang].subject, html, text: stripTags(html) };
}

/** Đọc danh sách người nhận từ file dữ liệu của control plane. */
function recipients(brand, { dataDir = DATA_DIR } = {}) {
  const file = path.join(dataDir, brand.usersFile);
  if (!fs.existsSync(file)) return { list: [], skipped: [], missing: true };
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const users = Array.isArray(raw) ? raw : Object.values(raw.users ?? raw.accounts ?? raw);
  const seen = new Map();
  const skipped = [];
  for (const u of users) {
    if (!u || typeof u !== "object") continue;
    const email = String(u.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) continue;
    const [local, domain] = email.split("@");
    if (SKIP_DOMAINS.includes(domain) || SKIP_LOCALPARTS.some((p) => local === p || local.startsWith(`${p}+`) || local.startsWith(`${p}.`))) {
      skipped.push(email);
      continue;
    }
    if (seen.has(email)) continue;
    // Ngôn ngữ: user có field `lang` thì tôn trọng; không có (MeetFlow AI) thì đoán theo tên miền.
    const lang = u.lang || u.language ? pickMailLang(u.lang ?? u.language) : (/\.(cn|com\.cn)$/.test(domain) || ["qq.com", "163.com", "126.com", "sina.com", "foxmail.com"].includes(domain) ? "zh" : "en");
    seen.set(email, { email, lang });
  }
  return { list: [...seen.values()], skipped, missing: false };
}

function parseArgs(argv) {
  const out = { send: false, product: "both", limit: 0, delayMs: 900, sample: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--send") out.send = true;
    else if (a === "--product") out.product = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--delay-ms") out.delayMs = Number(argv[++i]);
    else if (a === "--sample") out.sample = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`tham số lạ: ${a}`);
  }
  return out;
}

function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("thiếu SMTP_HOST trong env (chạy bằng scripts/run-with-service-env.py hoặc trên node-2)");
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Dùng: node scripts/broadcast-release.mjs [--product vpn|ai|both] [--send] [--limit N] [--delay-ms N] [--sample vi|en|zh]");
    return;
  }
  const keys = args.product === "both" ? ["vpn", "ai"] : [args.product];
  for (const k of keys) if (!BRANDS[k]) throw new Error(`--product phải là vpn, ai hoặc both (nhận: ${args.product})`);

  if (args.sample) {
    const lang = pickMailLang(args.sample);
    for (const k of keys) {
      const mail = renderEmail(BRANDS[k], lang);
      console.log(`\n=== ${BRANDS[k].app} / ${lang} — subject: ${mail.subject} ===\n${mail.text}\n`);
    }
    return;
  }

  const plan = [];
  for (const k of keys) {
    const brand = BRANDS[k];
    const r = recipients(brand);
    const byLang = r.list.reduce((acc, u) => ({ ...acc, [u.lang]: (acc[u.lang] || 0) + 1 }), {});
    console.log(`--- ${brand.app} (${brand.usersFile})`);
    console.log(`    gửi cho: ${r.list.length} người | theo ngôn ngữ: ${JSON.stringify(byLang)}`);
    if (r.skipped.length) console.log(`    BỎ QUA (email thử/không hợp lệ): ${r.skipped.length} → ${r.skipped.slice(0, 4).map(mask).join(", ")}${r.skipped.length > 4 ? ", …" : ""}`);
    if (r.missing) console.log("    CẢNH BÁO: không thấy file dữ liệu người dùng");
    plan.push({ brand, list: r.list });
  }
  const allEmails = new Set(plan.flatMap((p) => p.list.map((u) => u.email)));
  console.log(`\n    Tổng email duy nhất (cả 2 sản phẩm): ${allEmails.size}`);
  if (plan.length === 2) {
    const a = new Set(plan[0].list.map((u) => u.email));
    const overlap = plan[1].list.filter((u) => a.has(u.email));
    console.log(`    Nằm trong cả 2 danh sách (sẽ nhận 2 email): ${overlap.length}${overlap.length ? " → " + overlap.slice(0, 3).map((u) => mask(u.email)).join(", ") : ""}`);
  }

  const stateFile = path.join(DATA_DIR, `broadcast-state-${VPN_VERSION}.json`);
  let state = { sent: [] };
  if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const already = new Set(state.sent);

  if (!args.send) {
    console.log("\n==> DRY-RUN: chưa gửi gì cả. Xem email mẫu bằng --sample vi, và thêm --send để gửi thật.");
    return;
  }

  const tx = transport();
  console.log(`\n==> GỬI THẬT qua SMTP (${process.env.SMTP_HOST}) — delay ${args.delayMs}ms/email`);
  let sent = 0, failed = 0, skippedDone = 0;
  for (const { brand, list } of plan) {
    for (const u of list) {
      const key = `${brand.key}:${sha256(u.email)}`;
      if (already.has(key)) { skippedDone++; continue; }
      if (args.limit && sent >= args.limit) { console.log(`    đã chạm --limit ${args.limit}, dừng`); break; }
      const mail = renderEmail(brand, u.lang);
      try {
        const info = await tx.sendMail({ from: brand.from, to: u.email, replyTo: SUPPORT_EMAIL, subject: mail.subject, html: mail.html, text: mail.text });
        sent++;
        state.sent.push(key);
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
        console.log(`    OK  ${brand.key} → ${mask(u.email)} (${u.lang}) id=${info.messageId ?? "-"}`);
      } catch (err) {
        failed++;
        console.error(`    LỖI ${brand.key} → ${mask(u.email)}: ${err?.message ?? err}`);
      }
      await new Promise((r) => setTimeout(r, args.delayMs));
    }
  }
  console.log(`\n==> Xong: gửi ${sent} | lỗi ${failed} | bỏ qua vì đã gửi trước đó ${skippedDone} | state: ${stateFile}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error("LỖI:", err.message); process.exit(2); });
