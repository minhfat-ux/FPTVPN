# HANDOFF — Cổng nghiệm thu log iOS đã siết + 3 lỗi mới (25/09/2026)

- **Từ:** harness Mac (publisher iOS/macOS) · **Cho:** session Mac đang build iOS + `committer`
- **Chủ dự án chốt:** **DỪNG publish iOS** cho tới khi 3 lỗi dưới đây đóng.
- **Trạng thái kênh lúc viết (đo lại, không lấy từ nhật ký):**
  - website iOS = **1.4.5 (44)** — `GET https://t1.meetflowai.site/v1/downloads/ios` → HTTP 200,
    **8.183.030 B** (khớp sổ); marker không đổi.
  - TestFlight: bản mới nhất trên ASC = **build 21 (1.4.3)**; build 20 `external=READY_FOR_BETA_SUBMISSION`.
    **Không có build 44/45 nào được upload** ⇒ publish đã dừng trước bước upload.
  - macOS: không đụng gì trong phiên này.
- **Đã push `origin/main`:** `b1571b0` (gate + tài liệu + luật 13 + 3 bug). Nhánh local `main` **lệch**
  `origin/main` (merge-base `75e8be5`; origin 68 commit / local 31 commit) — xem §5.

## 1. Ba lỗi mới (đã ghi `.privatevpn/status/bugs.json`)

| Bug | Mức | Bằng chứng (máy thật) |
|---|---|---|
| `BUG-IOS-JETSAM-001` — iOS giết extension vì chạm trần bộ nhớ per-process | high | `JetsamEvent-2026-09-25-190942.ips` (iPad): `PrivateVPNPacketTunnel`, `reason=per-process-limit`, `rpages=3202` ≈ 51 MB, `fds=50`, pid 3327. Phiên 19:01:51→19:08:41: nhịp tim 19:03:00 / 19:04:04 / 19:06:05 rồi **CÂM** sau lần dựng lại transport 19:06:41; log kết thúc **không có** dòng `stopTunnel`. iPhone `33987D6F-…` còn 2 ca cùng loại: `rpages=3200` (24/09 21:14:38), `rpages=3202` (21/09 20:49:44) ⇒ không phải ca đơn lẻ |
| `BUG-IOS-ONEWAY-001` — chiều VỀ đứt một chiều, app dựng lại transport trên **cùng** relay | high | Log Mac 25/09 **19:42:02→19:43:44**, relay `vn1hy`: **17 khoảng 5 s liên tiếp** máy gửi **1277 gói** mà `Go→packetFlow` **không tăng một gói nào** (đứng ở `360729 gói/125.639.055 B`); cả 3 lần dựng lại đều trên `vn1hy` (19:42:25, 19:42:58, 19:43:31); người dùng tự dừng 19:43:44. Cùng relay lúc **20:13 lại chạy tốt** ⇒ đứt một chiều là trạng thái TẠM THỜI phía relay/node ⇒ bắt buộc phải failover |
| `BUG-IOS-LOGLEAK-001` — log lộ nguyên văn `\(code)` | low | `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift:3515` viết `(\\(code))` (thừa 1 dấu `\`) ⇒ relay.log iPad 19:08:41.544 in `(\(code))` thay vì mã lỗi |

Gốc luật failover cũ (đã ghi trong bug 2): `startLivenessWatchdog` đặt mốc byte chiều về = 0 sau **mỗi**
lần dựng lại ⇒ nhịp đầu tính delta = cả đời bộ đếm (125 MB) ⇒ tưởng đường CÓ chở ⇒ xoá bộ đếm ⇒
không bao giờ đủ ngưỡng đổi node. `RelayFailoverWatch` trong working tree thay đúng chỗ này.

## 2. Cổng nghiệm thu đã siết — dùng thế nào từ giờ

```bash
xcrun devicectl device copy from --device <id> --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel --source Documents --destination <dir>
xcrun devicectl device copy from --device <id> --domain-type systemCrashLogs \
  --source . --destination <dir>/crash
python3 scripts/ios-log-acceptance.py <dir>/relay.log --crash-dir <dir>/crash   # exit 1 = KHÔNG ĐẠT
```

Thêm 4 tiêu chí (AGENTS §7d, `docs/PUBLISHER_PROCESS.md` luật 13, `docs/IOS_TUNNEL_BANDWIDTH_AND_NETWORK_CHANGE.md` §G1):

1. **Chiều về ĐÓNG BĂNG một chiều** — ≥3 khoảng `bridge:` (5 s) liên tiếp máy gửi ≥20 gói mà
   `Go→packetFlow` không tăng gói nào.
2. **Jetsam/crash của extension** — gắn vào đúng phiên chứa mốc thời gian ⇒ phiên đó KHÔNG ĐẠT.
3. **Phiên đầu file** (trước mốc `build: version=` đầu tiên) vẫn được chấm, nhãn build `?`.
4. **Nội suy chuỗi lộ ra log** (`\(tên_biến)`).

Kết quả chạy lại trên log hiện có (bằng chứng trong phiên):

| Log | Kết quả |
|---|---|
| iPad, **không** `--crash-dir` | KHÔNG ĐẠT **1/8** |
| iPad, **có** `--crash-dir` | KHÔNG ĐẠT **2/8** (Jetsam gắn đúng phiên 19:08:48) |
| iPhone, có `--crash-dir` | ĐẠT **6/6** + ghi chú 15 crash/Jetsam **ngoài** khoảng log |
| Mac (ca một chiều) | KHÔNG ĐẠT **1/3** — bắt đúng "17 khoảng" |

## 3. Việc bàn giao (theo thứ tự)

1. **Commit `RelayFailoverWatch`** (+ case harness `scripts/ios-pure-logic-tests/main.swift` ≥ 389/389 PASS)
   — hiện đang ở working tree, chưa commit.
2. **Sửa 1 ký tự** `HysteriaPacketTunnelProvider.swift:3515`: `(\\(code))` → `(\(code))`.
3. **Build lại** (bản 45 đang cài trên iPad **không** in dòng `tài nguyên:`/`footprint` nào dù phiên chạy
   244 s ⇒ nghi build 45 được tạo TRƯỚC khi thêm `startResourceTicker`) rồi chạy **phiên ≥30 phút** để có
   đường cong bộ nhớ (footprint/resident/fds) — tìm thứ phình, nghi rò fd/bộ đệm theo mỗi lần dựng lại.
4. Đo lại máy thật theo §2 và gửi kèm: `relay.log` + thư mục crash + output `--crash-dir`.

## 4. Điều kiện được publish lại (exit criteria)

- [ ] Cả 3 bug ở §1 đóng (hoặc chủ dự án chốt ngoại lệ **có ghi sổ**).
- [ ] `python3 scripts/ios-log-acceptance.py <log> --crash-dir <crash>` → **exit 0** trên bản định phát.
- [ ] Có bằng chứng **chiều về còn chở sau khi đổi đường** (`đã đổi đường: vn1hy → …`) khi cắm relay hỏng.
- [ ] Phiên ≥30 phút không sinh `JetsamEvent` mới cho `PrivateVPNPacketTunnel`.
- [ ] §2c 7 mục đầy đủ (mục 4/5 test đổi Wi-Fi ↔ 4G và ngắt VPN) + cổng version khớp website ↔ TestFlight.

## 5. Ghi chú phối hợp (cho `committer`)

- **`origin/main` thiếu `scripts/ios-log-acceptance.py` và toàn bộ mục `## 7` của `AGENTS.md`
  (7a–7d)** — bộ luật nghiệm thu/build iOS chỉ nằm ở nhánh local. `b1571b0` đã bù **script + tài liệu
  tunnel + luật 13**, **chưa** bù `AGENTS.md §7` (nhánh local đang có session khác sửa dở §7b + file
  `scripts/clean-build-cache.sh` chưa commit) ⇒ cần một commit transplant riêng khi cây đã sạch.
- `docs/PUBLISHER_PROCESS.md`: bản `origin/main` có **dòng 12 lặp 2 lần**; bản transplant đã gộp lại
  còn 1 dòng + thêm dòng 13.
- Bảng việc chung `flowvpn-coord` **không đọc được từ máy này** trong phiên này (SSH node-1/node-2
  timeout; `node scripts/coord/flowvpn-coord.mjs list` → `EACCES /var/lib/flowvpn-coord/claims`).
  Đã kiểm 2 file sửa bằng `git status` + xác nhận không thuộc vùng bảo vệ §6b.
