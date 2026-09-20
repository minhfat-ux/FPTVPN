# R-006 — Kiến trúc đích & lộ trình migrate toàn bộ môi trường hiện tại để scale up

| | |
|---|---|
| **Mã nghiên cứu** | R-006 |
| **Feature** | **F-006 — Kiến trúc đích (target architecture) + lộ trình migrate hạ tầng hiện tại**, phục vụ scale-up về sau |
| **Câu hỏi nghiên cứu** | "Giờ chi phí còn thấp, chưa cần hạ tầng lớn. Nhưng cần một tài liệu để **sau này migrate toàn bộ môi trường hiện tại** sang kiến trúc đủ sức scale — cần chuẩn bị gì từ bây giờ, migrate theo thứ tự nào, tốn bao nhiêu, rollback ra sao?" |
| **Ngày khảo sát** | 20/09/2026 |
| **Người thực hiện** | Phiên nghiên cứu (Mac) |
| **Trạng thái** | Có kiến trúc đích + 3 mức migrate + runbook; chờ quyết định |
| **Liên quan** | R-005 (kiến trúc hạ tầng mỏng), R-003 (bán theo phút); code: `server/src/db.js`, `files.js`, `config.js`, `deploy/*`, `ops/*` |

> Nguyên tắc của tài liệu: **không mua gì mới hôm nay**, nhưng **cắm cờ đúng chỗ ngay hôm nay** để sang năm
> migrate là chuyển nhà, không phải đập đi xây lại.

---

## 1. Kết luận (TL;DR)

1. **Chi phí migrate gần như nằm ở 3 thứ, không phải 20 thứ**: (a) **cơ sở dữ liệu** (SQLite → Postgres),
   (b) **tệp/artifact** (đĩa cục bộ → object storage), (c) **nhiều máy** (1 node → nhiều node + tầng cân bằng).
   Mọi thứ khác (DNS, TLS, email, thanh toán, Telegram) đã ở dạng chuyển được. `[ĐÃ KIỂM]`
2. **Rào cản lớn nhất không phải hạ tầng mà là vài dòng code đặc thù SQLite**: **FTS5** (`messages_fts`),
   **`rowid`** dùng để phá thế bằng/ sắp xếp ở `chat-store.js`, `credits.js`, `credit-requests.js`, và việc
   **không có migration framework** (chỉ có `ALTER TABLE … ADD COLUMN` thủ công trong `db.js`). `[ĐÃ KIỂM]`
3. **Không có script backup/restore nào trong `ops/`** ⇒ đây là rủi ro lớn hơn cả chuyện scale: mất VPS là mất
   dữ liệu người dùng, credit, hội thoại. **Việc rẻ nhất và đáng làm nhất ngay tuần này.** `[ĐÃ KIỂM]`
4. **Tệp đang ghi thẳng ra đĩa** (`fs.writeFile(path.join(config.filesDir, …))`, `files.js` dòng 112) ⇒ cần
   đưa ra sau một **interface lưu trữ** (local | S3/R2) trước khi có máy thứ hai. `[ĐÃ KIỂM]`
5. **Kiến trúc đích 4 tầng**: Edge (Cloudflare) → App (≥2 node stateless, sticky cho WebSocket) → Data
   (Postgres managed + object storage + Redis tuỳ chọn) → Workers (hàng đợi cho việc dài: chuyển âm, MoM, email).
   `[ĐỀ XUẤT]`
6. **Chi phí từng mức (giá đã kiểm 20/09/2026):** M1 **0–5 USD/tháng** (Cloudflare + R2 free + monitoring free),
   M2 **~25–45 USD/tháng** (Postgres managed + secrets + node thứ hai), M3 **~80–150 USD/tháng** (scale ngang,
   replica, realtime tách riêng). GPU chỉ cần nếu tự host STT (**250–500 USD/tháng**) — **không khuyến nghị**. `[ĐÃ KIỂM]`
7. **Thứ tự migrate đúng là: sao lưu → tệp → DB → nhiều node → secrets/observability.** Làm ngược (scale trước,
   dữ liệu sau) là cách chắc chắn nhất để mất dữ liệu.
8. **Việc "cắm cờ" hôm nay đều 0 đồng**: tách tầng truy cập dữ liệu, thêm migration có version, cô lập FTS5/`rowid`,
   trừu tượng hoá lưu tệp, log JSON + `request id`, endpoint `/api/version`, và **script backup + diễn tập phục hồi**.

---

## 2. Kiểm kê môi trường hiện tại (inventory) `[ĐÃ KIỂM]`

| Hạng mục | Hiện tại | Nguồn |
|---|---|---|
| **Máy chủ** | node-2 (`fcnvps2`) `165.101.114.162`; **961 MB RAM**, unit fBuddy cap `MemoryMax=600M`; đĩa **~12 GB trống / 20 GB**; Node v24.19 | `docs/DEPLOY.md` §0, `deploy/fbuddy.service` |
| **Dịch vụ cùng máy** | Caddy (80/443) · `flowvpn-cp` (7778) · harness (3080) · fBuddy (7790) · site tĩnh `meetflowai.site` · `api.meetflowai.site` | `docs/DEPLOY.md`, `docs/HANDOVER.md` |
| **Reverse proxy** | Caddy, block sinh tự động: `fbuddy.meetflowai.site { encode zstd gzip; reverse_proxy 127.0.0.1:7790 }`, có backup + `caddy validate` + reload | `deploy/remote-setup.sh` bước 3 |
| **DNS/TLS** | Cloudflare zone `meetflowai.site`, bản ghi A `fbuddy` → `165.101.114.162`, **Proxied**; TLS do Caddy (Let's Encrypt) | `docs/DEPLOY.md` §2, `deploy/dns-cloudflare.sh` |
| **Chạy tiến trình** | systemd `fbuddy` (Type=simple, root, `Restart=always`), hardening: `ProtectSystem=full`, `ReadWritePaths=/var/lib/fbuddy` | `deploy/fbuddy.service` |
| **Dữ liệu** | SQLite (`node:sqlite`), **19 bảng**: users, conversations, messages, files, providers, mcp_servers, app_settings, email_tokens, user_skills, credit_ledger, credit_requests, hub_skills, hub_purchases, topup_orders, usage_log, audit_log, auth_sessions, user_state, user_memories (+ `messages_fts` FTS5) | `server/src/db.js` |
| **Schema/migration** | `CREATE TABLE IF NOT EXISTS` + danh sách `ADDED_COLUMNS` chạy `ALTER TABLE … ADD COLUMN` có kiểm tra PRAGMA; **không có migration framework** | `server/src/db.js` (~dòng 320) |
| **Tệp/artifact** | Ghi thẳng ra `config.filesDir` bằng `fs.writeFile` | `server/src/files.js` dòng 112 |
| **Bí mật** | API key provider/MCP + SePay mã hoá **AES-256-GCM** bằng `FBUDDY_SECRET`; env nằm ở `/etc/fbuddy/fbuddy.env` (mode 600) | `README.md`, `docs/DEPLOY.md` |
| **Cấu hình** | Toàn bộ qua biến môi trường (`FBUDDY_DATA_DIR`, `FBUDDY_SECRET`, `FBUDDY_PUBLIC_URL`, `FBUDDY_HOST`, …) — **tốt cho migrate** | `server/src/config.js` |
| **Triển khai** | PowerShell: build web → tarball → `scp` → giải nén `/opt/fbuddy` → `npm install` server → `remote-setup.sh` (systemd + Caddy + verify) | `deploy/deploy.ps1`, `deploy/remote-setup.sh` |
| **Vận hành** | `ops/*`: `check-deploy.sh`, `smoke.mjs`, `check-dns-records.sh`, `prune-*`, `refresh-model-pricing.mjs`… **không có script backup/restore** | `ops/` |
| **Thanh toán** | VietQR + **SePay** (webhook HMAC hoặc poll), đơn có mã, duyệt tay qua Telegram; sổ cái credit append-only | `server/src/topup.js`, `sepay.js` |
| **Email** | Resend, `no-reply@meetflowai.site` | `README.md`, `docs/RENAME-FBUDDY.md` |
| **Kênh vận hành** | Telegram (duyệt, báo cáo) + **agent-bus** giữa Mac và WIN (`https://fbuddy.meetflowai.site/agent-bus`) | `AGENTS.local.md`, `docs/AGENT-BUS.md` |
| **Máy ngoài VPS** | Mac (harness + DSH, cổng 3080), Windows (đối tác WIN, watcher) | `AGENTS.local.md`, `ops/agent-*` |

**Điểm chết duy nhất (SPOF):** node-2 chạy **cả 4 sản phẩm FlowTech**. Một lần OOM/đầy đĩa/reboot là mất tất cả.

---

## 3. Ba thứ thực sự khó migrate (và vì sao)

| # | Thứ | Vì sao khó | Dấu hiệu trong code |
|---|---|---|---|
| 1 | **Cơ sở dữ liệu** | SQLite khoá ghi toàn cục; **FTS5** là tính năng riêng của SQLite; **`rowid`** dùng để phá thế bằng và phân trang ⇒ Postgres không có `rowid` | `db.js` (`messages_fts` FTS5), `chat-store.js`, `credits.js`, `credit-requests.js` (order `rowid`) |
| 2 | **Tệp/artifact** | Ghi thẳng ra đĩa cục bộ ⇒ máy thứ hai không thấy tệp của máy thứ nhất | `files.js` dòng 112 |
| 3 | **Nhiều máy** | `auth_sessions`, rate limit, hàng đợi đều đang "trong tiến trình/một DB" ⇒ hai node sẽ lệch trạng thái | `db.js` bảng `auth_sessions`, `agent.js` giới hạn trong RAM |

Ba thứ này **không cần sửa hôm nay**, nhưng cần **cô lập** để ngày migrate chỉ đổi một chỗ.

---

## 4. Việc "cắm cờ" làm ngay — tất cả 0 đồng `[ĐỀ XUẤT]`

| # | Việc | Vì sao đáng làm ngay | Chi phí |
|---|---|---|---|
| 1 | **Script backup + diễn tập phục hồi**: `sqlite3 .backup` định kỳ → R2 (hoặc máy nhà), ghi rõ quy trình restore và **thử phục hồi 1 lần/quý** | Hiện **không có** backup nào. Mất VPS = mất sạch credit, hội thoại, người dùng | 0đ (R2 free 10 GB) |
| 2 | **Thêm migration có version** (bảng `schema_migrations` + thư mục `migrations/NNN-*.sql`) | Không có framework thì mỗi lần đổi schema là một lần liều; sang Postgres càng không thể | 0đ |
| 3 | **Cô lập FTS5 + `rowid`** vào một module (ví dụ `search.js` xuất `indexMessage()`, `searchMessages()`, `pageAfter()`), không rải khắp nơi | Postgres không có FTS5/`rowid`; khi migrate chỉ viết lại 1 file | 0đ |
| 4 | **Trừu tượng hoá lưu tệp**: một interface `storage.put/get/delete/url` với driver `local` (hiện tại) và `s3` (R2/S3) | Điều kiện tiên quyết để chạy nhiều node | 0đ (driver s3 viết sau) |
| 5 | **Log JSON + `request id`**, thêm `/api/version` trả commit hash | Không có log có cấu trúc thì không chẩn đoán được khi có 2 node | 0đ |
| 6 | **Tách việc dài ra khỏi request**: một interface `jobs.enqueue(name, payload)` chạy in-process hôm nay, thay bằng queue thật sau (chuyển âm, MoM, email) | Phiên họp 1 giờ và MoM không nên nằm trong vòng đời request HTTP | 0đ |
| 7 | **Chuẩn hoá thời gian & ID**: `nowIso()` UTC + `newId()` dạng TEXT opaque (đã đúng — **giữ nguyên**, đừng đổi sang auto-increment) | ID dạng chuỗi chuyển DB không phải sinh lại khoá | 0đ |
| 8 | **Ghi lại "hợp đồng" API** (`docs/API_CONTRACT.md` đã có) và version hoá đường dẫn khi cần | App mobile/WIN đang gọi API; đổi hạ tầng không được phá client | 0đ |

> Ghi chú: **credit_ledger append-only** và **secret AES-GCM** là hai tài sản thiết kế tốt — chuyển nhà giữ nguyên,
> không cần làm lại.

---

## 5. Kiến trúc đích

```
            ┌──────────── EDGE (Cloudflare) ────────────┐
            │ TLS · WAF · DDoS · cache tĩnh · DNS       │
            └───────────────┬───────────────────────────┘
                            │
            ┌───────────────▼───────────────────────────┐
            │ APP — ≥2 node stateless (Node/Express)    │
            │ sticky cho WebSocket/SSE · health · version│
            └───────┬───────────────┬───────────────────┘
                    │               │
     ┌──────────────▼───┐   ┌───────▼─────────┐   ┌────────────────┐
     │ DATA             │   │ CACHE/STATE     │   │ WORKERS        │
     │ Postgres managed │   │ Redis (tuỳ chọn)│   │ queue: STT,MoM │
     │ Object storage   │   │ session, rate   │   │ email, export  │
     │ (R2/S3)          │   │ limit, lock     │   │                │
     └──────────────────┘   └─────────────────┘   └────────────────┘
                    │
     ┌──────────────▼───────────────────────────────────────────┐
     │ OBSERVABILITY: log tập trung · metrics · uptime · alert    │
     └───────────────────────────────────────────────────────────┘
```

**Nguyên tắc đích:** app **không giữ trạng thái** (session/limit trong Redis hoặc DB), tệp **không nằm trên máy app**,
việc dài **không nằm trong request**, và mọi node **giống hệt nhau** (deploy bằng image/artifact, không sửa tay).

---

## 6. Lộ trình migrate — 3 mức, có trigger và chi phí

### M1 — "Sẵn sàng chuyển nhà" (0–5 USD/tháng) — làm khi rảnh, không chờ trigger

| Bước | Việc | Xong khi |
|---|---|---|
| 1.1 | Backup tự động SQLite → R2 + diễn tập restore | Phục hồi được một bản backup vào máy sạch trong <30 phút |
| 1.2 | Migration framework + `schema_migrations` | Mọi thay đổi schema đi qua file migration |
| 1.3 | Interface lưu tệp (`local` | `s3`) + driver `s3` cho R2 | Tải/ghi tệp qua R2 chạy song song được |
| 1.4 | Log JSON + request id + `/api/version` | Truy vết được một request qua log |
| 1.5 | Cloudflare WAF/rate limit cho `/api/*`; bật cache cho tài sản tĩnh | Tấn công cơ bản bị chặn ở edge |
| 1.6 | Uptime monitoring + alert Telegram (hạ tầng Telegram đã có) | Có cảnh báo khi app chết trong ≤5 phút |
| 1.7 | CI deploy (GitHub Actions) thay vì `scp` tay | Deploy = bấm/merge, có log, rollback được |

**Chi phí:** R2 free (10 GB, egress free) · Workers Paid $5 nếu cần · monitoring free tier ⇒ **0–5 USD**.

### M2 — "Chuyển DB và chạy nhiều node" (~25–45 USD/tháng)

| Bước | Việc | Xong khi |
|---|---|---|
| 2.1 | Dựng Postgres managed, viết schema tương đương (xem §7) | Import xong, đếm dòng khớp, smoke đạt trên DB mới |
| 2.2 | Chuyển toàn bộ tệp sang object storage (copy + kiểm hash) | 100% tệp đọc được từ storage mới, đĩa cũ chỉ còn read-only |
| 2.3 | Chuyển tìm kiếm: FTS5 → `tsvector`/`pg_trgm` | Tìm kiếm cũ/mới trả cùng kết quả trên bộ mẫu |
| 2.4 | Node thứ hai + cân bằng tải; sticky cho WebSocket/SSE | 2 node chạy, rút 1 node không làm rớt phiên đang mở (trừ phiên WebSocket) |
| 2.5 | Session/rate limit ra Redis (Upstash free 256 MB/500K lệnh/tháng, hoặc VPS phụ) | Đăng nhập trên node A dùng được ở node B |
| 2.6 | Secrets ra secrets manager (Infisical/Doppler free tier) khi đã >1 máy | Không còn secret trong file env trên từng máy |
| 2.7 | Queue thật cho việc dài (chuyển âm, MoM, email) | Job sống sót khi restart app |

**Chi phí tham chiếu (giá đã kiểm 20/09/2026):** Neon Free (100 CU-giờ, 0,5 GB) → Launch **$0,106/CU-giờ**, **$0,35/GB-tháng**;
Supabase Pro **$25/tháng** (500 MB free / 100 GB storage ở Pro); Fly.io shared-cpu-1x 1 GB **~$7,78/tháng**;
VPS phụ Contabo Cloud VPS 4 **€5,50/tháng**; Upstash free; Doppler free 3 người (**$8/người/tháng** thêm); Infisical có free tier.

### M3 — "Scale ngang & vận hành nghiêm túc" (~80–150 USD/tháng)

| Bước | Việc | Trigger |
|---|---|---|
| 3.1 | ≥3 node app sau LB + autoscale; image hoá (Docker) | CPU/RAM 1 node > 60% kéo dài |
| 3.2 | Read replica Postgres + connection pooling | Truy vấn đọc chiếm >70% tải DB |
| 3.3 | Tách realtime (phòng họp) sang tầng riêng: Cloudflare DO hoặc VPS riêng | > 50 phiên đồng thời |
| 3.4 | Log/metrics tập trung có retention (Grafana Cloud/Better Stack free tier → trả phí khi vượt) | Cần điều tra sự cố lịch sử |
| 3.5 | Đa vùng/HA cho DB (managed multi-AZ) | Doanh thu đủ để trả, hoặc SLA với khách |
| 3.6 | (**Chỉ khi**) GPU tự host STT | Chi phí Soniox vượt hẳn 250–500 USD/tháng và có người trực ops |

---

## 7. Runbook: SQLite → Postgres (phần khó nhất)

**Chuẩn bị (làm ở M1, không đợi):**
1. Migration có version cho **cả hai** hệ (SQLite hiện tại và Postgres tương lai).
2. Cô lập FTS5/`rowid` vào một module. Ba chỗ phải xử lý riêng: `messages_fts` (FTS5), và mọi `ORDER BY … rowid`
   (`chat-store.js`, `credits.js`, `credit-requests.js`). Ở Postgres, thứ tự ổn định thay bằng **khoá phụ**
   (ví dụ `created_at, id` nếu id tăng đơn điệu, hoặc thêm cột `seq BIGSERIAL`).
3. Ánh xạ kiểu dữ liệu: `TEXT` → `text`; `INTEGER` → `bigint`/`integer`; `REAL` → `double precision`;
   `choices_json` → `jsonb`; thời gian đang là chuỗi ISO → **giữ `text`** hoặc `timestamptz` (chọn một, ghi rõ
   vì mọi so sánh hiện dựa trên chuỗi ISO).
4. Bật **WAL** và `PRAGMA foreign_keys` cho SQLite ngay từ giờ để dữ liệu sạch khi export.

**Chuyển dữ liệu:**
```bash
# 1) Sao lưu trước khi làm bất cứ gì
sqlite3 /var/lib/fbuddy/fbuddy.db ".backup /root/backup-$(date +%F).db"

# 2) Xuất từng bảng ra NDJSON (dễ kiểm, dễ nạp lại) — chạy tại chỗ
#    (ví dụ với một bảng; lặp cho 19 bảng, trừ messages_fts sẽ dựng lại ở Postgres)

# 3) Nạp vào Postgres bằng COPY
#    \copy users FROM 'users.csv' CSV HEADER

# 4) Kiểm tra: đếm dòng + tổng credit theo user phải khớp TUYỆT ĐỐI
#    SELECT count(*) FROM users;                  -- so với SQLite
#    SELECT user_id, SUM(delta) FROM credit_ledger GROUP BY user_id;  -- phải khớp sổ cái cũ
```
**Cutover khuyến nghị cho quy mô này: "đóng băng ngắn" (5–10 phút)** — bật chế độ bảo trì, sao lưu, export/import,
đổi `DATABASE_URL`, deploy, chạy `ops/smoke.mjs`, rồi mở lại. Ở quy mô vài chục người dùng, dual-write phức tạp
hơn nhiều so với lợi ích.
**Rollback:** giữ nguyên file SQLite và bản backup; nếu smoke fail thì trả `DATABASE_URL` về SQLite và khởi động lại
(điều kiện: trong thời gian bảo trì **không** phát sinh dữ liệu mới).

---

## 8. Runbook: tệp/artifact → object storage (R2/S3)

1. Bật **driver `local` + `s3` song song**, ghi mới vào `s3`, đọc fallback `local`.
2. Copy toàn bộ tệp cũ lên R2; **đối chiếu hash + số lượng**; ghi báo cáo.
3. Đổi đọc sang `s3` là chính; giữ đĩa cũ **read-only 1 tuần**.
4. Sau 1 tuần không sự cố: xoá dần bản cũ (giữ 1 bản lạnh).
5. Kiểm tra lại các đường tải tệp có kiểm tra chủ sở hữu và endpoint artifact (đừng để URL công khai).

---

## 9. Rủi ro & điều cần quyết

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Không có backup** (hiện tại) | 🔴 cao | Việc #1 ở M1, làm ngay, không cần tiền |
| node-2 chết là chết cả 4 sản phẩm | 🔴 cao | M2 tách app ra máy riêng; giữ node-2 làm edge/DB phụ |
| FTS5/`rowid` rải trong code | 🟠 vừa | Cô lập vào 1 module (việc #3 ở §4) |
| Không có migration framework | 🟠 vừa | Thêm `schema_migrations` (việc #2) |
| Deploy bằng `scp` tay, không CI | 🟠 vừa | M1 bước 1.7 |
| Secrets trong file env trên mỗi máy | 🟡 thấp khi 1 máy, cao khi nhiều máy | M2 bước 2.6 |
| Realtime (phòng họp) gắn chặt app | 🟡 | M3 bước 3.3, hoặc dùng Cloudflare DO ngay từ M1 (R-005 §4) |

---

## 10. Chi phí theo mức (giá đã kiểm 20/09/2026) `[ĐÃ KIỂM]`

| Mức | Thành phần | USD/tháng |
|---|---|---|
| **M0** (hôm nay) | 1 VPS sẵn có, SQLite, Caddy, Cloudflare free | **0** |
| **M1** | + R2 free, monitoring free, CI free, (Workers Paid nếu cần) | **0–5** |
| **M2** | + Postgres managed (Neon Launch/Supabase Pro) + node thứ hai + secrets | **25–45** |
| **M3** | + scale ngang, replica, realtime tách riêng, log/metrics trả phí | **80–150** |
| (**không khuyến nghị**) | + GPU tự host STT | **+250–500** |

---

## 11. Việc cần làm ngay — 6 gạch đầu dòng, 0 đồng

1. **Script backup + diễn tập phục hồi** (đang thiếu hoàn toàn).
2. **Migration framework có version**.
3. **Cô lập FTS5 + `rowid`** vào một module.
4. **Interface lưu tệp** (`local` | `s3`).
5. **Log JSON + request id + `/api/version`**.
6. **Interface `jobs.enqueue()`** cho việc dài (chuyển âm, MoM, email).

Sáu việc này **không đổi hành vi người dùng**, không tốn tiền, và biến việc migrate về sau từ "đập đi xây lại"
thành "đổi cấu hình + chạy script".

---

## 12. Kết luận

1. **Đừng mua hạ tầng bây giờ.** Ở mức chi phí hiện tại, M0/M1 là đủ; cái thiếu là **kỷ luật kỹ thuật**
   (backup, migration, cô lập phụ thuộc), không phải máy chủ.
2. **Ba ổ gà migrate đã được xác định rõ**: DB (FTS5/`rowid`/schema), tệp (đĩa cục bộ), nhiều node (session/rate
   limit trong tiến trình). Cả ba đều **cô lập được ngay hôm nay với 0 đồng**.
3. **Thứ tự migrate: backup → tệp → DB → nhiều node → secrets/observability.** Không đảo thứ tự.
4. **Trigger nâng cấp phải là số đo** (RAM, số phiên đồng thời, người dùng hoạt động, doanh thu theo phút),
   không phải cảm giác — và mỗi mức đều có đường lùi rõ ràng.
