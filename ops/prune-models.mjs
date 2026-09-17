#!/usr/bin/env node
/**
 * Prune stale model ids from every provider: a model that the gateway no longer
 * serves (OpenRouter answers 404 "No endpoints found") must not sit in the
 * picker. The provider's current default is always kept — it may be valid even
 * when the gateway does not list it (e.g. GLM serves glm-4-flash without
 * advertising it).
 *
 *   NODE_ENV=production node ops/prune-models.mjs [--dry-run]
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = pathToFileURL(path.join(HERE, "..", "server", "src")).href;
const dryRun = process.argv.includes("--dry-run");

const { initDb, all } = await import(`${SERVER}/db.js`);
initDb();
const settings = await import(`${SERVER}/settings.js`);
const providers = await import(`${SERVER}/providers/index.js`);

let changed = 0;
for (const row of all("providers")) {
  const runtime = providers.toRuntimeProvider(row);
  if (!runtime.hasKey) {
    console.log(`- ${row.name}: bỏ qua (chưa có key)`);
    continue;
  }
  let live = null;
  try {
    live = await providers.providerModels({ provider: runtime });
  } catch (err) {
    console.log(`- ${row.name}: không lấy được danh sách model (${String(err?.message ?? err).slice(0, 80)}) — bỏ qua`);
    continue;
  }
  const models = row.models ?? [];
  const keep = models.filter((model) => live.includes(model) || model === row.default_model);
  const dropped = models.filter((model) => !keep.includes(model));
  if (!dropped.length) {
    console.log(`- ${row.name}: ${models.length} model, không có model chết`);
    continue;
  }
  console.log(`- ${row.name}: bỏ ${dropped.length} model không còn tồn tại → ${dropped.join(", ")}`);
  if (!dryRun) settings.updateProvider(row.id, { models: keep });
  changed += 1;
}

console.log(
  changed
    ? `\n${dryRun ? "DRY RUN — sẽ" : "Đã"} dọn ${changed} provider.`
    : "\nKhông có provider nào cần dọn.",
);
