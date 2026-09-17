import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ensureDirs } from "./config.js";
import { initDb } from "./db.js";
import { readAppSettings } from "./settings.js";
import { createApiRouter } from "./routes.js";
import { ApiError } from "./util.js";
import { closeAll, connectAll } from "./mcp.js";
import { countUsers } from "./auth.js";

ensureDirs();
initDb();

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
