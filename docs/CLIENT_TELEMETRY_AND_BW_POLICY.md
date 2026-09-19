# CLIENT_TELEMETRY_AND_BW_POLICY — telemetry từ client + tham số `bw_policy` phát xuống client

> Nền tảng cho **vòng lặp AI tinh chỉnh băng thông**: app gửi số đo thật lên control plane →
> agent/AI đọc dữ liệu → sửa tham số chính sách trên server → client lượt sau tự nhận tham số
> mới **không cần phát hành app mới**.
>
> Tài liệu này là hợp đồng (contract) cho bước client đọc/ghi. Nguồn sự thật của code:
> `control-plane/src/client-telemetry.js`, `control-plane/src/bw-policy.js`,
> `control-plane/scripts/bw-loop.mjs`. Hằng số mặc định lấy **đúng** từ
> `android/app/src/main/java/com/privatevpn/app/vpn/BandwidthMemory.kt` (object `BandwidthPolicy`),
> `android/app/src/main/java/com/privatevpn/app/Config.kt` và
> `iOS/PrivateVPNPacketTunnel/HysteriaBandwidthControl.swift`.

## 0. Luồng tổng thể

```
client (Android/iOS/macOS/Windows)
  │  1. đo goodput qua tunnel + log `bw: …` / `hy-udp:<port> … up=… down=…`
  │  2. POST /v1/client-telemetry   (không cần đăng nhập, 204)
  ▼
control plane (node:sqlite)
  │  bảng client_telemetry  ← dữ liệu thật, xoay vòng theo ngày + số dòng
  │  3. agent/AI đọc (SQL / `scripts/bw-loop.mjs report …`)
  │  4. sửa tham số: app_config.bw_policy  (không deploy) hoặc env BW_POLICY_*
  ▼
  │  5. GET /v1/bootstrap + GET /v1/nodes  →  thêm khối `bw_policy`
client lượt kết nối SAU áp tham số mới, kèm `policy_revision` trong telemetry
```

Trạng thái hiện tại: **bước 1–5 phía server đã xong và có test**; phía client còn phải làm
(xem §6). Client chưa đọc `bw_policy` thì hành vi **không đổi** vì mặc định trong payload
bằng đúng hằng số đang hard-code trong app.

---

## 1. Endpoint nhận telemetry

| Mục | Giá trị |
| --- | --- |
| Method + path | `POST /v1/client-telemetry` |
| Xác thực | **Không** cần token (app chưa có phiên khi cần gửi số đo). Route được đăng ký **trước** cổng `AUTH_TOKEN` toàn cục trong `index.js`. |
| Body | 1 object sự kiện **hoặc** `{"events": [ … ]}` **hoặc** mảng object |
| Trả về | `204 No Content` (không body) khi nhận và lưu xong |
| Trần kích thước | 32 768 byte/request (`TELEMETRY_MAX_BYTES`); 8 192 byte/sự kiện |
| Trần số sự kiện | 20 sự kiện/request (`TELEMETRY_MAX_EVENTS`) |
| Rate limit | 60 sự kiện/phút/IP, 30 sự kiện/phút/`device_id`, 3 000 sự kiện/phút toàn hệ (đổi bằng env) |
| Chống lạm dụng | từ chối key nhạy cảm (§2.5), từ chối sự kiện không có số đo nào, từ chối `created_at` ở tương lai > 1h hoặc cũ hơn 7 ngày, giới hạn độ dài mọi chuỗi, công tắc `CLIENT_TELEMETRY=0` |

Mã lỗi:

| HTTP | `error` | Khi nào |
| --- | --- | --- |
| 204 | — | đã lưu (hoặc telemetry đang tắt bằng công tắc) |
| 400 | `invalid_telemetry` | sai schema; `details[]` = `{index, errors[]}` cho từng sự kiện |
| 400 | `too_many_events` / `empty_batch` | > 20 sự kiện / lô rỗng |
| 413 | `payload_too_large` | vượt trần byte |
| 429 | `rate_limited` | vượt hạn mức; có header `Retry-After` |
| 500 | `internal_error` | lỗi ghi DB (đã log) |

Ví dụ (dữ liệu giả, chạy thật trên control plane local):

```bash
curl -i -X POST -H 'content-type: application/json' \
  --data '{"schema_version":1,"device_id":"dev-8f2a91c4","platform":"android","app_version":"1.4.2",
           "model":"Pixel 7","net_key_hash":"9f2c7ab41d3e","net_type":"wifi","rssi":-58,
           "link_speed_kbps":866000,"metered":false,"node_id":"vn-hn-1","measured_kbps":42000,
           "declared_up_kbps":25000,"declared_down_kbps":85000,"effective_up_kbps":23000,
           "effective_down_kbps":79000,"reason":"memory","transport":"hy-udp:8443",
           "ctx":"pass-start","rtt_ms":38,"loss_pct":0.4,"probe_bytes":4000000,"probe_ms":2900,
           "tz_offset_min":420,"policy_revision":"7e2ffef79c2b"}' \
  https://api.meetflowai.site/v1/client-telemetry
# HTTP/1.1 204 No Content
```

Từ chối SSID thô (client phải hash trước khi gửi):

```bash
curl -s -X POST -H 'content-type: application/json' \
  --data '{"device_id":"dev-8f2a91c4","platform":"android","measured_kbps":42000,"ssid":"ICONLABHOTEL"}' \
  https://api.meetflowai.site/v1/client-telemetry
# {"error":"invalid_telemetry","details":[{"index":0,"errors":["privacy_violation:ssid"]}]}
```

Bật/tắt cả endpoint (không cần deploy lại code, chỉ cần set env rồi restart service):

```bash
CLIENT_TELEMETRY=0   # nhận 204 nhưng không ghi gì (client không phải đổi)
```

---

## 2. Schema telemetry (v1)

### 2.1 Đường bao (envelope)

- **1 sự kiện = 1 mẫu hoặc 1 tổng kết phiên**. Field `kind` quyết định:
  `sample` (mẫu định kỳ), `probe` (kết quả đo goodput), `ramp` (quyết định ramp/hạ giữa phiên),
  `session` (tổng kết phiên), `summary` (tổng hợp nhiều phiên).
- Gửi theo lô để đỡ tốn pin/dữ liệu: `{"events": [ … ≤ 20 … ]}`.
- `schema_version` = 1. Client **cũ hơn** server: thiếu field ⇒ nhận (field tuỳ chọn = `null`).
  Client **mới hơn** server (`schema_version` > 1) ⇒ bị từ chối `schema_version:unsupported`
  để server không lưu dữ liệu mà nó không hiểu.

### 2.2 Bảng trường

| Trường | Kiểu / giới hạn | Bắt buộc | Nguồn ở client | Ghi chú |
| --- | --- | --- | --- | --- |
| `schema_version` | int 1..1000 | tuỳ chọn (mặc định 1) | hằng số trong app | > 1 ⇒ bị từ chối |
| `created_at` | ISO 8601 **hoặc** epoch giây/ms (`ts`, `time` cũng nhận) | tuỳ chọn (mặc định = giờ server nhận) | `System.currentTimeMillis()` | tương lai > 1h hoặc cũ > 7 ngày ⇒ từ chối |
| `tz_offset_min` | int −900..900 | tuỳ chọn (0) | `TimeZone.getDefault().getOffset()`/60_000 | để phân tích theo **giờ địa phương** của khách |
| `device_id` | chuỗi 6..64, `[A-Za-z0-9._-]`, chữ/số đầu | **có** | UUID ngẫu nhiên lưu trong prefs | ẩn danh, **xoay được** (đổi id = mất tương quan) |
| `platform` | `android` \| `ios` \| `macos` \| `windows` \| `linux` \| `other` | **có** | hằng số build | dùng cho chỉ mục `(platform, created_at)` |
| `app_version` | chuỗi ≤ 40 | tuỳ chọn | `versionName` | để loại trừ số liệu của bản cũ khi phân tích |
| `model` | chuỗi ≤ 64 | tuỳ chọn | `Build.MODEL` (iOS: `hw.machine`) | gỡ lỗi theo máy |
| `net_key_hash` | hex 8..64, **KHÔNG nhận SSID thô** | tuỳ chọn | `SHA-256(device_id + "|" + netKey)` | khoá mạng (SSID/nhà mạng) đã ẩn danh — xem §2.5 |
| `net_type` | `wifi` \| `cell` \| `ethernet` \| `other` \| `unknown` | tuỳ chọn | `NetworkCapabilities` / `NetworkMonitor.describe()` | |
| `rssi` | int −120..0 (0 = không đọc được) | tuỳ chọn | `WifiInfo.rssi` | chỉ Wi-Fi |
| `link_speed_kbps` | int 0..100 000 000 | tuỳ chọn | `WifiInfo.linkSpeed * 1000` | tốc độ PHY **đàm phán**, không phải tốc độ thật |
| `metered` | bool | tuỳ chọn | `ConnectivityManager.isActiveNetworkMetered` | chọn nấc tĩnh nào đã dùng |
| `node_id` | chuỗi ≤ 40 | tuỳ chọn | node đang chọn trong app | thay cho IP thoát (không nhạy cảm) |
| `measured_kbps` | int 0..100 000 000 | **có ít nhất 1 trong các field số đo** | dòng `bw: probe …` / `bw: ramp … observed=…` | goodput THẬT đo qua tunnel |
| `declared_up_kbps` | int 0..100 000 000 | " | số truyền vào client hysteria (`attemptUpKbps`) | |
| `declared_down_kbps` | int 0..100 000 000 | " | `attemptDownKbps` | |
| `effective_up_kbps` | int 0..100 000 000 | " | `hy-udp:<port> … up=…` | số **đang thực sự dùng** |
| `effective_down_kbps` | int 0..100 000 000 | " | `hy-udp:<port> … down=…` | |
| `reason` | `probe`\|`memory`\|`clamp`\|`profile`\|`ramp`\|`idle-reconnect`\|`loss-backoff`\|`other` | tuỳ chọn | `bw: … reason=…` | lạ ⇒ lưu `other` + bản gốc trong `payload_json` |
| `transport` | chuỗi ≤ 40 | tuỳ chọn | `DiagnosticsLog.transport`, `outerDetail` | `hy-udp:8443`, `hy-tcp:8443`, `ws-relay`, `wg-relay` |
| `ctx` | chuỗi ≤ 40 | tuỳ chọn | tham số `reason` của `refreshMeteredState()` | `pass-start`, `tun-up`, `next-connect` |
| `policy_revision` | chuỗi ≤ 16 | tuỳ chọn | `bw_policy.revision` đã cache | **rỗng = client chưa đọc bw_policy**; dùng để so trước/sau |
| `rtt_ms` | int 0..60 000 | tuỳ chọn | probe HTTP/DNS | |
| `loss_pct` | số 0..100 (2 chữ số) | tuỳ chọn | đếm gói utun / thống kê QUIC | |
| `probe_bytes` | int 0..1e9 | tuỳ chọn | `bw: probe ${total}B/${ms}ms` | |
| `probe_ms` | int 0..600 000 | tuỳ chọn | như trên | |
| `exit_ip_hash` | hex 8..64 | tuỳ chọn | hash IP thoát đã quan sát | **IP thô bị từ chối** |
| `session_id` | chuỗi ≤ 64 | tuỳ chọn | id phiên tunnel | gom mẫu theo phiên |
| `kind` | `sample`\|`session`\|`probe`\|`ramp`\|`summary` | tuỳ chọn (`sample`) | theo loại sự kiện | |

Field **lạ** (không có trong bảng) vẫn được nhận và lưu nguyên vào cột `payload_json` (đổi schema
client trước server không làm mất dữ liệu) — trừ key nằm trong danh sách cấm dưới đây.

### 2.3 Ánh xạ từ log app đang có → sự kiện telemetry

App đã ghi đủ số liệu; client **không cần đo thêm gì**, chỉ đổi chỗ ghi log thành gửi JSON.

| Dòng log hiện có | kind | Ánh xạ |
| --- | --- | --- |
| `bw: net=<key> measured=<kbps> declared up=<u> down=<d> reason=probe\|memory\|clamp\|profile ctx=pass-start\|tun-up\|next-connect ceil=<kbps>` | `sample` | `net_key_hash` (hash của `<key>`), `measured_kbps`, `declared_up_kbps`, `declared_down_kbps`, `reason`, `ctx`, `net_type/rssi/link_speed_kbps/metered` từ `NetProfile` |
| `bw: probe <bytes>B/<ms>ms -> <kbps> qua tunnel` | `probe` | `probe_bytes`, `probe_ms`, `measured_kbps`, `reason="probe"` |
| `bw: ramp net=… observed=… old=… new=… reason=idle-reconnect\|loss-backoff` | `ramp` | `measured_kbps=observed`, `declared_up_kbps=new`, `effective_up_kbps=old`, `reason` |
| `hy-udp:<port> … up=<kbps> down=<kbps>` | `session` | `transport="hy-udp:<port>"`, `effective_up_kbps`, `effective_down_kbps`, `session_id` |

### 2.4 Ví dụ payload thật (đã gửi thử, đã lưu đúng vào SQLite)

```json
{
  "schema_version": 1,
  "device_id": "dev-8f2a91c4",
  "platform": "android",
  "app_version": "1.4.2",
  "model": "Pixel 7",
  "net_key_hash": "9f2c7ab41d3e",
  "net_type": "wifi",
  "rssi": -58,
  "link_speed_kbps": 866000,
  "metered": false,
  "node_id": "vn-hn-1",
  "measured_kbps": 42000,
  "declared_up_kbps": 25000,
  "declared_down_kbps": 85000,
  "effective_up_kbps": 23000,
  "effective_down_kbps": 79000,
  "reason": "memory",
  "transport": "hy-udp:8443",
  "ctx": "pass-start",
  "rtt_ms": 38,
  "loss_pct": 0.4,
  "probe_bytes": 4000000,
  "probe_ms": 2900,
  "tz_offset_min": 420,
  "policy_revision": "7e2ffef79c2b",
  "created_at": "2026-09-19T14:48:21.152Z"
}
```

Dòng đã lưu trong `client_telemetry` (đọc lại bằng `node:sqlite`):

```
device_id      platform  created_at                 tz_offset_min  net_key_hash    net_type  rssi  link_speed_kbps  metered  measured_kbps  declared_up_kbps  declared_down_kbps  reason  transport     ctx
dev-8f2a91c4   android   2026-09-19T14:48:21.152Z   420            9f2c7ab41d3e    wifi      -58   866000           0        42000          25000             85000               memory  hy-udp:8443   pass-start
```

### 2.5 Quy tắc riêng tư (ép ở tầng validate, không chỉ ghi trong doc)

**Không bao giờ gửi** (server trả 400 `privacy_violation:<key>` nếu thấy):

| Nhóm | Key bị cấm |
| --- | --- |
| Danh tính mạng thô | `ssid`, `bssid`, `net_key`, `network_name`, `wifi_name`, `router_mac`, `mac` |
| Bí mật | `token`, `access_token`, `refresh_token`, `id_token`, `jwt`, `secret`, `password`, `passwd`, `passphrase`, `credential(s)`, `authorization`, `cookie`, `api_key` |
| IP thô | `ip`, `client_ip`, `public_ip`, `remote_ip`, `exit_ip`, `server_ip`, `local_ip` (chỉ nhận `*_hash`) |
| Nội dung traffic | `body`, `content`, `payload`, `traffic`, `dns_query(s)`, `url(s)`, `host(s)`, `sni`, `headers`, `user_agent` |

Nguyên tắc:

1. **Không nội dung traffic**: không URL đã truy cập, không tên miền DNS đã hỏi, không header, không body.
2. **Không SSID thô**: chỉ `net_key_hash` — hash **có salt theo `device_id`**
   (`SHA-256(device_id + "|" + netKey)`), để hash của cùng một SSID ở hai máy khác nhau khác nhau.
3. **Không token/credential**: endpoint hoàn toàn không cần token, nên client **không được** gửi kèm.
4. **Không IP thô**: chỉ `exit_ip_hash`; `node_id` là cách rẻ và hữu ích hơn để biết đi qua node nào.
5. **`device_id` xoay được**: app nên có nút "xoay định danh" trong Settings; xoay id là mất tương quan
   giữa dữ liệu cũ và mới (server không giữ bản đồ id ↔ máy).
6. **Gom lô + gửi muộn** không sao (≤ 7 ngày), nhưng không được "đào lại" dữ liệu cũ hơn.

---

## 3. Lưu trữ & xoay vòng dữ liệu

### 3.1 Bảng (SQLite, `data/client-telemetry.db`)

```sql
CREATE TABLE IF NOT EXISTS client_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schema_version INTEGER NOT NULL,
  received_at TEXT NOT NULL,          -- giờ SERVER nhận (audit)
  created_at TEXT NOT NULL,           -- giờ CLIENT đo (ISO)
  tz_offset_min INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT, model TEXT,
  net_key_hash TEXT, net_type TEXT, rssi INTEGER, link_speed_kbps INTEGER, metered INTEGER,
  node_id TEXT,
  measured_kbps INTEGER, declared_up_kbps INTEGER, declared_down_kbps INTEGER,
  effective_up_kbps INTEGER, effective_down_kbps INTEGER,
  reason TEXT, transport TEXT, ctx TEXT, policy_revision TEXT,
  rtt_ms INTEGER, loss_pct REAL, probe_bytes INTEGER, probe_ms INTEGER,
  exit_ip_hash TEXT, session_id TEXT,
  kind TEXT NOT NULL DEFAULT 'sample',
  payload_json TEXT NOT NULL          -- bản gốc client gửi (giữ field lạ)
);
CREATE INDEX IF NOT EXISTS idx_client_telemetry_platform_created ON client_telemetry (platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_telemetry_device_created   ON client_telemetry (device_id, created_at DESC);
```

### 3.2 Xoay vòng / dọn dữ liệu

Chạy **lúc khởi động** và **mỗi 500 lần ghi** (`TELEMETRY_PURGE_EVERY_INSERTS`), hai tầng:

1. **Theo thời gian**: xoá dòng có `created_at` cũ hơn `CLIENT_TELEMETRY_RETENTION_DAYS`
   (mặc định **90 ngày**).
2. **Theo số dòng**: nếu bảng vượt `CLIENT_TELEMETRY_MAX_ROWS` (mặc định **2 000 000**) thì xoá
   dòng cũ nhất cho tới khi bằng trần.

Nhờ vậy bảng không phình vô hạn kể cả khi endpoint bị spam. Muốn xoá tay:

```bash
sqlite3 /opt/flowvpn/control-plane/data/client-telemetry.db \
  "DELETE FROM client_telemetry WHERE created_at < '2026-06-01T00:00:00.000Z';"
```

### 3.3 Truy vấn mẫu cho agent/AI

Chạy bằng CLI (khuyến nghị — đã kiểm tra cú pháp):

```bash
node control-plane/scripts/bw-loop.mjs report lying   --days 7
node control-plane/scripts/bw-loop.mjs report ramp    --days 7
node control-plane/scripts/bw-loop.mjs report hours   --days 7
node control-plane/scripts/bw-loop.mjs report policy  --days 7
```

Hoặc SQL trực tiếp (`${CUTOFF}` = mốc ISO, ví dụ `2026-09-12T00:00:00.000Z`):

**a) Mạng nào bị KHAI VƯỢT nhiều nhất** (`ratio > 1` = khai quá sức mạng thật):

```sql
SELECT platform, net_type, COALESCE(substr(net_key_hash, 1, 8), '-') AS net,
       COUNT(*) AS samples,
       ROUND(AVG(measured_kbps)) AS measured,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(declared_down_kbps) * 1.0 / NULLIF(AVG(measured_kbps), 0), 2) AS ratio,
       SUM(CASE WHEN measured_kbps * 100 < declared_down_kbps * 80 THEN 1 ELSE 0 END) AS over80
FROM client_telemetry
WHERE created_at >= :cutoff AND measured_kbps > 0 AND declared_down_kbps > 0
GROUP BY platform, net_type, net
HAVING samples >= 3
ORDER BY ratio DESC LIMIT 20;
```

**b) Ramp/hạ số khai có hiệu quả không** (`utilisation` = tốc độ thật / số khai):

```sql
SELECT COALESCE(reason, '-') AS reason,
       COUNT(*) AS events,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps))) AS actual,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps)) * 1.0 / NULLIF(AVG(declared_down_kbps), 0), 2) AS utilisation,
       SUM(CASE WHEN COALESCE(effective_down_kbps, measured_kbps) * 100 >= declared_down_kbps * 95 THEN 1 ELSE 0 END) AS cham_tran
FROM client_telemetry
WHERE created_at >= :cutoff AND declared_down_kbps > 0
GROUP BY reason ORDER BY events DESC;
```

**c) Giờ nào tệ nhất** (theo **giờ địa phương** của khách, nhờ `tz_offset_min`):

```sql
SELECT strftime('%H', datetime(created_at, '+' || tz_offset_min || ' minutes')) AS gio_dia_phuong,
       COUNT(*) AS samples,
       ROUND(AVG(measured_kbps)) AS measured,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps)) * 1.0 / NULLIF(AVG(declared_down_kbps), 0), 2) AS utilisation
FROM client_telemetry
WHERE created_at >= :cutoff AND declared_down_kbps > 0
GROUP BY gio_dia_phuong ORDER BY utilisation ASC;
```

**d) So sánh TRƯỚC/SAU một lần đổi tham số** (theo `policy_revision`):

```sql
SELECT COALESCE(policy_revision, '(chưa đọc)') AS revision,
       COUNT(*) AS events, COUNT(DISTINCT device_id) AS devices,
       ROUND(AVG(declared_down_kbps)) AS declared,
       ROUND(AVG(measured_kbps)) AS measured,
       ROUND(AVG(COALESCE(effective_down_kbps, measured_kbps)) * 1.0 / NULLIF(AVG(declared_down_kbps), 0), 2) AS utilisation,
       ROUND(AVG(loss_pct), 2) AS loss_pct_tb
FROM client_telemetry
WHERE created_at >= :cutoff AND declared_down_kbps > 0
GROUP BY revision ORDER BY events DESC;
```

Ví dụ kết quả thật của (a) trên **dữ liệu mô phỏng** (`/tmp/bw-demo.db`, 61 dòng):

```
platform  net_type  net       samples  measured  declared  ratio  over80
--------  --------  --------  -------  --------  --------  -----  ------
android   wifi      cccc5555  10       5550      85000     15.32  10
android   cell      bbbb3333  15       10233     12000     1.17   3
android   wifi      aaaa1111  36       84208     90833     1.08   0
```

Đọc bảng này: mạng `cccc5555` (Wi-Fi yếu/k sạn, RSSI −79) bị khai 85 Mbps trong khi đo được
5,5 Mbps ⇒ **khai vượt 15 lần**. Việc cần làm: kiểm tra tỉ lệ trần Wi-Fi theo RSSI
(`wifi_ceiling_poor_pct`, hiện 15%) và/hoặc `min_trusted_measured_kbps` — nhưng **chỉ đổi một
tham số mỗi lần**, rồi đo lại bằng truy vấn (d) để biết có cải thiện thật.

---

## 4. `bw_policy` — tham số chính sách phát xuống client

### 4.1 Client nhận ở đâu

Khối `bw_policy` được thêm vào **đúng hai payload client đã gọi sẵn**:

| Endpoint | Ai gọi | Ghi chú |
| --- | --- | --- |
| `GET /v1/nodes` (và `/nodes`) | Android `ControlAPIClient.fetchNodes()`, các app khác | thêm field cạnh `nodes` — client cũ bỏ qua field lạ |
| `GET /v1/bootstrap` | client né chặn (danh sách host/transport) | thêm field cạnh `poll_after_seconds` |

Client Android đọc được ở `fetchNodes()` — `Json { ignoreUnknownKeys = true }` nên **bản build
hiện tại không hỏng** khi server trả thêm field.

### 4.2 Payload mặc định (thật, `revision = 7e2ffef79c2b`)

Khối này trả về khi **chưa có override nào** — tức là giá trị đang hard-code trong app:

```json
{
  "schema_version": 1,
  "revision": "7e2ffef79c2b",
  "generated_at": "2026-09-19T14:51:32.798Z",
  "overridden_keys": [],
  "ramp_up_factor": 1.25,
  "ramp_up_factor_saturated": 1.5,
  "ramp_headroom_ratio": 1.15,
  "ramp_saturated_ratio": 0.85,
  "ramp_saturated_strong_ratio": 0.9,
  "loss_backoff_factor": 0.7,
  "peak_window_s": 10,
  "ramp_min_observed_s": 10,
  "loss_backoff_min_observed_s": 5,
  "idle_before_change_s": 2,
  "busy_bytes_per_second": 2000,
  "min_trusted_measured_kbps": 5000,
  "memory_freshness_s": 2592000,
  "max_remembered_networks": 32,
  "memory_write_delta_kbps": 2000,
  "ramp_rebuild_max_attempts": 5,
  "ramp_transport_retries": 4,
  "ramp_transport_retry_delay_ms": 300,
  "ramp_rebuild_mode": "client-default",
  "declare_ratio_pct": 85,
  "jumpup_pct": 150,
  "saturated_pct": 95,
  "deadband_pct": 80,
  "explore_pct": 115,
  "damping_pct": 60,
  "floor_up_kbps": 500,
  "floor_down_kbps": 1000,
  "ceiling_max_kbps": 10000000,
  "ceiling_min_kbps": 500,
  "static_up_kbps": 30000,
  "static_down_kbps": 100000,
  "mobile_up_kbps": 8000,
  "mobile_down_kbps": 12000,
  "probe_url": "https://speed.cloudflare.com/__down?bytes=4000000",
  "probe_max_ms": 3000,
  "probe_bytes": 4000000,
  "probe_bytes_metered": 1500000,
  "probe_delay_ms": 1200,
  "probe_min_interval_ms": 180000,
  "probe_min_bytes": 200000,
  "probe_min_ms": 400,
  "probe_connect_timeout_ms": 2000,
  "wifi_rssi_good_dbm": -55,
  "wifi_rssi_fair_dbm": -67,
  "wifi_rssi_weak_dbm": -75,
  "wifi_ceiling_good_pct": 45,
  "wifi_ceiling_fair_pct": 35,
  "wifi_ceiling_weak_pct": 25,
  "wifi_ceiling_poor_pct": 15,
  "cell_ceiling_5g_kbps": 200000,
  "cell_ceiling_lte_kbps": 50000,
  "cell_ceiling_hspa_kbps": 10000,
  "cell_ceiling_default_kbps": 20000,
  "loss_min_packets_per_sample": 20,
  "loss_inbound_divisor": 8,
  "enabled": true,
  "memory_enabled": true,
  "ramp_enabled": true,
  "loss_backoff_enabled": true,
  "probe_enabled": true,
  "clamp_enabled": true,
  "telemetry_enabled": true,
  "telemetry_interval_s": 300,
  "notes": ""
}
```

Bốn field đầu là **meta**, phần còn lại là tham số:

| Meta | Ý nghĩa |
| --- | --- |
| `schema_version` | phiên bản schema khối (`1`); client lạ ⇒ bỏ qua khối, giữ hằng số cũ |
| `revision` | hash 12 hex của tham số hiệu lực — client cache theo field này và gửi lại trong `policy_revision` |
| `generated_at` | giờ server sinh payload (tiện gỡ lỗi) |
| `overridden_keys` | tham số đang khác mặc định (rỗng = không override) |

### 4.3 Bảng đầy đủ 64 tham số (mặc định = hằng số trong app)

| Tham số | Mặc định | Khoảng hợp lệ | Ý nghĩa (lấy đúng từ hằng số đang chạy trong app) |
| --- | --- | --- | --- |
| `ramp_up_factor` | `1.25` | [1, 4] | ×1,25 mỗi bậc ramp khi đỉnh vượt số khai ≥15% |
| `ramp_up_factor_saturated` | `1.5` | [1, 4] | ×1,5 khi dùng hết ≥90% số khai (bão hoà rõ) |
| `ramp_headroom_ratio` | `1.15` | [1, 4] | đỉnh trượt vượt số khai ≥15% ⇒ còn dư |
| `ramp_saturated_ratio` | `0.85` | [0, 1] | dùng hết ≥85% số khai ⇒ chạm trần |
| `ramp_saturated_strong_ratio` | `0.9` | [0, 1] | ≥90% ⇒ tăng mạnh hơn một bậc |
| `loss_backoff_factor` | `0.7` | [0.1, 1] | mất gói ⇒ hạ ×0,7 |
| `peak_window_s` | `10` | [1, 120] | cửa sổ đỉnh trượt (giây) |
| `ramp_min_observed_s` | `10` | [1, 600] | phải bão hoà liên tục ngần này mới tăng |
| `loss_backoff_min_observed_s` | `5` | [1, 600] | mất gói liên tục ngần này mới hạ |
| `idle_before_change_s` | `2` | [0, 60] | tunnel rảnh ngần này mới dựng lại transport |
| `busy_bytes_per_second` | `2000` | [0, 1000000] | dưới mức này coi là tunnel rảnh |
| `min_trusted_measured_kbps` | `5000` | [0, 1000000] | dưới mức này số đo chưa đủ tin để TĂNG |
| `memory_freshness_s` | `2592000` | [0, 31536000] | bộ nhớ theo mạng quá cũ thì bỏ (30 ngày) |
| `max_remembered_networks` | `32` | [1, 1024] | trần số mạng nhớ được |
| `memory_write_delta_kbps` | `2000` | [0, 1000000] | chỉ ghi bộ nhớ khi đỉnh đổi đủ nhiều |
| `ramp_rebuild_max_attempts` | `5` | [0, 50] | trần số lần dựng lại transport vì ramp trong 1 phiên |
| `ramp_transport_retries` | `4` | [0, 20] | số lần thử dựng lại transport |
| `ramp_transport_retry_delay_ms` | `300` | [0, 5000] | chờ giữa hai lần thử (ms) |
| `ramp_rebuild_mode` | `client-default` | `client-default` \| `on` \| `off` | cho phép dựng lại transport giữa phiên; client-default = theo nền tảng |
| `declare_ratio_pct` | `85` | [10, 100] | khai 85% số đo (chừa đầu cho tunnel/relay) |
| `jumpup_pct` | `150` | [100, 1000] | đo ≥150% số khai ⇒ nhảy lên theo số đo |
| `saturated_pct` | `95` | [10, 1000] | 95–150% ⇒ dò lên 15% |
| `deadband_pct` | `80` | [10, 1000] | 80–95% ⇒ giữ nguyên (dải chết chống dao động) |
| `explore_pct` | `115` | [100, 1000] | bước dò lên khi đường còn dư |
| `damping_pct` | `60` | [1, 100] | giảm xóc: mẫu tụt sâu chỉ kéo xuống còn 60% mốc cũ |
| `floor_up_kbps` | `500` | [0, 100000] | sàn chiều lên |
| `floor_down_kbps` | `1000` | [0, 100000] | sàn chiều xuống |
| `ceiling_max_kbps` | `10000000` | [1000, 100000000] | trần cứng của mọi số khai (chặn số rác) |
| `ceiling_min_kbps` | `500` | [0, 1000000] | dưới mức này thà về 0 để dùng CC chuẩn |
| `static_up_kbps` | `30000` | [100, 100000000] | nấc tĩnh chiều lên (unmetered) |
| `static_down_kbps` | `100000` | [100, 100000000] | nấc tĩnh chiều xuống (unmetered) |
| `mobile_up_kbps` | `8000` | [100, 100000000] | nấc tĩnh chiều lên (metered) |
| `mobile_down_kbps` | `12000` | [100, 100000000] | nấc tĩnh chiều xuống (metered) |
| `probe_url` | `https://speed.cloudflare.com/__down?bytes=4000000` | http(s) URL | URL đo goodput qua tunnel |
| `probe_max_ms` | `3000` | [100, 600000] | trần thời gian đọc dữ liệu (ms) |
| `probe_bytes` | `4000000` | [0, 1000000000] | trần byte mỗi phép đo |
| `probe_bytes_metered` | `1500000` | [0, 1000000000] | trần byte khi mạng tính phí |
| `probe_delay_ms` | `1200` | [0, 60000] | chờ trước khi đo cho tunnel kịp mở cửa sổ |
| `probe_min_interval_ms` | `180000` | [0, 86400000] | không đo lại trong khoảng này (đỡ tốn dữ liệu) |
| `probe_min_bytes` | `200000` | [0, 1000000000] | dưới mức này phép đo vô nghĩa |
| `probe_min_ms` | `400` | [1, 60000] | dưới mức này phép đo vô nghĩa |
| `probe_connect_timeout_ms` | `2000` | [100, 60000] | trần bắt tay HTTP của phép đo |
| `wifi_rssi_good_dbm` | `-55` | [-120, 0] | ngưỡng RSSI tốt |
| `wifi_rssi_fair_dbm` | `-67` | [-120, 0] | ngưỡng RSSI khá |
| `wifi_rssi_weak_dbm` | `-75` | [-120, 0] | ngưỡng RSSI yếu |
| `wifi_ceiling_good_pct` | `45` | [0, 100] | trần = linkSpeed × 45% khi RSSI tốt |
| `wifi_ceiling_fair_pct` | `35` | [0, 100] | trần = linkSpeed × 35% khi RSSI khá |
| `wifi_ceiling_weak_pct` | `25` | [0, 100] | trần = linkSpeed × 25% khi RSSI yếu |
| `wifi_ceiling_poor_pct` | `15` | [0, 100] | trần = linkSpeed × 15% khi RSSI rất yếu |
| `cell_ceiling_5g_kbps` | `200000` | [0, 100000000] | trần cho 5G NR |
| `cell_ceiling_lte_kbps` | `50000` | [0, 100000000] | trần cho LTE |
| `cell_ceiling_hspa_kbps` | `10000` | [0, 100000000] | trần cho HSPA/UMTS |
| `cell_ceiling_default_kbps` | `20000` | [0, 100000000] | trần khi không đọc được loại mạng |
| `loss_min_packets_per_sample` | `20` | [1, 1000000] | mẫu phải có ≥20 gói ra mới xét |
| `loss_inbound_divisor` | `8` | [1, 1000] | gói về ≤ 1/8 gói ra ⇒ coi như mất gói |
| `enabled` | `true` | true \| false | công tắc tổng: false ⇒ client giữ nguyên hành vi cũ đang có |
| `memory_enabled` | `true` | true \| false | dùng số đã nhớ theo mạng |
| `ramp_enabled` | `true` | true \| false | ramp giữa phiên |
| `loss_backoff_enabled` | `true` | true \| false | hạ số khai khi mất gói |
| `probe_enabled` | `true` | true \| false | đo goodput qua tunnel |
| `clamp_enabled` | `true` | true \| false | kẹp trần/sàn |
| `telemetry_enabled` | `true` | true \| false | client gửi telemetry lên /v1/client-telemetry |
| `telemetry_interval_s` | `300` | [0, 86400] | nhịp gửi mẫu telemetry (giây); 0 = chỉ gửi khi kết thúc phiên |
| `notes` | (rỗng) | chuỗi ≤ 200 ký tự | ghi chú của người/AI đặt tham số (không dùng trong logic) |

Ghi chú quan trọng:

- `enabled=false` ⇒ client nên **tắt toàn bộ cơ chế động** (về đúng nấc tĩnh cũ). Công tắc tổng để
  rút lui nhanh nếu một thay đổi gây hại.
- Các cặp tương ứng giữa hai nền tảng: Android dùng `declare_ratio_pct/jumpup_pct/…` +
  `static_*/mobile_*`; iOS dùng `ramp_*/loss_backoff_*/peak_window_s/…`. Client chỉ cần đọc phần
  mình dùng; field của nền tảng kia cứ để nguyên.
- `ramp_rebuild_mode`: `client-default` (mặc định) = giữ nguyên hành vi từng nền tảng
  (iOS bật, macOS tắt — xem `BandwidthControl.allowsTransportRebuild`), `on`/`off` để ép.

### 4.4 Cách admin sửa tham số (không cần deploy app, không cần deploy code)

**Cách 1 — CLI (khuyến nghị, có kiểm tra giá trị):**

```bash
cd /opt/flowvpn/control-plane

# xem policy hiệu lực + tham số nào đang override
node scripts/bw-loop.mjs policy show

# thử (dry-run, KHÔNG ghi): in ra diff before → after
node scripts/bw-loop.mjs policy set ramp_up_factor_saturated=1.35 loss_backoff_factor=0.6 probe_max_ms=2500

# ghi thật
node scripts/bw-loop.mjs policy set ramp_up_factor_saturated=1.35 loss_backoff_factor=0.6 probe_max_ms=2500 --apply
# key:                       before  after
# ramp_up_factor_saturated  1.5     1.35
# loss_backoff_factor       0.7     0.6
# probe_max_ms              3000    2500
# Đã ghi. revision mới: 018eeba24c85 — client lượt sau nhận qua /v1/bootstrap + /v1/nodes.

# quay về mặc định trong code
node scripts/bw-loop.mjs policy reset --apply
```

Giá trị sai bị **chặn, không ghi** (exit code 2):

```
$ node scripts/bw-loop.mjs policy set ramp_up_factor=khong-phai-so
KHÔNG ghi — cấu hình sai:
  - ramp_up_factor: not_a_number
$ node scripts/bw-loop.mjs policy set khong_ton_tai=5 --apply
KHÔNG ghi — cấu hình sai:
  - khong_ton_tai: không phải tham số hợp lệ
```

**Cách 2 — env (mức triển khai, thắng `app_config`):**

```bash
BW_POLICY_JSON='{"ramp_up_factor":1.4,"telemetry_interval_s":120}'   # cả khối
BW_POLICY_RAMP_UP_FACTOR=1.4                                          # từng tham số
```

**Thứ tự ưu tiên** (sau thắng trước): mặc định trong `bw-policy.js` → `app_config.bw_policy`
→ `BW_POLICY_JSON` → `BW_POLICY_<KEY>`. Giá trị ngoài khoảng bị **kẹp về biên**; sai kiểu/enum
thì **giữ mặc định** và ghi log một lần cho mỗi revision.

Đã kiểm chứng trên control plane đang chạy: sửa `app_config.bw_policy` khi server **không restart**
⇒ `/v1/nodes` trả ngay giá trị mới và `revision` đổi (`57b7627b5c51` → `b07924487e6d`).

### 4.5 Client nên cache thế nào

1. Đọc `bw_policy` trong lần gọi `/v1/nodes` (đã có sẵn) **hoặc** `/v1/bootstrap`; ghi
   JSON + `revision` vào SharedPreferences/UserDefaults.
2. Cache có TTL (đề xuất 6–24h, hoặc theo `poll_after_seconds` của bootstrap); payload `revision`
   khác bản đang cache ⇒ thay thế, cùng revision thì không ghi lại (đỡ ghi prefs mỗi lần mở app).
3. **Chỉ áp ở ranh giới kết nối** (`bw-policy` chốt số khai trước khi mở client hysteria). Không áp
   giữa phiên, trừ khi `ramp_rebuild_mode` cho phép và client có khả năng dựng lại transport.
4. Field thiếu/null ⇒ dùng hằng số cũ trong app (không đổi hành vi). `schema_version` lạ ⇒ bỏ qua
   cả khối.
5. Luôn **kẹp lại phía client** (`ceiling_min_kbps`/`ceiling_max_kbps`) và giữ capability riêng của
   nền tảng — không tin server mù quáng.
6. Gửi kèm `policy_revision` trong mọi sự kiện telemetry để so được trước/sau.

---

## 5. Vòng lặp tinh chỉnh đề xuất (cho agent/AI)

1. **Thu thập ≥ 3–7 ngày** dữ liệu (đủ số mẫu/mạng theo `HAVING samples >= 3`).
2. **Chẩn đoán** bằng 4 truy vấn §3.3. Ba dấu hiệu điển hình:
   - `ratio` cao (≥ 1,5) ở nhóm mạng nào đó ⇒ khai vượt sức mạng ⇒ xem lại trần vật lý
     (`wifi_ceiling_*`/`cell_ceiling_*`) hoặc nấc tĩnh (`static_*`/`mobile_*`).
   - `cham_tran` (utilisation ≥ 95%) nhiều mà `ramp` ít ⇒ số khai đang là nút cổ chai và ramp
     chưa chạy ⇒ xem `ramp_saturated_ratio`/`ramp_up_factor_saturated` và chu kỳ đo.
   - `loss_pct_tb` cao kèm `reason=loss-backoff` ⇒ hạ số khai có tác dụng; nếu không giảm mất gói
     thì `loss_backoff_factor` đang quá nhẹ.
3. **Đổi MỘT tham số một lần**, ghi `notes` (field `notes` có sẵn trong policy) để lần sau biết vì sao.
4. **Đo lại** bằng truy vấn (d) theo `policy_revision`; so `utilisation`, `loss_pct_tb`, `measured`
   của cùng nhóm mạng. Không cải thiện ⇒ `bw-loop policy reset --apply` hoặc đặt lại giá trị cũ.
5. Ghi lại kết luận vào `docs/` (hoặc `.privatevpn/status/`) kèm revision + số liệu trước/sau.

---

## 6. Việc client cần làm tiếp (Android trước)

Chưa có gì phía client được sửa trong lượt này — dưới đây là việc của bước sau.

**A. Gửi telemetry (`ControlAPIClient` + `HysteriaVpnService` + `BandwidthMemory`)**

- Thêm hàm `sendTelemetry(events)` gọi `POST /v1/client-telemetry` (không cần Authorization),
  dùng OkHttp đã có; coi 204 là thành công, **không** thử lại khi 400/413 (payload sai thì retry vô ích).
- **Gửi khi nào** (đủ để học, không tốn pin):
  1. sau mỗi phép đo `measureDownKbps()` → `kind=probe, reason=probe, probe_bytes, probe_ms, measured_kbps`;
  2. mỗi lần chốt số khai ở ranh giới kết nối (dòng `bw: net=…`) → `kind=sample` + `ctx`;
  3. mỗi lần ramp/hạ số khai giữa phiên → `kind=ramp, reason=idle-reconnect|loss-backoff`;
  4. khi tunnel xuống (hoặc mỗi `bw_policy.telemetry_interval_s`, mặc định 300s) → `kind=session`
     kèm `effective_up/down_kbps` lấy từ `hy-udp:<port> … up=… down=…`.
- **Hàng đợi offline**: file JSON ≤ 200 sự kiện trong `filesDir`, gửi theo lô ≤ 20, bỏ sự kiện cũ
  hơn 7 ngày (server từ chối), backoff khi 429 (đọc `Retry-After`).
- `device_id`: UUID ngẫu nhiên sinh lần đầu, lưu prefs; nút "xoay định danh" trong Settings.
- `net_key_hash = SHA-256(device_id + "|" + netKey)` dạng hex — **không gửi SSID thô**
  (`netKey` chính là khoá `profileOf()` đang dùng: `wifi:<ssid>`, `cell:<nhà mạng>`, …).
- `tz_offset_min = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000`.

**B. Đọc `bw_policy`**

- `NodesResponse` thêm field `bw_policy` (`@Serializable data class BwPolicyDto` với **default cho
  mọi field** để payload thiếu field vẫn decode được); hoặc đọc từ `/v1/bootstrap`.
- Lưu JSON + `revision` vào prefs; áp trong `BandwidthPolicy.decide(...)` (thay các hằng số
  `JUMPUP_PCT`, `EXPLORE_PCT`, `DECLARE_RATIO_PCT`, `FLOOR_*`, `probe_*`, trần Wi-Fi/di động).
- Giữ đúng "kẹp trần/sàn" hiện có; `telemetry_interval_s` quyết định nhịp gửi mẫu.

**C. iOS/macOS/Windows sau** — cùng hợp đồng; iOS dùng `ramp_*`/`loss_*`, macOS lưu ý
`ramp_rebuild_mode` phải theo capability nền tảng.

---

## 7. Vận hành

### 7.1 Biến môi trường

| Env | Mặc định | Việc |
| --- | --- | --- |
| `CLIENT_TELEMETRY_DB` | `<data>/client-telemetry.db` | file SQLite telemetry |
| `CLIENT_TELEMETRY` | `1` | `0` = nhận 204 nhưng không lưu (công tắc tắt) |
| `CLIENT_TELEMETRY_RETENTION_DAYS` | `90` | xoá dòng cũ hơn N ngày |
| `CLIENT_TELEMETRY_MAX_ROWS` | `2000000` | trần số dòng |
| `CLIENT_TELEMETRY_PER_IP_PER_MIN` | `60` | trần sự kiện/phút/IP |
| `CLIENT_TELEMETRY_PER_DEVICE_PER_MIN` | `30` | trần sự kiện/phút/`device_id` |
| `CLIENT_TELEMETRY_GLOBAL_PER_MIN` | `3000` | trần toàn hệ |
| `APP_CONFIG_DB` | `<data>/app-config.db` | bảng override `bw_policy` |
| `BW_POLICY_JSON` | — | JSON override cả khối policy |
| `BW_POLICY_<KEY>` | — | override từng tham số (vd `BW_POLICY_PROBE_MAX_MS`) |

### 7.2 Nơi nối vào `index.js` (vùng bảo vệ §6b AGENTS.md)

Chỉ 6 dòng thêm + 1 dòng sửa, tất cả đã ghi trong báo cáo handoff:

| Dòng | Nội dung |
| --- | --- |
| 32–33 | `import { createBwPolicyProvider } from "./bw-policy.js";` + `import { registerClientTelemetry } from "./client-telemetry.js";` |
| 231 | `const bwPolicy = createBwPolicyProvider({ read: (key) => appConfig.get(key), env: process.env });` |
| 259–265 | `registerClientTelemetry(app, { dbPath: …, env: process.env });` (**cố ý đặt trước** cổng `AUTH_TOKEN` để endpoint công khai) |
| 460 | `res.json({ nodes: …, bw_policy: bwPolicy.payload() })` (sửa 1 dòng trong `listPublicNodes`) |
| 513 | `bw_policy: bwPolicy.payload(),` trong payload `/v1/bootstrap` |

### 7.3 Kiểm thử

```bash
cd control-plane && node --test test/client-telemetry.test.js   # 30 pass / 0 fail
cd control-plane && node --test test/*.test.js                  # toàn bộ (xem ghi chú lỗi có sẵn)
```

---

## 8. Riêng tư & rủi ro còn lại

| Rủi ro | Mức | Giảm thiểu đã có / cần làm |
| --- | --- | --- |
| Hash SSID bị dò ngược (không gian SSID nhỏ, có thể thử từ điển) | **Cao nếu hash trần** | Bắt buộc salt theo `device_id`; `device_id` xoay được ⇒ mất tương quan. Nếu vẫn ngại: chỉ gửi `net_type` + `rssi` và bỏ `net_key_hash` (mất khả năng phân tích theo từng mạng). |
| Endpoint công khai bị spam làm phình DB | Trung bình | Trần byte + trần sự kiện + rate-limit 3 tầng + retention 90 ngày + trần 2 triệu dòng + công tắc `CLIENT_TELEMETRY=0`. Kẻ tấn công nhiều IP vẫn bơm được tới trần dòng ⇒ nên thêm rule rate-limit ở Cloudflare/Caddy cho path này. |
| Ghi SQLite đồng bộ (`node:sqlite`) chặn event loop của API | Thấp | Mỗi request 1 transaction, ≤ 20 dòng; WAL + `busy_timeout`. Nếu lưu lượng lớn: tách writer/queue. |
| `node:sqlite` còn experimental | Thấp | Repo đã dùng cho `app_config`; chỉ là cảnh báo khi khởi động. |
| AI/admin đặt tham số quá tay (vd `ramp_up_factor=4`) | Trung bình | Khoảng hợp lệ + kẹp biên + CLI từ chối giá trị sai + `revision` để đối chiếu + `enabled=false` để rút lui. |
| Chưa đo được "traffic thật của khách" mà chỉ đo goodput qua tunnel | Thấp (đúng thiết kế) | Đây chính là con số cần để khai Brutal; đo qua tunnel tính cả chi phí tunnel/relay. |
| Dữ liệu telemetry chưa được client gửi ⇒ chưa có gì để học | **Cao (hiện tại)** | Bước tiếp theo bắt buộc: client Android gửi telemetry + đọc `bw_policy` (§6). |
| `device_id` ổn định lâu dài ⇒ dựng được hồ sơ theo máy | Trung bình | Nút xoay id trong Settings; không lưu IP; chỉ lưu hash mạng có salt. |
