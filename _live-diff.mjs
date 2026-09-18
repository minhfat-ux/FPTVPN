// So từng dòng giữa file trên /opt/fbuddy và blob trong git (byte-exact, không qua PowerShell).
import { execFileSync } from "node:child_process";

const HOST = "root@165.101.114.162";

function liveFile(remotePath) {
  return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", HOST, `cat ${remotePath}`], {
    maxBuffer: 1 << 26,
  }).toString("utf8");
}

function gitFile(rev, repoPath) {
  return execFileSync("git", ["show", `${rev}:${repoPath}`], { maxBuffer: 1 << 26 }).toString("utf8");
}

function report(label, liveText, repoText) {
  const liveLines = liveText.replace(/\r\n/g, "\n").split("\n");
  const repoLines = repoText.replace(/\r\n/g, "\n").split("\n");
  console.log(`\n=== ${label}: live ${liveLines.length} dòng, repo@72c7779 ${repoLines.length} dòng`);

  let prefix = 0;
  while (prefix < liveLines.length && prefix < repoLines.length && liveLines[prefix] === repoLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < liveLines.length - prefix &&
    suffix < repoLines.length - prefix &&
    liveLines[liveLines.length - 1 - suffix] === repoLines[repoLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const liveOnly = liveLines.slice(prefix, liveLines.length - suffix);
  const repoOnly = repoLines.slice(prefix, repoLines.length - suffix);
  console.log(`giống nhau: ${prefix} dòng đầu + ${suffix} dòng cuối`);
  console.log(`--- CHỈ CÓ TRÊN LIVE (${liveOnly.length} dòng) ---`);
  liveOnly.slice(0, 40).forEach((line, index) => console.log(`${prefix + index + 1}: ${line}`));
  console.log(`--- CHỈ CÓ TRONG REPO (${repoOnly.length} dòng) ---`);
  repoOnly.slice(0, 40).forEach((line, index) => console.log(`${prefix + index + 1}: ${line}`));
}

for (const file of ["server/src/topup.js", "server/src/mailer.js"]) {
  report(file, liveFile(`/opt/fbuddy/${file}`), gitFile("72c7779", file));
}
