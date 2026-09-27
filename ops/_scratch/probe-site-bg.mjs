/** Lấy mã màu nền trang meetflowai.site (bus #519). Chỉ đọc, không ghi site. */
import fs from "node:fs";

const BASE = "https://meetflowai.site";
const out = { fetchedAt: new Date().toISOString(), pages: {}, css: {} };

async function get(url) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) mfa-bgprobe/1.0", "accept-encoding": "identity" }, redirect: "follow" });
  const text = await r.text();
  return { status: r.status, finalUrl: r.url, text };
}

const home = await get(BASE + "/");
out.pages["/"] = { status: home.status, finalUrl: home.finalUrl, bytes: home.text.length };
fs.writeFileSync("ops/_scratch/site-home.html", home.text);

// liệt kê <link rel=stylesheet> và <style>
const cssUrls = [...home.text.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
  .map((m) => (m[0].match(/href=["']([^"']+)["']/i) || [])[1])
  .filter(Boolean)
  .map((h) => (h.startsWith("http") ? h : new URL(h, home.finalUrl).href))
  .filter((u) => u.startsWith(BASE) || u.includes("meetflowai"));

const inlineStyles = [...home.text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
out.pages["/"].cssLinks = cssUrls;
out.pages["/"].inlineStyleBlocks = inlineStyles.length;
out.pages["/"].inlineStyleBytes = inlineStyles.join("\n").length;

const allCss = [...inlineStyles];
for (const u of cssUrls) {
  try {
    const c = await get(u);
    out.css[u] = { status: c.status, bytes: c.text.length };
    allCss.push(c.text);
    fs.writeFileSync("ops/_scratch/site-" + u.split("/").pop().split("?")[0].replace(/[^\w.-]/g, "_"), c.text);
  } catch (e) {
    out.css[u] = { error: String(e.message || e) };
  }
}

const css = allCss.join("\n");
fs.writeFileSync("ops/_scratch/site-all.css", css);

function decls(sel) {
  const re = new RegExp("([^{}]*" + sel + "[^{}]*)\\{([^}]*)\\}", "gi");
  const rows = [];
  for (const m of css.matchAll(re)) {
    const body = m[2];
    for (const d of body.split(";")) {
      const t = d.trim();
      if (/background(-color)?\s*:/i.test(t) || /--[\w-]*(bg|background)[\w-]*\s*:/i.test(t)) rows.push({ selector: m[1].trim().replace(/\s+/g, " ").slice(0, 120), decl: t });
    }
  }
  return rows;
}

out.bodyRule = decls("body");
out.htmlRule = decls("html");
out.rootVars = [...css.matchAll(/(--[\w-]*(?:bg|background|surface|page)[\w-]*)\s*:\s*([^;}]+)/gi)].map((m) => m[1] + ": " + m[2].trim());
out.allBackgroundCount = (css.match(/background(-color)?\s*:/gi) || []).length;

// ảnh chụp thẻ meta theme-color
out.themeColor = [...home.text.matchAll(/<meta[^>]+name=["']theme-color["'][^>]*>/gi)].map((m) => m[0]);
out.htmlTag = (home.text.match(/<html[^>]*>/i) || [])[0];
out.bodyTag = (home.text.match(/<body[^>]*>/i) || [])[0];

console.log(JSON.stringify(out, null, 2));
