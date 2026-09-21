#!/usr/bin/env node
/**
 * Cài plugin AgentTeams (@nanmicoder/dsh-agent-teams) vào một profile DSH.
 *
 *   node ops/install-agent-teams.mjs [--profile web] [--version 0.1.20]
 *
 * PHẢI chạy NGOÀI harness (terminal thường của người dùng). Vì sao: session harness bị
 * file-sandbox `workspace-write` chặn mọi ghi ra ~/.dsh, nên `dsh plugin add` chạy từ trong
 * chat sẽ chết với `[EPERM] ...\.dsh\profiles\<p>\_tmp_...` (đã gặp thật trên WIN 21/09/2026).
 * Chi tiết: docs/TASK-dsh-agent-teams-upgrade.md.
 *
 * Script idempotent: chạy lại nhiều lần vẫn an toàn.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PKG = "@nanmicoder/dsh-agent-teams";
const EXPECTED_TOOLS = [
  "agent_teams_create",
  "agent_teams_status",
  "agent_teams_add_member",
  "agent_teams_remove_member",
  "agent_teams_send_message",
  "agent_teams_create_task",
  "agent_teams_claim_task",
  "agent_teams_update_task",
  "agent_teams_reassign_task",
  "agent_teams_amend_task",
  "agent_teams_edit_plan",
  "agent_teams_approve",
  "agent_teams_resume",
  "agent_teams_delete",
];

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback;
};

const profile = flag("profile", process.env.DSH_PROFILE || "web");
const version = flag("version", "0.1.20");
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profileDir = path.join(dshHome, "profiles", profile);

const WIN = process.platform === "win32";
const say = (message = "") => console.log(message);

/** Chạy `dsh …`; shell:true để tìm được dsh.cmd trên Windows. */
function runDsh(args, { capture = false } = {}) {
  const result = spawnSync("dsh", args, {
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    shell: WIN,
    encoding: "utf8",
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

const probe = runDsh(["--version"], { capture: true });
if (probe.status !== 0) {
  console.error("[LỖI] Không chạy được `dsh`. Cài harness trước:");
  console.error("       npm install --global @deepseek-ai/dsh@0.1.5-rc.1");
  process.exit(1);
}

say(`== Cài ${PKG}@${version} vào profile "${profile}" ==`);
say(`   dsh --version → ${probe.stdout.trim()}`);
say(`   DSH_HOME      → ${dshHome}`);

say(`\n[1/3] dsh plugin --profile ${profile} add --save-exact ${PKG}@${version}`);
const added = runDsh(["plugin", "--profile", profile, "add", "--save-exact", `${PKG}@${version}`]);
if (added.status !== 0) {
  console.error(`\n[LỖI] Cài thất bại (mã ${added.status}).`);
  console.error("      Nếu log có [EPERM] ...\\.dsh\\... thì bạn đang chạy TRONG harness —");
  console.error("      hãy mở terminal thường (ngoài harness) rồi chạy lại lệnh này.");
  process.exit(added.status);
}

say(`\n[2/3] dsh plugin --profile ${profile} list`);
runDsh(["plugin", "--profile", profile, "list"]);

say(`\n[3/3] Kiểm ${path.join("~", ".dsh", "profiles", profile, "package.json")}`);
let ok = false;
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(profileDir, "package.json"), "utf8"));
  const dependency = pkg.dependencies?.[PKG];
  const bundled = Array.isArray(pkg.dsh?.profile?.bundles) && pkg.dsh.profile.bundles.includes(PKG);
  say(`   dependencies["${PKG}"]        = ${dependency ?? "(THIẾU)"}`);
  say(`   dsh.profile.bundles có "${PKG}" = ${bundled}`);
  ok = Boolean(dependency) && bundled;
} catch (error) {
  console.error(`   không đọc được package.json profile: ${error.message}`);
}
if (!ok) {
  console.error("\n[LỖI] Profile chưa ghi đủ dependency + bundle — xem log phía trên.");
  process.exit(1);
}

say("\n✅ Đã cài xong. Bước cuối KHÔNG được bỏ qua:");
say(`   1. TẮT HẲN harness của profile "${profile}" rồi mở lại.`);
say("   2. Refresh trình duyệt.");
say("   3. Session phải có đủ 14 tool:");
for (const tool of EXPECTED_TOOLS) say(`      - ${tool}`);
say("\nNghiệm thu nhanh:");
say("   dsh --version");
say(`   dsh plugin --profile ${profile} list`);
