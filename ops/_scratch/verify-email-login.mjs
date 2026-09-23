// Nghiem thu duong dang nhap bang ma email tren PRODUCTION (api.meetflowai.site).
// Chay: node ops/_scratch/verify-email-login.mjs [email]
// Dung email nam trong DEBUG_CODE_EMAILS de lay duoc debug_code (khong can doc hop thu).
const BASE = process.env.LOGIN_BASE || "https://api.meetflowai.site";
const email = process.argv[2] || "review@meetflowai.site";
const FALLBACK = "https://t1.meetflowai.site";

const t = async (label, url, opts) => {
  const started = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    const text = await r.text();
    console.log(`\n[${label}] ${opts?.method || "GET"} ${url}`);
    console.log(`  -> HTTP ${r.status} (${Date.now() - started} ms)`);
    console.log(`  body: ${text.slice(0, 400)}`);
    return { status: r.status, text };
  } catch (e) {
    console.log(`\n[${label}] ${opts?.method || "GET"} ${url}`);
    console.log(`  -> LOI ${e.name}: ${e.message} (${Date.now() - started} ms)${e.cause ? ` | cause: ${e.cause.message}` : ""}`);
    return { status: 0, text: "" };
  }
};

console.log(`== Do duong dang nhap email (email=${email}) ==`);
const health = await t("health", `${BASE}/v1/health`);
const start = await t("email/start", `${BASE}/v1/auth/email/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, lang: "vi" }),
});

let code = null;
try {
  code = JSON.parse(start.text).debug_code ?? null;
} catch {}
console.log(`\n  debug_code: ${code ?? "(khong co — email that se nhan OTP qua Resend)"}`);

let verify = { status: 0, text: "" };
if (code) {
  verify = await t("email/verify", `${BASE}/v1/auth/email/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
} else {
  console.log("  (bo qua verify vi khong co debug_code)");
}

// Duong du phong: cung endpoint nhung qua host t1.
const fb = await t("fallback t1 health", `${FALLBACK}/v1/health`);
const fbStart = await t("fallback t1 email/start", `${FALLBACK}/v1/auth/email/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, lang: "vi" }),
});

const ok =
  health.status === 200 &&
  health.text.includes("ok") &&
  (start.status === 200 || start.status === 202) &&
  !/Failed to send login code email/i.test(start.text) &&
  (!code || verify.status === 201);
console.log(`\n== KET LUAN: ${ok ? "PASS" : "FAIL"} ==`);
console.log(`  health=${health.status} start=${start.status} verify=${code ? verify.status : "n/a"} fallback_health=${fb.status} fallback_start=${fbStart.status}`);
process.exit(ok ? 0 : 1);
