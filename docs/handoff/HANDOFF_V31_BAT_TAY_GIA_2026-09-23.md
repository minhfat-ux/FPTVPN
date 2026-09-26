# HANDOFF v31 — KHÔNG TIN "BẮT TAY TCP" KHI CHỌN ĐƯỜNG (23/09/2026)

> Tiếp nối `HANDOFF_V30_KHAI_BAO_ADAPTIVE_2026-09-23.md`. Build mới nhất: **versionCode 31 / 1.4.3-dev**.
> **Yêu cầu cho iOS/macOS đã ghi vào `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2i + §3c** (chủ dự án yêu cầu
> mọi update Android phải được chuyển cho iOS).

## 1. Triệu chứng (chủ dự án báo: "5G rất chậm", đang xem Netflix)

Trên Unicom **5G**: tunnel chỉ **13–109 kbps**, `loss=30–80%`, `rtt=0–2.662ms`, app **dựng lại – chết –
dựng lại** liên tục; Netflix không xem được. Trong khi đó **mạng nền đo được 6,08 Mbps** và trên Wi-Fi
cùng máy tunnel chở **5,2 Mbps** (Netflix chạy tốt).

## 2. Nguyên nhân gốc — BẮT TAY TCP GIẢ

Đo khi **VPN TẮT** (23/09/2026, Z Fold5, Unicom 5G):

| Đích | `connect()` TCP |
|---|---|
| node-2 `165.101.114.162:8443` | **2–4 ms** ← bất khả thi vật lý (RTT thật TQ→VN 40–100 ms) |
| node-1 `103.173.155.50:8443` | **2,7 ms** ← cũng giả |
| `api.meetflowai.site:443` (Cloudflare) | 250–780 ms ← thật |

⇒ Nhà mạng/GFW **tự trả lời bắt tay TCP** cho cổng của node (không byte nào đi qua), nhưng app tin vào
con số "4 ms", tưởng đường trực tiếp nhanh gấp ~500 lần cầu WS (1802 ms) nên **chọn đúng đường chết**:

```
14:56:49 chon-duong: truc-tiep=4ms cau-WS=chua-biet -> uu tien TRUC TIEP
14:56:59 bw: sampler nguồn byte = cầu WS (đang qua cầu)          ← direct chết, rơi về cầu
14:57:21 probe#6 tunnel UP nhưng 2 lần liên tiếp không có gói nào qua -> dừng client để dựng lại
14:57:02 observed=13 kbps loss=30%   14:57:39 observed=22 kbps loss=80%
```

## 3. Đã sửa

| File | Sửa gì |
|---|---|
| `vpn/BandwidthMemory.kt` | Thêm `PATH_MIN_PLAUSIBLE_MS = 25` + hàm thuần `plausibleDirectMs(ms)`: độ trễ `connect()` nhỏ hơn ngưỡng này tới node nước ngoài là bất khả thi ⇒ không đáng tin. |
| `vpn/HysteriaVpnService.kt` | `probeTcpRelayMs()` báo **"không mở được"** khi bắt tay nhanh bất khả thi (kèm cảnh báo log). Thêm cờ `directSuspect`: khi watchdog phát hiện **tunnel UP mà không có gói nào qua** trên đường trực tiếp thì **ghi nhớ** và những lượt dựng lại sau **ưu tiên cầu WS**, không chọn lại đường trực tiếp chỉ vì phép đo trả vài ms "đẹp". Cờ này **tự xoá khi ĐỔI MẠNG** (kết luận của mạng cũ không còn nghĩa). Dòng `chon-duong` in thêm nhãn `[nghi-bat-tay-gia]`. |
| `app/build.gradle.kts` | `versionCode = 31`. |
| `test/.../BandwidthPolicyTest.kt` | +1 test: 2/4 ms (giả) và 0/-1 (đo hỏng) không đáng tin; 114 ms (đo thật trên Wi-Fi) đáng tin. |

## 4. Bằng chứng

```
gradlew :app:testModernDebugUnitTest :app:assembleModernDebug -> BUILD SUCCESSFUL
TONG: tests=57 failures=0
APK: versionCode=31 sha256 80CCBB0F1D184F2D761AA2BB5C3D3A009D7A0CD0177C7D2C1B3CCFF99DB008C9
     (113.422.833 byte) — trong dex có plausibleDirectMs / PATH_MIN_PLAUSIBLE_MS / directSuspect
Đã cài lên Z Fold5: com.privatevpn.app.dev versionCode=31
```

## 5. Việc kèm theo (server — đã xong, không cần build client)

`wsrelay` được deploy bản mới (`sha256 acee1382…`): sửa lỗi **bind UDP vào loopback khi upstream là host
remote** ⇒ trước đó `relay-cf-vn1hy`/`vn1wg` **chết 100%** (`udp send: send EINVAL 103.173.155.50:8443`,
`out=0B`, `udpErrors=129`).

Kiểm chứng sau deploy:
- 4/4 unit `active`, mọi `/healthz` trả `udpErrors: 0`, `lastError: null`;
- mở một phiên WS thật vào `/relay/vn1hy`: `#1 MỞ … #1 ĐÓNG sau 3.1s | in=3f/15B out=0f/0B | client-close 1005`
  ⇒ 3 frame đã gửi được tới upstream remote, không còn EINVAL;
- backup để rollback: `/root/wsrelay.js.bak-20260923-135047`.

## 6. Việc còn lại

1. **iOS/macOS**: áp §2i.1 (B1 nguồn byte), §2i.2 (B2 không hạ khai vì nhu cầu thấp), §2i.3 (B3 bắt tay
   giả) trong `docs/YEU_CAU_TOC_DO_ON_DINH.md`, nghiệm thu bằng cùng lệnh đo ở §3c.
2. Android còn một điểm chưa đo được: **đường trực tiếp trên 5G vẫn bị chặn** — v31 chỉ giúp app **thôi
   chọn nhầm** và dùng cầu WS; muốn có đường trực tiếp trên 5G thì phải xử ở tầng node (đổi cổng/obfs,
   thêm node trong nước, hoặc để server chọn đường — §2f).
3. Mac: căn 16 KB page + keystore (tồn từ trước).
