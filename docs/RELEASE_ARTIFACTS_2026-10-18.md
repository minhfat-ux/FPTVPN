# RELEASE ARTIFACTS — iOS 1.4.7 / build 66 (18/10/2026)

> Bản do **harness Mac** build (AGENTS.md §0: harness Mac phát hành iOS + macOS).
> Publisher đọc file này + `docs/handoff/HANDOFF_PUBLISHER_IOS_1.4.7_65_2026-10-18.md`.

## 1. Artifact

| Trường | Giá trị |
|---|---|
| File | `build/ios-adhoc-export/ipa/FlowVPN.ipa` |
| Size | **8.230.157 B** |
| sha256 | `374b399aee92f7819c57d89b7bd3822eb9c497180c1d9b8d5eecac0af267a577` |
| md5 | `8dc7b400b0af0eca8e56cffb3409772d` |
| version / build | **1.4.7 / 65** (đọc TỪ TRONG IPA, không suy từ tên file) |
| Ký | Ad Hoc · profile `VPNFlow AdHoc App` + `VPNFlow AdHoc Tunnel` · **10 UDID** · `get-task-allow=false` |
| Extension | có `PrivateVPNPacketTunnel.appex`, cùng số 1.4.7/66 |
| Cổng `ios-verify-ipa.sh --version 1.4.7 --build 66` | **ĐẠT 8/8** |

## 2. Đích phát hành (PUBLISHER_PROCESS §3)

| Việc | Giá trị |
|---|---|
| File trên node-2 | `/root/flowvpn-ipa/VPNFlow-latest.ipa` |
| Route | `GET /v1/downloads/ios` (verify bằng host `t1.meetflowai.site`) |
| Mốc §4 | `PATCH /v1/admin/app-version` → `latest_version=1.4.7`, `ipa_build=66` |
| KHÔNG đặt | `minimum_version` (chủ dự án chưa chốt buộc cập nhật) |

## 3. Khoá phát hành

`.privatevpn/status/release-lock.json` đã chuyển từ **ios 1.4.6/57** → **ios 1.4.7/66**
(lý do: chủ dự án chốt 18/10/2026 — "sửa xong bump lên 1.4.7 và handover cho publisher để publish bản mới").
Đã kiểm cổng:

```
--platform ios --version 1.4.7 --build 66  -> exit 0 (QUA)
--platform ios --version 1.4.6 --build 57  -> BỊ CHẶN (đúng)
```

## 4. ⚠️ VIỆC CHƯA XONG — KHÔNG ĐƯỢC QUẢNG CÁO MẤY MỤC NÀY

1. ~~CHƯA COMMIT~~ → **ĐÃ COMMIT: `31816f5`** (10 file, +496/−94). Điều kiện "commit trước,
   deploy sau" (AGENTS §6b) **đã thoả**; bản phát hành truy vết được về commit này.
2. **CHỈ iPad đã cài 1.4.7/66.** iPhone (`Minh's iphone`) **offline** giữa phiên
   (`unavailable`, `CoreDeviceError 1011`) nên **chưa cài được** lên iPhone.
3. **Chưa chạy nghiệm thu chính thức §7d trên build 66** (`ios-log-acceptance.py` + `--crash-dir`).
   Đã đọc log quan sát tay, nhưng đó **không phải** nghiệm thu theo cổng.
4. **FPT Play**: đã thấy chạy được trên iPad qua `node-1` khi mạng đạt ~5,3 Mbps. **Chưa** kiểm lại
   trên `Vietnam 3` (`103.6.235.39`) — dải `103.6.x` từng bị chặn với FPT Play (commit `15999a1`).
5. Sửa hiển thị **"Mức đã khoá (stable)"** là thay đổi **hiển thị**, chưa xác nhận bằng mắt.
6. **macOS 1.4.7/28 KHÔNG nằm trong bàn giao này** — không build, không test, không có artifact.
7. Phép đo tốc độ trong ngày bị nhiễu vì **mạng TQ tại chỗ dao động 0,6–4,7 Mbps rồi mới hồi**;
   đọc `.privatevpn/reports/2026-10-18-ios-toc-do-fpt-play-dieu-tra.md` trước khi trích số.

## 5. Code thay đổi trong bản này (cần commit trước khi publish)

| File | Thay đổi |
|---|---|
| `iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift` | Gom lô ≤32 gói/lần `flow.writePackets` ở đường về (nút thắt 52 gói/s) + nhịp đo `bridge: nhịp vào` |
| `iOS/PrivateVPNPacketTunnel/HysteriaBandwidthControl.swift` | `preMeasure` lấy tới 3 mẫu, bỏ mẫu hỏng, chọn **trung vị** |
| `iOS/PrivateVPNPacketTunnel/RelayDiagnostics.swift` | `bw: ` vào `alwaysKeywords` — mọi quyết định khai/ramp luôn được ghi |
| `iOS/PrivateVPN/ContentView.swift` | "Mức đã khoá (stable)" in kèm ngưỡng thay vì `—` trơ |
| `project.yml` | iOS 1.4.6/64 → **1.4.7/66** (macOS giữ 1.4.7/28) |
| `scripts/ios-adhoc-export.sh` | Xoá profile cục bộ trùng tên trước khi cài bản mới (chống lỗi `Multiple profiles found`) |
| `.privatevpn/status/release-lock.json` | Ghim ios **1.4.7/66** |

## 6. Cổng đã chạy trên bản này

```
ios-pure-logic-tests/run.sh   668/668 PASS, 0 FAIL
ios-lint-locks.py             ĐẠT — không có khoá lồng nhau
ios-typecheck.sh              extension 0 lỗi · app 0 lỗi · macOS 0 lỗi
archive-appstore.sh           ARCHIVE SUCCEEDED
ios-adhoc-export.sh           EXPORT SUCCEEDED
ios-verify-ipa.sh             ĐẠT 8/8 (1.4.7/66)
```
