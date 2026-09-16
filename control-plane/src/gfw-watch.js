import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import path from "node:path";
import { sendAlert } from "./alerts.js";

/**
 * health-watch phát hiện host bị GFW chặn theo TÊN MIỀN (SNI) — bản Node của
 * scripts/gfw-check.sh, chạy nền trong control plane.
 *
 * Vì sao không dùng thẳng shell: cần lịch sử (để không báo lắt nhắt), cần alert
 * chống rung (hysteresis) và cần trạng thái cho admin page. Ba thứ đó phải là
 * logic THUẦN để test được mà không cần mạng thật.
 *
 * Phân loại mỗi lần đo:
 *   OK      — DNS + TCP 443 + TLS(SNI = host) đều tốt
 *   BLOCKED — TCP 443 thông nhưng TLS theo SNI thất bại ⇒ nghi chặn theo TÊN
 *   UNKNOWN — DNS hoặc TCP thất bại ⇒ chưa đủ dữ liệu kết luận (mạng ta lỗi)
 *
 * Chống spam: chỉ alert khi trạng thái ỔN ĐỊNH đổi (xem evaluateHysteresis).
 * Mọi lỗi đều bị nuốt trong watcher: health-watch KHÔNG được làm chết control plane.
 */

export const GFW_STATE = Object.freeze({
  OK: "OK",
  BLOCKED: "BLOCKED",
  UNKNOWN: "UNKNOWN",
});

/** Danh sách host mặc định — khớp scripts/gfw-check.sh và /v1/bootstrap. */
export const DEFAULT_GFW_HOSTS = [
  "api.meetflowai.site",
  "t1.meetflowai.site",
  "meetflowai.site",
  "fcnvpn.tail303be3.ts.net",
];

export const PROBE_TIMEOUT_MS = 5000;
/** 288 mẫu × 5 phút ≈ 24h lịch sử mỗi host. */
export const MAX_SAMPLES = 288;

const RESEND_API = "https://api.resend.com";
const DEFAULT_FROM_EMAIL = "VPNFlow <no-reply@meetflowai.site>";

/** Đọc danh sách host từ env (GFW_HOSTS, phân tách bằng dấu phẩy). */
export function parseGfwHosts(value, fallback = DEFAULT_GFW_HOSTS) {
  const raw = String(value ?? "").trim();
  if (!raw) return [...fallback];
  const hosts = raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : [...fallback];
}

/**
 * Hàm THUẦN: nhận mảng trạng thái đo được của MỘT host (true = ok, false = fail;
 * null/undefined = không đo được, bị bỏ qua) và trả về trạng thái ỔN ĐỊNH + có nên
 * bắn alert hay không.
 *
 * Quy tắc chống rung:
 *   - fail liên tiếp ≥ failThreshold  ⇒ BLOCKED
 *   - ok   liên tiếp ≥ okThreshold    ⇒ OK
 *   - `alert` CHỈ true khi mẫu CUỐI CÙNG vừa làm trạng thái đổi ⇒ không spam lại
 *     khi vẫn đang BLOCKED (hoặc vẫn OK).
 *
 * Hàm phát lại (replay) toàn bộ mảng từ trạng thái `initial`, nên tự nó đã biết
 * trạng thái trước đó mà không cần tham số ngoài — dễ test và dễ lưu lịch sử.
 */
export function evaluateHysteresis(samples, { failThreshold = 3, okThreshold = 2, initial = GFW_STATE.OK } = {}) {
  const list = Array.isArray(samples) ? samples : [];
  let state = initial === GFW_STATE.BLOCKED ? GFW_STATE.BLOCKED : GFW_STATE.OK;
  let alert = false;
  let okRun = 0;
  let failRun = 0;

  for (const sample of list) {
    if (sample === true) {
      okRun += 1;
      failRun = 0;
    } else if (sample === false) {
      failRun += 1;
      okRun = 0;
    } else {
      // UNKNOWN: không tính vào chuỗi, cũng không reset chuỗi (mạng ta lỗi tạm thời
      // không được phá vỡ chuỗi fail đang đếm).
      alert = false;
      continue;
    }

    let next = state;
    if (state === GFW_STATE.BLOCKED) {
      if (okRun >= okThreshold) next = GFW_STATE.OK;
    } else if (failRun >= failThreshold) {
      next = GFW_STATE.BLOCKED;
    }
    alert = next !== state;
    state = next;
  }

  return { state, alert };
}

function errText(err) {
  if (!err) return "lỗi không rõ";
  const code = err.code ? `${err.code}: ` : "";
  return `${code}${err.message ?? String(err)}`;
}

/** TCP connect tới ip:port, timeout `ms`; resolve khi kết nối được. */
function tcpConnect(ip, port, ms, netImpl) {
  return new Promise((resolve, reject) => {
    const socket = netImpl.connect({ host: ip, port });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.removeAllListeners?.();
      socket.destroy?.();
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(new Error(`timeout ${ms}ms`)), ms);
    socket.once("connect", () => finish());
    socket.once("error", (err) => finish(err));
    socket.once("timeout", () => finish(new Error(`timeout ${ms}ms`)));
  });
}

/** TLS handshake tới ip:port với servername = SNI; resolve khi handshake hợp lệ. */
function tlsHandshake(ip, port, servername, ms, tlsImpl) {
  return new Promise((resolve, reject) => {
    const socket = tlsImpl.connect({ host: ip, port, servername, rejectUnauthorized: true });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.removeAllListeners?.();
      socket.destroy?.();
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(new Error(`timeout ${ms}ms`)), ms);
    socket.once("secureConnect", () => {
      if (socket.authorized === false) finish(new Error(socket.authorizationError || "chứng chỉ không hợp lệ"));
      else finish();
    });
    socket.once("error", (err) => finish(err));
    socket.once("timeout", () => finish(new Error(`timeout ${ms}ms`)));
  });
}

/**
 * Đo một host: DNS → TCP 443 → TLS(SNI). Không bao giờ ném ra ngoài.
 * `deps` cho phép test bơm fake dns/net/tls.
 * @returns {Promise<{host:string, ip:string|null, state:string, detail:string}>}
 */
export async function probeHost(host, deps = {}) {
  const name = String(host ?? "").trim();
  const timeoutMs = Math.max(1, Number(deps.timeoutMs) || PROBE_TIMEOUT_MS);
  const dnsImpl = deps.dns ?? dns.promises;
  const netImpl = deps.net ?? net;
  const tlsImpl = deps.tls ?? tls;

  if (!name) return { host: name, ip: null, state: GFW_STATE.UNKNOWN, detail: "host rỗng" };

  let ip = null;
  try {
    const resolved = await dnsImpl.lookup(name, { family: 0 });
    ip = resolved?.address ?? null;
    if (!ip) throw new Error("không có bản ghi A/AAAA");
  } catch (err) {
    return { host: name, ip: null, state: GFW_STATE.UNKNOWN, detail: `DNS thất bại: ${errText(err)}` };
  }

  try {
    await tcpConnect(ip, 443, timeoutMs, netImpl);
  } catch (err) {
    return { host: name, ip, state: GFW_STATE.UNKNOWN, detail: `TCP 443 thất bại: ${errText(err)}` };
  }

  try {
    await tlsHandshake(ip, 443, name, timeoutMs, tlsImpl);
  } catch (err) {
    return {
      host: name,
      ip,
      state: GFW_STATE.BLOCKED,
      detail: `TCP 443 thông nhưng TLS(SNI=${name}) thất bại: ${errText(err)}`,
    };
  }

  return { host: name, ip, state: GFW_STATE.OK, detail: `DNS ${ip} + TCP 443 + TLS(SNI=${name}) đều tốt` };
}

/**
 * Ghi/đọc lịch sử health-watch dạng JSON (cùng chỗ với các store khác trong data/).
 * Ghi nguyên-file qua file tạm rồi rename, mode 0600 — hỏng thì không ghi đè file cũ.
 */
export class GfwHistoryStore {
  constructor(filePath) {
    this.filePath = filePath;
    this._data = this._load();
  }

  _load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const hosts = parsed && typeof parsed.hosts === "object" && parsed.hosts ? parsed.hosts : {};
      return { updatedAt: parsed?.updatedAt ?? null, hosts };
    } catch (err) {
      if (err?.code !== "ENOENT") {
        console.error(`gfw-watch: đọc ${this.filePath} lỗi (${err.message}) — bắt đầu lịch sử mới`);
      }
      return { updatedAt: null, hosts: {} };
    }
  }

  get(host) {
    return this._data.hosts[host] ?? null;
  }

  upsert(host, patch) {
    const prev = this._data.hosts[host] ?? { host, state: null, lastChangeAt: null, lastProbe: null, samples: [] };
    this._data.hosts[host] = { ...prev, ...patch, host };
    this._data.updatedAt = new Date().toISOString();
    this._write();
  }

  snapshot() {
    const hosts = Object.values(this._data.hosts).map((h) => ({
      host: h.host,
      state: h.state ?? GFW_STATE.UNKNOWN,
      lastChangeAt: h.lastChangeAt ?? null,
      lastProbe: h.lastProbe ?? null,
      samples: Array.isArray(h.samples) ? h.samples.slice() : [],
    }));
    return { hosts, updatedAt: this._data.updatedAt ?? null };
  }

  _write() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch {
      // best effort (một số filesystem không hỗ trợ chmod)
    }
  }
}

/**
 * Gửi email alert qua mailer transport (Resend) tới ALERT_EMAIL.
 *
 * Lưu ý: mailer.js chỉ export các hàm template cụ thể (hoá đơn, nhắc gia hạn…),
 * không có hàm gửi email tuỳ ý; phạm vi task không cho sửa mailer.js nên ở đây gọi
 * thẳng Resend HTTP API bằng fetch builtin, dùng ĐÚNG cấu hình của mailer
 * (RESEND_API_KEY / FROM_EMAIL). Không ném lỗi.
 */
export async function sendGfwAlertEmail({ host, state, probe, at, blockedSince } = {}, deps = {}) {
  const env = deps.env ?? process.env;
  const to = String(env.ALERT_EMAIL ?? "").trim();
  if (!to) return { sent: false, reason: "ALERT_EMAIL chưa cấu hình" };
  const key = String(env.RESEND_API_KEY ?? "").trim();
  if (!key) return { sent: false, reason: "RESEND_API_KEY chưa cấu hình" };
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return { sent: false, reason: "runtime không có fetch" };

  const from = String(env.FROM_EMAIL ?? DEFAULT_FROM_EMAIL).trim();
  const blocked = state === GFW_STATE.BLOCKED;
  const subject = blocked ? `🚨 Host bị chặn theo tên: ${host}` : `✅ Host hồi phục: ${host}`;
  const lines = [
    `Host: ${host}`,
    blocked ? `Trạng thái: BLOCKED (bị chặn theo SNI)` : `Trạng thái: RECOVERED (đã vào lại được)`,
    blocked ? `Từ: ${blockedSince ?? at ?? "?"}` : `Bị chặn từ: ${blockedSince ?? "?"}`,
    `Bằng chứng: ${probe?.detail ?? "?"}`,
    `Gợi ý: chuyển client sang host dự phòng — chỉ cần đổi API_HOSTS/transport trong /v1/bootstrap, không cần phát hành app mới.`,
  ];
  const text = `${subject}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
  const html = `<h2>${subject}</h2><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;

  try {
    const res = await fetchImpl(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error) {
      return { sent: false, reason: body?.error?.message ?? `HTTP ${res.status}` };
    }
    return { sent: true, id: body?.id ?? null };
  } catch (err) {
    return { sent: false, reason: err?.message ?? String(err) };
  }
}

/**
 * Watcher: đo định kỳ, lưu lịch sử, alert khi trạng thái ổn định đổi.
 * Mọi lỗi bị nuốt trong runOnce/start — không bao giờ làm chết process.
 */
export class GfwWatcher {
  constructor({ filePath, hosts, failThreshold = 3, okThreshold = 2, timeoutMs = PROBE_TIMEOUT_MS, maxSamples = MAX_SAMPLES, deps = {} } = {}) {
    this.store = new GfwHistoryStore(filePath);
    this.hosts = Array.isArray(hosts) && hosts.length > 0 ? hosts.slice() : [...DEFAULT_GFW_HOSTS];
    this.failThreshold = failThreshold;
    this.okThreshold = okThreshold;
    this.timeoutMs = timeoutMs;
    this.maxSamples = Math.max(1, Number(maxSamples) || MAX_SAMPLES);
    this._deps = deps;
    this._timer = null;
  }

  /** Đo tất cả host một lượt. Trả snapshot để admin route dùng ngay. */
  async runOnce() {
    for (const host of this.hosts) {
      try {
        await this._checkHost(host);
      } catch (err) {
        console.error(`gfw-watch: lỗi khi kiểm ${host}:`, err?.message ?? err);
      }
    }
    return this.store.snapshot();
  }

  async _checkHost(host) {
    const probeFn = this._deps.probeHost ?? probeHost;
    const probe = await probeFn(host, { ...this._deps.probe, timeoutMs: this.timeoutMs });
    const at = new Date().toISOString();
    const sample = {
      at,
      state: probe.state,
      ok: probe.state === GFW_STATE.OK ? true : probe.state === GFW_STATE.BLOCKED ? false : null,
      detail: probe.detail,
      ip: probe.ip,
    };

    const previous = this.store.get(host);
    const history = [...(previous?.samples ?? []), sample].slice(-this.maxSamples);
    const { state, alert } = evaluateHysteresis(
      history.map((s) => s.ok),
      { failThreshold: this.failThreshold, okThreshold: this.okThreshold },
    );

    // Nhớ mốc BẮT ĐẦU chặn trước khi có thể bị ghi đè bằng mốc hồi phục.
    const blockedSince = previous?.state === GFW_STATE.BLOCKED ? previous.lastChangeAt : null;
    const lastChangeAt = alert ? at : previous?.lastChangeAt ?? null;

    this.store.upsert(host, {
      state,
      lastChangeAt,
      lastProbe: { state: probe.state, detail: probe.detail, ip: probe.ip, at },
      samples: history,
    });

    if (alert) {
      await this._notify(host, state, { probe, at, blockedSince });
    }
  }

  async _notify(host, state, { probe, at, blockedSince }) {
    const blocked = state === GFW_STATE.BLOCKED;
    const title = blocked ? `Host ${host} bị chặn (BLOCKED)` : `Host ${host} đã hồi phục (RECOVERED)`;
    const lines = [
      `Host: ${host}`,
      blocked ? `Từ: ${at}` : `Bị chặn từ: ${blockedSince ?? "?"}`,
      `Bằng chứng: ${probe.detail}`,
      "Gợi ý: chuyển client sang host dự phòng — chỉ cần đổi host/transport trong /v1/bootstrap, KHÔNG cần phát hành app mới.",
    ];

    const sendAlertFn = this._deps.sendAlert ?? sendAlert;
    try {
      await sendAlertFn({ title, lines, level: blocked ? "error" : "ok" });
    } catch (err) {
      console.error(`gfw-watch: gửi telegram lỗi (${host}):`, err?.message ?? err);
    }

    const sendEmailFn = this._deps.sendEmail ?? sendGfwAlertEmail;
    try {
      const result = await sendEmailFn({ host, state, probe, at, blockedSince }, this._deps.email);
      if (result && result.sent === false) {
        console.warn(`gfw-watch: KHÔNG gửi được email (${result.reason}) — ${host}`);
      }
    } catch (err) {
      console.error(`gfw-watch: gửi email lỗi (${host}):`, err?.message ?? err);
    }
  }

  /** Trạng thái hiện tại của mọi host (cho route admin). */
  snapshot() {
    return this.store.snapshot();
  }

  /** Bật lịch đo. `everyMs` tối thiểu 60s; timer unref để không giữ process. */
  start(everyMs = 300_000) {
    if (this._timer) return this._timer;
    const ms = Math.max(60_000, Number(everyMs) || 300_000);
    this._timer = setInterval(() => {
      this.runOnce().catch((err) => console.error("gfw-watch:", err?.message ?? err));
    }, ms);
    this._timer.unref?.();
    this.runOnce().catch((err) => console.error("gfw-watch:", err?.message ?? err));
    return this._timer;
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}
