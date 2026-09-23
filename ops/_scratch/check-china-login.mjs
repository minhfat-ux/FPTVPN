// Do duong DANG NHAP (api.meetflowai.site) tu node Trung Quoc dai luc / HK / My qua apihz.cn.
// Dung: node ops/_scratch/check-china-login.mjs
const base = "https://cn.apihz.cn/api/wangzhan/getcode.php?id=88888888&key=88888888";
const enc = (u) => u.replace(/&/g, "@").replace(/[()]/g, "");
const targets = [
  "https://www.baidu.com", // doi chung: phai 200 tu TQ
  "https://www.google.com", // doi chung: phai loi/timeout tu TQ
  "https://api.meetflowai.site/v1/health",
  "https://t1.meetflowai.site/v1/health",
  "https://api.meetflowai.site/v1/auth/email/start", // GET -> 404/405 nhung van chung minh toi duoc
  "https://meetflowai.site/buy",
];
const regions = { 1: "TQ dai luc", 2: "Hong Kong", 3: "My" };

for (const [type, label] of Object.entries(regions)) {
  console.log(`\n===== Node ${label} (type=${type}) =====`);
  for (const t of targets) {
    const url = `${base}&type=${type}&url=${encodeURIComponent(enc(t))}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const txt = (await r.text()).trim();
      console.log(`  ${txt.slice(0, 170)}   <= ${t}`);
    } catch (e) {
      console.log(`  LOI ${e.name}: ${e.message}   <= ${t}`);
    }
    await new Promise((s) => setTimeout(s, 2500));
  }
}
