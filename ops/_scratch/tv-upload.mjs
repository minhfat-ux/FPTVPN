/**
 * Upload file lớn từ máy Windows lên node-2 bằng NHIỀU kết nối scp SONG SONG + resume.
 *
 * Vì sao: đo thật 28/09/2026 — 1 kết nối scp chỉ ~31 KB/s (RTT cao); 4-8 kết nối song song
 * ~90-115 KB/s. Một file 90 MB một kết nối = ~48 phút; song song = ~15 phút.
 *
 * Resume: chunk nằm ở /tmp/tvup-<tên-file>/ trên node-2. Chạy lại sẽ bỏ qua chunk đã có ĐỦ byte.
 *
 * Dùng: node ops/_scratch/tv-upload.mjs <file-local> <đường-dẫn-remote> [chunkMB] [song song]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";

const [localFile, remotePath, chunkMbArg, concArg] = process.argv.slice(2);
if (!localFile || !remotePath) {
  console.error("Thiếu tham số: <file-local> <đường-dẫn-remote> [chunkMB] [song-song]");
  process.exit(2);
}
const chunkSize = (Number(chunkMbArg) || 1) * 1024 * 1024;
const concurrency = Number(concArg) || 6;
const key = path.join(process.env.USERPROFILE, ".ssh", "id_ed25519");
const host = "root@165.101.114.162";
const stage = `/tmp/tvup-${path.basename(remotePath).replace(/[^A-Za-z0-9._-]/g, "_")}`;
const NO_WINDOW = { windowsHide: true }; // Windows: đừng nháy cửa sổ console

/**
 * Sandbox chặn named pipe ⇒ KHÔNG hứng stdout/stderr của tiến trình con bằng pipe
 * (spawnSync mặc định dùng pipe ⇒ EPERM). Hứng bằng hai tệp tạm, như `ops/lib/capture.mjs`.
 */
function runCapture(command, args, { ignoreOutput = false } = {}) {
  if (ignoreOutput) return { status: spawnSync(command, args, { stdio: "ignore", ...NO_WINDOW }).status, stdout: "", stderr: "" };
  const base = path.join(os.tmpdir(), `tvup-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const outFd = fs.openSync(base, "w");
  const errFd = fs.openSync(`${base}.err`, "w");
  const result = spawnSync(command, args, { stdio: ["ignore", outFd, errFd], ...NO_WINDOW });
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  const stdout = fs.readFileSync(base, "utf8");
  const stderr = fs.readFileSync(`${base}.err`, "utf8");
  fs.rmSync(base, { force: true });
  fs.rmSync(`${base}.err`, { force: true });
  return { status: result.status, stdout, stderr };
}

const ssh = (command) => runCapture("ssh", ["-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, command]);
/** scp chạy NỀN (không pipe) để nhiều kết nối cùng lúc. */
const scpAsync = (from, to) =>
  new Promise((resolve) => {
    const child = spawn("scp", ["-O", "-q", "-i", key, "-o", "BatchMode=yes", from, to], { stdio: "ignore", ...NO_WINDOW });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });

const size = fs.statSync(localFile).size;
const fd = fs.openSync(localFile, "r");
const readAt = (position, length) => {
  const out = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const got = fs.readSync(fd, out, done, length - done, position + done);
    if (!got) break;
    done += got;
  }
  return out.subarray(0, done);
};

const digest = crypto.createHash("sha256");
for (let offset = 0; offset < size; offset += 4 * 1024 * 1024) digest.update(readAt(offset, Math.min(4 * 1024 * 1024, size - offset)));
const sha = digest.digest("hex");

const chunks = Math.ceil(size / chunkSize);
console.log(`local : ${localFile}\n        ${size} byte  sha256=${sha}\n        ${chunks} chunk x ${chunkSize / 1048576} MB, ${concurrency} song song\nstage : ${stage}`);

if (ssh(`mkdir -p ${stage}`).status !== 0) {
  console.error("không tạo được thư mục tạm trên node-2");
  process.exit(2);
}

// Resume: chunk nào đã nằm trên node-2 với ĐÚNG số byte thì bỏ qua.
const listing = ssh(`cd ${stage} && ls -l 2>/dev/null | awk '{print $9, $5}'`);
const staged = new Map();
for (const line of (listing.stdout || "").split("\n")) {
  const [name, bytes] = line.trim().split(/\s+/);
  if (name && /^c\d{5}$/.test(name)) staged.set(name, Number(bytes));
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tvup-"));
const queue = [];
for (let index = 0; index < chunks; index += 1) {
  const name = `c${String(index).padStart(5, "0")}`;
  const length = Math.min(chunkSize, size - index * chunkSize);
  if (staged.get(name) === length) continue; // đã có đủ
  queue.push({ index, name, length });
}
const already = chunks - queue.length;
if (already) console.log(`resume: bỏ qua ${already}/${chunks} chunk đã đẩy trước đó`);

const started = Date.now();
let uploaded = already;
let failed = 0;
function tick() {
  const elapsed = (Date.now() - started) / 1000;
  const rate = uploaded > already ? Math.round(((uploaded - already) * chunkSize) / 1024 / elapsed) : 0;
  process.stdout.write(`\r  đã đẩy ${uploaded}/${chunks} chunk  (~${rate} KB/s, ${Math.round(elapsed)}s)      `);
}
tick();

async function uploadChunk(job) {
  const local = path.join(tmpDir, job.name);
  fs.writeFileSync(local, readAt(job.index * chunkSize, job.length));
  const ok = await scpAsync(local, `${host}:${stage}/${job.name}`);
  fs.unlinkSync(local);
  if (ok) uploaded += 1;
  else {
    failed += 1;
    console.error(`\n  ! chunk ${job.name} lỗi`);
  }
  tick();
}

const workers = Array.from({ length: concurrency }, async () => {
  while (queue.length) await uploadChunk(queue.shift());
});
await Promise.all(workers);
fs.closeSync(fd);
process.stdout.write("\n");
fs.rmSync(tmpDir, { recursive: true, force: true });

if (failed) {
  console.error(`${failed} chunk lỗi — chưa ghép. Chạy lại lệnh này để resume (stage ${stage}).`);
  process.exit(3);
}

const assemble = ssh(`cd ${stage} && cat $(ls -v | grep -E '^c[0-9]{5}$') > assembled.bin && sha256sum assembled.bin && stat -c %s assembled.bin`);
console.log((assemble.stdout || assemble.stderr || "").trim());
const remoteSha = (assemble.stdout || "").trim().split(/\s+/)[0];
if (remoteSha !== sha) {
  console.error(`SHA256 KHÔNG KHỚP: remote=${remoteSha} local=${sha}`);
  process.exit(4);
}
const place = ssh(
  `mkdir -p "$(dirname ${remotePath})" && mv ${stage}/assembled.bin ${remotePath} && chown caddy:caddy ${remotePath} && chmod 644 ${remotePath} && rm -rf ${stage} && sha256sum ${remotePath} && stat -c '%s %n' ${remotePath}`,
);
console.log((place.stdout || place.stderr || "").trim());
console.log(`XONG sau ${Math.round((Date.now() - started) / 1000)}s: ${remotePath}`);
