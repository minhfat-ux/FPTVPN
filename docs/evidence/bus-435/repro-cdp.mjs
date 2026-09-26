const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable"); await send("Network.enable"); await send("Runtime.enable");
const fs = await import("node:fs");
async function shot(name) {
  const m = await send("Page.getLayoutMetrics");
  const cs = m.cssContentSize || m.contentSize || { width: 0, height: 0 };
  let params = { format: "png" };
  if (cs.width > 0 && cs.height > 0) params.clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.min(Math.ceil(cs.height), 6000), scale: 1 };
  const r = await send("Page.captureScreenshot", params);
  fs.writeFileSync(`/tmp/shots/${name}.png`, Buffer.from(r.data, "base64"));
}
async function probe() {
  const r = await send("Runtime.evaluate", { expression: `(()=>{const h=document.getElementById('dlHost');const s=document.getElementById('leadStatus');const form=document.getElementById('buyForm');const gate=document.getElementById('leadGate');const vis=[...h.querySelectorAll('a')].map(a=>a.href.split('/').slice(-1)[0]+(a.classList.contains('plat-hidden')?'[hidden]':'[SHOWN]'));return JSON.stringify({status:s?s.textContent:'',gateHidden:gate?gate.style.display:'',formShown:form?form.style.display:'',links:vis});})()`, returnByValue: true });
  return r.result.value;
}
const devices = [
  { name: "iphone", w: 390, h: 844, mobile: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  { name: "android", w: 412, h: 915, mobile: true, ua: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Mobile Safari/537.36" },
  { name: "desktop-mac", w: 1440, h: 900, mobile: false, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" },
];
const results = [];
for (const d of devices) {
  await send("Emulation.clearDeviceMetricsOverride").catch(()=>{});
  await send("Emulation.setDeviceMetricsOverride", { width: d.w, height: d.h, deviceScaleFactor: 1, mobile: d.mobile });
  await send("Network.setUserAgentOverride", { userAgent: d.ua });
  await send("Page.navigate", { url: "https://t1.meetflowai.site/buy" });
  await sleep(3000);
  await shot(`${d.name}-1-gate`);
  results.push(`${d.name} gate: ${await probe()}`);
  // valid email WITH letter s (example.com) -> should PASS but broken client regex rejects
  await send("Runtime.evaluate", { expression: `(()=>{document.getElementById('leadEmail').value='user@example.com';document.getElementById('leadBtn').click();})()` });
  await sleep(2500);
  await shot(`${d.name}-2-after-s-email`);
  const withS = await probe();
  results.push(`${d.name} user@example.com -> ${withS}`);
  // valid email WITHOUT letter s -> should pass and reveal
  await send("Page.navigate", { url: "https://t1.meetflowai.site/buy" });
  await sleep(2500);
  await send("Runtime.evaluate", { expression: `(()=>{document.getElementById('leadEmail').value='john@gmail.com';document.getElementById('leadBtn').click();})()` });
  await sleep(3500);
  await shot(`${d.name}-3-after-no-s-email`);
  results.push(`${d.name} john@gmail.com -> ${await probe()}`);
}
console.log(results.join("\n"));
ws.close();
