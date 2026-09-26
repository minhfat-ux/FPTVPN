# VPNFlow iOS/macOS 1.4.3 (build 20) — có gì mới

> Phát hành 23/09/2026. **BUỘC CẬP NHẬT**: app cũ hiện màn hình yêu cầu cập nhật và không dùng được
> cho tới khi cập nhật xong (`minimum_version = 1.4.3`).
> Nội dung thông báo khách: `docs/NOTICE_IOS_RELOGIN.md` · email: `scripts/send-ios-b19-announcement.py`.
> Nguồn: commit bỏ nhóm keychain, `820b9d2`+`ff08f5b` (watchdog), `7c98e53` (đăng xuất thiết bị khác),
> và các commit ramp/diagnostics của bản này.

## Vì sao bắt buộc cập nhật

Bản ≤ 1.4.2/19 khai **nhóm keychain dùng chung** (`G6XW3RN6LJ.com.privatevpn.shared`) nhưng profile
Ad Hoc chỉ cấp wildcard `G6XW3RN6LJ.*` ⇒ `SecItemAdd` trả `errSecMissingEntitlement (-34018)` ⇒ khách
**nhập mã OTP xong vẫn đứng ở màn đăng nhập**. Bản 1.4.3 bỏ hẳn nhóm đó trên iOS (extension iOS là
hysteria-only, nhận cấu hình qua `providerConfiguration`, không đọc keychain).

**Hệ quả với khách:** phải **đăng nhập lại một lần**. Không mất hội thoại, credit hay gói dịch vụ.

## Điểm chính

1. **Sửa lỗi "nhập mã xong không vào được app"** — bỏ nhóm keychain dùng chung (app + appex).
2. **Ramp băng thông tự áp trong phiên (không cần Connect lại)** — port từ Android:
   `BandwidthPolicy` 4 dải + damping, khai 85% số đo, pre-measure A8 trước khi khai (1,5 MB/2,5 s/200 KB),
   **đo lại ĐƯỜNG THẬT ngoài tunnel mỗi 60 s** để không kẹt ở số khai thấp, áp số mới bằng cách
   **retarget fd** (giữ một cầu sống, không dựng lại cầu) nên khựng ~1,5 s và đường dữ liệu không đứt.
3. **Sửa gốc lỗi "Connected nhưng mất mạng"** — đường dựng lại transport trước đây **tái dùng fd mà Go
   đã đóng** ⇒ cầu bỏ 100% gói; nay mọi lần dựng lại lấy **cặp socketpair mới/retarget an toàn**, và chỉ
   watchdog H2 được dựng lại transport.
4. **Watchdog không còn gỡ oan tunnel** — bỏ luật "bộ đếm = 0 ⇒ gỡ"; chỉ kết luận khi máy **đang tải**
   và probe hỏng liên tiếp; máy rảnh ⇒ không kết luận gì.
5. **Tự đăng xuất khỏi thiết bị khác ngay trên app** (`7c98e53`).
6. **Thẻ Diagnostics (iOS + macOS)** hiện đủ 8 dòng §2g: tải xuống/tải lên live, đo được (đường ramp),
   khai báo hiện tại, khai báo còn lên được / "đã tối đa", đường đang dùng, mức đã khoá; kèm `loss%`/`RTT`
   hiện `—` kèm nhãn (framework không cung cấp số QUIC — không hiện số bịa).

## Kênh phát hành

| Kênh | Bản | Ghi chú |
|---|---|---|
| Trang buy / cài trực tiếp (IPA ad-hoc) | 1.4.3 (20) | `FlowVPN.ipa` · 8.175.010 B · sha256 `b2432247407e6e46fee80da4d444adc4a4c0092fa22b7e851cc0df79e9282bc1` · profile Ad Hoc 8 UDID · `get-task-allow=false` |
| macOS DMG (Developer ID + notarize + staple) | 1.4.3 (20) | `VPNFlow-mac-1.4.3-20.dmg` · 23.411.699 B · sha256 `24f19eacd8189ef55f7b80daab0fef32b789d71d79f8ffb8a5b70f0563154730` · `spctl: accepted / Notarized Developer ID` |

## Việc đã kiểm trước khi phát

- **Cổng iOS**: `check-publish-version.py --platform ios --file <ipa> --version 1.4.3 --build 20` → **exit 0**
  (version/build app+appex = 1.4.3/20 · credential hysteria2 có trong app · **không còn** `keychain-access-groups`).
- **Cổng macOS**: `--platform macos --file <dmg>` → **exit 0** cả 4 mục: `stapler validate` DMG ·
  `stapler validate` app bên trong · `spctl` (`Notarized Developer ID`) · `codesign --verify --deep --strict`
  (`valid on disk`).
- **Test máy thật (iOS, iPhone 14 Pro Max)**: đăng nhập lại 1 lần → **tắt hẳn app, mở lại KHÔNG hỏi đăng nhập**
  (phiên sống) → connect có mạng, tunnel chở gói (`SYN-ACK về 10`, `packetFlow→Go 511 gói/170.650 B`).
  ⇒ lỗi keychain `-34018` đã hết thật.
- **Harness thuần logic**: `bash scripts/ios-pure-logic-tests/run.sh` → **289/289 PASS, 0 FAIL**.
- **Test macOS trên máy thật**: ramp tự áp trong phiên `apply=forced-after-wait 21 stallMs=1486
  verify=inbound-packets(≤3s) retargets=1`; cầu vẫn chở gói sau retarget
  (`packetFlow→Go 14320→16186`, `Go→packetFlow 14843→16501`); **0** lần tự gỡ tunnel; `best` không còn bị reset.
- **CHƯA chứng minh runtime**: banner đỏ khi extension macOS bị cũ (mới chứng minh cổng phát hiện `=> CU`),
  nhánh `apply=rollback`/`apply=idle-now`, và chưa chụp được `binary=1.4.1/16` của phiên cũ.
- ⚠️ **DMG macOS đang phát (1.4.0/14) KHÔNG qua nổi `codesign --verify --deep --strict`** (`com.apple.FinderInfo`
  trên binary trong framework, do dựng bằng `hdiutil makehybrid`) — bản 1.4.3 này dựng bằng `hdiutil create
  -srcfolder` + `xattr -cr` nên đã qua cổng.
