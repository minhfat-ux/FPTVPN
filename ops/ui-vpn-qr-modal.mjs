#!/usr/bin/env node
/**
 * Screenshot the themed QR modal on /buy WITHOUT creating a real order:
 * the modal is revealed purely client-side and fed the public vietqr test
 * image, so no row is written to the live payments store.
 */
import fs from "node:fs";
import path from "node:path";

const PORT = 9224;
const outDir = process.argv[2] ?? "ops/ui-out-vpn";
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws")); });

let nextId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    return;
  }
  if (m.method === "Runtime.exceptionThrown") {
    errors.push(m.params?.exceptionDetails?.exception?.description?.split("\n")[0] ?? "exception");
  }
};
const send = (method, params = {}) => {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => pending.has(id) && (pending.delete(id), reject(new Error(method + " timeout"))), 30000);
  });
};
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: "https://meetflowai.site/buy" });
await sleep(7000);

// Feed the modal the same public test QR used in the CLI check. No POST to
// /v1/payments/create happens anywhere in this script.
const injected = await evaluate(`(async () => {
  const img = document.getElementById('qrImg');
  img.src = 'https://img.vietqr.io/image/970423-57222538888-compact2.png?amount=200000&addInfo=TEST';
  await new Promise((res) => { img.onload = res; img.onerror = res; setTimeout(res, 6000); });
  document.getElementById('qrPlan').textContent = 'Gói 1 tháng (Monthly)';
  document.getElementById('qrAmt').textContent = '200.000 đ';
  document.getElementById('qrAmtSub').textContent = '≈ 7,80 USD · 58 CNY';
  const copyBtn = document.getElementById('qrCopyBtn');
  copyBtn.dataset.amount = '200000';
  const copyOrder = document.getElementById('qrCopyOrderBtn');
  copyOrder.dataset.ref = 'VPNFLOW-1789319664';
  document.getElementById('qrOrder').textContent = 'Mã đơn: #1789319664';
  document.getElementById('qrOrderHint').textContent =
    'Nội dung chuyển khoản: VPNFLOW-1789319664 (không cần gõ tay khi quét QR).';
  document.getElementById('qrHint').textContent =
    'Mở app ngân hàng, quét mã QR. Số tiền và nội dung đã điền sẵn.';
  document.getElementById('qrStatus').textContent = 'Đang chờ thanh toán…';
  document.getElementById('qrModal').classList.add('show');
  return { qrNatural: img.naturalWidth + 'x' + img.naturalHeight, complete: img.complete };
})()`);

await sleep(1200);

const probe = await evaluate(`(() => {
  const modal = document.querySelector('.modal');
  const wrap = document.querySelector('.modal .qr-wrap');
  const cs = (el, p) => getComputedStyle(el, p || null);
  const ring = (el) => {
    const s = cs(el, '::before');
    return {
      maskComposite: s.getPropertyValue('mask-composite') || s.getPropertyValue('-webkit-mask-composite') || '',
      background: s.backgroundImage.slice(0, 90)
    };
  };
  return {
    modalVisible: cs(document.getElementById('qrModal')).display,
    modalRadius: cs(modal).borderRadius,
    modalRing: ring(modal),
    qrWrapRadius: cs(wrap).borderRadius,
    qrWrapRing: ring(wrap),
    qrWrapBg: cs(wrap).backgroundColor,
    imgBox: cs(document.getElementById('qrImg')).width + ' x ' + cs(document.getElementById('qrImg')).height,
    imgPadding: cs(document.getElementById('qrImg')).padding,
    imgBackground: cs(document.getElementById('qrImg')).backgroundColor
  };
})()`);

const metrics = await send("Page.getLayoutMetrics");
const content = metrics.cssContentSize ?? metrics.contentSize;
await send("Emulation.setDeviceMetricsOverride", {
  width: Math.min(Math.max(1280, Math.ceil(content.width)), 1920),
  height: Math.min(Math.ceil(content.height), 20000),
  deviceScaleFactor: 1, mobile: false
});
await sleep(600);
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const outFile = path.join(outDir, "buy-qr-modal-after.png");
fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
await send("Emulation.clearDeviceMetricsOverride");

console.log(JSON.stringify({
  qrImageLoaded: injected,
  probe,
  screenshot: outFile,
  screenshotBytes: fs.statSync(outFile).size,
  consoleErrors: errors
}, null, 2));

await fetch(`http://127.0.0.1:${PORT}/json/close/${created.id}`).catch(() => {});
ws.close();
await sleep(500);
process.exit(errors.length ? 1 : 0);
