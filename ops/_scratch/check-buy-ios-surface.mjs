// Soi trang buy + install/ios: version nao dang hien cho khach.
const pages = [
  "https://t1.meetflowai.site/buy",
  "https://t1.meetflowai.site/buy?lang=vi",
  "https://t1.meetflowai.site/install/ios",
  "https://meetflowai.site/buy",
];
for (const u of pages) {
  try {
    const r = await fetch(u, { redirect: "follow" });
    const t = await r.text();
    console.log("=".repeat(70));
    console.log(u, r.status, r.url);
    // bo CSS/JS
    const body = t
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    console.log("TEXT:", body.slice(0, 1200));
    const vers = [...t.matchAll(/1\.\d+\.\d+(?:\s*\(?build\s*\d+\)?|\s*\(\d+\))?/gi)].map((m) => m[0]);
    console.log("VERSIONS in html:", [...new Set(vers)].join(" | "));
    const links = [...t.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => /dl|download|install|ipa|apk|exe|diawi|itunes|apps\.apple/i.test(h));
    console.log("LINKS:", [...new Set(links)].join("\n        "));
    const ipa = [...t.matchAll(/https?:\/\/[^"'\s<>]*\.ipa[^"'\s<>]*/gi)].map((m) => m[0]);
    if (ipa.length) console.log("IPA URLs:", [...new Set(ipa)].join(" | "));
  } catch (e) {
    console.log("ERR", u, e.message);
  }
}
