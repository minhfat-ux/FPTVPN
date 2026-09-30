// Đẩy BẰNG CHỨNG (không chỉ sổ ops/tasks) lên origin/flowgpt.
//
// Vì sao cần riêng: `node ops/task.mjs done --push` chỉ đẩy `ops/tasks/`. Nhưng lệnh `--verify` và
// `docs/evidence/**` mà sự kiện `done` trỏ tới thì KHÔNG được đẩy kèm ⇒ bên giao không nghiệm thu được.
// Cây làm việc cục bộ ở đây đang lệch nặng với origin/flowgpt, nên phải chép sang worktree tạm của
// origin/flowgpt rồi commit ở đó — đúng cách `pushLedger` trong ops/task.mjs vẫn làm.
//
// Dùng: node ops/_scratch/T-20260930-02/push-evidence.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCapture, gitCapture } from "../../lib/capture.mjs";

const PATHS = [
  "docs/evidence/T-20260930-02",
  "ops/_scratch/T-20260930-02",
  "ops/verify-claude-gemini-vpn.mjs",
];
const SUBJECT = "T-20260930-02: Claude/Gemini qua VPN KHONG bi chan (do 2 vantage) + script nghiem thu + bang chung";

function ghToken() {
  const fromEnv = String(process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "").trim();
  if (fromEnv) return fromEnv;
  const result = runCapture("gh", ["auth", "token"]);
  return result.ok ? String(result.stdout).trim() : "";
}

function pushAuthed(ref, cwd) {
  const direct = gitCapture(["push", "origin", ref], { cwd });
  if (!direct.startsWith("!git")) return { ok: true, detail: direct };
  const token = ghToken();
  const url = gitCapture(["remote", "get-url", "origin"], { cwd });
  if (!token || url.startsWith("!git")) return { ok: false, detail: direct };
  const slug = String(url)
    .trim()
    .replace(/^https:\/\/[^@/]*@/, "https://")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  if (!slug || slug.includes("://")) return { ok: false, detail: direct };
  const retry = gitCapture(
    ["-c", "credential.helper=", "push", `https://x-access-token:${token}@github.com/${slug}.git`, ref],
    { cwd },
  );
  if (retry.startsWith("!git")) return { ok: false, detail: `${direct} | token: ${retry}` };
  return { ok: true, detail: `${retry} (qua token gh)` };
}

for (const p of PATHS) {
  if (!fs.existsSync(p)) {
    console.error(`Thiếu đường dẫn: ${p}`);
    process.exit(2);
  }
}

console.log(gitCapture(["fetch", "origin", "flowgpt"]) || "đã fetch origin flowgpt");

const worktree = path.join(os.tmpdir(), `dsh-evidence-${process.pid}`);
const added = gitCapture(["worktree", "add", "-q", "--detach", worktree, "origin/flowgpt"]);
if (added.startsWith("!git")) {
  console.error(`Không tạo được worktree: ${added}`);
  process.exit(1);
}

try {
  for (const p of PATHS) {
    const dest = path.join(worktree, p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(p, dest, { recursive: true });
  }
  const staged = gitCapture(["add", ...PATHS], { cwd: worktree });
  if (staged.startsWith("!git")) throw new Error(`git add: ${staged}`);

  const status = gitCapture(["status", "--short", "--", ...PATHS], { cwd: worktree });
  console.log(`--- sẽ commit ---\n${status}`);

  const commit = gitCapture(
    ["-c", "user.email=agent@flowtech", "-c", "user.name=FlowTech Agent", "commit", "-q", "-m", SUBJECT],
    { cwd: worktree },
  );
  if (commit.startsWith("!git")) throw new Error(`git commit: ${commit}`);

  const sha = gitCapture(["rev-parse", "--short", "HEAD"], { cwd: worktree });
  console.log(`commit: ${sha}  ${SUBJECT}`);

  const pushed = pushAuthed("HEAD:flowgpt", worktree);
  console.log(pushed.ok ? `push OK: ${pushed.detail || "thành công"}` : `PUSH LỖI: ${pushed.detail}`);
  process.exitCode = pushed.ok ? 0 : 1;
} finally {
  gitCapture(["worktree", "remove", "--force", worktree]);
  gitCapture(["worktree", "prune"]);
}
