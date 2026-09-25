# BÀN GIAO → **PUBLISHER** (kênh iOS) — loạt 1.4.5, 24/09/2026

> Người soạn: harness Mac (main agent). **Chưa phát hành gì cho loạt này.**
> Quy trình bắt buộc: `docs/PUBLISHER_PROCESS.md` §0/§1 · `docs/RELEASE_RUNBOOK.md` §3 ·
> `docs/VERSIONING.md` (artifact bất biến + ghi sổ).

## 1. Trạng thái: CHỜ ĐIỀU KIỆN — **chưa được upload**

⛔ **Chỉ phát hành sau khi chủ dự án xác nhận §2c** (test máy thật, 7 mục). Hiện §2c **CHƯA ĐẠT**:
loạt 1.4.5 vẫn đang sửa lỗi ổn định, bản mới nhất có thể thay đổi.

## 2. Artifact đề xuất phát hành (lấy bản MỚI NHẤT trong cây khi tới lượt)

| | |
|---|---|
| File | `build/ios-adhoc-export/ipa/FlowVPN.ipa` (sinh bằng `scripts/ios-adhoc-export.sh --no-upload`) |
| Bản ghi tại thời điểm bàn giao | **1.4.5 (26)** — 8.158.342 B · sha256 `140039f35247f99c4b313a86…` |
| Kiểm bên trong IPA | app + appex đều `1.4.5` / `26`; profile ad-hoc 9 UDID; không nhóm keychain dùng chung; `codesign --verify --deep --strict` OK |
| Đích | `/root/flowvpn-ipa/VPNFlow-latest.ipa` (route `GET /v1/downloads/ios`) |
| Mốc control-plane | `latest_version=1.4.5`, `ipa_build=26` — **KHÔNG** đặt `minimum_version` (giữ 1.3.3) |
| Bản đang phát hiện tại | **1.4.4 (21)** — `/root/flowvpn-ipa/VPNFlow-latest.ipa` |
| Backup trước khi ghi đè | bản 1.4.4 (21), và bản gốc an toàn `VPNFlow-latest.bak-1.4.3-b20-20260924-131447.ipa` |

## 3. Các bước (đúng runbook §3)

```bash
# 0) claim vùng release-ios
ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162 flowvpn-coord claim --owner mac --area release-ios \
    --files /root/flowvpn-ipa/ --note "publish iOS 1.4.5"
# 1) cổng chặn TRƯỚC upload (bắt buộc)
python3 scripts/check-publish-version.py --platform ios \
    --file build/ios-adhoc-export/ipa/FlowVPN.ipa --version 1.4.5 --build 26
# 2) §2c: PHẢI có file bằng chứng test máy thật (7 mục) — publish-ios.sh từ chối nếu thiếu
scripts/publish-ios.sh build/ios-adhoc-export/ipa/FlowVPN.ipa 1.4.5 26 \
    --device-test <file-bằng-chứng-§2c>
# 3) sau upload: cổng chặn hậu-upload
python3 scripts/check-publish-version.py --platform ios --mode post --version 1.4.5
# 4) ghi sổ + tag
node scripts/release-record.mjs append --platform ios --version 1.4.5 --build 26 \
    --sha256 <sha256 đo được> --size <bytes> --marker-latest 1.4.5 --marker-build 26 \
    --internal-version 1.4.5 --internal-build 26 --origin publish --status published \
    --verified-by "<model iPhone / iOS>" --evidence docs/RELEASE_ARTIFACTS_*.md
node scripts/release-record.mjs verify --platform ios
```
`publish-ios.sh` tự làm: gate pre → verify từ trong IPA → backup bản đang phát → upload **nguyên tử**
(file tạm + verify sha256 + `mv`) → PATCH mốc → verify tải thật qua `t1` → gate post.
**Không** tự gửi email cho khách: chờ chủ dự án chốt.

## 4. Bối cảnh bản này sửa gì (để viết release notes)

- **Bỏ tự-áp số khai giữa phiên** ⇒ hết 7 lần "transport vừa thay (ramp băng thông)" mỗi phiên
  (mỗi lần là một lần khách thấy đứt) — theo đúng cách Android đã làm.
- Ngưỡng watchdog: im lặng 10s→**45s + 2 strike**, ngưỡng tự GỠ tunnel 45s→**120s**.
- **Không còn "chịu thua/HOLD"**: gặp đường hỏng thì **thử lại ngầm mãi** (giãn nhịp 2→60s).
- **Phát hiện "Connected mà không có mạng"**: luật `SYN mà không có SYN-ACK` và luật
  `máy đẩy gói vào cầu mà relay KHÔNG nhận thêm frame` (ca thật 22:23→22:56: relay đóng băng >60s).
- Thẻ Diagnostics: "% còn lên" 1,15× (Android), "Mức đã khoá" theo mốc ≥8 Mbps.
- Chi tiết đầy đủ: `docs/DIAG_IOS_STABILITY_2026-09-24.md`, `docs/RELEASE_NOTES_IOS_1.4.4.md`.

## 5. Việc KHÔNG thuộc publisher (đã/đang xử lý chỗ khác)

- **Commit cây làm việc**: đã bàn giao **committer** (`.privatevpn/memory/AGENT_HANDOFFS/2026-09-23-committer-ios-batch.md`
  §CẬP NHẬT 24/09 + notify inbox `committer`). Sổ phát hành chỉ ghi được `--commit`/tag SAU khi commit.
- **§2c**: chủ dự án test trên iPhone + iPad (cả hai máy đang chạy build trong cây).
- **Email thông báo khách**: chủ dự án chốt.

## 6. GHI CHÚ QUAN TRỌNG — bản 27 đang cài trên máy test là bản **ký lại tay**

24/09/2026 khuya: `scripts/ios-adhoc-export.sh` **không chạy được** vì Mac đang bật VPN (hotel WiFi
chặn SSH; bật VPN thì `curl: (16) Error in the HTTP2 framing layer` khi gọi
`api.appstoreconnect.apple.com` — bước tạo/cập nhật profile Ad Hoc qua API).

Để test được ngay, bản 27 đã được **ký lại không cần mạng**:
`codesign` app + appex của `build/ios-adhoc-export/PrivateVPN.xcarchive` bằng **đúng chứng chỉ
Distribution** và **đúng profile Ad Hoc của bản 26** (`VPNFlow AdHoc App`, 9 UDID,
`get-task-allow=false`), `--timestamp=none`, rồi zip thành IPA.

| | |
|---|---|
| IPA ký lại (đã cài lên iPhone + iPad) | 8.168.026 B · sha256 `b8122a1f710794453431…` |
| Trong IPA | app + appex đều `1.4.5` / `27` · `codesign --verify --deep --strict` **OK** · không nhóm keychain dùng chung |
| Cách dựng lại | copy app từ archive → nhúng `embedded.mobileprovision` → ký **appex trước** rồi **app** (thứ tự này bắt buộc: nhúng profile SAU khi ký sẽ làm seal sai) |

⇒ **Khi phát hành chính thức, publisher PHẢI dựng lại bằng `scripts/ios-adhoc-export.sh --no-upload`**
khi gọi được API Apple (tắt VPN trên Mac), rồi dùng **sha256 của bản đó** để ghi sổ — **không** dùng
sha256 của bản ký lại tay ở trên. Nếu muốn phát hành đúng bản ký lại này thì phải ghi rõ nguồn gốc
trong sổ (`notes`) vì artifact không sinh ra từ quy trình chuẩn.
