#!/usr/bin/env node
/**
 * flowvpn-harness — cài DeepSeek Harness rồi áp style FlowVPN + branding FlowTech.
 *
 * Chạy MỘT dòng (không cần clone repo):
 *     npx -y github:minhfat-ux/FPTVPN#harness
 *
 * Việc nó làm, theo đúng thứ tự:
 *   1) kiểm tra Node.js (đang chạy được script này nghĩa là có) + npm
 *   2) cài DeepSeek Harness nếu máy chưa có:  npm install -g @deepseek-ai/dsh
 *   3) copy bộ cài của đúng hệ điều hành ra thư mục tạm (để patch ghi backup được)
 *   4) chạy installer của bộ đó: theme FlowVPN + branding FlowTech + profile
 *   5) in bước cuối (restart `dsh web`, hard refresh)
 *
 * Tham số:
 *   --skip-patch        chỉ cài DSH, không patch style
 *   --dsh-root <path>   chỉ định thư mục DSH nếu tự dò không ra (chỉ macOS)
 *   --dry-run           in ra sẽ làm gì, không chạy
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const valueOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dryRun = hasFlag("--dry-run");
const skipPatch = hasFlag("--skip-patch");
const dshRoot = valueOf("--dsh-root");

const say = (m) => console.log(`\u001b[36m==>\u001b[0m ${m}`);
const ok = (m) => console.log(`   \u001b[32mOK\u001b[0m  ${m}`);
const warn = (m) => console.log(`   \u001b[33m!!\u001b[0m  ${m}`);

function run(cmd, args, { allowFail = false } = {}) {
  if (dryRun) {
    console.log(`   (dry-run) ${cmd} ${args.join(" ")}`);
    return { status: 0, stdout: "" };
  }
  const result = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`lệnh thất bại: ${cmd} ${args.join(" ")} (exit ${result.status})`);
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

function npmRootGlobal() {
  const r = run("npm", ["root", "-g"], { allowFail: true });
  return r.status === 0 ? r.stdout.trim() : "";
}

function main() {
  console.log("\n  ============================================");
  console.log("   FLOWTECH HARNESS - CAI DAT 1 DONG LENH");
  console.log("  ============================================\n");

  const platform = process.platform;
  const bundleDir = platform === "win32" ? "windows" : platform === "darwin" ? "mac" : null;
  if (!bundleDir) {
    throw new Error(`chưa hỗ trợ hệ điều hành "${platform}" (chỉ Windows và macOS)`);
  }
  say(`Hệ điều hành: ${platform} · Node ${process.version}`);

  // [1] DeepSeek Harness
  say("Kiểm tra DeepSeek Harness (@deepseek-ai/dsh)");
  const root = npmRootGlobal();
  let installed = root ? existsSync(path.join(root, "@deepseek-ai", "dsh")) : false;
  if (!installed) {
    say("Chưa có DSH — đang cài: npm install -g @deepseek-ai/dsh");
    run("npm", ["install", "-g", "@deepseek-ai/dsh"]);
    installed = true;
  }
  ok("DSH đã sẵn sàng");

  // [2] copy bundle ra thư mục tạm: patch cần ghi file backup cạnh nguồn, mà cache của npx
  // không phải chỗ nên ghi.
  const src = path.join(HERE, bundleDir);
  if (!existsSync(src)) {
    throw new Error(`thiếu thư mục ${bundleDir}/ trong package — cài lại bằng: npx -y github:minhfat-ux/FPTVPN#harness`);
  }
  const workDir = dryRun ? path.join(tmpdir(), "flowvpn-harness") : mkdtempSync(path.join(tmpdir(), "flowvpn-harness-"));
  say(`Chuẩn bị bộ cài trong ${workDir}`);
  if (!dryRun) {
    cpSync(src, workDir, { recursive: true });
    const shared = path.join(HERE, "profile");
    if (existsSync(shared)) cpSync(shared, path.join(workDir, "profile"), { recursive: true });
  }

  // [3] chạy installer của hệ điều hành
  if (platform === "win32") {
    const script = path.join(workDir, "install-fpt-harness.ps1");
    const args = ["-ExecutionPolicy", "Bypass", "-File", script];
    if (skipPatch) args.push("-SkipPatch");
    say("Chạy installer Windows");
    run("powershell", args);
  } else {
    const script = path.join(workDir, "install-mac.sh");
    const args = [script];
    if (skipPatch) args.push("--skip-patch");
    if (dshRoot) args.push("--dsh-root", dshRoot);
    say("Chạy installer macOS");
    run("bash", args);
  }

  if (!dryRun) {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* thư mục tạm, không quan trọng */
    }
  }

  console.log("\n  ============================================");
  console.log("   XONG");
  console.log("  ============================================");
  console.log("  1) Restart DSH:  Ctrl+C cửa sổ `dsh web` rồi chạy lại  dsh web");
  console.log("  2) Trong trình duyệt:  Ctrl+Shift+R  (hard refresh)");
  console.log("  Patch chỉ đổi style/branding, không đụng dữ liệu phiên làm việc.\n");
}

try {
  main();
} catch (err) {
  console.error(`\n\u001b[31mLỖI:\u001b[0m ${err?.message ?? err}\n`);
  process.exit(1);
}
