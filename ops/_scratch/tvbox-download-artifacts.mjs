// Tải thật artifact đang phát (AI android + VPNFlow modern/legacy) để đọc version trong file.
// Chạy: node ops/_scratch/tvbox-download-artifacts.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const outDir = path.join("ops", "_scratch", "_tvbox");
fs.mkdirSync(outDir, { recursive: true });

const items = [
  ["ai-android.apk", "https://api.meetflowai.site/v1/ai/downloads/android"],
  ["vpn-modern.apk", "https://api.meetflowai.site/v1/downloads/android"],
  ["vpn-legacy.apk", "https://api.meetflowai.site/v1/downloads/android-legacy"],
];

for (const [name, url] of items) {
  const dest = path.join(outDir, name);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(900000) });
    const hash = crypto.createHash("sha256");
    const fh = fs.createWriteStream(dest);
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      hash.update(chunk);
      await new Promise((r) => fh.write(chunk, r));
    }
    await new Promise((r) => fh.end(r));
    console.log(`${name} status=${res.status} bytes=${size} last=${res.headers.get("last-modified")} sha256=${hash.digest("hex")} (${((Date.now() - t0) / 1000).toFixed(1)}s) -> ${dest}`);
  } catch (e) {
    console.log(`${name} LOI ${e.name}: ${e.message}`);
  }
}
