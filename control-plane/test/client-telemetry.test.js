import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

import {
  ClientTelemetryStore,
  createRateLimiter,
  registerClientTelemetry,
  splitTelemetryBody,
  validateTelemetryEvent,
} from "../src/client-telemetry.js";
import {
  BW_POLICY_META_KEYS,
  BW_POLICY_SPEC,
  DEFAULT_BW_POLICY,
  createBwPolicyProvider,
  resolveBwPolicy,
} from "../src/bw-policy.js";

/** Log câm: test không cần rác ra stdout. */
const quietLog = { log: () => {}, warn: () => {}, error: () => {} };

/** Sự kiện hợp lệ tối thiểu, giống dòng log `bw:` thật của Android. */
function validEvent(overrides = {}) {
  return {
    schema_version: 1,
    device_id: "dev-8f2a91c4",
    platform: "android",
    app_version: "1.4.2",
    model: "Pixel 7",
    net_key_hash: "9f2c7ab41d3e",
    net_type: "wifi",
    rssi: -58,
    link_speed_kbps: 866000,
    metered: false,
    node_id: "vn-hn-1",
    measured_kbps: 42000,
    declared_up_kbps: 25000,
    declared_down_kbps: 85000,
    reason: "memory",
    transport: "hy-udp:8443",
    ctx: "pass-start",
    probe_bytes: 4000000,
    probe_ms: 2900,
    tz_offset_min: 420,
    policy_revision: "7e2ffef79c2b",
    ...overrides,
  };
}

/** App test dựng ĐÚNG thứ tự của index.js: route telemetry đứng TRƯỚC cổng AUTH_TOKEN. */
async function withTelemetryServer(options, run) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "privatevpn-telemetry-"));
  const dbPath = path.join(dir, "client-telemetry.db");
  const app = express();
  app.use(express.json());
  const telemetry = registerClientTelemetry(app, { dbPath, log: quietLog, ...options });
  // Cổng token kiểu AUTH_TOKEN: mọi path khác 401. Route telemetry đã ở TRƯỚC nên vẫn tới được.
  app.use((req, res, next) => (req.path === "/v1/nodes" ? next() : res.status(401).json({ error: "Unauthorized" })));
  app.get("/v1/nodes", (_req, res) => res.json({ nodes: [] }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run({ base, telemetry, dbPath, dir });
  } finally {
    server.close();
    await once(server, "close");
    telemetry.store.close();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

const post = (base, body, headers = {}) =>
  fetch(`${base}/v1/client-telemetry`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

// ------------------------------------------------------------------ validate schema

test("validate: sự kiện bw thật của Android được chuẩn hoá đủ trường", () => {
  const result = validateTelemetryEvent(validEvent());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const e = result.event;
  assert.equal(e.platform, "android");
  assert.equal(e.net_type, "wifi");
  assert.equal(e.reason, "memory");
  assert.equal(e.transport, "hy-udp:8443");
  assert.equal(e.ctx, "pass-start");
  assert.equal(e.measured_kbps, 42000);
  assert.equal(e.declared_down_kbps, 85000);
  assert.equal(e.metered, false);
  assert.match(e.created_at, /^\d{4}-\d\d-\d\dT/);
  assert.equal(e.tz_offset_min, 420);
  assert.equal(e.kind, "sample", "kind mặc định là mẫu định kỳ");
  assert.ok(JSON.parse(e.payload_json).device_id, "payload_json giữ nguyên bản gốc");
});

test("validate: thiếu danh tính (device_id/platform) ⇒ từ chối", () => {
  const noDevice = validateTelemetryEvent(validEvent({ device_id: undefined }));
  assert.equal(noDevice.ok, false);
  assert.ok(noDevice.errors.some((x) => x.startsWith("device_id:")), JSON.stringify(noDevice.errors));

  const badPlatform = validateTelemetryEvent(validEvent({ platform: "symbian" }));
  assert.equal(badPlatform.ok, false);
  assert.ok(badPlatform.errors.includes("platform:not_supported"));

  const noPlatform = validateTelemetryEvent(validEvent({ platform: undefined }));
  assert.equal(noPlatform.ok, false);
  assert.ok(noPlatform.errors.includes("platform:missing"));
});

test("validate: không có số đo nào ⇒ từ chối (chống ping rỗng)", () => {
  const result = validateTelemetryEvent({
    device_id: "dev-8f2a91c4",
    platform: "ios",
    net_type: "wifi",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("no_measurement"));
});

test("validate: riêng tư — SSID thô, token, IP thô đều bị TỪ CHỐI", () => {
  for (const bad of [
    { ssid: "ICONLABHOTEL" },
    { net_key: "wifi:MyHome" },
    { access_token: "abc" },
    { exit_ip: "203.0.113.9" },
    { dns_query: "example.com" },
    { nested: { password: "hunter2" } },
  ]) {
    const result = validateTelemetryEvent(validEvent(bad));
    assert.equal(result.ok, false, `phải từ chối ${JSON.stringify(bad)}`);
    assert.ok(result.errors.some((x) => x.startsWith("privacy_violation:")), JSON.stringify(result.errors));
  }
  // Bản ĐÚNG của cùng thông tin đó thì được nhận.
  const ok = validateTelemetryEvent(validEvent({ net_key_hash: "9f2c7ab41d3e", exit_ip_hash: "a1b2c3d4e5f6" }));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
});

test("validate: giá trị sai kiểu / ngoài khoảng ⇒ từ chối kèm tên field", () => {
  const result = validateTelemetryEvent(validEvent({ measured_kbps: -5, rssi: 40, loss_pct: 150, metered: "maybe" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("measured_kbps:out_of_range"));
  assert.ok(result.errors.includes("rssi:out_of_range"));
  assert.ok(result.errors.includes("loss_pct:out_of_range"));
  assert.ok(result.errors.includes("metered:not_a_boolean"));
});

test("validate: schema_version mới hơn server ⇒ từ chối", () => {
  const result = validateTelemetryEvent(validEvent({ schema_version: 99 }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("schema_version:unsupported"));
});

test("validate: reason lạ được quy về 'other' nhưng vẫn lưu bản gốc trong payload_json", () => {
  const result = validateTelemetryEvent(validEvent({ reason: "chan-doan-moi" }));
  assert.equal(result.ok, true);
  assert.equal(result.event.reason, "other");
  assert.equal(JSON.parse(result.event.payload_json).reason, "chan-doan-moi");
});

test("validate: policy_revision là tuỳ chọn — client chưa đọc bw_policy thì lưu NULL", () => {
  const withRevision = validateTelemetryEvent(validEvent());
  assert.equal(withRevision.event.policy_revision, "7e2ffef79c2b");
  const without = validateTelemetryEvent(validEvent({ policy_revision: undefined }));
  assert.equal(without.ok, true);
  assert.equal(without.event.policy_revision, null);
  const bad = validateTelemetryEvent(validEvent({ policy_revision: "rev co dau cach" }));
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.includes("policy_revision:invalid_format"));
});

test("validate: mốc thời gian ở tương lai / quá cũ ⇒ từ chối", () => {
  const future = validateTelemetryEvent(validEvent({ created_at: new Date(Date.now() + 6 * 3600_000).toISOString() }));
  assert.equal(future.ok, false);
  assert.ok(future.errors.includes("created_at:timestamp_in_future"));

  const old = validateTelemetryEvent(validEvent({ created_at: new Date(Date.now() - 30 * 86_400_000).toISOString() }));
  assert.equal(old.ok, false);
  assert.ok(old.errors.includes("created_at:timestamp_too_old"));
});

test("validate: nhận epoch ms và epoch giây của client", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const asSeconds = validateTelemetryEvent(validEvent({ ts: nowSec }));
  const asMillis = validateTelemetryEvent(validEvent({ ts: nowSec * 1000 }));
  assert.equal(asSeconds.ok, true, JSON.stringify(asSeconds.errors));
  assert.equal(asMillis.ok, true, JSON.stringify(asMillis.errors));
  assert.equal(asSeconds.event.created_at, asMillis.event.created_at);
});

test("splitTelemetryBody: nhận 1 object, mảng, và { events: [...] }", () => {
  assert.equal(splitTelemetryBody(validEvent()).events.length, 1);
  assert.equal(splitTelemetryBody([validEvent(), validEvent()]).events.length, 2);
  assert.equal(splitTelemetryBody({ events: [validEvent()] }).events.length, 1);
  assert.equal(splitTelemetryBody({ events: [] }).error, "empty_batch");
  const tooMany = splitTelemetryBody({ events: Array.from({ length: 21 }, () => validEvent()) });
  assert.equal(tooMany.error, "too_many_events");
});

test("rate limiter: cửa sổ trượt, trả retry_after, có trần số key", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 3 });
  const t0 = 1_000_000;
  assert.equal(limiter.check("a", { now: t0 }).allowed, true);
  assert.equal(limiter.check("a", { now: t0 }).allowed, true);
  const blocked = limiter.check("a", { now: t0 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterS, 1);
  // Hết cửa sổ thì lại được.
  assert.equal(limiter.check("a", { now: t0 + 1001 }).allowed, true);
  // cost > 1 tính theo số sự kiện, không theo số request.
  assert.equal(limiter.check("b", { now: t0, cost: 3 }).allowed, false);
  // Trần số key: nhét 10 key khác nhau vẫn không phình quá maxKeys.
  for (let i = 0; i < 10; i++) limiter.check(`k${i}`, { now: t0 });
  assert.ok(limiter.size() <= 3, `size=${limiter.size()}`);
});

// ------------------------------------------------------------------ store SQLite

test("store: lưu đúng dòng, có chỉ mục (platform, created_at)", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "privatevpn-store-"));
  const store = new ClientTelemetryStore(path.join(dir, "t.db"), { log: quietLog });
  try {
    const { event } = validateTelemetryEvent(validEvent());
    store.insert(event, { receivedAt: "2026-09-19T10:00:00.000Z" });
    const rows = store.recent(1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].platform, "android");
    assert.equal(rows[0].device_id, "dev-8f2a91c4");
    assert.equal(rows[0].measured_kbps, 42000);
    assert.equal(rows[0].declared_down_kbps, 85000);
    assert.equal(rows[0].reason, "memory");
    assert.equal(rows[0].net_key_hash, "9f2c7ab41d3e");
    assert.equal(rows[0].metered, 0);
    assert.equal(rows[0].policy_revision, "7e2ffef79c2b");
    assert.equal(rows[0].received_at, "2026-09-19T10:00:00.000Z");
    const indexes = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'client_telemetry'")
      .all()
      .map((row) => row.name);
    assert.ok(indexes.includes("idx_client_telemetry_platform_created"), indexes.join(","));
    assert.equal(store.count(), 1);
  } finally {
    store.close();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("store: xoay vòng theo tuổi và theo số dòng", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "privatevpn-purge-"));
  const store = new ClientTelemetryStore(path.join(dir, "t.db"), { retentionDays: 1, maxRows: 2, log: quietLog });
  try {
    const now = Date.parse("2026-09-19T10:00:00.000Z");
    const { event } = validateTelemetryEvent(validEvent(), { now });
    const at = (iso) => ({ ...event, created_at: iso });
    store.insertMany(
      [
        at("2026-09-15T10:00:00.000Z"),
        at("2026-09-18T09:00:00.000Z"),
        at("2026-09-19T09:00:00.000Z"),
      ],
      { receivedAt: new Date(now).toISOString() },
    );
    assert.equal(store.count(), 3);
    const purged = store.purge({ now });
    assert.equal(purged.deletedOld, 2, "xoá 2 dòng cũ hơn 1 ngày");
    assert.equal(store.count(), 1);

    store.insertMany([at("2026-09-19T09:10:00.000Z"), at("2026-09-19T09:20:00.000Z")], {
      receivedAt: new Date(now).toISOString(),
    });
    const purged2 = store.purge({ now });
    assert.equal(purged2.deletedOverflow, 1, "vượt trần 2 dòng ⇒ xoá cũ nhất");
    assert.equal(store.count(), 2);
  } finally {
    store.close();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ endpoint

test("endpoint: POST hợp lệ ⇒ 204 không body và ghi đúng vào DB", async () => {
  await withTelemetryServer({}, async ({ base, telemetry }) => {
    const res = await post(base, validEvent({ effective_up_kbps: 21000, effective_down_kbps: 78000, session_id: "s-1" }));
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "", "204 phải không có body");
    const rows = telemetry.store.recent(5);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].effective_down_kbps, 78000);
    assert.equal(rows[0].session_id, "s-1");
    assert.equal(rows[0].ctx, "pass-start");
    assert.equal(rows[0].policy_revision, "7e2ffef79c2b", "lưu revision policy client đang chạy");
  });
});

test("endpoint: lô nhiều sự kiện ⇒ 204 và ghi hết trong 1 request", async () => {
  await withTelemetryServer({}, async ({ base, telemetry }) => {
    const res = await post(base, { events: [validEvent(), validEvent({ kind: "probe", probe_ms: 2800 })] });
    assert.equal(res.status, 204);
    assert.equal(telemetry.store.count(), 2);
  });
});

test("endpoint: không cần AUTH_TOKEN — route đứng trước cổng token", async () => {
  await withTelemetryServer({}, async ({ base }) => {
    // Path khác (không public) bị cổng token chặn 401…
    const gated = await fetch(`${base}/v1/khong-ton-tai`, { method: "POST" });
    assert.equal(gated.status, 401);
    // …còn telemetry thì đi thẳng vào route (204), chứng minh thứ tự đăng ký trong index.js.
    const res = await post(base, validEvent());
    assert.equal(res.status, 204);
  });
});

test("endpoint: payload quá lớn ⇒ 413 (không lưu gì)", async () => {
  await withTelemetryServer({}, async ({ base, telemetry }) => {
    const huge = JSON.stringify({ ...validEvent(), junk: "x".repeat(40 * 1024) });
    const res = await post(base, huge);
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.equal(body.error, "payload_too_large");
    assert.equal(body.max_bytes, 32 * 1024);
    assert.equal(telemetry.store.count(), 0);
  });
});

test("endpoint: một sự kiện dài quá 8KB ⇒ 400 event_too_large", async () => {
  await withTelemetryServer({}, async ({ base }) => {
    const res = await post(base, { ...validEvent(), junk: "y".repeat(9 * 1024) });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_telemetry");
    assert.ok(body.details[0].errors.includes("event_too_large"), JSON.stringify(body.details));
  });
});

test("endpoint: body sai schema ⇒ 400 kèm details theo từng sự kiện", async () => {
  await withTelemetryServer({}, async ({ base, telemetry }) => {
    const res = await post(base, { events: [validEvent({ platform: "symbian" }), validEvent({ ssid: "MyHome" })] });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_telemetry");
    assert.equal(body.details.length, 2);
    assert.ok(body.details[0].errors.includes("platform:not_supported"));
    assert.ok(body.details[1].errors.includes("privacy_violation:ssid"));
    assert.equal(telemetry.store.count(), 0, "request sai ⇒ không ghi dòng nào");
  });
});

test("endpoint: quá nhiều sự kiện trong 1 request ⇒ 400 too_many_events", async () => {
  await withTelemetryServer({}, async ({ base }) => {
    const res = await post(base, { events: Array.from({ length: 21 }, () => validEvent()) });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "too_many_events");
  });
});

test("endpoint: lô hợp lệ + lô sai lẫn nhau ⇒ không ghi nửa vời", async () => {
  await withTelemetryServer({}, async ({ base, telemetry }) => {
    const res = await post(base, { events: [validEvent(), validEvent({ measured_kbps: "abc" })] });
    assert.equal(res.status, 400);
    assert.equal(telemetry.store.count(), 0);
  });
});

test("endpoint: rate-limit theo IP ⇒ 429 kèm Retry-After", async () => {
  await withTelemetryServer(
    { env: { CLIENT_TELEMETRY_PER_IP_PER_MIN: "3", CLIENT_TELEMETRY_PER_DEVICE_PER_MIN: "100", CLIENT_TELEMETRY_GLOBAL_PER_MIN: "100" } },
    async ({ base, telemetry }) => {
      for (let i = 0; i < 3; i++) {
        const ok = await post(base, validEvent());
        assert.equal(ok.status, 204, `lượt ${i + 1} phải qua`);
      }
      const blocked = await post(base, validEvent());
      assert.equal(blocked.status, 429);
      const body = await blocked.json();
      assert.equal(body.error, "rate_limited");
      assert.ok(body.retry_after_s >= 1);
      assert.equal(blocked.headers.get("retry-after"), String(body.retry_after_s));
      assert.equal(telemetry.store.count(), 3, "request bị chặn không được ghi");
    },
  );
});

test("endpoint: rate-limit theo THIẾT BỊ (nhiều IP cùng một device_id)", async () => {
  await withTelemetryServer(
    { env: { CLIENT_TELEMETRY_PER_IP_PER_MIN: "100", CLIENT_TELEMETRY_PER_DEVICE_PER_MIN: "2", CLIENT_TELEMETRY_GLOBAL_PER_MIN: "100" } },
    async ({ base }) => {
      assert.equal((await post(base, validEvent())).status, 204);
      assert.equal((await post(base, validEvent())).status, 204);
      const blocked = await post(base, validEvent());
      assert.equal(blocked.status, 429);
    },
  );
});

test("endpoint: công tắc CLIENT_TELEMETRY=0 ⇒ nhận 204 nhưng không lưu", async () => {
  await withTelemetryServer({ env: { CLIENT_TELEMETRY: "0" } }, async ({ base, telemetry }) => {
    assert.equal((await post(base, validEvent())).status, 204);
    assert.equal(telemetry.store.count(), 0);
  });
});

// ------------------------------------------------------------------ bw_policy

test("bw_policy: mặc định ĐÚNG hằng số đang hard-code trong app", () => {
  // iOS HysteriaBandwidthControl.swift
  assert.equal(DEFAULT_BW_POLICY.ramp_up_factor, 1.25);
  assert.equal(DEFAULT_BW_POLICY.ramp_up_factor_saturated, 1.5);
  assert.equal(DEFAULT_BW_POLICY.loss_backoff_factor, 0.7);
  assert.equal(DEFAULT_BW_POLICY.ramp_saturated_ratio, 0.85);
  assert.equal(DEFAULT_BW_POLICY.ramp_headroom_ratio, 1.15);
  assert.equal(DEFAULT_BW_POLICY.peak_window_s, 10);
  assert.equal(DEFAULT_BW_POLICY.ramp_min_observed_s, 10);
  assert.equal(DEFAULT_BW_POLICY.loss_backoff_min_observed_s, 5);
  assert.equal(DEFAULT_BW_POLICY.idle_before_change_s, 2);
  assert.equal(DEFAULT_BW_POLICY.memory_freshness_s, 30 * 24 * 3600);
  assert.equal(DEFAULT_BW_POLICY.max_remembered_networks, 32);
  assert.equal(DEFAULT_BW_POLICY.min_trusted_measured_kbps, 5000);
  assert.equal(DEFAULT_BW_POLICY.ceiling_max_kbps, 10_000_000);
  assert.equal(DEFAULT_BW_POLICY.ceiling_min_kbps, 500);
  // Android BandwidthPolicy + Config.kt
  assert.equal(DEFAULT_BW_POLICY.declare_ratio_pct, 85);
  assert.equal(DEFAULT_BW_POLICY.jumpup_pct, 150);
  assert.equal(DEFAULT_BW_POLICY.saturated_pct, 95);
  assert.equal(DEFAULT_BW_POLICY.deadband_pct, 80);
  assert.equal(DEFAULT_BW_POLICY.explore_pct, 115);
  assert.equal(DEFAULT_BW_POLICY.damping_pct, 60);
  assert.equal(DEFAULT_BW_POLICY.floor_up_kbps, 500);
  assert.equal(DEFAULT_BW_POLICY.floor_down_kbps, 1000);
  assert.equal(DEFAULT_BW_POLICY.static_up_kbps, 30000);
  assert.equal(DEFAULT_BW_POLICY.static_down_kbps, 100000);
  assert.equal(DEFAULT_BW_POLICY.mobile_up_kbps, 8000);
  assert.equal(DEFAULT_BW_POLICY.mobile_down_kbps, 12000);
  // Config.BW_PROBE_URL + BandwidthMemory.companion
  assert.equal(DEFAULT_BW_POLICY.probe_url, "https://speed.cloudflare.com/__down?bytes=4000000");
  assert.equal(DEFAULT_BW_POLICY.probe_max_ms, 3000);
  assert.equal(DEFAULT_BW_POLICY.probe_bytes, 4000000);
  assert.equal(DEFAULT_BW_POLICY.probe_bytes_metered, 1500000);
  assert.equal(DEFAULT_BW_POLICY.probe_min_interval_ms, 3 * 60 * 1000);
  assert.equal(DEFAULT_BW_POLICY.probe_min_bytes, 200000);
  assert.equal(DEFAULT_BW_POLICY.probe_min_ms, 400);
  // Trần Wi-Fi/di động
  assert.equal(DEFAULT_BW_POLICY.wifi_ceiling_good_pct, 45);
  assert.equal(DEFAULT_BW_POLICY.wifi_ceiling_fair_pct, 35);
  assert.equal(DEFAULT_BW_POLICY.wifi_ceiling_weak_pct, 25);
  assert.equal(DEFAULT_BW_POLICY.wifi_ceiling_poor_pct, 15);
  assert.equal(DEFAULT_BW_POLICY.cell_ceiling_5g_kbps, 200000);
  assert.equal(DEFAULT_BW_POLICY.cell_ceiling_lte_kbps, 50000);
});

test("bw_policy: payload trả ĐỦ trường + meta, không trùng tên với tham số", () => {
  const payload = createBwPolicyProvider().payload();
  for (const key of Object.keys(BW_POLICY_SPEC)) {
    assert.ok(Object.hasOwn(payload, key), `payload thiếu field ${key}`);
  }
  for (const meta of BW_POLICY_META_KEYS) {
    assert.ok(Object.hasOwn(payload, meta), `payload thiếu meta ${meta}`);
    assert.ok(!Object.hasOwn(BW_POLICY_SPEC, meta), `meta ${meta} trùng tên tham số`);
  }
  assert.equal(payload.schema_version, 1);
  assert.match(payload.revision, /^[0-9a-f]{12}$/);
  assert.deepEqual(payload.overridden_keys, [], "mặc định thì không có field nào bị override");
  assert.equal(typeof payload.enabled, "boolean");
  assert.equal(typeof payload.telemetry_enabled, "boolean");
  assert.equal(payload.probe_url, DEFAULT_BW_POLICY.probe_url);
});

test("bw_policy: app_config override được, env thắng app_config, và revision đổi theo", () => {
  const read = (key) => (key === "bw_policy" ? JSON.stringify({ ramp_up_factor: 1.4, probe_max_ms: 2500 }) : null);
  const fromConfig = resolveBwPolicy({ read, env: {} });
  assert.equal(fromConfig.policy.ramp_up_factor, 1.4);
  assert.equal(fromConfig.policy.probe_max_ms, 2500);
  assert.deepEqual(fromConfig.overridden_keys.sort(), ["probe_max_ms", "ramp_up_factor"]);
  const baseRevision = resolveBwPolicy({ env: {} }).revision;
  assert.notEqual(fromConfig.revision, baseRevision, "revision phải đổi khi tham số đổi");

  const envWins = resolveBwPolicy({ read, env: { BW_POLICY_RAMP_UP_FACTOR: "2" } });
  assert.equal(envWins.policy.ramp_up_factor, 2, "env từng tham số thắng app_config");

  const envJson = resolveBwPolicy({ read, env: { BW_POLICY_JSON: '{"ramp_up_factor":1.8}' } });
  assert.equal(envJson.policy.ramp_up_factor, 1.8, "BW_POLICY_JSON thắng app_config");
});

test("bw_policy: giá trị sai ⇒ giữ default và ghi lý do, không ném lỗi", () => {
  const read = () =>
    JSON.stringify({
      ramp_up_factor: "khong-phai-so",
      loss_backoff_factor: 5, // ngoài trần 1 ⇒ kẹp về 1
      ramp_rebuild_mode: "maybe",
      probe_url: "ftp://khong-hop-le",
      khong_ton_tai: 1,
    });
  const result = resolveBwPolicy({ read, env: {} });
  assert.equal(result.policy.ramp_up_factor, DEFAULT_BW_POLICY.ramp_up_factor);
  assert.equal(result.policy.loss_backoff_factor, 1, "kẹp về biên trên");
  assert.equal(result.policy.ramp_rebuild_mode, "client-default");
  assert.equal(result.policy.probe_url, DEFAULT_BW_POLICY.probe_url);
  const reasons = result.rejected.map((item) => `${item.key}:${item.reason}`);
  assert.ok(reasons.includes("ramp_up_factor:not_a_number"), reasons.join(","));
  assert.ok(reasons.includes("loss_backoff_factor:clamped"), reasons.join(","));
  assert.ok(reasons.includes("ramp_rebuild_mode:not_in_enum"), reasons.join(","));
  assert.ok(reasons.includes("probe_url:invalid_format"), reasons.join(","));
  assert.ok(reasons.includes("khong_ton_tai:unknown_key"), reasons.join(","));
});

test("bw_policy: app_config JSON hỏng ⇒ dùng default, không làm sập route", () => {
  const result = resolveBwPolicy({ read: () => "{khong-phai-json", env: {} });
  assert.deepEqual(result.policy, { ...DEFAULT_BW_POLICY });
  assert.ok(result.rejected.some((item) => item.reason === "invalid_json"));
});
