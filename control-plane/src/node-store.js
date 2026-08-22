import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * JSON-file backed exit-node registry.
 *
 * The public app only sees active nodes; admin endpoints can manage active and
 * disabled records. Existing env-based single-node deployments are used as a
 * fallback until the first node is saved.
 */
export class NodeStore {
  constructor(filePath, fallbackNode) {
    this.filePath = filePath;
    this.fallbackNode = fallbackNode;
  }

  async _loadRaw() {
    if (!existsSync(this.filePath)) return [];
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async _load() {
    const nodes = await this._loadRaw();
    if (nodes.length > 0) return nodes.map(normalizeNode);
    return this.fallbackNode ? [normalizeNode(this.fallbackNode)] : [];
  }

  async _save(nodes) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(nodes.map(normalizeNode), null, 2), "utf8");
  }

  async all() {
    return this._load();
  }

  async active() {
    const nodes = await this._load();
    return nodes
      .filter((node) => node.active)
      .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
  }

  async findById(id) {
    const nodes = await this._load();
    return nodes.find((node) => node.id === id) ?? null;
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
    const nodes = await this._load();
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
    if (nodes.some((existing) => existing.id === node.id)) {
      const error = new Error(`Exit node '${node.id}' already exists`);
      error.statusCode = 409;
      throw error;
    }

    nodes.push(node);
    await this._save(nodes);
    return node;
  }

  async update(id, input) {
    const nodes = await this._load();
    const index = nodes.findIndex((node) => node.id === id);
    if (index < 0) return null;

    const updated = normalizeNode({
      ...nodes[index],
      ...input,
      id,
      updated_at: new Date().toISOString(),
    });

    validateNode(updated);
    nodes[index] = updated;
    await this._save(nodes);
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
