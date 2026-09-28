# KHÓA BẢN iOS — 23/09/2026

**Trạng thái: FREEZE.** Chủ dự án chốt ngày 23/09/2026: **khóa bản iOS hôm nay lại**. Từ giờ
**không sửa iOS thêm** (app, packet tunnel, `HysteriaDefaults`, entitlements, `project.yml` phần iOS)
cho tới khi có yêu cầu mới của chủ dự án. Cần sửa → xin ý kiến trước.

## 1. Mốc của bản khóa

| Hạng mục | Giá trị |
|---|---|
| Version / build | **1.4.3 / 20** (`project.yml`: `MARKETING_VERSION 1.4.3`, `CURRENT_PROJECT_VERSION 20`) |
| `HEAD` (local) | `82bd872` — fix(publish-ios): upload nguyên tử (file tạm + verify sha/size) |
| `origin/main` | `9266366` (cùng nội dung publish-ios) |
| 2 commit của Mac (**chưa** ở `origin/main`) | `6fa8b1a` (MTU 1300 + 2 DNS) · `ff08f5b` (watchdog) |
| **Ghim cây làm việc** (36 file chưa commit) | `git stash create` → commit **`906a85b29b096ffaaa8c1d85373814a2f23ec7b0`** |
| sha256 của `git diff` toàn cây | `43c71f473092bc84ba7816bb63ce38c3…` |
| **Artifact đã build + đã cài lên iPhone** | `.privatevpn/tmp/ios-test5/ipa/FlowVPN.ipa` — 8.168.205 byte · **sha256 `15ef7c2f52b84d418459d0ec…`** · md5 `77e1f1b2d575ac8b128465fbc9941419` |

> ⚠️ **`HEAD` KHÔNG phải bản khóa.** 36 file đang sửa dở (phiên làm việc song song) là phần **chưa
> commit**. Muốn tái lập đúng bản khóa: dùng đúng IPA có sha256 ở trên, hoặc khôi phục cây bằng
> `git stash apply 906a85b29b096ffaaa8c1d85373814a2f23ec7b0`.
> **Không** dùng `git add -A` (cuốn `.privatevpn/tmp/` + artifact build).

## 2. Bản khóa gồm những gì (đều đã đo trên iPhone thật)

| # | Việc | Ở đâu |
|---|---|---|
| 1 | **MTU 1500 → 1300** + resolver thứ 2 (`1.1.1.1, 8.8.8.8`) — hết "Connected nhưng không có mạng" | `iOS/PrivateVPN/Services/HysteriaDefaults.swift` · commit `6fa8b1a` |
| 2 | **Watchdog sống-còn không còn im lặng**: đồng hồ chết ở hàng đợi riêng, nhịp tim 60 s, log mọi đường thoát, tự bật lại | `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` · commit `ff08f5b` |
| 3 | **Bộ giám sát lưu lượng không gỡ tunnel oan** sau khi ramp dựng lại transport (mốc `supervisorStart` được đặt lại) | `HysteriaPacketTunnelProvider.swift` (+ `LivenessWatchdog`, `HysteriaTransport`, `HysteriaBandwidthControl`) — **trong cây, chưa commit** |
| 4 | **Relay node-1 đã sửa và đã deploy** (không thuộc app): bind loopback trong `wsrelay.js` ⇒ `relay-cf-vn1hy` hết `EINVAL`, đã chuyển **943 MB vào / 1,1 GB ra** | `84d4f93` (đã ở `origin/main`) + deploy trên node-2 |
| 5 | App/extension cùng build number **20**; credential hysteria nhúng đúng (21/12 ký tự) | IPA ở mục 1 |

## 3. Bằng chứng chất lượng

```
Đo trên iPhone thật:
  MTU 1500 : 661 KB vào / 314 KB ra trong 17 phút · observed ≈ 0 · cầu bỏ gói write=1504 errno=35 ×100
  MTU 1300 : 37,3 MB tải về (phiên 17:01) · observed 5404 kbps · bỏ 211/36037 = 0,6%
  Phiên Netflix: 16,1 MB trong 80 giây · observed đỉnh 5096 kbps

Cổng kỹ thuật:
  swiftc -parse          -> exit 0 (arm64-apple-macos14.0) · exit 0 (arm64-apple-ios17.0)
  ios-pure-logic-tests   -> 258/258 PASS, 0 FAIL
  ARCHIVE SUCCEEDED + EXPORT SUCCEEDED (1.4.3/20) · IPA có HysteriaPassword (21) + HysteriaObfs (12)
  iPhone đã cài: VPNFlow 1.4.3 build 20
```

## 4. Còn treo (đã biết, KHÔNG chặn khóa)

1. **Extension ngừng ghi log im lặng** — đo được 1 lần: `17:03:12 → 17:14:21` (11 phút, không crash,
   không jetsam, không `stopTunnel`), xảy ra khi đang ở **WiFi công ty**. Chưa tái diễn trên 4G.
   Cách bắt tiếp: cài `libimobiledevice` (`idevicesyslog`/`idevicecrashreport`) để đọc syslog iPhone
   **không cần Xcode**, hoặc cắm cáp để kéo `relay.log` đối chiếu.
2. **"Bấm Connect không được" trên WiFi công ty** — không phải lỗi app: phép đo mạng *trước khi áp
   tunnel* fail ở **cả 2 nguồn độc lập** (`meetflowai.site`, `speed.cloudflare.com`). Nghiệm thu phải
   chạy trên 4G/hotspot.
3. **macOS**: `HysteriaDefaults` dùng chung nên macOS **đã** nhận MTU 1300 + 2 resolver, nhưng **chưa
   đo lại trên Mac thật**.
4. **Android parity**: bản vá MTU 1300 + 2 resolver của Android vẫn nằm trong `git stash@{0}`.
5. **A7 cho macOS** (bước 1: 4 dải LAN) đã vào git, **bước 2/3 chưa làm**.

## 5. Việc của committer / publisher

- **Committer**: commit 36 file trong cây theo nhóm (fix tunnel iOS · docs · version bump · báo cáo),
  **kiểm `git diff --cached` trước mỗi lần commit** (cây đang được sửa song song), đừng `git add -A`;
  push kèm 2 commit của Mac (`6fa8b1a`, `ff08f5b`).
- **Publisher**: nghiệm thu theo
  `.privatevpn/memory/AGENT_HANDOFFS/2026-09-23-publisher-ios-acceptance.md` — **chỉ trên 4G/hotspot**.
- Sau khi khóa: mọi thay đổi iOS mới phải được chủ dự án mở khóa trước.

---

## 6. MỞ KHÓA (23/09/2026) — sửa số Diagnostics (A10)

Chủ dự án mở khóa với ràng buộc: *"Mở khóa sửa nhưng không được làm impact đến các feature đang ổn
định."* Phạm vi được phép: **chỉ phần hiển thị số của thẻ Diagnostics**.

### Triệu chứng khách báo (2 điểm)
1. **"Hiện lên khi connect, sau đó không có thông số"** — số hiện lúc mới kết nối rồi mất hết.
2. **"Down/up không đúng với Ookla"**.

### Nguyên nhân (truy trong code, không phải phỏng đoán)
1. `serving` được tính bằng `bytes.inbound + bytes.outbound > 0` — bộ đếm của **CẦU HIỆN TẠI**, mà
   mỗi lần dựng lại transport là **cầu mới** (`retargetTunnelFD` → `bridge = created`) nên bộ đếm về
   0 ⇒ `serving = false` ⇒ `RampStatus.display` **xoá toàn bộ số** ⇒ thẻ mất thông số dù phiên vẫn chạy.
2. Số down/up là **mẫu 1 giây đơn lẻ** (`delta/dt`), dao động rất mạnh nên không so được với phép đo
   trung bình nhiều giây của Ookla.
3. (Phát hiện thêm) dòng "Khai báo hiện tại" lấy số **kế hoạch** của `BandwidthControl`, không phải
   số **đang nằm trong transport**. Log thật lệch nhau:
   `bw: net=… declared up=1431 down=4773 … plan=up1002/down3341 apply=pending`.

### Đã sửa (chỉ 4 chỗ, TẤT CẢ đều là đường hiển thị — không đụng logic)
| # | Sửa | Ảnh hưởng |
|---|---|---|
| 1 | Thêm `hasServedThisSession` (đặt true khi cầu có byte, reset ở `prepareBandwidthSession`) và dùng làm `serving` | Chỉ cờ gating của thẻ Diagnostics |
| 2 | Cửa sổ 3 mẫu 1 s (`liveDownWindow/liveUpWindow`) cho số **hiển thị**; log vẫn in số 1 s thô | Chỉ số hiển thị |
| 3 | "Khai báo hiện tại" lấy `activeDownKbps/activeUpKbps` (số Go đang dùng) | Chỉ số hiển thị |
| 4 | Reset 2 cửa sổ + cờ khi bắt đầu phiên mới | Trạng thái nội bộ của đường hiển thị |

**Không đụng**: ramp/băng thông, watchdog sống-còn, transport, bridge, DNS, MTU, entitlements — tức
mọi thứ thuộc "feature đang ổn định".

### Bằng chứng
```
swiftc -parse  -> exit 0 (arm64-apple-macos14.0) · exit 0 (arm64-apple-ios17.0)
ios-pure-logic-tests -> 289/289 PASS, 0 FAIL
chỉ 1 chỗ gọi .diagnostics( trong toàn bộ iOS/  (đã sửa)
```
