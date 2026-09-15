/**
 * Tạo chứng chỉ Apple Distribution MỚI ngay trên máy ký (Linux) — KHÔNG cần máy Mac.
 *
 * Vì sao: khoá ký đang nằm trong keychain macOS (chỉ export được khi người ngồi máy nhập mật khẩu),
 * nên bước đưa khoá lên server hay bị tắc. Đường này sinh khoá + CSR bằng openssl trên server rồi
 * xin Apple cấp chứng chỉ qua App Store Connect API — khoá riêng KHÔNG bao giờ rời khỏi server.
 *
 *   node create-cert.mjs [outDir] [p12Password]
 *
 * Chứng chỉ cũ KHÔNG bị ảnh hưởng (app đã cài vẫn nguyên). Profile Ad Hoc sẽ được tạo lại để chứa
 * CẢ chứng chỉ cũ và mới ⇒ ký bằng cái nào cũng cài được.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MODULE = process.env.APPLE_MODULE || "/root/flowvpn-sign/apple-devices.js";
const CRED_FILE = process.env.ASC_CRED_FILE || "/root/flowvpn-sign/apple-asc.json";
const OUT_DIR = process.argv[2] || "/root/flowvpn-sign";
const P12_PASS = process.argv[3] || "FlowVPN-Sign-2026!";
const { AppleCredentialStore, signAscToken } = await import(MODULE);

const REVOKE = process.argv[2] === "--revoke" ? process.argv[3] : null;

const creds = await new AppleCredentialStore(CRED_FILE).load();
if (!creds.keyId || !creds.issuerId || !creds.privateKey) {
  console.error("  LỖI: chưa có khoá App Store Connect");
  process.exit(2);
}
const token = signAscToken({ keyId: creds.keyId, issuerId: creds.issuerId, privateKey: creds.privateKey });

if (REVOKE) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/certificates/${REVOKE}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(res.ok || res.status === 204
    ? `  ✔ đã thu hồi chứng chỉ ${REVOKE}`
    : `  LỖI thu hồi: HTTP ${res.status}`);
  process.exit(res.ok || res.status === 204 ? 0 : 1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const keyPem = path.join(OUT_DIR, "sign.key");
const csrPem = path.join(OUT_DIR, "sign.csr");
const certPem = path.join(OUT_DIR, "sign.crt");
const chainPem = path.join(OUT_DIR, "chain.pem");
const p12 = path.join(OUT_DIR, "dist.p12");

if (fs.existsSync(p12)) {
  console.log("  đã có dist.p12 — không tạo thêm (xoá file đó nếu muốn tạo chứng chỉ mới)");
  process.exit(0);
}
const derPath = path.join(OUT_DIR, "sign.der");
// Chạy lại sau khi đã xin được chứng chỉ (bước trước lỗi giữa đường) thì DÙNG LẠI, không xin thêm
// chứng chỉ mới — Apple giới hạn số chứng chỉ Distribution của một tài khoản.
const reuseCert = fs.existsSync(derPath) || fs.existsSync(certPem);

// Khoá phải ỔN ĐỊNH giữa các lần chạy: chạy lại mà sinh khoá mới thì khoá không còn khớp chứng chỉ
// đã xin (đã từng gặp: "No cert in -in file matches private key").
if (fs.existsSync(keyPem) && fs.existsSync(csrPem)) {
  console.log("  1) đã có khoá + CSR trên máy này — giữ nguyên (không sinh lại)");
} else {
  console.log("  1) sinh khoá RSA 2048 + CSR (openssl, ngay trên máy ký)");
  execFileSync("openssl", ["genrsa", "-out", keyPem, "2048"], { stdio: "ignore" });
  execFileSync("openssl", ["req", "-new", "-key", keyPem, "-out", csrPem,
    "-subj", `/CN=VPNFlow Distribution/OU=${creds.teamId || ""}/O=VPNFlow/C=VN`], { stdio: "ignore" });
  fs.chmodSync(keyPem, 0o600);
}

const CERT_ID = process.env.CERT_ID || "";
if (CERT_ID) {
  console.log(`  2) dùng lại chứng chỉ đã có trên Apple: ${CERT_ID}`);
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/certificates/${CERT_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) { console.error(`  LỖI: HTTP ${res.status}`); process.exit(1); }
  fs.writeFileSync(derPath, Buffer.from(json.data.attributes.certificateContent, "base64"));
  console.log(`     ✔ ${json.data.attributes.certificateType} — hết hạn ${json.data.attributes.expirationDate}`);
} else if (reuseCert) {
  console.log("  2) đã có chứng chỉ từ lần chạy trước — dùng lại (không xin thêm)");
} else {
console.log("  2) xin Apple cấp chứng chỉ Distribution qua App Store Connect API");
const res = await fetch("https://api.appstoreconnect.apple.com/v1/certificates", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent: fs.readFileSync(csrPem, "utf8") } },
  }),
});
const json = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`  LỖI: HTTP ${res.status} ${JSON.stringify(json?.errors?.[0] ?? "")}`);
  process.exit(1);
}
const certDer = Buffer.from(json.data.attributes.certificateContent, "base64");
fs.writeFileSync(derPath, certDer);
console.log(`     ✔ chứng chỉ mới: ${json.data.id} — hết hạn ${json.data.attributes.expirationDate}`);
}
if (fs.existsSync(derPath) && !fs.existsSync(certPem)) {
  execFileSync("openssl", ["x509", "-inform", "DER", "-in", derPath, "-out", certPem]);
}
if (!fs.existsSync(certPem)) { console.error("  LỖI: không có sign.crt để ghép p12"); process.exit(1); }

console.log("  3) ghép p12 = khoá mới + chứng chỉ mới + chuỗi Apple (WWDR + Root)");
execFileSync("openssl", ["pkcs12", "-export", "-out", p12, "-inkey", keyPem, "-in", certPem,
  "-certfile", chainPem, "-passout", `pass:${P12_PASS}`, "-name", "Apple Distribution"], { stdio: "ignore" });
fs.chmodSync(p12, 0o600);
fs.writeFileSync(path.join(OUT_DIR, "dist.p12.pass"), P12_PASS, { mode: 0o600 });

console.log("  4) kiểm chuỗi trong p12:");
const certs = execFileSync("bash", ["-c", `openssl pkcs12 -in ${p12} -nokeys -passin pass:'${P12_PASS}' 2>/dev/null | openssl crl2pkcs7 -nocrl -certfile /dev/stdin 2>/dev/null | openssl pkcs7 -print_certs -noout 2>/dev/null | grep subject`], { encoding: "utf8" });
certs.trim().split("\n").forEach((l) => console.log("     " + l.replace("subject=", "")));
console.log(`  ✔ ${p12} (${fs.statSync(p12).size} bytes, 0600) + dist.p12.pass`);
