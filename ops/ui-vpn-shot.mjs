#!/usr/bin/env node
/**
 * FlowTech Signature theme check — VPNFlow control plane.
 *
 * Opens its OWN tab over CDP (PUT /json/new) so it never navigates away from
 * a tab someone else is using, screenshots the full page, and reports console
 * errors + theme probes (gradient borders, mint table heads, tokens, radius).
 *
 *   node ops/ui-vpn-shot.mjs <url> <outDir> <name> [port]
 */

import fs from "node:fs";
import path from "node:path";

const [url, outDir, name, portArg] = process.argv.slice(2);
if (!url || !outDir || !name) {
  console.error("usage: node ops/ui-vpn-shot.mjs <url> <outDir> <name> [port]");
  process.exit(2);
}
const PORT = Number(portArg ?? 9224);
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- open an isolated tab -------------------------------------------------
const created = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
).json();
const targetId = created.id;

const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error("cannot open CDP websocket"));
});

let nextId = 0;
const pending = new Map();
const errors = [];
let docStatus = null;
let docUrl = null;

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params?.exceptionDetails;
    errors.push("exception: " + (d?.exception?.description?.split("\n")[0] ?? d?.text ?? "unknown"));
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? "")
      .join(" ")
      .slice(0, 240);
    // Resource 401/403/404 are expected on the admin shell (it has no token yet).
    if (!/401|403|404|Failed to load resource/i.test(text)) errors.push("console: " + text);
  }
};

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(
      () => pending.has(id) && (pending.delete(id), reject(new Error(`${method} timeout`))),
      30000
    );
  });
}
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result?.value;
};

// --- navigate ------------------------------------------------------------
await send("Runtime.enable");
await send("Page.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true }); // never shoot a cached build
send("Page.navigate", { url }).catch(() => {});
await sleep(7000);

docUrl = await evaluate("location.href");
docStatus = await evaluate(
  "performance.getEntriesByType('navigation')[0]?.responseStatus ?? null"
);

// --- theme probes --------------------------------------------------------
const probe = await evaluate(`(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const root = cs(document.documentElement);
  const tok = (n) => root.getPropertyValue(n).trim();
  const all = [...document.querySelectorAll('*')];
  const gradBg = all.filter((el) => (cs(el).backgroundImage || '').includes('linear-gradient')).length;
  // Gradient 1px rings live on ::before, which querySelectorAll never returns —
  // ask getComputedStyle for the pseudo-element explicitly.
  const ringOf = (el) => {
    const s = getComputedStyle(el, '::before');
    if (!s || s.content === 'none' || !s.content) return null;
    const maskImg = s.getPropertyValue('mask-image') || s.getPropertyValue('-webkit-mask-image') || 'none';
    if (!maskImg || maskImg === 'none') return null;
    return {
      maskComposite: s.getPropertyValue('mask-composite') || s.getPropertyValue('-webkit-mask-composite') || '',
      background: s.backgroundImage.slice(0, 90)
    };
  };
  const ringed = all.filter((el) => {
    const r = ringOf(el);
    return r && r.background.includes('linear-gradient');
  });
  const gradMask = ringed.length;
  const th = document.querySelector('th');
  const animated = all.filter((el) => (cs(el).animationName || 'none') !== 'none').length;
  return {
    title: document.title,
    hasStyleTags: document.querySelectorAll('style').length,
    tokens: {
      accent: tok('--accent'), accent2: tok('--accent-2'), accent3: tok('--accent-3'),
      sigText: tok('--sig-text'), sigMint: tok('--sig-mint'), sigLine: tok('--sig-line')
    },
    gradientBackgrounds: gradBg,
    gradientMaskBorders: gradMask,
    gradientRingSample: ringed.length ? ringOf(ringed[0]) : null,
    animatedElements: animated,
    tableHead: th ? { color: cs(th).color, transform: cs(th).textTransform, size: cs(th).fontSize, spacing: cs(th).letterSpacing } : null,
    cardRadius: (() => { const c = document.querySelector('.card'); return c ? cs(c).borderRadius : null; })(),
    cardBgImage: (() => { const c = document.querySelector('.card'); return c ? cs(c).backgroundImage.slice(0, 150) : null; })(),
    primaryButton: (() => { const b = document.querySelector('button:not(.close):not(.tab)'); const s = cs(b); return b ? { bgImage: s.backgroundImage.slice(0, 110), radius: s.borderRadius, shadow: s.boxShadow.slice(0, 90) } : null; })(),
    bodyText: cs(document.body).color,
    bodyBgImage: cs(document.body).backgroundImage.slice(0, 150),
    // Regression guard: wider theme type must not clip table cells.
    overflow: {
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      horizontallyScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      wideTables: [...document.querySelectorAll('table')].filter((t) => t.scrollWidth > t.clientWidth + 1).length,
      clippedCells: [...document.querySelectorAll('th,td')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent.trim().slice(0, 26))
        .slice(0, 10),
      bodyOverflowX: (() => {
        const b = document.body;
        return { scrollW: b.scrollWidth, clientW: b.clientWidth };
      })()
    }
  };
})()`);

// --- full-page screenshot ------------------------------------------------
const metrics = await send("Page.getLayoutMetrics");
const content = metrics.cssContentSize ?? metrics.contentSize;
const width = Math.min(Math.max(1280, Math.ceil(content.width)), 1920);
const height = Math.min(Math.ceil(content.height), 20000);
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: false
});
await sleep(700);
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const outFile = path.join(outDir, `${name}.png`);
fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
await send("Emulation.clearDeviceMetricsOverride");

const report = {
  name,
  requestedUrl: url,
  finalUrl: docUrl,
  httpStatus: docStatus,
  screenshot: outFile,
  screenshotBytes: fs.statSync(outFile).size,
  pageHeight: height,
  consoleErrors: errors,
  ...probe
};
console.log(JSON.stringify(report, null, 2));

// Close our tab, then let the socket finish closing before exiting: calling
// process.exit() mid-teardown trips a libuv assertion on Windows.
await fetch(`http://127.0.0.1:${PORT}/json/close/${targetId}`).catch(() => {});
ws.close();
await sleep(500);
process.exit(errors.length ? 1 : 0);
