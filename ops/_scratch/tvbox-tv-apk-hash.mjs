// Tải THẬT bản TV đang phát + băm, đối chiếu artifact đã kiểm 28/09 (T-20260928-02).
// Chạy: node ops/_scratch/tvbox-tv-apk-hash.mjs
import crypto from "node:crypto";

const WANT = "cc03504ed83d0e4a05962c204d535cdc668a2d3f09c3284ec48da33f586ef821";
const WANT_SIZE = 113423049;

for (const url of ["https://meetflowai.site/dl/VPNFlow-tv-latest.apk", "https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk"]) {
  const t0 = Date.now();
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(600000) });
  const hash = crypto.createHash("sha256");
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    hash.update(chunk);
  }
  const sha = hash.digest("hex");
  const last = res.headers.get("last-modified");
  const etag = res.headers.get("etag");
  console.log(`${url}
  status=${res.status} bytes=${size} (want ${WANT_SIZE}) ${size === WANT_SIZE ? "KHOP" : "LECH"} ${((Date.now() - t0) / 1000).toFixed(1)}s
  last-modified=${last}  etag=${etag}
  sha256=${sha} ${sha === WANT ? "KHOP" : "LECH"} (want ${WANT})`);
}
