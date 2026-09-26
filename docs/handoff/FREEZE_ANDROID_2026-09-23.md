# KHÓA BẢN ANDROID — 23/09/2026 (bàn giao publisher)

**Trạng thái: FREEZE.** Chủ dự án chốt: *"tạm khóa bản Android lại, nếu cần publish bản latest thì cho
publisher làm"*. Từ giờ **không sửa Android thêm** cho tới khi có yêu cầu mới của chủ dự án.

- **Commit khóa:** `eeae7ef` — `fix(android): v32 — phep do mang truoc khi khai khong con bi ngan sach 2,5s an het`
- **versionCode / versionName:** `32` / `1.4.3` (bản dev có hậu tố `-dev`, applicationId `com.privatevpn.app.dev`)
- Cây làm việc **sạch**, mọi commit **đã push** `origin/main`.

## 1. Bản khóa gồm những gì (v29 → v32, đều đã commit + push)

| Commit | Nội dung | Vì sao |
|---|---|---|
| `86944de` | **v29** — số đo tốc độ dùng nguồn byte phủ **mọi transport** (`TrafficStats` theo UID; `/proc/net/dev` bị SELinux chặn) | Diagnostics báo **5 kbps** trong khi tunnel chở **4.463 kbps** (sai ~900 lần); vòng ramp vì thế kẹt số khai ở sàn |
| `8f949f8` | **v30** — khi quyết định số khai chỉ tính **mẫu đang chở dữ liệu**; chỉ hạ khai khi cửa sổ **≥8/12 mẫu hoạt động** và tụt dưới 50% | Xem Netflix, số khai **tự tụt 4.018 → 2.812 kbps** (trung bình 12 s tính cả giây nghỉ của video adaptive) |
| `48498b7` | **v31** — không tin bắt tay TCP **nhanh bất khả thi** (<25 ms); ghi nhớ "đường trực tiếp đã chết trên mạng này" cho tới khi đổi mạng | Trên 5G, `connect()` tới node VN trả **2–4 ms** (bắt tay **giả** của nhà mạng) ⇒ app chọn đúng đường không chở gói nào |
| `758fb8b` | Sửa `PinnedDnsConfigTest` đỏ từ 18/09 cho khớp quyết định cấu hình (API host **cố ý không ghim** IP) | Cổng test Android đỏ suốt từ 18/09 |
| `eeae7ef` | **v32** — đo mạng trước khi khai: tính tốc độ **từ byte đầu tiên** + ngân sách 2.500 → **6.000 ms**, trần 1,5 → **4 MB** | App đo ra **559 kbps** trên mạng 5G đo được **19 Mbps** ⇒ kẹt khai ở sàn 1.000 kbps |
| (server) | `wsrelay` deploy `sha256 acee1382…` + nới **`PONG_TIMEOUT_MS` 20 s → 60 s** trên 4 unit | Relay cắt kết nối mỗi 20–30 s vì app ping đúng 20 s; sau fix: **0 pong-timeout**, đã chuyển **40+ MB**, `dropped=0` |

Kèm theo trong bản khóa: fix MTU/DNS (`38a3e6f`, port nguyên vẹn), 16 KB page fix cho `hysteria.aar`
(`121eb7b`), build release 1.4.3 (`121eb7b`).

## 2. Bằng chứng chất lượng (để publisher đối chiếu khi build)

```
gradlew :app:testModernDebugUnitTest :app:assembleModernDebug   -> BUILD SUCCESSFUL
TONG: tests=57  failures=0
APK dev (modern): sha256 C97EA0173AF5C5A961FC58D3B7725F457538F2BD810C268F3612E82BCB056A08
                  versionCode=32  versionName=1.4.3-dev  113.422.837 byte
APK dev (legacy): 113.422.841 byte (cùng phiên build)
```

**Đo trên máy thật (Z Fold5, 23/09/2026):**

| Phép đo | Kết quả |
|---|---|
| Wi-Fi — tunnel qua đường trực tiếp (`hy-tcp:8443`, probe 114 ms) | **5,2 Mbps**, Netflix/FPT Play mượt |
| 5G — sức chứa tunnel (tải song song qua tunnel) | **40 MB / 11,1 s = 28,9 Mbps**; 25 MB / 10 s = 20,4 Mbps |
| 5G — FPT Play FullHD | chạy được, trung bình ~2,5 Mbps, cụm 9–13 Mbps, **thỉnh thoảng giật** (xem §4) |
| 5G — độ ổn định kết nối | `loss=0%`, `dropped=0`, `pong-timeout=0`, không dựng lại transport |
| 5G — RTT qua tunnel (qua Cloudflare) | 1,0–2,0 giây (nguyên nhân giật: chặn đầu dòng UDP-trong-TCP) |

## 3. Việc của PUBLISHER (chỉ làm khi chủ dự án yêu cầu phát "latest")

1. **Muốn phát bản mới:** build **release** từ đúng commit `eeae7ef` (KHÔNG build từ cây đang sửa),
   `versionCode = 32`, `versionName = "1.4.3"`, applicationId `com.privatevpn.app` (flavor production,
   không phải `.dev`). Chạy `scripts/check-apk-release.py` + ghi `scripts/release-record.mjs` như quy trình.
2. **Nếu muốn giữ nguyên hành vi đang phát:** bản production hiện tại (`versionCode 29`) **đã có v29**
   (sửa nguồn byte) — em đã kiểm chứng trên máy chủ dự án: log production ghi `src=` / `raw=` đúng.
   Ba bản vá v30/v31/v32 **chỉ có trong bản dev**, chưa lên production.
3. **Lưu ý dữ liệu khi phát v32:** phép đo trước khi khai nay tối đa **4 MB** (trước 1,5 MB) và đo
   **1 lần cho mỗi mạng** (cache theo profile). Nếu muốn tiết kiệm data hơn thì nói, hạ trần xuống 2–3 MB
   là một dòng trong `Config.kt` — nhưng phải mở khóa Android (xem §5).
4. **Không cần đụng gì tới server**: relay (node-2) đã deploy bản vá + ngưỡng `PONG_TIMEOUT_MS=60s` và
   đang chạy `4/4 active`.

## 4. Việc còn tồn (KHÔNG chặn phát hành, đã ghi nhận)

1. **VPS Hong Kong**: kế hoạch đầy đủ ở `docs/handoff/PLAN_VPS_HONGKONG_2026-09-23.md`. Đây là cách
   sửa tận gốc cho 5G (đường trực tiếp UDP, RTT 10–40 ms ⇒ hết giật, đủ 2K/4K). Chủ dự án đang xem xét;
   có IP là thi công + nghiệm thu theo §4 của kế hoạch.
2. **Giật trên 5G**: nguyên nhân là **chặn đầu dòng** (tunnel UDP chui trong 1 kết nối TCP/WS tới
   Cloudflare) + RTT 1–2 giây — hạn chế cố hữu của đường hiện tại, không sửa được ở phía app.
3. **iOS/macOS phải áp cùng 3 bản vá** (B1 nguồn byte, B2 không hạ khai vì nhu cầu thấp, B3 bắt tay giả)
   — yêu cầu đã ghi ở `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2i + §3c và đã gửi Mac (inbox + Telegram).
   Mac cũng đang làm nhánh `mac/ios-mtu-1300`.
4. Mac: căn 16 KB page + keystore (tồn từ trước; Android đã xử ở `121eb7b`).

## 5. Quy tắc khóa

- Muốn sửa Android tiếp ⇒ **cần yêu cầu mới của chủ dự án**; mở khóa bằng cách ghi vào handoff này
  (hoặc handoff mới) rồi mới sửa.
- Bản dev `com.privatevpn.app.dev` versionCode 32 **đang cài trên máy chủ dự án** để đối chiếu hành vi;
  nó **không phải** bản phát hành.
- Nguồn sự thật của bản khóa: commit `eeae7ef` trên `origin/main`.

## 6. GHI NHẬN MỞ KHÓA — 23/09/2026 (theo luật §5)

Chủ dự án yêu cầu trực tiếp trong phiên (DSH main agent, owner `windows`):

1. **Phân vai build + publish:** **harness Windows = Windows VÀ Android**; harness Mac = iOS + macOS.
   Đã ghi vào `docs/PUBLISHER_PROCESS.md` §0 (luật 7 + ghi chú PHÂN VAI) và `docs/VERSIONING.md` §3 (chủ sở hữu version Android) — commit `a34756b`.
2. **Cho phép mở khóa ĐÚNG 1 DÒNG** để phát được bản khóa v32: `android/app/build.gradle.kts`
   `versionName "1.4.3"` → **`"1.4.4"`** (giữ nguyên `versionCode = 32`, `applicationId = com.privatevpn.app`).
   - **Vì sao bắt buộc:** versionName `1.4.3` đã thuộc artifact đang phát (`versionCode 29`, sha256 `9563366…4ce5`).
     Ghi sổ cùng `(android, 1.4.3)` với sha256 khác sẽ bị cổng sổ **từ chối** (artifact bất biến — `docs/VERSIONING.md` §3.3).
   - **Không đổi hành vi**: chỉ đổi nhãn phiên bản; toàn bộ code v29/v30/v31/v32 giữ nguyên.
   - **Commit build để phát:** `eeae7ef` (code v32) + commit bump versionName này.
3. **Keystore release:** đã hỏi Mac chuyển qua node-1 (`/root/keystores-incoming/`, 700/600) — bus **#311**;
   yêu cầu cert phải là `dc6e484b…5e46` (đúng cert đã ký bản 1.4.3/29 đang phát).
4. **Sau khi phát:** đóng mục này lại; Android **vẫn khóa** cho tới yêu cầu mới của chủ dự án.

## 7. XÁC NHẬN CỦA CHỦ DỰ ÁN — BẢN ĐANG PHÁT ỔN ĐỊNH TRÊN THIẾT BỊ (24/09/2026)

Chủ dự án nói trực tiếp trong phiên (DSH main agent, owner `windows`):

> *"bản android hiện tại trên devices đang khá stable rồi."*

**Ý nghĩa với publisher:**
1. **Đóng mục treo "đối chiếu artifact ↔ máy thật"** của bản `android 1.4.4/32` (mục này nằm trong
   `verified_by`/`notes` của row publish và trong `docs/handoff/FIX_APPVERSION_PLATFORM_2026-09-23.md` §6.3).
   Trước đó mục này treo vì thiết bị SM-F9460 rớt kết nối adb liên tục — nay **chủ dự án xác nhận trực tiếp**
   là bằng chứng thay thế (luật §2b: bản phát hành phải là bản đã được test + verify với người có thẩm quyền).
2. Đã ghi **2 row `origin=verify`** vào sổ (`release/releases.jsonl`): `android 1.4.4` và
   `android-legacy 1.4.4`, cùng sha256 với row publish, kèm nguyên văn xác nhận.
3. **Không có số liệu hiện trường để đối chiếu thêm:** `client-telemetry.db` trên node-2 hiện **0 bản ghi**
   (app Android chưa gửi telemetry), `adb devices` **rỗng** (thiết bị vẫn offline). Bằng chứng định lượng
   vẫn là §2 (Z Fold5, 23/09) — nếu sau này cần số liệu thiết bị thật thì phải bật gửi telemetry hoặc
   cắm lại máy.
4. **Android VẪN KHÓA** theo §5: muốn sửa tiếp (vd phần CPU còn lại của `BUG-ANDROID-CPU-001`: giãn nhịp
   probe 15 s, log buffer, nhận biết màn hình tắt) vẫn phải có **yêu cầu mới của chủ dự án**.

