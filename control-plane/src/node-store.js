import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";

/**
 * SQLite-backed exit-node registry (node:sqlite).
 *
 * The public app only sees active nodes; admin endpoints manage active and
 * disabled records. On first run the store seeds itself from an optional
 * legacy JSON file (nodes.json) or from the env-based fallback node.
 *
 * DB file is configured via NODES_DB_FILE (default ./data/nodes.db).
 */
export class NodeStore {
  constructor(dbPath, fallbackNode, { legacyJsonPath } = {}) {
    this.dbPath = dbPath;
    this.fallbackNode = fallbackNode;
    this.legacyJsonPath = legacyJsonPath;
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exit_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        city TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        public_key TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    this._seedIfEmpty();
  }

  _seedIfEmpty() {
    const count = this.db.prepare("SELECT COUNT(*) AS c FROM exit_nodes").get().c;
    if (count > 0) return;

    // 1) Migrate from a legacy JSON file (nodes.json) if present.
    if (this.legacyJsonPath && existsSync(this.legacyJsonPath)) {
      try {
        const raw = JSON.parse(readFileSync(this.legacyJsonPath, "utf8"));
        const nodes = Array.isArray(raw) ? raw : raw.nodes ?? [];
        for (const node of nodes.map(normalizeNode)) {
          this._insert(node);
        }
        if (nodes.length > 0) return;
      } catch {
        // fall through to env fallback
      }
    }

    // 2) Seed from the env-based fallback node (WG_SERVER_PUBKEY / WG_PUBLIC_ENDPOINT).
    if (this.fallbackNode) {
      this._insert(normalizeNode(this.fallbackNode));
    }
  }

  _insert(node) {
    this.db.prepare(`
      INSERT INTO exit_nodes (id, name, country, city, endpoint, public_key, priority, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(node.id, node.name, node.country, node.city, node.endpoint, node.public_key, node.priority, node.active ? 1 : 0, node.created_at, node.updated_at);
  }

  _rows() {
    return this.db.prepare("SELECT * FROM exit_nodes").all().map(rowToNode);
  }

  async all() {
    return this._rows();
  }

  async active() {
    return this._rows()
      .filter((node) => node.active)
      .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
  }

  async findById(id) {
    const row = this.db.prepare("SELECT * FROM exit_nodes WHERE id = ?").get(id);
    return row ? rowToNode(row) : null;
  }

  async findActiveById(id) {
    const node = await this.findById(id);
    return node?.active ? node : null;
  }

  async firstActive() {
    const nodes = await this.active();
    return nodes[0] ?? null;
  }

  async create(input) {
    const now = new Date().toISOString();
    const node = normalizeNode({
      ...input,
      id: input.id || slugify(input.name || input.city || "node"),
      active: input.active ?? true,
      priority: input.priority ?? 100,
      created_at: now,
      updated_at: now,
    });

    validateNode(node);
    const existing = this.db.prepare("SELECT id FROM exit_nodes WHERE id = ?").get(node.id);
    if (existing) {
      const error = new Error(`Exit node '${node.id}' already exists`);
      error.statusCode = 409;
      throw error;
    }

    this._insert(node);
    return node;
  }

  async update(id, input) {
    const existing = this.db.prepare("SELECT * FROM exit_nodes WHERE id = ?").get(id);
    if (!existing) return null;

    const updated = normalizeNode({
      ...rowToNode(existing),
      ...input,
      id,
      updated_at: new Date().toISOString(),
    });

    validateNode(updated);
    this.db.prepare(`
      UPDATE exit_nodes
      SET name = ?, country = ?, city = ?, endpoint = ?, public_key = ?,
          priority = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(updated.name, updated.country, updated.city, updated.endpoint, updated.public_key,
           updated.priority, updated.active ? 1 : 0, updated.updated_at, id);
    return updated;
  }

  async disable(id) {
    return this.update(id, { active: false });
  }
}

export function publicNode(node) {
  return {
    id: node.id,
    name: node.name,
    country: node.country,
    city: node.city,
    endpoint: node.endpoint,
    public_key: node.public_key,
    serverPublicKey: node.public_key,
  };
}

export function adminNode(node) {
  return {
    ...publicNode(node),
    active: node.active,
    priority: node.priority,
    created_at: node.created_at,
    updated_at: node.updated_at,
  };
}

function rowToNode(row) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    city: row.city,
    endpoint: row.endpoint,
    public_key: row.public_key,
    priority: row.priority,
    active: row.active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeNode(node) {
  const publicKey = node.public_key ?? node.serverPublicKey ?? node.server_public_key ?? "";
  return {
    id: String(node.id ?? "").trim(),
    name: String(node.name ?? "").trim(),
    country: String(node.country ?? "VN").trim().toUpperCase(),
    city: String(node.city ?? "").trim(),
    endpoint: String(node.endpoint ?? "").trim(),
    public_key: String(publicKey).trim(),
    active: node.active !== false,
    priority: Number.isFinite(Number(node.priority)) ? Number(node.priority) : 100,
    created_at: node.created_at ?? node.createdAt ?? new Date().toISOString(),
    updated_at: node.updated_at ?? node.updatedAt ?? new Date().toISOString(),
  };
}

function validateNode(node) {
  const errors = [];
  if (!node.id) errors.push("id is required");
  if (!/^[a-z0-9][a-z0-9-_.]{1,62}$/i.test(node.id)) {
    errors.push("id must be 2-63 characters using letters, numbers, dash, underscore or dot");
  }
  if (!node.name) errors.push("name is required");
  if (!node.country || !/^[A-Z]{2}$/.test(node.country)) errors.push("country must be an ISO 3166-1 alpha-2 code");
  if (!node.city) errors.push("city is required");
  if (!node.endpoint || !/^[^:\s]+:\d{1,5}$/.test(node.endpoint)) errors.push("endpoint must be host:port");
  if (!node.public_key) errors.push("public_key is required");

  const port = Number(node.endpoint.split(":").pop());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("endpoint port must be 1-65535");
  }

  if (errors.length > 0) {
    const error = new Error(errors.join("; "));
    error.statusCode = 400;
    throw error;
  }
}

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "node";
}
