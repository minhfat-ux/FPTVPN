# Chọn dải IP cho exit node (VN → khách Trung Quốc)

_Cập nhật: 2026-09-12. Bằng chứng lấy từ đo thật, không phải suy đoán._

## Bằng chứng đang có

| Node | IP | ASN | Từ Trung Quốc | Ghi chú |
|---|---|---|---|---|
| node1 | 103.173.155.50 | **AS135905 (VNPT)** | ✅ UDP 8443 chạy trực tiếp, TCP relay cũng chạy, ổn định nhiều phút trên wifi hotel TQ | Dùng làm chuẩn |
| node2 | **165.101.114.162** (đổi 14/09/2026, trước là 103.6.234.233) | **AS135905 (VNPT)** — dải `165.101.114.0/23` đã có trong khuyến nghị số 1 | ✅ đổi sang VNPT nên UDP từ TQ nhiều khả năng thông (cần đo lại) | Không còn dính AS152992 |

Đo bổ sung:
- Baseline hysteria node2→node1 (VN↔VN, UDP): **11.4 MB/s (~91 Mbps)**, node1 tự tải loopback 137 MB/s, Cloudflare/mirror 12–22 MB/s ⇒ **server không nghẽn**; chậm là do đường truyền TQ + transport.
- node1 chỉ có **1 vCPU** ⇒ trần thực tế quanh ~90–100 Mbps/khách ít.
- FPT Play: `https://fptplay.vn/` trả **HTTP 200** từ cả hai ASN ⇒ không chặn ở mức ASN/dải.

## Khuyến nghị thứ tự ưu tiên

1. **AS135905 — VNPT (ưu tiên số 1, đã chứng minh)**
   - Các dải đã thấy: `103.173.x`, `103.137.184.0/23`, `165.101.114.0/23`
   - Ưu điểm: UDP TQ thông ⇒ hysteria đi thẳng, tốc độ tốt; TCP relay chỉ là dự phòng
   - Nên hỏi nhà cung cấp: **block tĩnh /29 hoặc /28, dedicated, không NAT**, cho set **rDNS/PTR**
2. **AS45899 — VNPT Corp (dự phòng tốt)**
   - Cùng tập đoàn VNPT ⇒ định tuyến TQ tương tự, nhưng đây là ASN "băng rộng/dân dụng"
   - IP trông giống residential hơn ⇒ **tốt hơn cho FPT Play** (khó bị coi là datacenter), nhưng kém phù hợp để làm server theo ToS
3. **AS7552 — Viettel (cần test trước)**
   - Transit lớn, định tuyến TQ ổn, nhưng dải datacenter Viettel bị lạm dụng nhiều ⇒ **phải test UDP từ TQ trước khi mua nhiều**
4. **TRÁNH: AS152992 (Online Data / DataOnline)**
   - Đúng ASN của node2 — đã bị chặn UDP từ TQ ở mức IP
   - ⚠️ `103.6.235.1` nằm cùng /23 với **IP CŨ của node2** ⇒ nhiều khả năng dính y hệt

## Quy trình trước khi mua nhiều (bắt buộc)

1. Mua/test **1 IP trước** (rẻ nhất), dựng node bằng `tools/node-setup/provision-node.sh`
2. Từ **điện thoại dùng data TQ**: ping + TCP tới IP đó, sau đó **connect hysteria (UDP)** — đây là bài test quyết định
3. Test **FPT Play** bằng account thật (kiểm tra anti-VPN/datacenter) nếu khách cần xem FPT Play
4. Kiểm tra danh tiếng IP trước khi nhận: **AbuseIPDB + Spamhaus** (IP dính blacklist thường bị GFW chặn sớm)
5. Đạt cả 3 ⇒ mua thêm cùng /23 (nhưng vẫn test lại từng IP vì GFW chặn theo IP//24, không theo AS)

## Lưu ý

- "Cùng AS" **không đảm bảo** cùng hành vi: GFW chặn theo IP//24 dựa trên lịch sử abuse. Vì vậy luôn test IP thật.
- Lỗi do hệ điều hành Android (chặn data nền trên mạng metered) **không liên quan** tới dải IP — xem `docs/ANDROID_METERED_BACKGROUND_DATA.md`.
- Sau khi có node mới: cập nhật `nodes.json` của control-plane + `ExitNodeFallback` trong app.

## Checklist khi IP của node đổi (đã chạy thật 14/09/2026)

IP node-2 đổi `103.6.234.233` → `165.101.114.162`. Thứ tự việc phải làm, đúng thứ tự đã làm:

1. **DNS** (PA Vietnam) trỏ `meetflowai.site` + `api.meetflowai.site` sang IP mới — làm trước tiên,
   DNS cũ là site chết hoàn toàn (edge không còn ai trả lời).
2. **`WG_PUBLIC_ENDPOINT`** trong `/etc/systemd/system/flowvpn-cp.service` (node-2) — đây là endpoint
   client VPN dùng để kết nối; quên là mọi client trỏ vào IP chết. Rồi `daemon-reload && restart`.
3. **Bảng exit node**: `data/nodes.db` (`exit_nodes.endpoint` của node-2) hoặc PATCH qua admin API.
4. **Caddy node-2**: khối `http://<IP cũ> { … }` (phục vụ file tải khi SNI bị chặn) → IP mới.
5. **Caddy node-1**: `trusted_proxies static <IP cũ>` → IP mới (nếu không, IP khách bị gộp thành IP node-2).
6. **cp-proxy node-1** (`/usr/local/bin/cp-proxy.js`): `UPSTREAM_IP` → IP mới (proxy HTTPS sang node-2).
7. **Scripts**: `sync-caddy-certs.sh`, `compare-nodes-apk.sh`, `check-public-surface.py`, `sync-peers.py`,
   `upload-ios-ipa.sh` — mặc định `NODE2=…` trong repo + bản trên server.
8. **App** (Android `Config.API_FALLBACK_ADDRESSES` + iOS/Mac) — đường dự phòng khi DNS/GFW chặn;
   sửa code **và phải phát hành bản mới**, app đang cài vẫn giữ IP cũ.
9. Kiểm lại: `curl` qua `--resolve` vào IP mới (bỏ DNS), `/install/ios` + `/v1/downloads/*` +
   `/health`, và `curl https://api.meetflowai.site/v1/nodes | grep endpoint` phải ra IP mới.

⚠️ IP mới là **DHCP (`dynamic`)** — nên xin IT gán **tĩnh**; nếu còn đổi nữa thì lặp lại đúng checklist
này (mục 2 và 3 là hai chỗ dễ quên nhất, và đều ảnh hưởng trực tiếp khách VPN).
