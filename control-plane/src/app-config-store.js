import { DatabaseSync } from "node:sqlite";

/**
 * SQLite-backed app version/config store (force-update mechanism).
 * Table app_config (key TEXT PRIMARY KEY, value TEXT).
 */
export class AppConfigStore {
  constructor(dbPath, defaults = {}) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    // Seed defaults if the table is empty.
    for (const [key, value] of Object.entries(defaults)) {
      const row = this.db.prepare("SELECT value FROM app_config WHERE key = ?").get(key);
      if (!row) {
        this.db.prepare("INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)")
          .run(key, String(value), new Date().toISOString());
      }
    }
  }

  get(key) {
    const row = this.db.prepare("SELECT value FROM app_config WHERE key = ?").get(key);
    return row ? row.value : null;
  }

  set(key, value) {
    this.db.prepare(`
      INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value), new Date().toISOString());
  }

  all() {
    return this.db.prepare("SELECT key, value FROM app_config").all();
  }
}
