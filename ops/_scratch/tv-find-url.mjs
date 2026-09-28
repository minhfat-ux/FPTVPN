// Tìm URL nguồn của APK FPT Play TV trong transcript các phiên DSH (repo FPTVPN).
// Mục đích: để node-2 tự tải từ nguồn (nhanh) thay vì upload chậm từ máy Windows.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.join(process.env.USERPROFILE, ".dsh", "sessions", "--C-Users-Minhn-FPTVPN--");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.zst(d)?$/i.test(entry.name)) files.push(full);
  }
})(root);
files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
console.log("transcripts:", files.length);

const urls = new Set();
const lines = new Set();
for (const file of files) {
  let text = "";
  try {
    text = zlib.zstdDecompressSync(fs.readFileSync(file)).toString("utf8");
  } catch (error) {
    console.log("skip", path.basename(path.dirname(file)), String(error.message).slice(0, 60));
    continue;
  }
  const tag = path.basename(path.dirname(file));
  console.log("---", tag, text.length);
  for (const match of text.matchAll(/https?:\/\/[^\s"'\\<>\])}]+/g)) {
    const url = match[0];
    if (/\.(apk|xapk)|apkpure|apkcombo|fptplay|ottbox|apkmirror|aptoide/i.test(url)) urls.add(url.slice(0, 300));
  }
  for (const match of text.matchAll(/[^\n]{0,160}(?:adb connect|install-multiple|net\.fptplay\.ottbox)[^\n]{0,160}/g)) {
    lines.add(match[0].trim().slice(0, 300));
  }
}
console.log("\n=== URL ===");
for (const url of [...urls].sort()) console.log(url);
console.log("\n=== dòng liên quan ===");
for (const line of [...lines].sort()) console.log(line);
