import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Minimal JSON-file backed device registry.
 * Keyed by device id; public key uniqueness is enforced at the API layer.
 */
export class DeviceStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async _load() {
    if (!existsSync(this.filePath)) return [];
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async _save(devices) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(devices, null, 2), "utf8");
  }

  async all() {
    return this._load();
  }

  async findByPublicKey(publicKey) {
    const devices = await this._load();
    return devices.find((d) => d.publicKey === publicKey) ?? null;
  }

  async findById(id) {
    const devices = await this._load();
    return devices.find((d) => d.id === id) ?? null;
  }

  /** Creates or returns the existing device for a public key. */
  async upsertByPublicKey({ publicKey, deviceName, assignedIP, platform }) {
    const devices = await this._load();
    const existing = devices.find((d) => d.publicKey === publicKey);
    if (existing) {
      existing.deviceName = deviceName ?? existing.deviceName;
      existing.platform = platform ?? existing.platform;
      existing.active = true;
      await this._save(devices);
      return { device: existing, isNew: false };
    }
    const device = {
      id: crypto.randomUUID(),
      publicKey,
      deviceName: deviceName ?? "device",
      platform: platform ?? null,
      assignedIP,
      createdAt: new Date().toISOString(),
      active: true,
    };
    devices.push(device);
    await this._save(devices);
    return { device, isNew: true };
  }

  async deactivate(id) {
    const devices = await this._load();
    const device = devices.find((d) => d.id === id);
    if (!device) return null;
    device.active = false;
    await this._save(devices);
    return device;
  }
}
