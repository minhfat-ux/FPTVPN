#!/usr/bin/env node
/**
 * Đưa file phát hành (IPA/APK) lên Diawi để khách cài trực tiếp qua link HTTPS.
 *
 * Vì sao có script này: trước đây chủ shop upload tay lên web Diawi rồi copy link vào
 * dashboard. Upload tay dễ sai file (bản cũ) và không lưu lại md5, nên script này:
 *   - in md5 + dung lượng TRƯỚC khi upload để đối chiếu với bản đã build;
 *   - chờ Diawi xử lý xong mới trả link (Diawi chạy nền, upload xong chưa có link ngay);
 *   - in ra JSON gọn để script khác/cron lấy link mà đổi link tải trên app + trang buy.
 *
 * Cần "API access token" của Diawi (Diawi → Settings → API access). Truyền theo thứ tự ưu tiên:
 *   --token <token>  |  --token-file <path>  |  biến môi trường DIAWI_TOKEN
 * KHÔNG commit token vào repo; trên node-2 nó nằm ở /root/.diawi-token (chmod 600).
 *
 * Dùng:
 *   node scripts/diawi-upload.mjs --file /root/flowvpn-ipa/VPNFlow-latest.ipa --days 30
 *   node scripts/diawi-upload.mjs --file app.apk --days 30 --find-by-udid --comment "VPNFlow 1.2.6"
 *   node scripts/diawi-upload.mjs --file app.ipa --json      # chỉ in JSON để máy đọc
 *
 * Lưu ý về IPA: bản dev/ad-hoc CHỈ cài được trên máy có UDID nằm trong provisioning profile.
 * Với bản đó nên bật `--find-by-udid` để máy lạ gửi UDID cho mình (rồi phải build lại kèm UDID đó).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const UPLOAD_URL = "https://upload.diawi.com/";
const STATUS_URL = "https://upload.diawi.com/status";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

function parseArgs(argv) {
  const args = {
    file: null, token: null, tokenFile: null, days: null, password: null,
    comment: null, findByUdid: false, wallaby: false, json: false, help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} cần một giá trị`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--file": args.file = next(); break;
      case "--token": args.token = next(); break;
      case "--token-file": args.tokenFile = next(); break;
      case "--days": args.days = Number(next()); break;
      case "--password": args.password = next(); break;
      case "--comment": args.comment = next(); break;
      case "--find-by-udid": args.findByUdid = true; break;
      case "--wallaby": args.wallaby = true; break;
      case "--json": args.json = true; break;
      case "-h":
      case "--help": args.help = true; break;
      default: throw new Error(`tham số lạ: ${arg}`);
    }
  }
  return args;
}

function readToken(args) {
  if (args.token) return args.token.trim();
  if (args.tokenFile) return fs.readFileSync(args.tokenFile, "utf8").trim();
  if (process.env.DIAWI_TOKEN) return process.env.DIAWI_TOKEN.trim();
  return null;
}

/**
 * Gọi HTTP bằng `curl` (không dùng fetch): VPS có bản ghi AAAA cho *.diawi.com nhưng IPv6 không
 * đi được, node fetch chọn IPv6 rồi treo tới lúc timeout (ETIMEDOUT) trong khi curl đi IPv4 bình
 * thường. Token truyền qua file cấu hình curl (-K) chmod 600 rồi xoá ngay, KHÔNG để lộ trong `ps`.
 */
function curlWithConfig(lines, { timeoutSec = 900 } = {}) {
  const cfg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "diawi-")), "curl.conf");
  fs.writeFileSync(cfg, lines.join("\n") + "\n", { mode: 0o600 });
  try {
    const res = spawnSync("curl", ["-sS", "--fail-with-body", "--max-time", String(timeoutSec), "-K", cfg], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: (timeoutSec + 30) * 1000,
    });
    if (res.error) throw new Error(`không chạy được curl: ${res.error.message}`);
    if (res.status !== 0) {
      throw new Error(`curl lỗi (exit ${res.status}): ${(res.stderr || res.stdout || "").trim().slice(0, 300)}`);
    }
    return res.stdout;
  } finally {
    try { fs.rmSync(path.dirname(cfg), { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function escapeCurlConfigValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function postFile({ token, file, options }) {
  const lines = ['url = "https://upload.diawi.com/"', `form = "token=${escapeCurlConfigValue(token)}"`, `form = "file=@${escapeCurlConfigValue(file)}"`];
  for (const [key, value] of Object.entries(options)) {
    if (value === null || value === undefined || value === false) continue;
    lines.push(`form = "${key}=${escapeCurlConfigValue(value === true ? "1" : value)}"`);
  }
  const text = curlWithConfig(lines);
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* Diawi trả HTML khi lỗi hạ tầng */ }
  if (parsed?.error) throw new Error(`upload lỗi ${parsed.error}: ${parsed.message ?? text.slice(0, 200)}`);
  if (!parsed?.job) throw new Error(`upload không trả về job: ${text.slice(0, 300)}`);
  return parsed.job;
}

/** Diawi xử lý nền: status 2000 = xong; mã khác kèm `message` là còn chạy hoặc lỗi. */
async function waitForLink(token, job, { quiet = false } = {}) {
  const startedAt = Date.now();
  let lastStatus = null;
  for (;;) {
    const text = curlWithConfig([
      `url = "${STATUS_URL}?token=${escapeCurlConfigValue(token)}&job=${escapeCurlConfigValue(job)}"`,
    ], { timeoutSec: 60 });
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    if (!parsed || parsed.error) throw new Error(`status lỗi: ${text.slice(0, 300)}`);
    if (parsed.link) return parsed;
    if (parsed.status !== lastStatus) {
      lastStatus = parsed.status;
      if (!quiet) console.log(`  … Diawi status=${parsed.status} ${parsed.message ?? ""}`);
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) throw new Error("quá thời gian chờ Diawi xử lý (30 phút)");
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: node scripts/diawi-upload.mjs --file <path> [--days 30] [--comment txt] [--find-by-udid] [--password pw] [--token t|--token-file f] [--json]");
    return;
  }
  if (!args.file) throw new Error("thiếu --file");
  const token = readToken(args);
  if (!token) throw new Error("thiếu token: --token, --token-file hoặc DIAWI_TOKEN");
  if (!fs.existsSync(args.file)) throw new Error(`không thấy file: ${args.file}`);

  const stat = fs.statSync(args.file);
  const md5 = crypto.createHash("md5").update(fs.readFileSync(args.file)).digest("hex");
  if (!args.json) {
    console.log(`File : ${args.file}`);
    console.log(`Size : ${(stat.size / 1024 / 1024).toFixed(2)} MB · md5=${md5}`);
  }

  const options = {
    comment: args.comment,
    expiration: args.days ? `${args.days}d` : null,
    password: args.password,
    find_by_udid: args.findByUdid,
    wallaby: args.wallaby,
  };
  if (!args.json) console.log(`Đang upload${args.days ? ` (hết hạn sau ${args.days} ngày)` : ""}…`);
  const job = await postFile({ token, file: args.file, options });
  if (!args.json) console.log(`  job=${job}`);
  const result = await waitForLink(token, job, { quiet: args.json });

  const payload = {
    file: args.file,
    name: path.basename(args.file),
    bytes: stat.size,
    md5,
    job,
    link: result.link,
    expiresAt: result.expiresAt ?? result.expiration ?? null,
    raw: args.json ? undefined : result,
  };
  if (args.json) console.log(JSON.stringify(payload));
  else {
    console.log(`\nLink : ${result.link}`);
    console.log(JSON.stringify(result));
  }
}

main().catch((err) => {
  console.error(`LỖI: ${err.message}`);
  process.exit(1);
});
