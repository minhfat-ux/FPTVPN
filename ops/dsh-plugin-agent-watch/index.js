/**
 * dsh-plugin-agent-watch — gắn vòng đời watcher đánh thức vào `dsh web`.
 *
 * Khi profile web khởi động: dừng watcher cũ (nếu còn) rồi chạy `ops/agent-watch.mjs --auto`.
 * Khi dsh web tắt: `ctx.effect` dọn tiến trình ⇒ không còn watcher mồ côi.
 *
 * Mọi lỗi đều được nuốt và ghi log: plugin này KHÔNG được làm hỏng việc boot harness.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const name = "agent-watch";

/** Chu kỳ thử lại khi repo chưa sẵn sàng (ms). */
const RETRY_MS = Number(process.env.AGENT_WATCH_RETRY_MS || 30000);

const DEFAULTS = {
  enabled: true,
  repo: process.env.FLOWGPT_REPO || "/Volumes/BIWIN/FlowGPT",
  script: "ops/agent-watch.mjs",
  agentName: "MAC",
  interval: 20,
  auto: true,
  log: "",
};

function listWatchers() {
  try {
    return execFileSync("pgrep", ["-fl", "agent-watch.mjs"], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return []; // pgrep trả mã 1 khi không có tiến trình nào
  }
}

/**
 * Dừng watcher cũ trước khi chạy cái mới — tránh 2 watcher cùng đánh thức.
 *
 * Khớp theo TÊN SCRIPT (`agent-watch.mjs`) chứ không theo đường dẫn repo: watcher chạy tay
 * có thể có cmdline dạng đường dẫn tương đối (`node ops/agent-watch.mjs`), khi đó so khớp
 * theo repo sẽ trượt và để lại watcher mồ côi (đã gặp thật).
 */
function stopWatchers(repo, log) {
  let stopped = 0;
  for (const line of listWatchers()) {
    if (!line.includes("agent-watch.mjs")) continue;
    const pid = Number(line.split(/\s+/)[0]);
    if (!Number.isFinite(pid) || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGTERM");
      stopped += 1;
    } catch (error) {
      log(`không dừng được pid ${pid}: ${error?.message ?? error}`);
    }
  }
  return stopped;
}

export function apply(ctx, config = {}) {
  const options = { ...DEFAULTS, ...(config ?? {}) };
  const logFile = options.log || `/tmp/agent-watch-${String(options.agentName).toLowerCase()}.log`;
  const log = (message) => {
    const line = `[agent-watch] ${message}`;
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
    } catch {
      /* không ghi được log thì thôi */
    }
    try {
      ctx.logger?.info?.(line);
    } catch {
      /* logger không có cũng không sao */
    }
  };

  let child = null;
  let timer = null;
  let attempts = 0;

  /** Thử khởi động; nếu repo/script chưa có (ví dụ ổ ngoài chưa mount) thì hẹn thử lại. */
  const start = () => {
    try {
      if (child) return;
      const cwd = options.repo;
      const scriptPath = path.join(cwd, options.script);
      if (!fs.existsSync(scriptPath)) {
        attempts += 1;
        if (attempts === 1 || attempts % 10 === 0) {
          log(`chưa thấy ${scriptPath} (lần thử ${attempts}) — sẽ thử lại mỗi ${RETRY_MS / 1000}s`);
        }
        return;
      }
      const stopped = stopWatchers(cwd, log);
      if (stopped) log(`đã dừng ${stopped} watcher cũ của repo này`);

      const args = [scriptPath, ...(options.auto ? ["--auto"] : []), "--interval", String(options.interval)];
      const out = fs.openSync(logFile, "a");
      child = spawn(process.execPath, args, {
        cwd,
        detached: true,
        stdio: ["ignore", out, out],
        env: { ...process.env, AGENT_NAME: options.agentName },
      });
      child.unref();
      child.on("exit", (code) => {
        log(`watcher thoát (mã ${code}) — sẽ khởi động lại`);
        child = null;
      });
      log(`đã khởi động watcher pid ${child.pid} · ${options.agentName} · poll ${options.interval}s · ${options.auto ? "tự đánh thức" : "chỉ báo"}`);
    } catch (error) {
      log(`lỗi khởi động: ${error?.message ?? error}`);
    }
  };

  try {
    if (!options.enabled) {
      log("đang tắt (enabled: false) — không khởi động watcher");
      return;
    }

    // Cập nhật bảng trạng thái trước khi vào việc: phiên mới mở ra là biết ngay tình hình.
    const refreshBoard = () => {
      try {
        if (!fs.existsSync(path.join(options.repo, "ops", "status-board.mjs"))) return;
        spawn(process.execPath, [path.join("ops", "status-board.mjs")], { cwd: options.repo, detached: true, stdio: "ignore" }).unref();
        log("đã cập nhật bảng trạng thái AGENTS.local.md");
      } catch (error) {
        log(`không cập nhật được bảng trạng thái: ${error?.message ?? error}`);
      }
    };

    start();
    refreshBoard();
    // Thử lại định kỳ: ổ ngoài có thể được cắm SAU khi dsh web khởi động (đã gặp thật —
    // watcher không chạy suốt phiên vì repo chưa mount lúc boot).
    timer = setInterval(() => {
      if (!child) {
        start();
        if (child) refreshBoard();
      }
    }, RETRY_MS);
    timer.unref?.();

    ctx.effect(() => () => {
      try {
        if (timer) clearInterval(timer);
        if (child) {
          process.kill(child.pid, "SIGTERM");
          log(`đã dừng watcher pid ${child.pid} (dsh web tắt)`);
        }
      } catch {
        /* đã chết rồi */
      }
    });
  } catch (error) {
    log(`lỗi khởi động: ${error?.message ?? error}`);
  }
}
