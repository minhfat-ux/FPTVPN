/**
 * Đăng ký thiết bị iOS (UDID) — phần "identify device" giống Diawi nhưng nằm trên hệ thống của mình.
 *
 * Vì sao cần: IPA phát cho khách là bản ad-hoc, iOS **chỉ cài được** lên máy có UDID nằm trong
 * provisioning profile. Luồng cho khách:
 *   1. khách tải profile nhỏ (.mobileconfig) → iOS gửi UDID + model + phiên bản về server mình;
 *   2. server ghi vào hàng đợi + báo chủ shop;
 *   3. máy Mac của shop thêm UDID vào tài khoản, KÝ LẠI IPA rồi upload lên Diawi;
 *   4. trang chờ của khách tự chuyển sang nút "Cài đặt" khi bản ký lại xong.
 *
 * Module chỉ chứa hàm thuần + một store JSON nhỏ (không I/O mạng) để test được.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * iOS POST về `data=<base64 plist>` (profile có khoá URL) — cũng nhận plist thô để test được.
 * Trả `null` nếu payload không có UDID.
 */
export function decodeDevicePayload(body) {
  const raw = String(body ?? "").trim();
  if (!raw) return null;
  let plistText = raw;
  if (!raw.startsWith("<")) {
    // Chấp nhận mọi dạng iOS/curl gửi lên:
    //  · form "data=<base64>" (iOS gửi vậy)  · chỉ mỗi chuỗi base64  · base64 urlsafe
    const matched = /(?:^|&)data=([^&]+)/.exec(raw);
    let candidate = matched ? matched[1] : raw;
    try {
      candidate = decodeURIComponent(candidate);
    } catch { /* chuỗi base64 thô có '%' hiếm khi xảy ra — cứ dùng nguyên */ }
    // express/querystring đổi '+' thành dấu cách khi parse form ⇒ trả lại '+'.
    candidate = candidate.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    try {
      plistText = Buffer.from(candidate, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  const pick = (key) => {
    const m = plistText.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`, "i"));
    return m ? m[1].trim() : null;
  };
  const udid = pick("UDID");
  if (!udid) return null;
  return {
    udid,
    serial: pick("SERIAL"),
    model: pick("PRODUCT"),
    iosVersion: pick("VERSION"),
    imei: pick("IMEI"),
    iccid: pick("ICCID"),
  };
}

/**
 * Profile .mobileconfig để iOS gửi thông tin thiết bị về `callbackUrl`.
 * Khách cài: Cài đặt → Đã tải về hồ sơ → Cài đặt (1 lần, có thể gỡ sau).
 */
export function buildDeviceProfile({
  callbackUrl,
  deviceAttributes = ["UDID", "VERSION", "PRODUCT", "SERIAL"],
  displayName = "VPNFlow — Device registration",
  payloadName = displayName,
  description = "Reports the device ID (UDID) to VPNFlow so we can issue a matching build.",
  organization = "VPNFlow",
}) {
  const uuid = crypto.randomUUID().toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>URL</key><string>${callbackUrl}</string>
      <key>DeviceAttributes</key>
      <array>${deviceAttributes.map((attribute) => `
        <string>${attribute}</string>`).join("")}
      </array>
      <key>PayloadType</key><string>Profile Service</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>site.meetflowai.vpnflow.device.${uuid}</string>
      <key>PayloadUUID</key><string>${uuid}</string>
      <key>PayloadDisplayName</key><string>${payloadName}</string>
      <key>PayloadDescription</key><string>${description}</string>
      <key>PayloadRemovalDisallowed</key><false/>
    </dict>
  </array>
  <key>PayloadDisplayName</key><string>${displayName}</string>
  <key>PayloadIdentifier</key><string>site.meetflowai.vpnflow.registration</string>
  <key>PayloadOrganization</key><string>${organization}</string>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${uuid}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
}

/**
 * Hàng đợi thiết bị đã đăng ký + số hiệu bản đã ký lại.
 * `buildSerial` tăng mỗi lần máy Mac ký lại IPA; thiết bị `built: false` là còn phải ký lại mới cài được.
 */
export class IosDeviceStore {
  constructor(filePath) {
    this.filePath = filePath;
    this._chain = Promise.resolve();
  }

  _withLock(fn) {
    const run = this._chain.then(fn, fn);
    this._chain = run.then(() => {}, () => {});
    return run;
  }

  _empty() {
    return { buildSerial: 0, builtAt: null, devices: [] };
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.filePath, "utf8"));
      return {
        buildSerial: Number(parsed?.buildSerial ?? 0),
        builtAt: parsed?.builtAt ?? null,
        devices: Array.isArray(parsed?.devices) ? parsed.devices : [],
      };
    } catch {
      return this._empty();
    }
  }

  async save(data) {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  /** Ghi một lần đăng ký. `isNew` cho biết có thiết bị mới ⇒ cần ký lại. */
  async register(info) {
    return this._withLock(async () => {
      const data = await this.load();
      const udid = String(info.udid ?? "").trim();
      if (!udid) throw new Error("thiếu UDID");
      const token = String(info.token ?? "").trim() || null;
      const now = new Date().toISOString();
      const existing = data.devices.find((d) => d.udid === udid);
      if (existing) {
        existing.lastSeenAt = now;
        existing.iosVersion = info.iosVersion ?? existing.iosVersion;
        existing.model = info.model ?? existing.model;
        existing.serial = info.serial ?? existing.serial;
        existing.imei = info.imei ?? existing.imei;
        existing.iccid = info.iccid ?? existing.iccid;
        existing.enrollmentToken = token ?? existing.enrollmentToken;
        if (info.userId) existing.userId = info.userId;
        if (info.email) existing.email = info.email;
        await this.save(data);
        return { device: existing, isNew: false, buildSerial: data.buildSerial };
      }
      const device = {
        udid,
        model: info.model ?? null,
        iosVersion: info.iosVersion ?? null,
        serial: info.serial ?? null,
        imei: info.imei ?? null,
        iccid: info.iccid ?? null,
        enrollmentToken: token,
        userId: info.userId ?? null,
        email: info.email ?? null,
        registeredAt: now,
        lastSeenAt: now,
        built: false,
      };
      data.devices.push(device);
      await this.save(data);
      return { device, isNew: true, buildSerial: data.buildSerial };
    });
  }

  async mapAccount(udid, { userId, email }) {
    return this._withLock(async () => {
      const data = await this.load();
      const device = data.devices.find((entry) => entry.udid === String(udid ?? "").trim());
      if (!device) throw new Error("Không tìm thấy UDID");
      device.userId = userId ?? null;
      device.email = email ?? null;
      device.updatedAt = new Date().toISOString();
      await this.save(data);
      return device;
    });
  }

  /** Thiết bị chưa được ký lại ⇒ máy đó bấm cài sẽ lỗi "Unable to Install". */
  async pending() {
    const data = await this.load();
    return data.devices.filter((d) => !d.built);
  }

  async list() {
    const data = await this.load();
    return { buildSerial: data.buildSerial, builtAt: data.builtAt, devices: data.devices };
  }

  /** Máy Mac gọi sau khi ký lại + upload xong: mọi thiết bị hiện có đều cài được. */
  async markBuilt({ note = null } = {}) {
    return this._withLock(async () => {
      const data = await this.load();
      data.buildSerial = data.buildSerial + 1;
      data.builtAt = new Date().toISOString();
      data.buildNote = note;
      data.devices = data.devices.map((d) => ({ ...d, built: true, builtAt: data.builtAt }));
      await this.save(data);
      return data.buildSerial;
    });
  }

  /** Trạng thái cho trang chờ của khách. */
  async statusFor(udid) {
    const data = await this.load();
    const device = data.devices.find((d) => d.udid === udid) ?? null;
    return {
      registered: Boolean(device),
      ready: Boolean(device?.built),
      buildSerial: data.buildSerial,
      builtAt: data.builtAt,
    };
  }
}
