# bus-990 — iOS không connect được (build 81) → phát build 87

**Ngày:** 2026-10-19/20 (UTC+7) · **Máy:** MAC · **Kênh:** iOS ad-hoc
**Trạng thái:** ĐÃ PHÁT build 87 · chờ chủ dự án cài lại và gửi log máy thật (§7d).

## 1. Chủ dự án xác nhận

Bus #993 (win → mac): nguyên văn *"xac nhan voi Mac, ban build 81 cua iOS bi loi khong connect duoc nhe!"*
⇒ máy khách đang chạy **iOS 1.4.7 build 81**, không phải build 80 như kênh đang phát.

## 2. Nguyên nhân gốc (đã có báo cáo, khớp 100%)

`.privatevpn/reports/2026-10-20-ios-connect-quay-tit-khong-len.md`

- Commit `26c0f37` đặt `state = .connecting` **trước** chốt chống bấm đôi.
- Chốt ngay sau đó thấy `.connecting` và `return` ⇒ **mọi cú bấm Connect đầu tiên bị nuốt**,
  app kẹt `.connecting` vĩnh viễn, extension không hề được khởi động.
- Build 81–84 dính; build 85 (`37e1148`) đã sửa và đã kiểm trên iPhone thật (connect 2,06 s,
  extension ghi `build=85`, `handshake ok`, có mạng sau 5 s).
- Build 80 **không** dính lỗi này (lỗi vào cây sau build 80). Vì vậy "đang phát build 80"
  không phải nguyên nhân của ca build 81.

## 3. Vì sao phát build 87 (không phải 88)

- Build 87 = sau bản sửa connect 85, có dây N tunnel (`ec0e185`), **mặc định N = 1 (TẮT)**.
- Build 88 (`27eb6e6`) đặt `VPNManager.defaultTunnelCount = 4` — **mặc định BẬT N=4** — trong khi
  biên bản N tunnel ghi "chưa đạt". Không phát 88 khi chưa nghiệm thu N=4.
- Build 87 đã có ca thật dùng cho phần Diagnostics (`27eb6e6` nhắc "ca thật build 87").

## 4. Artifact đã phát

| Trường | Giá trị |
|---|---|
| Phiên bản | iOS **1.4.7 / build 87** (app **và** extension) |
| Nguồn | app bundle build 87 có sẵn tại `.privatevpn/tmp/ipa87`, **ký lại** (không build lại) |
| Profile | Ad Hoc mới, **13 UDID**, có `00008101-000A55C01E85001E` (máy khách) và `00008120-0004641A1AD0C01E` |
| `get-task-allow` | `False` |
| Kích thước | **8.243.806 B** |
| sha256 | `0a912cc9d59f83f5a559eb789de7670ea88192a8c8325e36d9966cb5cc8c73ea` |
| Server | `/root/flowvpn-ipa/VPNFlow-latest.ipa` |
| Backup bản cũ | `/root/flowvpn-ipa/VPNFlow-latest.bak-1.4.7-b80-resign-20261019-2319.ipa` (8.327.903 B) |
| Mốc | `ipa_build=87`, `latest_version=1.4.7`, `minimum_version=1.3.3` |
| `buildSerial` | 21, pending 0, builtAt `2026-10-19T15:19:11.270Z` |

## 5. Lệnh + kết quả thật

```bash
# Tạo IPA từ app bundle build 87 có sẵn
ditto -c -k --sequesterRsrc --keepParent .../.privatevpn/tmp/ipa87/Payload build/ios-87/src.ipa
# → 8.243.608 B, Info.plist app+appex = 1.4.7/87

# Ký lại + tạo profile Ad Hoc mới (không upload)
bash scripts/ios-resign-ipa.sh --src build/ios-87/src.ipa --no-upload
# → profile 13 UDID; IPA 8.243.806 B sha256 0a912cc9...

# Cổng IPA (dùng shim openssl cho `security cms` vì sandbox chặn keychain import)
PATH="$PWD/bin:$PATH" bash scripts/ios-verify-ipa.sh build/ios-resign/VPNFlow-resigned-20261019-231818.ipa --version 1.4.7 --build 87
# → ĐẠT: credential hysteria2, app+appex cùng 1.4.7/87, không keychain chung,
#        codesign --verify --deep --strict, profile 13 UDID, get-task-allow=False

# Upload + mốc
scp ... root@165.101.114.162:/root/flowvpn-ipa/VPNFlow-latest.ipa
# server sha256 = 0a912cc9... (khớp)
# PATCH /v1/admin/app-version {"latest_version":"1.4.7","ipa_build":"87"}
# → {"minimum_version":"1.3.3","latest_version":"1.4.7","ipa_build":"87",...}
# POST /v1/admin/ios/devices/built
# → {"ok":true,"buildSerial":21,"notified":0,"notify_pending":0}

# Tải thật từ kênh
curl -sS -H 'Cache-Control: no-cache' https://t1.meetflowai.site/v1/downloads/ios?cb=...
# → 8.243.806 B, sha256 0a912cc9..., Info.plist 1.4.7/87
# manifest.plist bundle-version=87 · /install/ios 200 · /buy 200
```

## 6. Cổng/log chưa chạy được (trung thực)

- `xcrun devicectl list devices` → iPhone/iPad đều `unavailable`; **chưa lấy được log máy thật §7d**
  cho IPA vừa phát. Đây là việc còn lại, cần chủ dự án cắm iPhone hoặc gửi `app.log`/`relay.log`.
- `xcodebuild` build mới **không chạy được trong sandbox phiên này**: SwiftPM gọi `sandbox-exec`
  ⇒ `sandbox_apply: Operation not permitted`. Vì vậy đã **ký lại artifact build 87 có sẵn**, không
  rebuild từ source. Không thay đổi code sản phẩm.
- `scripts/ios-typecheck.sh` báo 2 lỗi `#Preview` macro plugin (`PreviewsMacros.SwiftUIView`)
  ở app/macOS — lỗi môi trường Xcode/sandbox, không phải lỗi code; extension 0 lỗi.
- `ios-pure-logic-tests/run.sh` → **668/668 PASS, 0 FAIL**; `ios-lint-locks.py` → **ĐẠT**.

## 7. Việc còn lại

1. Chủ dự án cài lại từ `https://t1.meetflowai.site/install/ios` (Safari) và bấm Connect.
2. Gửi `Documents/app.log` + `relay.log` để chạy `python3 scripts/ios-log-acceptance.py`.
3. Nếu ổn: ghi dòng sổ `release/releases.jsonl` cho build 87 + tag `ios-v1.4.7-b87`.
4. **Không** phát build 88 cho tới khi nghiệm thu N=4 (hoặc đổi mặc định về 1).
