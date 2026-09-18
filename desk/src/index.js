import path from "node:path";
import { pathToFileURL } from "node:url";
import { config, openrouterKey, sonioxKey } from "./config.js";
import { initDb } from "./db.js";
import { entitlementStatus } from "./entitlement.js";
import { startServer } from "./app.js";

/**
 * Điểm khởi động flowdesk.
 *
 * Chạy trực tiếp:  node desk/src/index.js
 * systemd:         deploy/flowdesk.service (WorkingDirectory=/opt/flowdesk)
 *
 * Không có `process.exit()` ở đây — trên Windows, thoát ngay sau một `fetch`
 * đang dở làm libuv crash (bài học từ session trước). Dùng `process.exitCode`.
 */

export async function start() {
  initDb();
  const source = entitlementStatus();
  const { server, url, port } = await startServer();
  console.log(`[flowdesk] ${config.serviceName} v${config.version} đang nghe tại ${url}`);
  console.log(
    `[flowdesk] nguồn quyền: ${config.fbuddyDbFile} — ${source.available ? "đọc được" : `KHÔNG đọc được (${source.error})`}`,
  );
  if (!source.available) {
    console.warn("[flowdesk] không đọc được DB đơn hàng ⇒ MỌI kích hoạt sẽ bị từ chối (fail closed)");
  }
  if (!config.adminToken) console.warn("[flowdesk] chưa cấu hình DESK_ADMIN_TOKEN ⇒ các route admin trả 503");
  // Chỉ nói CÓ hay KHÔNG, tuyệt đối không in giá trị key.
  console.log(
    `[flowdesk] key nhà cung cấp: soniox=${sonioxKey() ? "có" : "THIẾU"}, openrouter=${openrouterKey() ? "có" : "THIẾU"}`,
  );

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[flowdesk] nhận ${signal}, đóng server…`);
    server.close(() => {
      process.exitCode = 0;
    });
    setTimeout(() => {
      process.exitCode = 1;
    }, 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return { server, url, port };
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  start().catch((err) => {
    console.error("[flowdesk] không khởi động được:", err?.message ?? err);
    process.exitCode = 1;
  });
}
