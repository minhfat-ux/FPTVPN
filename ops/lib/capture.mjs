/**
 * Chạy tiến trình con và LẤY stdout/stderr — chịu được cả môi trường chặn named pipe.
 *
 * VÌ SAO CẦN (lỗi thật, đo được 19/09/2026):
 * Phiên harness do watcher ĐÁNH THỨC chạy ở chế độ sandbox `workspace-write`. Ở chế độ đó Node
 * KHÔNG mở được named pipe, nên mọi `execFileSync(..., { stdio: ["ignore","pipe","pipe"] })` chết
 * ngay: `spawnSync git EPERM` — git chưa hề chạy. Hậu quả: phiên được đánh thức `ack`/`done` được
 * (ghi tệp sự kiện bằng fs) nhưng KHÔNG `fetch`/`push` được sổ lên git; bằng chứng nằm lại máy,
 * bên giao không thấy gì. Đã ghi nhận nguyên văn trong `done` của T-20260919-01:
 * "push git bi chan EPERM trong sandbox phien nay".
 *
 * CÁCH CHỮA: hứng stdout/stderr vào TỆP TẠM rồi đọc lại. Tệp là file descriptor, không phải pipe,
 * nên sandbox cho qua. Chỉ dùng đường này khi đường pipe bị từ chối — máy bình thường vẫn chạy
 * đường pipe (nhanh, không tạo tệp).
 *
 *   const r = runCapture("git", ["push", "origin", "HEAD:flowgpt"], { cwd: repo });
 *   if (!r.ok) console.error(r.stderr);
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const NO_WINDOW = { windowsHide: true };

/** Tiến trình KHÔNG chạy được vì sandbox chặn pipe (khác với chạy được nhưng trả mã != 0). */
function spawnDenied(error) {
  if (!error) return false;
  if (error.status !== undefined && error.status !== null) return false; // có mã thoát ⇒ đã chạy thật
  if (["EPERM", "ENOTSUP", "EACCES", "EPIPE"].includes(String(error.code ?? ""))) return true;
  return /spawnSync .* EPERM|open named pipe|libuv/i.test(String(error.message ?? ""));
}

const tempPath = (tag) => path.join(os.tmpdir(), `capture-${process.pid}-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

function readOut(file, binary, fallback) {
  try {
    const data = fs.readFileSync(file);
    return binary ? data : data.toString("utf8");
  } catch {
    return fallback;
  }
}

function asText(value) {
  if (value === undefined || value === null) return "";
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(asText(value), "utf8");
}

/**
 * @returns {{ ok: boolean, stdout: string|Buffer, stderr: string|Buffer, code: number|null, spawnDenied: boolean }}
 *   - `binary: true`  ⇒ stdout/stderr là Buffer (dùng cho `git cat-file --batch`).
 *   - `input`         ⇒ stdin lấy từ tệp tạm (không bao giờ dùng pipe).
 */
export function runCapture(command, args, { input = null, binary = false, cwd = undefined, timeout = 120000, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const options = { cwd, timeout, maxBuffer, ...NO_WINDOW };
  const empty = binary ? Buffer.alloc(0) : "";

  // Đường thường: pipe. Chỉ dùng khi KHÔNG cần đưa dữ liệu vào stdin (stdin pipe cũng là named pipe).
  if (input === null) {
    try {
      const out = execFileSync(command, args, { ...options, ...(binary ? {} : { encoding: "utf8" }), stdio: ["ignore", "pipe", "pipe"] });
      return { ok: true, stdout: binary ? asBuffer(out) : asText(out), stderr: empty, code: 0, spawnDenied: false };
    } catch (error) {
      if (!spawnDenied(error)) {
        return {
          ok: false,
          stdout: binary ? asBuffer(error.stdout) : asText(error.stdout),
          stderr: binary ? asBuffer(error.stderr) : asText(error.stderr) || asText(error.message),
          code: typeof error.status === "number" ? error.status : null,
          spawnDenied: false,
        };
      }
    }
  }

  // Đường chịu sandbox: mọi luồng đều là TỆP.
  const outFile = tempPath("out");
  const errFile = tempPath("err");
  const inFile = input === null ? null : tempPath("in");
  const opened = [];
  try {
    if (inFile) fs.writeFileSync(inFile, input);
    const fdIn = inFile ? fs.openSync(inFile, "r") : fs.openSync(os.devNull, "r");
    const fdOut = fs.openSync(outFile, "w");
    const fdErr = fs.openSync(errFile, "w");
    opened.push(fdIn, fdOut, fdErr);
    execFileSync(command, args, { ...options, stdio: [fdIn, fdOut, fdErr] });
    return { ok: true, stdout: readOut(outFile, binary, empty), stderr: binary ? Buffer.alloc(0) : readOut(errFile, false, ""), code: 0, spawnDenied: false };
  } catch (error) {
    const stderr = readOut(errFile, binary, empty);
    return {
      ok: false,
      stdout: readOut(outFile, binary, empty),
      stderr: binary ? (stderr.length ? stderr : asBuffer(error.message)) : stderr || asText(error.message),
      code: typeof error.status === "number" ? error.status : null,
      spawnDenied: spawnDenied(error),
    };
  } finally {
    for (const fd of opened) {
      try { fs.closeSync(fd); } catch { /* đã đóng */ }
    }
    for (const file of [outFile, errFile, inFile]) {
      try { if (file) fs.rmSync(file, { force: true }); } catch { /* tệp tạm */ }
    }
  }
}

/** Bản gọn cho git: trả về stdout đã cắt, hoặc `!git: …` đúng như các script cũ mong đợi. */
export function gitCapture(args, options = {}) {
  const result = runCapture("git", args, options);
  if (!result.ok) {
    const detail = asText(result.stderr) || asText(result.stdout) || "git lỗi";
    return `!git: ${detail.trim().split("\n")[0]}`;
  }
  return asText(result.stdout).trim();
}
