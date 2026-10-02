#!/usr/bin/env node
/**
 * NGHIỆM THU ĐỘC LẬP bus-686 (tiêu chí 1 của MAC): gói phát hành CÔNG KHAI không được
 * còn bất kỳ định danh key provider nào.
 *
 * MAC đã mở lại bus-686 vì overlay zip công khai vẫn chứa MeetFlowAI.Win.dll build cũ
 * (còn SonioxApiKey/OpenRouterApiKey/PortableSecret/ProtectedSetting).
 *
 * Cách kiểm: tải CHÍNH URL công khai rồi mở zip bằng python3 (có sẵn trên node-2),
 * đọc thẳng byte của mọi entry .dll/.exe/.json để tìm định danh key.
 *
 * Dùng: node ops/_scratch/bus686-verify.mjs
 * Exit: 0 = PASS · 2 = FAIL · 3 = lỗi hạ tầng
 */
import { runCapture } from "../lib/capture.mjs";

const SSH = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=12", "root@165.101.114.162"];
const ZIP_URL = "https://meetflowai.site/dl/MeetFlowAI-Overlay-2.0.0-win-x64.zip";
const MARKERS = ["SonioxApiKey", "OpenRouterApiKey", "PortableSecret", "ProtectedSetting", "MeetFlowAI.Win.2026.Activation.Transcript"];

const py = `
import io, json, sys, urllib.request, zipfile, hashlib
url = sys.argv[1]
req = urllib.request.Request(url, headers={"User-Agent": "bus686-verify"})
data = urllib.request.urlopen(req, timeout=600).read()
md5 = hashlib.md5(data).hexdigest(); sha = hashlib.sha256(data).hexdigest()
z = zipfile.ZipFile(io.BytesIO(data))
entries = z.namelist()
appset = [n for n in entries if "appsettings" in n.lower()]
markers = ${JSON.stringify(MARKERS)}
hits = {}
scanned = 0
for n in entries:
    if not n.lower().endswith((".dll", ".exe", ".json", ".config")): continue
    try: b = z.read(n)
    except Exception: continue
    scanned += 1
    for m in markers:
        if m.encode() in b or m.encode("utf-16le") in b:
            hits.setdefault(n, []).append(m)
print(json.dumps({"bytes": len(data), "md5": md5, "sha256": sha, "entries": len(entries),
  "appsettings": appset, "scanned": scanned, "hits": hits, "testzip": z.testzip()}))
`;

const r = runCapture("ssh", [...SSH, `python3 - '${ZIP_URL}?cb=${Date.now()}' <<'PYEOF'\n${py}\nPYEOF`], { timeout: 900000 });
if (!r.ok) { console.error("ssh/python lỗi:", String(r.stderr).slice(0, 300)); process.exit(3); }
let out;
try { out = JSON.parse(String(r.stdout).trim().split("\n").pop()); }
catch { console.error("không parse được JSON:", String(r.stdout).slice(0, 400)); process.exit(3); }

console.log(`URL: ${ZIP_URL}`);
console.log(`  ${out.bytes} B  md5=${out.md5}  sha256=${out.sha256}`);
console.log(`  ${out.entries} entry · testzip=${out.testzip} · đã quét ${out.scanned} file dll/exe/json/config`);
console.log(`  entry appsettings*: ${out.appsettings.length ? out.appsettings.join(", ") : "0"}`);

const bad = Object.entries(out.hits);
if (out.appsettings.length) console.log(`  FAIL  zip còn entry appsettings*: ${out.appsettings.join(", ")}`);
if (bad.length) {
  console.log("  FAIL  còn định danh key provider trong DLL/EXE:");
  for (const [n, ms] of bad.slice(0, 6)) console.log(`        ${n}: ${ms.join(", ")}`);
}
if (!out.appsettings.length && !bad.length) {
  console.log("  PASS  không entry appsettings* + 0 định danh key provider trong mọi dll/exe/json/config");
  console.log("\n✅ PASS — overlay zip công khai đã keyless.");
  process.exit(0);
}
console.log("\n❌ FAIL — overlay zip công khai VẪN còn client giữ key (MAC đã mở lại bus-686).");
process.exit(2);
