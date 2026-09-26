#!/usr/bin/env node
// Kiểm thử bộ luật của VPS GUARD bằng dữ liệu mẫu (không cần root, không cần mạng).
// Chạy: node ops/vps-guard/test.mjs   (hoặc npm run guard:test)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const res = spawnSync(process.execPath, [path.join(here, "guard.mjs"), "--test"], { encoding: "utf8" });
process.stdout.write(res.stdout ?? "");
process.stderr.write(res.stderr ?? "");
process.exit(res.status ?? 1);
