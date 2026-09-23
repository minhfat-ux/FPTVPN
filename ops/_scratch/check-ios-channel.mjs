// Do kenh phat iOS: manifest.plist + trang diawi + API app-version.
const targets = [
  "https://t1.meetflowai.site/install/ios/manifest.plist",
  "https://i.diawi.com/7WTMjp",
];
for (const u of targets) {
  try {
    const r = await fetch(u, { redirect: "follow" });
    const t = await r.text();
    console.log("=".repeat(70));
    console.log(u, "->", r.status, r.url, "len=", t.length, "ct=", r.headers.get("content-type"));
    if (/plist/.test(u)) console.log(t.slice(0, 1500));
    else {
      const body = t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      console.log("TEXT:", body.slice(0, 600));
      const vers = [...t.matchAll(/1\.\d+\.\d+(?:\s*\(?build\s*\d+\)?|\s*\(\d+\))?/gi)].map((m) => m[0]);
      console.log("VERSIONS:", [...new Set(vers)].join(" | "));
      const ipa = [...t.matchAll(/https?:\/\/[^"'\s<>]*\.ipa[^"'\s<>]*/gi)].map((m) => m[0]);
      if (ipa.length) console.log("IPA:", [...new Set(ipa)].join(" | "));
    }
  } catch (e) {
    console.log("ERR", u, e.message);
  }
}
for (const p of ["ios", "android", "windows", "macos"]) {
  try {
    const r = await fetch(`https://t1.meetflowai.site/v1/app-version?platform=${p}`);
    console.log(`app-version[${p}] ${r.status}`, (await r.text()).slice(0, 400));
  } catch (e) {
    console.log("ERR app-version", p, e.message);
  }
}
