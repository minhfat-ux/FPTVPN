> 🚨 **CẬP NHẬT 26/09/2026 (đọc trước mọi mục dưới):** bản macOS **1.4.6/21 ĐÃ ĐƯỢC PHÁT nhưng KHÔNG MỞ ĐƯỢC**
> (`amfid … Code=-413 "No matching profile found"` · thiếu `packet-tunnel-provider` trong profile Developer ID).
> Bản cũ `1.4.0/14` **cũng** dính. Kênh macOS **đang chặn phát**; `minimum_mac_version` đã hạ về `0.0.0`;
> đã gửi email đính chính 21/21 khách. Chi tiết + việc phải làm: `docs/PUBLISHER_PROCESS.md` §7 mục 10 ·
> `docs/MACOS_SIGN_NOTARIZE.md` §1/§2(d)/§4a. **Số kế tiếp phải > 1.4.6 (đề xuất 1.4.7/22)** và **bắt buộc
> mở thử app thật** trước khi phát. Mục §1/§2 dưới đây (1.4.6/21) chỉ còn giá trị lịch sử.

# BÀN GIAO → **PUBLISHER** (kênh macOS) — loạt 1.4.6, 26/09/2026

> Người soạn: harness Mac (main agent). Quy trình bắt buộc: `docs/PUBLISHER_PROCESS.md` §0/§1/§2b/§4
> · `docs/RELEASE_RUNBOOK.md` · `docs/VERSIONING.md` (artifact bất biến + sổ append-only).

## 0. ĐÍNH CHÍNH — GO `GO-145-final.md` (1.4.5/45) **đã bị thay**, đọc mục này trước

| Điều GO cũ ghi | Sự thật (kiểm bằng lệnh, không suy đoán) |
|---|---|
| "iOS đang 1.4.5/44" | **1.4.5/44 ĐÃ PHÁT**: `release/releases.jsonl` dòng `ios 1.4.5 build 44 status=published sha256 7eae9f1472e4…` · tag `ios-v1.4.5` · kênh trả `latest_version=1.4.5` · file đang phát **8.197.165 B** (25/09 16:17:55 GMT) |
| "phát iOS 1.4.5, `--build 45`" | **CẤM** — phát lại CÙNG số version với sha256 khác (`docs/VERSIONING.md` §3.3) · §0 luật 10 · `publish-ios.sh` cổng 1c sẽ chặn. Loạt hiện tại là **1.4.6 / build 50** (`project.yml` `MARKETING_VERSION 1.4.6`, `CURRENT_PROJECT_VERSION "50"`; IPA `build/ios-adhoc-export/ipa/FlowVPN.ipa` 8.197.184 B sha256 `73b0c145…`) |
| "macOS lên 1.4.5/45" | macOS phải là **1.4.6 / build 21** — xem §1 |

**iOS 1.4.6/50 KHÔNG thuộc handoff này:** đang do một session Mac khác phát hành —
`flowvpn-coord list` ⇒ `[mac] release-ios (còn ~89m) · files: /root/flowvpn-ipa/VPNFlow-latest.ipa,
build/ios-146-device-test-50.md · note: publish-ios-1.4.6-50`. **Không giành claim, không phát lại iOS.**

## 1. Số version chốt cho macOS

| | |
|---|---|
| Version | **1.4.6** (`MARKETING_VERSION`) |
| Build | **21** (`CURRENT_PROJECT_VERSION`) — dãy macOS đã dùng 13 (1.3.3) → 14 (1.4.0, **đang phát**) → 20 (1.4.3, ký+notarize nhưng **chưa phát**) ⇒ số kế tiếp hợp lệ là 21 |
| Artifact | `~/.vpnflow-macrelease/VPNFlow-mac-1.4.6-21.dmg` |
| Đích | `/root/flowvpn-mac/VPNFlow-mac.dmg` — route `GET /v1/downloads/mac` |
| Mốc | `latest_mac_version=1.4.6` → **sau khi** kênh đã phục vụ đúng bản: `minimum_mac_version=1.4.6` |
| Bản đang phát | **1.4.0 / build 14** — 21.458.057 B (22/09 04:56) · `minimum_version=0.0.0` |

**Chốt `minimum_*` (chủ dự án, 25/09/2026):** *"ok, force khách update nếu đã cài"* — áp cho **cả macOS**.
Đây là chốt rõ theo §4 (mặc định §4 là KHÔNG đặt `minimum_version`), nên `minimum_version=1.4.6`
(iOS, do bên kia lo) và `minimum_mac_version=1.4.6` **được phép** — nhưng **chỉ set SAU** khi
`latest_*` đã trỏ đúng bản (thứ tự §1: set mốc trước, rồi mới ép cập nhật), nếu không khách
bị chặn mà không có bản để lên.

⚠️ `project.yml` **hiện vẫn `1.4.3 / 20` cho 2 target macOS** — bump lên `1.4.6 / 21` là **bước 1, trước khi build**.
⚠️ **KHÔNG đụng 2 target iOS** (đang `1.4.6/50`, claim `release-ios` đang active — §7b cấm build khi bên khác đang sửa).

## 2. ✅ HAI ĐIỀU KIỆN ĐÃ ĐƯỢC CHỦ DỰ ÁN CHỐT (26/09/2026) — publisher **KHÔNG** bị chặn nữa

> Chủ dự án chốt trực tiếp 26/09: **(a)** cho phát dù còn bug `high` đang mở; **(b)** chọn **"đường B"**
> cho §2b#3 (phát trước, test ngay sau khi cài OTA). Bản ghi chính thức: `docs/PUBLISHER_PROCESS.md` §6
> dòng **2026-09-26 (iOS + macOS · 1.4.6)**. Mục 2.1/2.2 dưới đây giữ nguyên nội dung luật để publisher
> biết mình đi qua cổng nào — **không cần hỏi lại**, chỉ cần dẫn chiếu dòng §6 đó trong claim + nhật ký.

### 2.1 §0 luật 13 — bug mức `high` đang mở (đã được chốt cho phát)
`.privatevpn/status/bugs.json` (đọc thật, 26/09):
```
BUG-IOS-JETSAM-001  high  open  iOS giết extension giữa phiên vì chạm trần bộ nhớ per-process
BUG-IOS-ONEWAY-001  high  open  Tunnel "Connected" nhưng CHIỀU VỀ đứt một chiều
BUG-20260823-001    high  open  /v1/tokens mở không cần auth (LEGACY_MODE, phía server)
```
Loạt 1.4.6 **giảm đau có kiểm soát** (van bộ nhớ 40 MB + tự hạ tunnel SẠCH để hệ điều hành trả mạng;
watchdog tự đổi node khi node chở ≈0) — **gốc rò bộ nhớ CHƯA tìm ra**. Luật 13 viết thẳng: *"Còn bug
mức `high` chưa đóng trên bản định phát ⇒ KHÔNG publish"*. ⇒ Cần **chốt chủ dự án** (tiền lệ: 1.4.4
đã phát theo chốt "phát hành chính thức luôn"). Chốt phải ghi vào **§6 nhật ký** + claim, không nói miệng.

### 2.2 §2b #3 — xác nhận của Dev phải cho **ĐÚNG sha256** bản sắp phát
3 fix của loạt này (A7/Tencent · ngưỡng bộ nhớ macOS · failover đường) đã chứng minh **trên máy Mac thật**,
nhưng trên bản **dev-signed** (cùng cây mã nguồn), **chưa** phải DMG **Developer ID + notarize**.
Hai đường, chọn 1 và ghi rõ đã chọn đường nào:

- **(A) Đúng luật, không cần miễn trừ:** build DMG → upload **nguyên tử** lên node-2 nhưng **CHƯA PATCH mốc**
  (`latest_mac_version` vẫn 1.4.0 ⇒ chưa quảng bá) → tải qua `https://t1.meetflowai.site/v1/downloads/mac`
  → cài trên Mac → chạy 3 ca ở §6 → ghi bằng chứng **kèm sha256** → **mới** set `latest_mac_version=1.4.6`
  → cổng post → email `--all`. Cần một cửa sổ được phép dùng máy Mac của chủ dự án.
- **(B) Miễn trừ như 1.4.4:** chủ dự án chốt "phát trước, test ngay sau khi cài OTA", bằng chứng chức năng
  lấy từ bản dev-signed cùng commit. Phải ghi nguyên văn chốt vào `docs/PUBLISHER_PROCESS.md` §6.

➡️ **ĐÃ CHỌN (B)** — chủ dự án chốt 26/09/2026, đã ghi vào `docs/PUBLISHER_PROCESS.md` §6 dòng 2026-09-26.
Publisher dẫn chiếu dòng đó trong claim; **không** cần cửa sổ test trên máy chủ dự án trước khi phát.
Sau khi phát, chạy 3 ca ở §6 trên chính bản tải từ `t1` và ghi kết quả vào §6 nhật ký (kể cả khi ĐẠT).

## 3. §2b #1 — manifest ĐÃ CÓ
`docs/RELEASE_ARTIFACTS_2026-09-26.md` (main agent ghi 26/09): có bảng iOS 1.4.6/50 **đã đo lại sha256 độc lập**
(`shasum` = `73b0c145…`) và bảng macOS 1.4.6/21 với **size/sha256 để trống chờ build** (bước 2 — điền vào sau khi
`mac-sign-notarize.sh` xong, rồi mới chạy cổng 1c). Mục **"Việc chưa xong"** đã liệt kê đủ để viết email.

## 4. ĐÃ SỬA để không chặn — `scripts/mac-sign-notarize.sh`
- DMG nay dựng bằng **`hdiutil create -fs APFS`** + `xattr -cr "$DMGSTAGE"`. HFS/`makehybrid` nhét
  `com.apple.FinderInfo` vào app bên trong ⇒ `codesign --verify --deep --strict` báo
  *"resource fork, Finder information, or similar detritus not allowed"* ⇒ DMG không được phát
  (đã gặp thật 23/09 và 25/09/2026). Vẫn giữ nhánh `makehybrid` làm dự phòng **có cảnh báo**.
- Thêm **cổng sớm 6b**: mở DMG → `codesign --verify --deep --strict` app bên trong → quét
  `com.apple.FinderInfo|ResourceFork`. Không đạt ⇒ **DỪNG trước khi notarize/ký DMG** (trước đây lỗi này
  chỉ lộ ở cổng §4a **sau khi** đã tốn 2 lượt notarize — đúng ca 25/09).
- Bằng chứng chạy thật (26/09): `bash -n scripts/mac-sign-notarize.sh` → OK · smoke test
  `hdiutil create -fs APFS …` → `created: …/t.dmg` **17.077 B**, `xattr -lr` app trong DMG → **trống (sạch)**.

## 5. Lệnh — chạy SAU khi §2 xong (đúng runbook, không tắt cổng nào)

```bash
# 0) claim kênh macOS (không đụng release-ios của session kia)
flowvpn-coord claim --owner mac --area release-macos \
  --files /root/flowvpn-mac/VPNFlow-mac.dmg --note "publish macOS 1.4.6/21"

# 1) bump 2 target macOS trong project.yml: MARKETING_VERSION 1.4.6 · CURRENT_PROJECT_VERSION "21"
#    (KHÔNG đụng target iOS) rồi xcodegen generate + build Release

# 2) ký + notarize + staple app & DMG (cổng sớm 6b nằm trong script)
bash scripts/mac-sign-notarize.sh <đường-dẫn>/VPNFlow.app 1.4.6-21 --dmg

# 3) cổng §0 luật 5 — staple + spctl + codesign --deep --strict TRÊN CHÍNH FILE SẮP PHÁT
bash scripts/check-publish-version.py --platform macos \
  --file ~/.vpnflow-macrelease/VPNFlow-mac-1.4.6-21.dmg --version 1.4.6 --build 21   # exit 0

# 4) upload NGUYÊN TỬ → verify sha256/size trên server → (đường A: test máy thật TRƯỚC khi set mốc)
cp -p /root/flowvpn-mac/VPNFlow-mac.dmg /root/flowvpn-mac/VPNFlow-mac.bak-1.4.0-b14-$(date +%Y%m%d-%H%M%S).dmg
# ...đẩy .dmg.new + sha256sum + mv (như publish-ios.sh làm cho IPA)

# 5) cổng §4a TRÊN FILE ĐANG PHÁT
python3 scripts/check-publish-version.py --platform macos --mode post --version 1.4.6 --build 21

# 6) set mốc (đọc JSON trả về, KHÔNG tin exit code curl): latest_mac_version=1.4.6
# 7) verify API /v1/app-version?platform=macos + tải thật qua t1 khớp sha
# 8) email toàn bộ khách: python3 scripts/send-mac-announcement.py --all   (chạy --recipients + --test trước)
# 9) ghi docs/PUBLISHER_PROCESS.md §6 + release/releases.jsonl + release claim
```

**Bẫy đã biết (đừng lặp):** link tải phải là host `t1.meetflowai.site` (không phải `api.`) · PATCH mốc
thất bại **im lặng** (401 vẫn exit 0) ⇒ luôn đọc JSON · gặp 404 oan thì thêm `?v=<hash>` (cache Cloudflare).

## 6. Bằng chứng 3 fix (dùng cho Dev confirmation + release notes)
| Fix | Số đo thật (máy Mac của chủ dự án, cùng cây mã nguồn) |
|---|---|
| A7/Tencent Meeting đi thẳng | `china: A7 nạp 5512 dải` (5494 `cn.txt` + 18 `tencent-meeting.txt`); route `43.129.255.19` · `129.226.103.131` · `43.175.44.35` đi `en0`; tải Tencent **9.211 B/s → 5.872.018 B/s (~637×)**; IP công khai vẫn `103.173.155.50` |
| Hết "Mac tự tắt VPN" | Ngưỡng bộ nhớ tách theo nền tảng (iOS 32/45 MB · macOS **200/400 MB**); footprint leo 25,8 → **46,5 MB** trong 10 phút, `teardown_tổng` đứng ở **2** (trước: hạ tunnel ở **148 MB** và **58,8 MB** trong 25 phút) |
| Failover đường | Chặn `relay-cf-vn2hy` trên node-2 → `link down` (1→2→4→8→15 s) → `tự phục hồi (fd mới)` → `handshake ok … relay/vn1hy` sau **0,6 s** → cửa sổ 15 s có **3151 gói VỀ** → `HTTP 200 · 1.451.271 B/s`; egress đổi `165.101.114.162 → 103.173.155.50`; **khách không bấm gì** |

## 7. Việc KHÔNG thuộc publisher này
- **iOS 1.4.6/50** — session Mac khác (claim `release-ios`).
- Đẩy `docs/routes/tencent-meeting.txt` lên `https://meetflowai.site/dl/routes/` (đang 404-tolerant; file
  trong bundle là nguồn chính) — cần người có quyền server.
- `extension-identity.log` chưa có giới hạn dung lượng (ghi 1 dòng/2 s, ~8 MB) — cần cắt/vòng xoay.
