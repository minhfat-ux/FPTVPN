import fs from "node:fs";
import path from "node:path";
import { MmdbReader } from "./mmdb.js";

/**
 * Tra vị trí/ISP cho IP client — CHẠY HOÀN TOÀN OFFLINE trên VPS.
 *
 * Vì sao offline: IP của khách là dữ liệu nhạy cảm, gửi sang API bên thứ ba để lấy
 * "location" là điều code này cố tránh (xem ghi chú cũ ở `connection-stats.js`).
 * Bảng dùng ở đây là DB-IP Lite (CC BY 4.0) đặt tại `/usr/share/GeoIP/`:
 *   - `dbip-city-lite.mmdb` → quốc gia / tỉnh-thành / thành phố / toạ độ
 *   - `dbip-asn-lite.mmdb`  → số hiệu AS + tên nhà mạng (ISP)
 * Cập nhật bảng: `scripts/geoip-update.sh` (chạy được bằng cron, không cần API key).
 */

/** Dải KHÔNG có ý nghĩa địa lý: loopback, private, link-local, CGNAT, ULA, multicast… */
const NON_PUBLIC_V4 = [
  /^0\./,
  /^10\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64/10 CGNAT
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^192\.168\./,
  /^198\.1[89]\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^22[4-9]\.|^23\d\.|^24\d\.|^25[0-5]\./, // multicast + reserved
];

/**
 * IP này có tra được vị trí không (loại loopback/private/CGNAT…).
 * @param {string|null|undefined} ip
 * @returns {boolean}
 */
export function isPublicIp(ip) {
  const value = String(ip ?? "").trim().replace(/^\[|\]$/g, "").replace(/^::ffff:/, "");
  if (!value) return false;
  if (value.includes(":")) {
    const lower = value.toLowerCase();
    if (lower === "::1" || lower === "::") return false;
    if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return false; // link-local + ULA
    if (lower.startsWith("ff")) return false; // multicast
    if (lower.startsWith("2001:db8")) return false; // dành cho tài liệu
    return true;
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  return !NON_PUBLIC_V4.some((re) => re.test(value));
}

/**
 * Nhãn "Thành phố, Quốc gia" để hiển thị trên dashboard.
 * @param {{city?: string|null, region?: string|null, country_name?: string|null, country?: string|null}} geo
 * @returns {string|null}
 */
export function locationLabel(geo) {
  if (!geo) return null;
  const place = geo.city || geo.region || null;
  const country = geo.country_name || geo.country || null;
  if (place && country) return `${place}, ${country}`;
  return place || country || null;
}

/**
 * Lookup có cache (RAM + file JSON) trên nền hai bảng mmdb.
 *
 * @param {object} [opts]
 * @param {string} [opts.cityDb] đường dẫn dbip-city-lite.mmdb
 * @param {string} [opts.asnDb] đường dẫn dbip-asn-lite.mmdb
 * @param {string} [opts.cacheFile] file cache JSON (mặc định data/geoip-cache.json)
 * @param {number} [opts.ttlMs] thời gian sống của một entry cache
 * @param {() => number} [opts.now] inject cho test
 * @param {{warn: Function}} [opts.logger]
 * @param {(file: string) => object} [opts.openReader] inject cho test
 */
export function createGeoLookup({
  cityDb = process.env.GEOIP_CITY_DB || "/usr/share/GeoIP/dbip-city-lite.mmdb",
  asnDb = process.env.GEOIP_ASN_DB || "/usr/share/GeoIP/dbip-asn-lite.mmdb",
  cacheFile = process.env.GEOIP_CACHE_FILE || path.join("data", "geoip-cache.json"),
  ttlMs = 7 * 24 * 60 * 60 * 1000,
  now = Date.now,
  logger = console,
  /** Cho phép test bơm reader giả (không cần file mmdb thật). */
  openReader = (file) => MmdbReader.open(file),
} = {}) {
  /** @type {Map<string, {at: number, value: object}>} */
  const cache = new Map();
  let cacheLoaded = false;
  let cacheDirty = false;
  let lastFlush = 0;
  let cityReader = null;
  let asnReader = null;
  let cityError = null;
  let asnError = null;

  function ensureReaders() {
    if (!cityReader && !cityError) {
      try {
        cityReader = openReader(cityDb);
      } catch (err) {
        cityError = err;
        logger.warn?.(`geoip: không mở được bảng city (${cityDb}): ${err.message}`);
      }
    }
    if (!asnReader && !asnError) {
      try {
        asnReader = openReader(asnDb);
      } catch (err) {
        asnError = err;
        logger.warn?.(`geoip: không mở được bảng ASN (${asnDb}): ${err.message}`);
      }
    }
  }

  function loadCacheFile() {
    if (cacheLoaded) return;
    cacheLoaded = true;
    try {
      if (!fs.existsSync(cacheFile)) return;
      const raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      const entries = raw && typeof raw === "object" ? raw.entries ?? {} : {};
      const at = Number(raw?.saved_at ?? 0);
      for (const [ip, value] of Object.entries(entries)) cache.set(ip, { at, value });
    } catch {
      // Cache hỏng không được làm chết dashboard — bỏ qua và tra lại từ bảng.
    }
  }

  async function flushCache(force = false) {
    const stamp = now();
    if (!cacheDirty) return;
    if (!force && stamp - lastFlush < 60_000) return;
    lastFlush = stamp;
    cacheDirty = false;
    const entries = {};
    for (const [ip, item] of cache) entries[ip] = item.value;
    const payload = JSON.stringify({ saved_at: stamp, entries });
    try {
      await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
      const tmp = `${cacheFile}.tmp`;
      await fs.promises.writeFile(tmp, payload, "utf8");
      await fs.promises.rename(tmp, cacheFile);
    } catch (err) {
      logger.warn?.(`geoip: ghi cache thất bại: ${err.message}`);
    }
  }

  function fromReaders(ip) {
    const city = cityReader?.lookup(ip) ?? null;
    const asn = asnReader?.lookup(ip) ?? null;
    const sub = (city?.subdivisions ?? [])[0] ?? null;
    const value = {
      ip,
      country: city?.country?.iso_code ?? null,
      country_name: city?.country?.names?.en ?? null,
      region: sub?.names?.en ?? null,
      city: city?.city?.names?.en ?? null,
      latitude: typeof city?.location?.latitude === "number" ? city.location.latitude : null,
      longitude: typeof city?.location?.longitude === "number" ? city.location.longitude : null,
      timezone: city?.location?.time_zone ?? null,
      asn: asn?.autonomous_system_number ?? null,
      isp: asn?.autonomous_system_organization ?? null,
      source: city || asn ? "mmdb" : "none",
    };
    value.location = locationLabel(value);
    return value;
  }

  /**
   * Tra một IP (đã cache).
   * @param {string} ip
   */
  async function lookup(ip) {
    const key = String(ip ?? "").trim().replace(/^\[|\]$/g, "");
    if (!key) return null;
    loadCacheFile();
    const cached = cache.get(key);
    if (cached && now() - cached.at < ttlMs) return cached.value;

    let value;
    if (!isPublicIp(key)) {
      value = { ip: key, private: true, location: null, source: "private" };
    } else {
      ensureReaders();
      try {
        value = fromReaders(key);
      } catch (err) {
        logger.warn?.(`geoip: tra ${key} lỗi: ${err.message}`);
        value = { ip: key, location: null, source: "error" };
      }
    }
    cache.set(key, { at: now(), value });
    cacheDirty = true;
    await flushCache();
    return value;
  }

  /**
   * Tra nhiều IP, trả Map(ip -> geo).
   * @param {Iterable<string>} ips
   */
  async function lookupMany(ips) {
    const unique = [...new Set([...(ips ?? [])].filter(Boolean).map((ip) => String(ip).trim()))];
    const out = new Map();
    for (const ip of unique) out.set(ip, await lookup(ip));
    return out;
  }

  return {
    lookup,
    lookupMany,
    isPublicIp,
    /** Thông tin bảng đang dùng — hiển thị trên dashboard để biết dữ liệu cũ hay mới. */
    info() {
      ensureReaders();
      const describe = (reader, file, error) => {
        if (error) return { path: file, ok: false, error: error.message };
        if (!reader) return { path: file, ok: false, error: "chưa mở" };
        let buildAt = null;
        let size = null;
        try {
          const stat = fs.statSync(file);
          buildAt = stat.mtime.toISOString();
          size = stat.size;
        } catch {
          // không đọc được stat thì vẫn trả meta của reader
        }
        return { path: file, ok: true, size, updated_at: buildAt, ...reader.meta() };
      };
      return { city: describe(cityReader, cityDb, cityError), asn: describe(asnReader, asnDb, asnError), cached: cache.size };
    },
    async close() {
      await flushCache(true);
      cityReader?.close();
      asnReader?.close();
      cityReader = null;
      asnReader = null;
    },
    _cache: cache,
  };
}
