/**
 * Live-connection aggregation cho owner dashboard (FR-ADMIN-001).
 *
 * Nguồn sự thật: output `wg show <iface> dump` của TỪNG exit node (mỗi peer có
 * endpoint = IP công khai của client, latest_handshake, rx/tx) ghép với device
 * registry (publicKey -> thiết bị/user). Các hàm ở đây là pure function; riêng
 * phần reverse DNS (PTR) nhận resolver inject từ ngoài để test không cần mạng —
 * không gọi API bên thứ ba, không gửi IP người dùng ra ngoài.
 */

/** Peer được coi là "đang kết nối" khi handshake trong vòng 3 phút. */
export const ONLINE_HANDSHAKE_WINDOW_SEC = 180;

/** Nhãn generic trong PTR, không phải tên ISP. */
const GENERIC_PTR_LABELS = new Set([
  "static", "dynamic", "dyn", "pool", "customer", "cust", "client", "ip", "host",
  "broadband", "bb", "adsl", "vdsl", "ftth", "fiber", "mobile", "3g", "4g", "5g",
  "ptr", "rev", "in", "addr", "arpa", "dsl", "cable", "cm", "node", "user", "ppp",
  "dhcp", "unassigned", "no-reverse", "localhost", "dns",
]);

/** Nhãn TLD phụ (second-level) để nhận diện country code dạng "com.vn", "co.jp". */
const SECOND_LEVEL_SUFFIXES = new Set([
  "com", "net", "org", "co", "or", "ne", "go", "ac", "gov", "edu", "mil", "biz", "info",
]);

/**
 * Lấy IP công khai của client từ wg endpoint.
 * Hỗ trợ IPv4 ("1.2.3.4:51820") và IPv6 ("[2001:db8::1]:51820").
 * @param {string|null|undefined} endpoint
 * @returns {string|null}
 */
export function clientIPFromEndpoint(endpoint) {
  if (!endpoint) return null;
  const value = String(endpoint).trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 1 ? value.slice(1, end) : null;
  }
  const colonCount = value.split(":").length - 1;
  // Từ 2 dấu ":" trở lên nhưng không có ngoặc vuông => IPv6 trần (không port).
  if (colonCount > 1) return value;
  const colon = value.lastIndexOf(":");
  // IPv4:port — chỉ cắt khi phần sau dấu ":" là port hợp lệ.
  if (colon > 0 && /^\d+$/.test(value.slice(colon + 1))) {
    return value.slice(0, colon);
  }
  return value;
}

/**
 * Peer có đang kết nối không (handshake trong cửa sổ ONLINE_HANDSHAKE_WINDOW_SEC).
 * @param {{latestHandshakeSec?: number}} peer
 * @param {number} nowSec
 * @param {number} windowSec
 * @returns {boolean}
 */
export function isPeerOnline(peer, nowSec = Date.now() / 1000, windowSec = ONLINE_HANDSHAKE_WINDOW_SEC) {
  const handshake = Number(peer?.latestHandshakeSec ?? 0);
  if (!handshake) return false;
  const age = nowSec - handshake;
  return age >= 0 && age < windowSec;
}

/**
 * Suy ra ISP + country hint từ tên PTR (best-effort, KHÔNG phải geolocation thật).
 * Ví dụ: "static.vnpt.vn" -> { isp: "vnpt", country: "VN" }.
 *
 * PTR thực tế thường có nhãn ghép số/chữ ("pool-1.fpt.net", "host-1-2-3-4.x.net"):
 * mỗi nhãn được tách theo [-_.] và chỉ những phần có nghĩa mới được coi là ISP,
 * nên "pool-1" bị bỏ qua và ISP lấy đúng là "fpt".
 *
 * @param {string|null|undefined} hostname
 * @returns {{isp: string|null, country: string|null}}
 */
export function ispHintFromPTR(hostname) {
  if (!hostname) return { isp: null, country: null };
  const labels = String(hostname)
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);
  if (labels.length === 0) return { isp: null, country: null };

  let country = null;
  let rest = labels;
  const last = labels[labels.length - 1];
  const secondLast = labels.length > 1 ? labels[labels.length - 2] : "";
  if (last.length === 2 && /^[a-z]{2}$/.test(last)) {
    country = last.toUpperCase();
    rest = labels.slice(0, -1);
  } else if (secondLast.length === 2 && /^[a-z]{2}$/.test(secondLast) && SECOND_LEVEL_SUFFIXES.has(last)) {
    country = secondLast.toUpperCase();
    rest = labels.slice(0, -2);
  }

  const meaningfulPart = (label) =>
    label
      .split(/[-_.]/)
      .find(
        (part) =>
          part.length > 1 &&
          !/^\d+$/.test(part) &&
          !GENERIC_PTR_LABELS.has(part) &&
          !SECOND_LEVEL_SUFFIXES.has(part),
      ) ?? null;

  // ISP = phần có nghĩa đầu tiên, bỏ qua nhãn generic/nhãn số/TLD phụ.
  let isp = null;
  for (const label of rest) {
    isp = meaningfulPart(label);
    if (isp) break;
  }
  return { isp, country };
}

/**
 * Gom peer của mọi node thành dữ liệu cho dashboard.
 *
 * @param {object} input
 * @param {Array<{id: string, name?: string, country?: string, city?: string}>} input.nodes
 * @param {Map<string, Array<object>>} input.peersByNode nodeId -> peer rows (từ wg dump)
 * @param {Map<string, object>} [input.devicesByPublicKey] publicKey -> device record
 * @param {Map<string, {isp: string|null, country: string|null}>} [input.ispByIP] IP client -> ISP hint
 * @param {number} [input.nowSec]
 * @param {number} [input.onlineWindowSec]
 * @returns {{by_node: Array<object>, by_location: Record<string, number>, online_devices: Array<object>, totals: object}}
 */
export function aggregateConnections({
  nodes = [],
  peersByNode = new Map(),
  devicesByPublicKey = new Map(),
  ispByIP = new Map(),
  nowSec = Date.now() / 1000,
  onlineWindowSec = ONLINE_HANDSHAKE_WINDOW_SEC,
} = {}) {
  const byNode = [];
  const onlineDevices = [];
  const byLocation = {};
  let onlineTotal = 0;
  let peerTotal = 0;

  for (const node of nodes) {
    const rows = peersByNode.get(node.id) ?? [];
    let onlineForNode = 0;
    for (const peer of rows) {
      peerTotal += 1;
      if (!isPeerOnline(peer, nowSec, onlineWindowSec)) continue;
      onlineForNode += 1;

      const device = devicesByPublicKey.get(peer.publicKey) ?? null;
      const clientIP = clientIPFromEndpoint(peer.endpoint);
      const hint = (clientIP && ispByIP.get(clientIP)) || { isp: null, country: null };
      const handshake = Number(peer.latestHandshakeSec ?? 0);
      const locationLabel = hint.isp ? `${hint.isp}${hint.country ? ` (${hint.country})` : ""}` : "unknown ISP";
      byLocation[locationLabel] = (byLocation[locationLabel] ?? 0) + 1;

      onlineDevices.push({
        device_id: device?.id ?? null,
        device_name: device?.deviceName ?? null,
        platform: device?.platform ?? null,
        user_id: device?.userId ?? null,
        node_id: node.id,
        node_name: node.name ?? node.id,
        node_location: [node.city, node.country].filter(Boolean).join(", ") || null,
        client_ip: clientIP,
        isp: hint.isp,
        country: hint.country,
        connected_sec: handshake ? Math.max(0, Math.round(nowSec - handshake)) : null,
        rx_bytes: Number(peer.rxBytes ?? 0),
        tx_bytes: Number(peer.txBytes ?? 0),
        allowed_ip: peer.allowedIps ?? null,
      });
    }
    onlineTotal += onlineForNode;
    byNode.push({
      node_id: node.id,
      name: node.name ?? node.id,
      country: node.country ?? null,
      city: node.city ?? null,
      location: [node.city, node.country].filter(Boolean).join(", ") || null,
      online: onlineForNode,
      total: rows.length,
    });
  }

  byNode.sort((a, b) => b.online - a.online || b.total - a.total || a.name.localeCompare(b.name));
  onlineDevices.sort((a, b) => (a.connected_sec ?? Infinity) - (b.connected_sec ?? Infinity));

  return {
    by_node: byNode,
    by_location: byLocation,
    online_devices: onlineDevices,
    totals: { online: onlineTotal, total: peerTotal, nodes: nodes.length },
  };
}

/**
 * Cửa sổ "thiết bị vừa báo cáo" cho dashboard.
 *
 * Vì sao cần nguồn thứ hai ngoài WireGuard: từ 19/09/2026 mọi bản app (iOS/macOS/
 * Android/Windows) đi **hysteria2 qua relay Cloudflare**, KHÔNG còn peer WireGuard
 * ⇒ `wg dump` không bao giờ có handshake, nên dashboard cũ hiện "0 online" dù khách
 * đang kết nối (đo thật 20/09: 2 máy đang chạy mà `online_peers: 0`).
 *
 * App gọi `POST /v1/devices/claim` (hoặc `/v1/peers/register`) mỗi lần kết nối và ghi
 * lại `lastSeenAt`/`lastClientIp`; đó là tín hiệu THẬT duy nhất còn lại ở server.
 */
export const DEFAULT_DEVICE_REPORT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Thiết bị đã báo cáo trong `windowMs` gần đây — nguồn "đang kết nối" thay cho
 * handshake WireGuard. Chỉ tính thiết bị thật (có userId, chưa thu hồi) vì bản ghi
 * probe/test có userId null.
 *
 * @param {object} input
 * @param {Array<object>} input.devices device registry
 * @param {Array<object>} [input.nodes] exit nodes (để lấy tên/vị trí node)
 * @param {Array<object>} [input.users] users (để hiện email)
 * @param {number} [input.nowMs]
 * @param {number} [input.windowMs]
 * @returns {{rows: Array<object>, by_location: Record<string, number>, totals: object}}
 */
export function aggregateDeviceSessions({
  devices = [],
  nodes = [],
  users = [],
  nowMs = Date.now(),
  windowMs = DEFAULT_DEVICE_REPORT_WINDOW_MS,
} = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const emailById = new Map(users.map((user) => [user.id, user.email ?? user.id]));
  const rows = [];
  let skippedNotReal = 0;
  let skippedStale = 0;

  for (const device of devices) {
    if (!device || !device.userId || device.active === false) {
      skippedNotReal += 1;
      continue;
    }
    const seenAt = device.lastClientIpAt ?? device.lastSeenAt ?? null;
    const at = seenAt ? Date.parse(seenAt) : NaN;
    if (!Number.isFinite(at) || nowMs - at > windowMs) {
      skippedStale += 1;
      continue;
    }
    const node = device.exitNodeId ? nodeById.get(device.exitNodeId) ?? null : null;
    rows.push({
      source: "device",
      device_id: device.id,
      device_name: device.deviceName ?? null,
      platform: device.platform ?? null,
      user_id: device.userId,
      user_email: emailById.get(device.userId) ?? null,
      node_id: node?.id ?? device.exitNodeId ?? null,
      node_name: node ? node.name ?? node.id : null,
      node_location: node ? [node.city, node.country].filter(Boolean).join(", ") || null : null,
      client_ip: device.lastClientIp ?? null,
      isp: null,
      country: null,
      last_seen_at: seenAt,
      reported_sec_ago: Math.max(0, Math.round((nowMs - at) / 1000)),
      connected_sec: null,
      rx_bytes: null,
      tx_bytes: null,
      allowed_ip: device.assignedIP ?? null,
    });
  }

  rows.sort((a, b) => a.reported_sec_ago - b.reported_sec_ago);
  return {
    rows,
    by_location: {},
    totals: {
      reported: rows.length,
      window_ms: windowMs,
      skipped_not_real_device: skippedNotReal,
      skipped_stale: skippedStale,
    },
  };
}

/**
 * Cache reverse-DNS (PTR) có TTL + timeout + giới hạn song song.
 * IP không tra được trả { isp: null, country: null } thay vì làm treo request.
 *
 * @param {object} [opts]
 * @param {(ip: string) => Promise<string[]>} [opts.resolve] resolver inject (test)
 * @param {number} [opts.ttlMs]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.concurrency]
 * @param {() => number} [opts.now]
 */
export function createPTRLookup({ resolve, ttlMs = 6 * 60 * 60 * 1000, timeoutMs = 1500, concurrency = 8, now = Date.now } = {}) {
  if (typeof resolve !== "function") throw new Error("createPTRLookup requires a resolve(ip) function");
  const cache = new Map(); // ip -> { at, value }

  const lookupOne = async (ip) => {
    const cached = cache.get(ip);
    if (cached && now() - cached.at < ttlMs) return cached.value;

    let value = { isp: null, country: null, hostname: null };
    try {
      const names = await Promise.race([
        resolve(ip),
        new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(null), timeoutMs)),
      ]);
      const hostname = Array.isArray(names) ? names.find(Boolean) ?? null : null;
      value = { ...ispHintFromPTR(hostname), hostname };
    } catch {
      value = { isp: null, country: null, hostname: null };
    }
    cache.set(ip, { at: now(), value });
    return value;
  };

  return {
    /** @param {string[]} ips @returns {Promise<Map<string, object>>} */
    async lookupMany(ips) {
      const unique = [...new Set((ips ?? []).filter(Boolean))];
      const out = new Map();
      let cursor = 0;
      const workers = Array.from({ length: Math.max(1, Math.min(concurrency, unique.length)) }, async () => {
        while (cursor < unique.length) {
          const ip = unique[cursor++];
          out.set(ip, await lookupOne(ip));
        }
      });
      await Promise.all(workers);
      return out;
    },
    /** Chỉ dùng cho test. */
    _cache: cache,
  };
}
