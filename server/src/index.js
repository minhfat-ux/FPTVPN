import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ensureDirs } from "./config.js";
import { initDb } from "./db.js";
import { readAppSettings } from "./settings.js";
import { createApiRouter } from "./routes.js";
import { ApiError, RateLimiter } from "./util.js";
import { closeAll, connectAll } from "./mcp.js";
import { countUsers } from "./auth.js";
import { ensureExtraColumns } from "./schema-extras.js";

ensureDirs();
initDb();

// Cột cho tính năng mới (đa ngữ kỹ năng, ngôn ngữ người dùng) — xem schema-extras.js.
try {
  const added = ensureExtraColumns();
  if (added.length) console.log(`[fbuddy] Đã thêm cột: ${added.join(", ")}`);
} catch (err) {
  console.warn("[fbuddy] Không thêm được cột bổ sung:", err?.message ?? err);
}

// Seed the Skill Hub catalogue once (idempotent by slug).
try {
  const { ensureHubSeed } = await import("./skills/hub.js");
  const created = ensureHubSeed();
  if (created) console.log(`[fbuddy] Skill Hub: đã thêm ${created} kỹ năng mẫu`);
} catch (err) {
  console.warn("[fbuddy] Không seed được Skill Hub:", err?.message ?? err);
}

const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", true);

// ---------------------------------------------------------------- bảo mật
//
// 2026-09-20 (chủ dự án: "nhớ có các feature security nhé, dễ bị hack lắm đấy"):
//  - header bảo mật cho MỌI phản hồi (chống nhúng iframe, dò MIME, rò referrer…)
//  - CSP chặt: web chỉ nạp script/style của chính nó (không có script inline)
//  - giới hạn tần suất TOÀN CỤC theo IP + theo người dùng: chống dò mật khẩu/mã đăng nhập,
//    chống spam lượt chat (mỗi lượt tốn tiền model) và chống lạm dụng tải tệp.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React đặt style qua thuộc tính style={...} nên cần 'unsafe-inline' cho style.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (config.publicUrl.startsWith("https://")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return next();
});

/**
 * Giới hạn tần suất: khoá theo NGƯỜI DÙNG (nếu đã đăng nhập) hoặc theo IP.
 * Ngưỡng rộng cho đọc dữ liệu, chặt cho việc tốn tiền (chat, tải tệp, đăng nhập).
 */
const apiLimiter = new RateLimiter({ limit: 300, windowMs: 60 * 1000 });
const expensiveLimiter = new RateLimiter({ limit: 30, windowMs: 60 * 1000 });

function clientKey(req, bucket) {
  const who = req.user?.id ?? req.ip ?? "anon";
  return `${bucket}:${who}`;
}

app.use("/api", (req, res, next) => {
  const expensive = /^\/(chat\/stream|files|voice|topup)/.test(req.path) && req.method === "POST";
  const limiter = expensive ? expensiveLimiter : apiLimiter;
  const gate = limiter.check(clientKey(req, expensive ? "expensive" : "api"));
  if (!gate.ok) {
    const retryAfter = Math.ceil((gate.retryAfterMs ?? 60_000) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: {
        code: "rate_limited",
        message: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.`,
      },
    });
  }
  return next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [config.publicUrl, ...config.devOrigins];
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }
  return next();
});

// Webhook SePay ký HMAC trên NGUYÊN VĂN thân request ⇒ route này phải nhận bytes
// gốc trước khi `express.json` parse. body-parser đánh dấu `req._body` sau khi đọc
// nên các parser phía sau tự bỏ qua, không parse hai lần.
app.use("/api/topup/sepay", express.raw({ type: () => true, limit: "1mb" }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Lightweight request log — enough to debug on the VPS with journalctl.
app.use((req, res, next) => {
  if (req.path === "/api/health") return next();
  const started = Date.now();
  res.on("finish", () => {
    if (res.statusCode >= 400) {
      console.log(
        JSON.stringify({
          t: new Date().toISOString(),
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ms: Date.now() - started,
          ip: req.ip,
        }),
      );
    }
  });
  return next();
});

app.use("/api", createApiRouter());

// ------------------------------------------------------------------ web app

const webDist = config.webDistDir;
const hasWeb = fs.existsSync(path.join(webDist, "index.html"));
if (hasWeb) {
  app.use(
    express.static(webDist, {
      index: false,
      setHeaders(res, filePath) {
        // Logo/favicon nằm ở URL CỐ ĐỊNH (khác asset của Vite có hash trong tên), nên
        // tuyệt đối không đánh dấu `immutable`: đổi icon mà trình duyệt/CDN giữ bản cũ
        // cả năm. Đã dính đúng lúc thay icon Culi (2026-09-18) — Cloudflare cache
        // `/brand-mark.png` và không chịu lấy bản mới.
        if (/(?:^|\/)(?:brand-mark|brand-logo|favicon)\.(?:png|svg|ico)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=300");
          return;
        }
        if (/\.(js|css|woff2?|png|svg|webp)$/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
}

app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (!hasWeb) {
    return res
      .status(200)
      .type("text/plain")
      .send("fBuddy API đang chạy. Web chưa build (chạy: npm run build).\n");
  }
  if (req.path.startsWith("/api/")) return next();
  // Shell SPA KHÔNG được cache: sau mỗi lần deploy, `index.html` cũ vẫn trỏ tới bundle CŨ
  // (asset có hash nằm ở edge gần như vĩnh viễn), nên khách mở lại tab là thấy GIAO DIỆN CŨ.
  // Đúng ca 20/09/2026: login "nhảy" giữa 2 bản — bản FlowGpt cũ (1 card giữa trang) và bản
  // fBuddy mới (slogan bên trái + box đăng nhập bên phải). Không cache ⇒ luôn lấy shell mới.
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  return res.sendFile(path.join(webDist, "index.html"));
});

// ------------------------------------------------------------ error handling

app.use((req, res) => {
  res.status(404).json({ error: { code: "not_found", message: `Không có route ${req.method} ${req.path}` } });
});

app.use((err, _req, res, _next) => {
  // Multer errors (wrong field name, size limit) are client mistakes, not 500s.
  if (err?.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Tệp vượt quá giới hạn cho phép."
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? `Sai tên field tệp ("${err.field}"). API nhận field tên "file" (upload thường) hoặc "audio" (giọng nói).`
          : `Lỗi tải tệp: ${err.code}`;
    if (res.headersSent) return res.end();
    return res.status(400).json({ error: { code: "bad_request", message } });
  }

  const status = err instanceof ApiError ? err.status : err?.status && err.status < 600 ? err.status : 500;
  const code = err instanceof ApiError ? err.code : err?.code ?? "internal_error";
  const message =
    err instanceof ApiError || err?.expose ? err.message : "Lỗi hệ thống, vui lòng thử lại";
  if (status >= 500) console.error("[fbuddy]", err);
  if (res.headersSent) return res.end();
  return res.status(status).json({ error: { code, message, ...(err?.details ? { details: err.details } : {}) } });
});

// ------------------------------------------------- SePay: tự cộng credit nạp

/**
 * Vòng poll SePay (chế độ `poll`). Đọc lại cấu hình mỗi vòng nên bật/tắt hay đổi
 * chu kỳ trong Cài đặt có hiệu lực ngay, không cần khởi động lại; chỉ gọi API khi
 * đã bật, đang ở chế độ poll và đã có token. `unref()` để không giữ sống tiến trình
 * test. Lỗi mạng chỉ ghi log rồi thử lại vòng sau — không làm chết dịch vụ.
 */
let sepayTimer = null;

async function sepayTick() {
  let nextMs = 60_000;
  try {
    const { pollOnce, recordPoll, sepayConfig } = await import("./sepay.js");
    const cfg = sepayConfig();
    nextMs = cfg.pollSeconds * 1000;
    if (cfg.enabled && cfg.mode === "poll" && cfg.apiToken) {
      try {
        const result = await pollOnce({ token: cfg.apiToken });
        recordPoll(result);
        if (result.applied.length) {
          const credits = result.applied.reduce((sum, item) => sum + Number(item.tokens ?? 0), 0);
          console.log(
            `[fbuddy] SePay: ${result.applied.length} đơn khớp → cộng ${credits.toLocaleString("vi-VN")} credit`,
          );
        }
      } catch (err) {
        recordPoll(null, err);
        console.warn("[fbuddy] SePay poll lỗi:", err?.message ?? err);
      }
    }
  } catch (err) {
    console.warn("[fbuddy] SePay poller lỗi:", err?.message ?? err);
  }
  sepayTimer = setTimeout(sepayTick, nextMs);
  sepayTimer.unref?.();
}

// -------------------------------------------------------------------- start

const server = app.listen(config.port, config.host, async () => {
  const settings = readAppSettings();
  console.log(
    `[fbuddy] ${config.appName} v${config.version} listening on http://${config.host}:${config.port} ` +
      `(env=${config.env}, data=${config.dataDir}, web=${hasWeb ? "built" : "dev-proxy"}, users=${countUsers()})`,
  );
  if (!countUsers()) {
    console.log("[fbuddy] Chưa có tài khoản nào — người đăng ký ĐẦU TIÊN sẽ là quản trị viên.");
  }
  if (!settings.defaultProviderId) {
    console.log("[fbuddy] Chưa cấu hình nhà cung cấp AI nào — thêm trong Cài đặt sau khi đăng nhập.");
  }
  try {
    const results = await connectAll();
    for (const result of results) {
      console.log(`[fbuddy] MCP ${result.id}: ${result.ok ? `${result.toolCount} tool` : `lỗi — ${result.error}`}`);
    }
  } catch (err) {
    console.warn("[fbuddy] MCP bootstrap lỗi:", err?.message ?? err);
  }
  sepayTick();
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`[fbuddy] ${signal} — đang dừng…`);
    if (sepayTimer) clearTimeout(sepayTimer);
    server.close();
    await closeAll().catch(() => {});
    process.exit(0);
  });
}

export { app, server };
