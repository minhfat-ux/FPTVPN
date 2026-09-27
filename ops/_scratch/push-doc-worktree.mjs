/**
 * Đẩy một danh sách TỆP (không phải chỉ sổ ops/tasks) lên origin/flowgpt qua worktree tạm.
 *
 * Vì sao cần: cây làm việc của máy WIN lệch xa origin (ahead/behind hàng trăm commit) nên
 * `git push HEAD:flowgpt` bị non-fast-forward. `ops/task.mjs` đã giải quyết cho sổ bằng cách
 * chép `ops/tasks/` sang worktree của origin — script này làm y hệt cho tệp bằng chứng.
 *
 * Dùng: node ops/_scratch/push-doc-worktree.mjs --msg "commit message" --file <path> [--file <path>...]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gitCapture, runCapture } from "../lib/capture.mjs";

const argv = process.argv.slice(2);
const files = [];
let msg = "docs: evidence";
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--file") files.push(argv[++i]);
  else if (argv[i] === "--msg") msg = argv[++i];
}
if (!files.length) {
  console.error("Thiếu --file <đường dẫn>");
  process.exit(2);
}

gitCapture(["fetch", "origin", "flowgpt"]);
const worktree = path.join(os.tmpdir(), `dsh-pushfiles-${process.pid}`);
const added = gitCapture(["worktree", "add", "-q", "--detach", worktree, "origin/flowgpt"]);
if (added.startsWith("!git")) {
  console.error("worktree add lỗi:", added);
  process.exit(1);
}

try {
  for (const file of files) {
    const dest = path.join(worktree, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  console.log("git add:", runCapture("git", ["add", ...files], { cwd: worktree }).ok ? "ok" : "lỗi");
  const commit = runCapture(
    "git",
    ["-c", "user.email=agent@flowtech", "-c", "user.name=FlowTech Agent", "commit", "-q", "-m", msg, "--", ...files],
    { cwd: worktree },
  );
  if (!commit.ok) {
    console.log("commit:", String(commit.stderr).trim().slice(0, 300));
  }
  const sha = gitCapture(["rev-parse", "--short", "HEAD"], { cwd: worktree });

  const tokenResult = runCapture("gh", ["auth", "token"]);
  const token = tokenResult.ok ? String(tokenResult.stdout).trim() : String(process.env.GITHUB_TOKEN ?? "").trim();
  if (!token) {
    console.error("Không lấy được token (gh auth token) — chưa push.");
    process.exit(1);
  }
  const remote = gitCapture(["remote", "get-url", "origin"]).replace(/^https:\/\/[^@/]*@/, "https://");
  const slug = remote.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").split("\n")[0].trim();
  const push = runCapture(
    "git",
    ["-c", "credential.helper=", "push", `https://x-access-token:${token}@github.com/${slug}.git`, "HEAD:flowgpt"],
    { cwd: worktree },
  );
  console.log("push:", push.ok ? "OK" : "LỖI");
  if (!push.ok) console.log(String(push.stderr).replaceAll(token, "***").trim().slice(0, 400));
  console.log("commit:", sha);
} finally {
  gitCapture(["worktree", "remove", "--force", worktree]);
  gitCapture(["worktree", "prune"]);
}
