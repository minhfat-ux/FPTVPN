import fs from "node:fs/promises";
import path from "node:path";

/**
 * MeetFlow AI user registry — the control plane's own record of the accounts it
 * has seen, independent of Firebase.
 *
 * MeetFlow AI accounts live in Firebase Authentication, but the control plane
 * only learns about a user when the app or the buy page talks to it: an
 * entitlement check, a payment order, an activation, or a manual admin grant.
 * Every one of those touches this registry, so the admin dashboard can show who
 * exists even before Firebase credentials are configured (and keep history
 * after a Firebase account is deleted).
 *
 * The row itself is intentionally small: email is the key, plus first/last seen
 * and where we saw it. Subscription state is always read live from the
 * entitlement + order stores, never duplicated here.
 */

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

const MAX_SOURCES = 8;

export class AiUsersStore {
  constructor(filePath) {
    this.filePath = filePath;
    // Every mutation is a read-modify-write of one JSON file, and the public
    // routes touch this store concurrently, so writes are serialized.
    this._queue = Promise.resolve();
  }

  _serialize(fn) {
    const run = this._queue.then(fn, fn);
    // Keep the chain alive even when a caller's promise rejects.
    this._queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async _load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      return { users: Array.isArray(data.users) ? data.users : [] };
    } catch (err) {
      if (err.code === "ENOENT") return { users: [] };
      throw err;
    }
  }

  async _save(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  /**
   * Records that we saw this email. Called from the public payment/entitlement
   * routes as well as from admin actions, so never throws on bad input.
   */
  async touch(email, { source = "app", platform = null, appVersion = null, note = null } = {}) {
    const key = normalizeEmail(email);
    if (!key || !key.includes("@")) return null;
    return this._serialize(() => this._touchNow(key, { source, platform, appVersion, note }));
  }

  async _touchNow(key, { source, platform, appVersion, note }) {
    const data = await this._load();
    const now = new Date().toISOString();
    let user = data.users.find((u) => u.email === key);
    if (!user) {
      user = { email: key, firstSeen: now, lastSeen: now, seenCount: 0, sources: [] };
      data.users.push(user);
    }
    user.lastSeen = now;
    user.seenCount = Number(user.seenCount ?? 0) + 1;
    if (source && !user.sources.includes(source)) {
      user.sources = [...user.sources, source].slice(-MAX_SOURCES);
    }
    if (platform) user.platform = String(platform).slice(0, 24);
    if (appVersion) user.appVersion = String(appVersion).slice(0, 24);
    if (note) user.note = String(note).slice(0, 240);

    await this._save(data);
    return user;
  }

  /** Registry rows, newest activity first. */
  async listUsers() {
    const data = await this._load();
    return [...data.users].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  }

  async count() {
    return (await this._load()).users.length;
  }

  /** Removes a registry row (used when an admin cleans up a bogus account). */
  async forget(email) {
    const key = normalizeEmail(email);
    return this._serialize(() => this._forgetNow(key));
  }

  async _forgetNow(key) {
    const data = await this._load();
    const before = data.users.length;
    data.users = data.users.filter((u) => u.email !== key);
    if (data.users.length !== before) await this._save(data);
    return before - data.users.length;
  }
}
