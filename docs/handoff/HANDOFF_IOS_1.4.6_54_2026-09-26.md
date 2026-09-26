# HANDOFF — iOS 1.4.6/54: chống "bấm Connect là fail" trên 5G (committer + publisher)

- **Ngày:** 2026-09-26 · **Người làm:** Solution Architect (DSH harness Mac)
- **Bản build:** `1.4.6` / build **54** — ARCHIVE + EXPORT **SUCCEEDED**, cổng publisher **ĐẠT**
- **Trạng thái:** cài trên **iPhone rồi**; **iPad chưa** (máy `unavailable`, khác mạng)
- **Việc tiếp:** committer commit → publisher phát hành (theo `docs/PUBLISHER_PROCESS.md`)

## 1. Vì sao có bản này (triệu chứng + nguyên nhân ĐO ĐƯỢC)

Log máy thật iPhone trên 5G (`cell|if:pdp_ip0`), build 53:

```text
03:04:30 startTunnel: bắt đầu phiên 1 (hysteria-only)
03:04:48 hysteria: dựng thất bại: ws-relay không dựng được: WS không mở được trong 6s
03:04:48 startTunnel thất bại (TUNNEL_START_FAILED)
03:05:22 ws-relay: handshake ok — connected to wss://api.meetflowai.site/relay/vn1hy   ← lần sau LẠI ĐƯỢC
```

⇒ Hỏng **chập chờn theo thời điểm**, KHÔNG phải do IPv6 (đã gỡ IPv6 ở build 53) và KHÔNG phải
relay chậm: đo trên chính mạng của khách (Mac nối hotspot iPhone), **cả 2 hostname mở 101 trong
0,50–0,73 s, 5/5 lần**.

Hai điểm yếu đúng chỗ đó:

| # | Điểm yếu | Sửa |
|---|---|---|
| 1 | `HysteriaTransport.relayOpenGrace = 6` giây — quá sát cho đường di động TQ (đo 1 lượt mất **4,2 s** chỉ riêng TCP connect) | **6 → 10 s** |
| 2 | `HysteriaDefaults.relayURLCandidates` có 2 mục nhưng **CÙNG một hostname** (`api.meetflowai.site`) ⇒ "thử relay kế tiếp" **chỉ đổi node, không đổi cửa vào** | Thêm **cửa vào thứ hai `t1.meetflowai.site`** (2 mục mới) |
| 3 | Ngân sách cả phiên `startTimeout = 20 s` không đủ chỗ thử danh sách dài hơn | **20 → 35 s** |

## 2. File đã sửa

| File | Ai sửa | Nội dung |
|---|---|---|
| `iOS/PrivateVPN/Services/HysteriaDefaults.swift` | **SA (phiên này)** | `relayURLCandidates` +2 cửa `t1.meetflowai.site`; sửa comment `tunIPv6CIDR`/`relayIPv6ExcludedCIDRs` |
| `iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift` | **SA** | `relayOpenGrace` 6 → 10 (kèm lý do) |
| `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | **SA** | `startTimeout` 20 → 35; **gỡ `ipv6Settings`** (lần 2) + ghi rõ vì sao KHÔNG thử lại cách đó |
| `scripts/ios-typecheck.sh` | **SA (mới)** | Cổng `-typecheck` theo AGENTS §7b (trước đây bắt buộc mà repo không có dụng cụ) |
| `scripts/check-relay-ipv6-exclusion.py` | **SA (mới)** | Kiểm bất biến chống rò IPv6 bằng DNS sống |
| `scripts/ios-pure-logic-tests/main.swift` + `run.sh` | **SA** | +6 test IPv6; nạp thêm `HysteriaDefaults.swift` |
| `iOS/PrivateVPN/VPNManager.swift`, `PrivateVPNApp.swift` | **SA (phiên trước)** | On-demand reconnect + `shutdownForTermination()` |
| `iOS/PrivateVPNPacketTunnel/RampStatus.swift`, `WSRelayClient.swift`, `RelayDiagnostics.swift`, `RelayUDPListener.swift` | **phiên dev** (đã có trong cây) | Trần cứng hàng đợi + `autoreleasepool` (BUG-IOS-JETSAM-001) — **KHÔNG phải của phiên này, đừng gán nhầm công** |
| `project.yml` | **SA** | build 53 → **54** (2 target iOS; macOS giữ 20) |

⚠️ **Cây đang trộn việc của 2 phiên.** Committer **phải tách đúng pathspec**, KHÔNG `git add -A`
(bài học commit `6b6272a` kéo nhầm file staged của phiên khác — xem `CURRENT_WORK.md`).

## 3. Đã thay đổi PRODUCTION (server) — committer KHÔNG cần làm gì

`/etc/caddy/Caddyfile` trên **node-2** (`165.101.114.162`): thêm 4 handle `/relay/*` vào site block
`meetflowai.site, t1.meetflowai.site, home.meetflowai.site`. Đã:
backup `Caddyfile.bak-relay-t1-20260926-021507` → `caddy validate` = **Valid configuration** →
`systemctl reload caddy` OK.
Kiểm chứng từ Trung Quốc: **cả 8 đường** (`api` + `t1` × `vn1hy/vn2hy/vn1wg/vn2wg`) đều **101**.

⇒ Rollback nếu cần: khôi phục file backup + reload.

## 4. BẰNG CHỨNG CỔNG (dán nguyên văn, không tóm tắt suông)

```text
$ bash scripts/ios-typecheck.sh
✅ extension: 0 lỗi
✅ app (shim WireGuardKit): 0 lỗi

$ bash scripts/ios-pure-logic-tests/run.sh
KẾT QUẢ: 505/505 PASS, 0 FAIL

$ python3 scripts/ios-lint-locks.py
KẾT LUẬN: ĐẠT — không có lời gọi lấy khoá lồng nhau

$ python3 scripts/check-relay-ipv6-exclusion.py
KẾT LUẬN: ĐẠT — mọi AAAA của relay đều bị loại trừ và phủ hết dải Cloudflare công bố.

$ bash scripts/archive-appstore.sh ios adhoc      (eval env credential trước)
** ARCHIVE SUCCEEDED **
** EXPORT SUCCEEDED **

$ bash scripts/ios-verify-ipa.sh build/ios-adhoc-export/ipa/FlowVPN.ipa --version 1.4.6 --build 54
   version trong file: 1.4.6/54
  [ ĐẠT ] Credential hysteria2 có trong Info.plist của app (21 + 12 ký tự)
  [ ĐẠT ] Extension cùng số (1.4.6/54)
  [ ĐẠT ] Khớp --version 1.4.6
  [ ĐẠT ] Khớp --build 54
  [ ĐẠT ] Không có nhóm keychain dùng chung
  [ ĐẠT ] codesign --verify --deep --strict
  [ ĐẠT ] profile Ad Hoc: 10 UDID
  [ ĐẠT ] get-task-allow = False (phải False)
✅ ĐẠT — được phép cài/phát hành.
```

## 5. VIỆC CỦA COMMITTER

```bash
# 1) Kiểm bảng việc trước khi commit (AGENTS §6)
flowvpn-coord list

# 2) Commit theo ĐÚNG pathspec (KHÔNG git add -A)
git add iOS/PrivateVPN/Services/HysteriaDefaults.swift \
        iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift \
        iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift \
        iOS/PrivateVPN/VPNManager.swift iOS/PrivateVPN/PrivateVPNApp.swift \
        project.yml \
        scripts/ios-typecheck.sh scripts/check-relay-ipv6-exclusion.py \
        scripts/ios-pure-logic-tests/main.swift scripts/ios-pure-logic-tests/run.sh
git commit -m "fix(ios): chong 'bam Connect la fail' tren 5G — noi relayOpenGrace 6->10s, them cua vao thu 2 (t1), ngan sach phien 20->35s; go ipv6Settings (lan 2, xem ly do); +cong typecheck va check ro IPv6" -- <danh sach file tren>

# 3) Docs/handoff (nhánh riêng nếu muốn)
git add docs/handoff/HANDOFF_IOS_1.4.6_54_2026-09-26.md .privatevpn/reports/2026-09-26-*.md
```

**Lưu ý:** các file `RampStatus/WSRelayClient/RelayDiagnostics/RelayUDPListener` là việc của phiên dev —
chỉ commit nếu chính phiên đó xác nhận; đừng gộp vào commit này.

## 6. VIỆC CỦA PUBLISHER (làm NGAY, đừng để bị trả lại)

Bản IPA đã build sẵn và **đã qua cổng**: `build/ios-adhoc-export/ipa/FlowVPN.ipa` (1.4.6/54).

```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN
eval "$(bash scripts/dev-hysteria-build-env.sh)"          # BẮT BUỘC (§7a)
bash scripts/ios-verify-ipa.sh build/ios-adhoc-export/ipa/FlowVPN.ipa --version 1.4.6 --build 54
# PHẢI thấy "✅ ĐẠT — được phép cài/phát hành" rồi mới đi tiếp
bash scripts/ios-adhoc-export.sh --no-upload              # hoặc đường phát hành trong PUBLISHER_PROCESS
```

**Cổng publisher hay trả lại vì (đã từng dính):**
- Credential rỗng ⇒ `ios-verify-ipa.sh` báo ĐẠT giả? **KHÔNG** — cổng này chặn credential rỗng;
  nhưng nếu build lại mà QUÊN `eval dev-hysteria-build-env.sh` thì IPA rỗng và cổng sẽ **chặn**.
- Sai số version/build ⇒ truyền `--version 1.4.6 --build 54` cho khớp file.
- `get-task-allow` phải **False** (ad-hoc). Ký `development` sẽ ra True ⇒ bị trả lại.
- Profile phải là **ad-hoc** và có UDID khách. Profile hiện có **10 UDID**.

## 7. CÒN LẠI / RỦI RO (nói thẳng)

1. **iPad chưa cài được** (máy `unavailable` vì khác mạng). Cần đưa iPad về cùng mạng rồi:
   `xcrun devicectl device install app --device 5BA3126D-4776-5F75-8B10-0A60559ED1CC build/ios-adhoc-export/ipa/FlowVPN.ipa`
2. **Chưa nghiệm thu máy thật** cho bản 54: cần một lượt **5G thật** (tắt Wi-Fi) và xác nhận
   không còn `WS không mở được trong 6s`. Đây là **điều kiện chưa xong**.
3. **Rò IPv6 VẪN CÒN** (bản 54 chủ ý IPv4-only = đúng code Android). Bản sửa đúng là **P2** trong
   `.privatevpn/reports/2026-09-26-ios-ipv6-solution-android-parity.md` §4 — **chưa làm, chờ chủ dự án duyệt**.
4. **`scripts/ios-resign-ipa.sh` có lỗi chọn cert** (lấy cert Distribution đầu tiên từ API, nhưng
   keychain chỉ có khoá riêng của `KCX28GM58P`) ⇒ cài máy báo `0xe8008015`. Chi tiết + cách tránh:
   `.privatevpn/reports/2026-09-26-ios-provisioning-fix.md`.
5. **App ID đã được bật capability** (`ACCESS_WIFI_INFORMATION`, `NETWORK_EXTENSIONS`,
   `ASSOCIATED_DOMAINS`) qua ASC API — thay đổi **vĩnh viễn** trên tài khoản Apple của chủ dự án.

---

## 8. NGHIỆM THU MÁY THẬT — **ĐẠT** (bổ sung 26/09/2026, sau khi chủ dự án test)

Chủ dấu án xác nhận **Đạt** sau khi test trên iPhone. Bằng chứng từ log máy thật (lọc RIÊNG phần
build 54 — log tích luỹ nhiều phiên cũ nên **phải lọc**, nếu không sẽ đếm nhầm lỗi của build ≤53):

| Chỉ số (chỉ phần build 54) | iPhone | iPad |
|---|---|---|
| `startTunnel` | 2 | 1 |
| **`TUNNEL_START_FAILED`** | **0** | **0** |
| `XÁC NHẬN tunnel có mạng thật` | 2 | 1 |
| `WS không mở được trong 6s/10s` | **0** | **0** |

Phiên **trên CELL (5G)** đã lên được:

```text
03:33:22 startTunnel: bắt đầu phiên 1 (hysteria-only)
03:33:24 ws-relay: handshake ok — connected to wss://api.meetflowai.site/relay/vn2hy
03:33:29 giám sát: XÁC NHẬN tunnel có mạng thật sau 5.0s — TCP handshake hoàn tất 4 lần (gói vào 51, ra 53)
03:33:33 bw: đổi mạng ⇒ dựng lại transport — lý do: net cell|if:pdp_ip0 -> wifi|ssid:ICONLABHOTEL
```
(`cell|if:pdp_ip0` xuất hiện ở mốc đổi mạng ⇒ phiên TRƯỚC ĐÓ chạy trên 5G.)

Sức khoẻ trong phiên (không hồi quy):

```text
tài nguyên: footprint=13.9MB resident=37.8MB | relay gửi 254 nhận 313 mở=yes
hàng đợi: relay chờ 0 gói/0 B (trần 512/524288; đã nạp 254, chờ 0, bỏ 0)
tự phục hồi: ĐÃ dựng lại transport (lần 1) — tunnel giữ nguyên
```

### ⚠️ Điều nghiệm thu này **CHƯA** chứng minh (nói thẳng, đừng đọc quá)

1. **Nhánh dự phòng sang `t1.meetflowai.site` CHƯA từng chạy** trên client: cả 5 lần kết nối trong
   build 54 đều vào được cửa chính `api.meetflowai.site`, nên code chưa hề rẽ sang cửa hai.
   Phía **server đã kiểm chứng** (`t1` trả 101 cho cả 4 đường, đo từ Trung Quốc) — nhưng
   **đường client→t1 chưa có bằng chứng máy thật**.
2. Mẫu còn nhỏ (2 + 1 lần start). Ca hỏng trước đây là **chập chờn**, nên chưa đủ để nói "hết 100%".
3. **Rò IPv6 vẫn còn** (bản 54 cố ý IPv4-only) — xem §7.3.

---

## 9. P2 — BỊT RÒ IPv6 (bản 55, chủ dự án duyệt 26/09/2026)

Bản 54 **đúng code Android** (IPv4-only) nhưng còn **rò IPv6** trên mạng có IPv6. P2 bịt rò theo
đúng **hành vi** Android, không lặp lại 2 lần hỏng trước.

### 9.1 Vì sao 2 lần trước hỏng, và mảnh còn thiếu

| Lần | Cách làm | Kết quả |
|---|---|---|
| 1 (22/09) | `::/0` **không** loại trừ relay | "mất mạng khi connect" (relay có AAAA bị hút vào tunnel) |
| 2 (26/09) | `::/0` **có** loại trừ đúng dải relay | Vẫn hỏng: gói IPv6 vào tunnel rồi cầu ghi vào fd của Go, Go trả `errno=2` ⇒ **gói biến mất IM LẶNG** ⇒ app treo (iPad "siêu chậm, không xem nổi Netflix") |

⇒ Loại trừ đúng là điều kiện **CẦN, không ĐỦ**. Thiếu mảnh: **phải TRẢ LỖI cho app**.
Android không dính cả 2 vì nền tảng nó **chặn theo family mặc định** (app nhận lỗi NGAY) — iOS không có.

### 9.2 Đã làm

| File | Thay đổi |
|---|---|
| `iOS/PrivateVPNPacketTunnel/IPv6Reject.swift` | **MỚI** — logic THUẦN dựng `ICMPv6 Destination Unreachable (type 1, code 0)` + checksum theo RFC 4443 (pseudo-header). Không trả lời cho chính ICMPv6 (sai RFC, dễ thành vòng) |
| `HysteriaTransport.swift` | `TunnelBridge.forwardToGo`: gói IPv6 **KHÔNG** đưa cho Go nữa — gọi `rejectIPv6` ⇒ gửi ICMPv6 unreachable về `packetFlow` ⇒ app lùi IPv4 **tức thì**. Thêm bộ đếm `toGoIPv6Blocked` + log `bridge: IPv6 BỊ CHẶN #N` |
| `HysteriaPacketTunnelProvider.swift` | Bật lại `ipv6Settings`: `::/0` + loại trừ dải Cloudflare (relay) + `cn6.txt` (TQ) + link-local |
| `project.yml` | Thêm `IPv6Reject.swift` vào **2** target extension (iOS + macOS); build 54 → **55** |
| `scripts/ios-typecheck.sh`, `ios-pure-logic-tests/{run.sh,main.swift}` | Nạp file mới; **+12 test** (gồm **tự kiểm checksum**) |

### 9.3 Bằng chứng cổng

```text
bash scripts/ios-typecheck.sh        -> extension 0 lỗi · app 0 lỗi
bash scripts/ios-pure-logic-tests    -> 517/517 PASS, 0 FAIL   (trước P2: 505)
python3 scripts/ios-lint-locks.py    -> ĐẠT
bash scripts/ios-verify-ipa.sh ... --version 1.4.6 --build 55
                                     -> ✅ ĐẠT — được phép cài/phát hành (8/8 mục)
devicectl install                    -> "App installed" trên CẢ iPhone và iPad
```

### 9.4 Tiêu chí nghiệm thu P2 (máy thật, mạng CÓ IPv6)

1. **Hết rò**: trên 5G, `curl -6 ifconfig.co` **KHÔNG** trả IP nhà mạng (trả IP exit node hoặc lỗi).
2. **Không treo (quan trọng nhất)**: duyệt web + **Netflix ≥10 phút** bình thường; `bw: sample observed`
   **tăng** khi tải.
3. **Log phải chứng minh**: có dòng `bridge: IPv6 BỊ CHẶN #1, #2, …` (bộ đếm TĂNG) và **KHÔNG** còn
   `packetFlow→Go (AF=30 … errno=2)`.
4. `ios-log-acceptance.py <relay.log> --crash-dir <crash>` exit 0.

### 9.5 Rủi ro còn lại của P2

- Nếu một dịch vụ **chỉ có IPv6** (IPv6-only) thì nó sẽ **không dùng được** qua VPN — nhưng đó là
  đánh đổi có ý thức (giống Android), và **không rò** nữa.
- Nhánh dự phòng relay `t1.meetflowai.site` **vẫn chưa được chạy thật** trên client (§8).
