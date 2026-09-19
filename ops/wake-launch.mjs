#!/usr/bin/env node
/**
 * Chạy lệnh ĐÁNH THỨC với prompt NHIỀU DÒNG mà KHÔNG đi qua shell.
 *
 * Vì sao cần: watcher đánh thức harness bằng `dsh --profile headless "<prompt>"`. Trên Windows
 * `spawn(chuỗi, { shell: true })` chạy qua cmd.exe, mà cmd cắt lệnh ở dòng đầu — phiên được đánh
 * thức chỉ nhận đúng một dòng `ĐÁNH THỨC TỰ ĐỘNG (WIN  ← watcher MAC).` và mất toàn bộ phần
 * "Lý do / Task / việc phải làm" (đã gặp thật 2026-09-18, xem phiên session-05c623cb).
 *
 * Launcher này đọc prompt từ TỆP rồi truyền nguyên văn thành MỘT đối số argv, nên không bị cắt,
 * không bị cmd diễn giải `&`, `|`, `%`, `(`, `"`…
 *
 *   node ops/wake-launch.mjs --prompt-file <tệp> [--cmd "dsh --profile headless"]
 *   node ops/wake-launch.mjs --prompt-file <tệp> --cmd "dsh --profile headless" --print-argv
 *
 * `--cmd` là lệnh đích KHÔNG kèm prompt (mặc định `dsh --profile headless`, đổi bằng env
 * DSH_WAKE_TARGET). Nếu lệnh đích là shim npm (`.cmd`/`.bat`) thì tự tìm entry `.js` bên trong
 * để chạy bằng chính `node` — nhờ vậy không cần cmd.exe.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const promptFile = flag("prompt-file");
const template = flag("cmd", process.env.DSH_WAKE_TARGET || "dsh --profile headless");
const PRINT_ONLY = args.includes("--print-argv");

const LOG_FILE = path.join(os.tmpdir(), "dsh-wake-launch.log");
const log = (message) => {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* không ghi được log thì thôi */
  }
};

/** Tách chuỗi lệnh thành argv, tôn trọng ngoặc kép/đơn. */
export function tokenize(input) {
  const out = [];
  let current = "";
  let quote = null;
  for (const char of String(input)) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        out.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) out.push(current);
  return out;
}

function findOnPath(bin) {
  if (bin.includes("/") || bin.includes("\\") || path.isAbsolute(bin)) {
    return fs.existsSync(bin) ? bin : null;
  }
  const exists = (candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };
  // Tự dò PATH bằng JS (không spawn `where`/`which`) — chạy được cả trong môi trường bị chặn
  // tạo tiến trình con, và không phụ thuộc công cụ ngoài.
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").map((ext) => ext.trim()).filter(Boolean)
      : [""];
  // Trên Windows ưu tiên tên CÓ đuôi (.cmd/.exe/…): shim npm còn có tệp `dsh` không đuôi (script
  // bash) — chọn nhầm nó thì spawn sẽ ENOENT.
  const names = process.platform === "win32" ? [...extensions.map((ext) => bin + ext), bin] : [bin];
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/** Trong shim npm (`dsh.cmd`) có đường dẫn tới entry `.js`; lấy ra để chạy thẳng bằng node. */
function npmShimEntry(shim) {
  try {
    const text = fs.readFileSync(shim, "utf8");
    const match = text.match(/["']?([^"'\r\n]*node_modules[\\/][^"'\r\n]*?\.js)["']?/i);
    if (!match) return null;
    const raw = match[1].replace(/%~?dp0%?/gi, `${path.dirname(shim)}${path.sep}`).trim();
    const candidate = path.resolve(raw);
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** Quyết định cách chạy: trả về { program, prefixArgs, needsShell }. */
export function resolveTarget(bin) {
  const found = findOnPath(bin);
  if (!found) {
    // Không dò được (ví dụ Task Scheduler không có %APPDATA%\npm trong PATH). Trên Windows tên
    // trần như `dsh` là shim .cmd nên phải qua shell mới chạy — chấp nhận, nhưng prompt nhiều
    // dòng có thể bị cắt (có cảnh báo bên dưới).
    return { program: bin, prefixArgs: [], needsShell: process.platform === "win32" };
  }
  const ext = path.extname(found).toLowerCase();
  if (ext === ".cmd" || ext === ".bat") {
    const entry = npmShimEntry(found);
    if (entry) return { program: process.execPath, prefixArgs: [entry], needsShell: false };
    // Shim không có entry .js (script .cmd thuần): buộc phải qua cmd — prompt nhiều dòng sẽ hỏng.
    return { program: found, prefixArgs: [], needsShell: true };
  }
  return { program: found, prefixArgs: [], needsShell: false };
}

function main() {
  if (!promptFile) {
    log("thiếu --prompt-file");
    process.exit(2);
  }
  let prompt;
  try {
    prompt = fs.readFileSync(promptFile, "utf8");
  } catch (error) {
    log(`không đọc được prompt "${promptFile}": ${error.message}`);
    process.exit(2);
  }
  const tokens = tokenize(template);
  if (!tokens.length) {
    log("--cmd rỗng");
    process.exit(2);
  }
  const { program, prefixArgs, needsShell } = resolveTarget(tokens[0]);
  const argv = [...prefixArgs, ...tokens.slice(1), prompt];

  if (PRINT_ONLY) {
    console.log(JSON.stringify({ program, argv, promptLength: prompt.length, needsShell }, null, 1));
    return;
  }

  if (needsShell && /[\r\n]/.test(prompt)) {
    log(`CẢNH BÁO: ${program} cần shell và prompt có xuống dòng — có thể bị cắt. Nên dùng lệnh đích có entry .js.`);
  }
  const child = spawn(program, argv, {
    detached: true,
    stdio: "ignore",
    // Trên Windows mặc định `windowsHide:false` ⇒ mỗi lần đánh thức lại nháy một cửa sổ console
    // (đúng thứ tự "bão cửa sổ" mà bộ nghe SSE đang dẹp). Ẩn đi; trên macOS/Linux vô hại.
    windowsHide: true,
    shell: needsShell,
    cwd: process.cwd(),
    env: process.env,
  });
  child.unref();
  log(`đã chạy ${program} (pid ${child.pid}, prompt ${prompt.length} ký tự, ${argv.length} đối số)`);
  try {
    fs.rmSync(promptFile, { force: true });
  } catch {
    /* tệp tạm, để lại cũng không sao */
  }
}

// Chỉ tự chạy khi được gọi trực tiếp (không phải lúc bị import để test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
