# HANDOFF v29 — SỬA NGUỒN BYTE CỦA DIAGNOSTICS (23/09/2026)

> Tiếp nối `HANDOFF_FINAL_2026-09-22.md`. Bản này **thay thế** phần build trong handoff cũ:
> build mới nhất là **versionCode 29 / versionName 1.4.3-dev**, không phải v28.

## 1. Vấn đề chủ dự án báo

> "các thông số trong Diagnostics đang không đúng với tốc độ đo được từ speed cloudflare.
> Có vẻ 2 đường đo tốc độ là khác nhau."

Chủ dự án xác nhận: **Diagnostics THẤP hơn nhiều** (speedtest cao gấp ≥2 lần).

## 2. Nguyên nhân gốc — có bằng chứng từ log của chính máy

Trích `diagnostics.log` trên máy thật (22/09/2026):

```
09-22 11:39:58  bw: sampler nguồn byte = cầu WS (app không đọc được /proc/net/dev)
09-22 12:55:41  tunnel: UP (hy-udp:50121)          <- transport đang chạy là UDP TRỰC TIẾP
09-22 13:08:59  bw: sample net=中国联通 observed=5 declared=1000
09-22 11:40:03  bw: probe 1719546B/3082ms -> 4463kbps qua tunnel
```

- Android/SELinux **chặn app đọc `/proc/net/dev`** ⇒ vòng lấy mẫu lùi về **bộ đếm của cầu WS**.
- Bộ đếm cầu WS **chỉ nhúc nhích khi đường chạy qua cầu WS**. Transport là `hy-udp`/`hy-tcp`
  trực tiếp ⇒ bộ đếm đứng yên ⇒ app báo **5 kbps** trong khi cùng phiên tunnel chở thật
  **4.463 kbps** — sai ~900 lần.
- Vòng ramp dùng **chính con số đó**, nên tưởng mạng chết và kẹt `declared` ở sàn 1.000 kbps.
  Đây cũng là lý do đã thấy "khai 1,4 / 3,8 Mbps trong khi tải thật 21–35 Mbps".

## 3. Đã sửa

| File | Sửa gì |
|---|---|
| `vpn/BandwidthMemory.kt` | Thêm `uidRxBytes()` / `uidTxBytes()` — `TrafficStats` theo UID, **luôn đọc được**, phủ **mọi transport** (socket trực tiếp lẫn socket cầu WS đều thuộc UID app). Ghi rõ trong KDoc cảnh báo: đếm mức "trên dây" và có tính traffic KHÔNG qua tunnel của chính app (đo trước khi nối / gọi API điều khiển). |
| `vpn/HysteriaVpnService.kt` | Vòng lấy mẫu chọn nguồn byte theo thứ tự: **(1)** `/proc/net/dev` → **(2)** đang qua cầu WS thì dùng bộ đếm cầu (khít nhất, không dính đếm trùng socket loopback `127.0.0.1`) → **(3)** đường trực tiếp thì `TrafficStats` theo UID. **Đổi đường (WS ⇄ trực tiếp) là chọn lại nguồn** (`srcOnWs`), vì giữ nguyên nguồn cũ chính là lỗi gốc. Dòng log `bw: sample ...` thêm `src=<1/2/3> raw=<byte>` để soát được. |
| `app/build.gradle.kts` | `versionCode = 29` (giữ `versionName = "1.4.3"` + hậu tố `-dev`). |
| `apply-patch-to-repo.ps1` (ngoài repo) | Dấu vết kiểm tra đổi theo v29: `versionCode = 29`, `uidRxBytes`, `srcOnWs`. |

Nhãn trên màn hình không đổi (đã i18n ở v28): **Tốc độ tải xuống / Tải lên / Đo được (đường ramp) /
Khai báo hiện tại / Khai báo còn lên được / Đường đang dùng**.

## 4. Sự cố trong lúc làm (đã khắc phục, phải ghi lại)

Script `tools/fix-mojibake.mjs` (viết để sửa lỗi mã hoá tiếng Việt do PowerShell 5.1 đọc file
không BOM bằng ANSI) có **lỗi `push`**: dòng nào sửa được thì bị *ghi log* mà **không được đưa
vào kết quả** ⇒ **xoá mất 54 dòng** ở `HysteriaVpnService.kt` + 5 dòng ở `Config.kt`.

- Đã khôi phục **nguyên văn** từ script vá gốc `.tmp/apply-ramp-patch.ps1`:
  6 chuỗi log (`ramp: STABLE at…`, `ramp: đường mới KHÔNG lên được…`, `ramp: kênh dò lỗi…`,
  `ramp: kênh dò KHÔNG có lãi…`, `ramp: kênh dò thấy đường TRỰC TIẾP tốt hơn…`,
  `ramp: NÂNG CẤP đường WS -> trực tiếp…`) và 17 khối comment/KDoc.
  Công cụ: `tools/restore-v29-lines.mjs`, `tools/restore-v29-comments.mjs` (mỗi phép thay phải
  khớp đúng 1 lần, sai thì **không ghi gì**).
- **Còn thiếu ~3 dòng comment** không khôi phục được (không xác định được nguyên văn). Không ảnh
  hưởng biên dịch/hành vi; committer nên biết để không ngạc nhiên khi soát.
- Bằng chứng trạng thái hiện tại: `BUILD SUCCESSFUL`, `HysteriaVpnService.kt` 1960 dòng
  (trước sự cố 1963), không còn lời gọi `DiagnosticsLog.*()` rỗng (đã quét bằng
  `tools/find-broken-log-calls.mjs`).

## 5. Bản build

```
APK : C:\Users\Minhn\.vpnflow-build-142\app\outputs\apk\modern\debug\app-modern-debug.apk
size: 113.451.055 bytes
sha256: 59BE53134AE6DEC6B09356CFA6268FD369692530972E7A114C9C7F0670E709B9
package: com.privatevpn.app.dev  versionCode=29  versionName=1.4.3-dev
```

Đã soi trong `classes3.dex` của chính APK này: có `uidRxBytes`, `uidTxBytes`,
`TrafficStats theo UID`, `srcOnWs`, `ramp: STABLE at` ⇒ đúng bản đã vá (không phải APK cũ còn sót).

**Lưu ý thứ tự build:** bản APK `A536BCA7…` (11:19) là bản *trước* khi port fix MTU/DNS của
commit `38a3e6f`; bản `59BE5313…` (11:58) mới là bản **khớp với source đã commit** (`86944de`).

## 5b. Đã port lại fix của máy khác để KHÔNG revert

Bản copy ngoài repo được tách trước commit `38a3e6f` (`fix(android): ha MTU tun0 1500->1300 +
cap 2 resolver DNS`), nên chép đè nguyên file sẽ **revert** commit đó. Trước khi chép, đã port
nguyên văn vào bản copy rồi mới commit:

| Việc port | Nội dung |
|---|---|
| `Config.kt` | `val HY_DNS_SERVERS = listOf("1.1.1.1", "8.8.8.8")` + KDoc lý do ≥2 resolver |
| `HysteriaVpnService.kt` | `for (dns in Config.HY_DNS_SERVERS) builder.addDnsServer(dns)` thay `addDnsServer("1.1.1.1")` |
| `HysteriaVpnService.kt` | `HY_MTU = 1500` → `1300` + KDoc path-MTU |

Đã kiểm tra thêm: `L10n.kt` trong bản copy **đã có** các key mới (`about`, `version`,
`latestOnServer`, …) của commit `152e524` và `build.gradle.kts` vẫn giữ `applicationIdSuffix =
".dev"` ⇒ không revert commit nào khác. `git diff origin/main` cho 8 file `windows/**` còn lại của
việc 1.4.4 **không bị đụng tới**.


## 6. Cách nghiệm thu trên máy (khi có adb)

```powershell
adb -s <serial> install -r -d <apk>
# bật VPN, chạy speedtest, rồi:
adb shell "grep -E 'sampler nguồn byte|bw: sample|chon-duong|tunnel: UP' /sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log | tail -20"
```

Đạt khi:
- `sampler nguồn byte = TrafficStats theo UID (đường trực tiếp)` khi `tunnel: UP (hy-udp…)`,
  hoặc `cầu WS (đang qua cầu)` khi đường đang qua cầu;
- `observed=` trong `bw: sample` **cùng bậc** với tốc độ speedtest (sai lệch ≤ ~20% là bình
  thường vì window 12 s gồm cả lúc rảnh), **không còn cảnh 5 kbps**;
- `declared` leo lên theo mạng thay vì kẹt ở 1.000 kbps.

## 6b. NGHIỆM THU TRÊN MÁY THẬT — ĐÃ ĐẠT (23/09/2026, Z Fold5)

Bản cài trên máy đã được đối chiếu byte-for-byte: `pm path` → `base.apk` có sha256
**`59BE5313…`** = đúng APK của commit `86944de` (không phải bản cũ còn sót).

1. **Nguồn byte đúng**: `12:41:52 bw: sampler nguồn byte = TrafficStats theo UID (đường trực tiếp)`
   — đường đang chạy là `hy-tcp:8443` (trực tiếp), trước đây chỗ này ghi "cầu WS" và sinh số rác.
2. **Phép tính đúng**: tự tính lại kbps từ chênh lệch `raw` giữa hai mẫu
   (`(raw2-raw1)*8/dt`) rồi so với `observed` (trung bình trượt 12 mẫu) — khớp trong sai số làm tròn
   (ví dụ 12:49:09: raw 1103 vs observed 1103; 12:50:01: raw 1937 vs observed 1972).
   Công cụ: `tools/check-sampler-math.mjs`.
3. **Có tải thật thì số BIẾT NHẢY** — đo song song hai đồng hồ độc lập:
   - `curl` trên máy tải qua chính tunnel: `size=13753216B time=120.002s speed=114608B/s`
     ⇒ **917 kbps** (Wi-Fi văn phòng đang rất tệ: RTT qua tunnel 1,2–2,3 s).
   - App Diagnostics cùng lúc: `observed` 168 → 671 → 985 → 1103 → 1265 → 1972 kbps
     (raw tính lại 325 → 671 → 1027 → 1232 → 1937) ⇒ **cùng bậc với 917 kbps**.
   - Trước bản vá, đúng khoảng này app báo **5 kbps** (sai ~200 lần).
4. **Lúc máy RẢNH thì 3–10 kbps là ĐÚNG** (chỉ còn keepalive) — không phải lỗi. Đây chính là chỗ
   dễ kết luận nhầm: số nhỏ chỉ là lỗi khi ĐANG có traffic.
5. **Vòng ramp nay phản ứng đúng** trên đường trực tiếp: `bw: ramp … observed=435 old=6938 new=4856
   reason=underrun-backoff apply=deferred-next-connect` — mạng thật chỉ ~1 Mbps nên hạ số khai
   (6.938 → 4.856 → 3.399 → 2.379) và **hoãn áp dụng tới lần kết nối sau** (không dựng lại giữa phiên).


## 7. KẾ HOẠCH TEST TỐI NAY (mạng NHANH — data di động) — chủ dự án chốt 23/09

Vì sao cần: Wi-Fi văn phòng hôm nay chỉ ~0,9 Mbps (RTT qua tunnel 1,2–2,8 s) nên **chưa kiểm được
các ngưỡng cần băng thông** (A1 ≥8 Mbps, A3 khoá mức, A6 kênh dò riêng). Chủ dự án sẽ test lại trên
mạng nhanh (Unicom — đã đo 16–21 Mbps) tối 23/09.

### 7.1 Lệnh lấy bằng chứng (một lần, không phải nhớ gì)

```powershell
$adb='C:\Users\Minhn\Android\sdk\platform-tools\adb.exe'
# adb vào qua Wi-Fi (không cần cáp); nếu IP đổi thì: adb mdns services
$S='10.193.44.116:43943'

# 1) kéo log về
& $adb -s $S pull /sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log C:\Users\Minhn\FPTVPN\.tmp\diag-toi-nay.log

# 2) dấu vết quyết định
& $adb -s $S shell "grep -E 'sampler nguồn byte|chon-duong|tunnel: UP' /sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log | tail -6"

# 3) số đo + tự tính lại từ bộ đếm thô
node C:\Users\Minhn\vpnflow-android-142\tools\check-sampler-math.mjs C:\Users\Minhn\FPTVPN\.tmp\diag-toi-nay.log 30

# 4) ramp/STABLE/kênh dò
& $adb -s $S shell "grep -E 'bw: ramp|ramp: STABLE|ramp: kênh dò|ramp: NÂNG' /sdcard/Android/data/com.privatevpn.app.dev/files/diagnostics.log | tail -12"

# 5) tạo tải thật để đối chứng (traffic của shell cũng đi qua tunnel)
& $adb -s $S shell "curl -s -o /dev/null -w 'size=%{size_download}B time=%{time_total}s speed=%{speed_download}B/s\n' --max-time 60 'https://speed.cloudflare.com/__down?bytes=20000000'"
```

### 7.2 Cần đạt / cần ghi lại

| # | Kiểm gì | Đạt khi |
|---|---|---|
| 1 | Nguồn byte | `TrafficStats theo UID (đường trực tiếp)` khi `hy-tcp/hy-udp`, `cầu WS (đang qua cầu)` khi qua cầu |
| 2 | Số khớp | `observed` (TB 12 s trong Diagnostics) **cùng bậc** với số Cloudflare/curl (lệch ≤ ~20–30%) |
| 3 | A1 | `observed` ≥ 8.000 kbps giữ ≥ 10 phút |
| 4 | A3 | thấy dòng `ramp: STABLE at …` rồi mức đó **không tụt** khi mạng còn tốt |
| 5 | A4 | ≤ 1 lần dựng lại transport / 30 phút (không có chuỗi `tunnel: UP` dày) |
| 6 | A6 | sau STABLE có `ramp: kênh dò …` chạy nền (không cướp băng thông) |
| 7 | A7 | app TQ (WeChat/Taobao…) vẫn vào bình thường + log `cn-bypass: 67 app TQ đi ĐƯỜNG RIÊNG` |
| 8 | A11 | `declared` ≤ 0,8 × số đo thật (log `bw: net=… measured=… declared=…`) |

### 7.3 Điểm phải chú ý khi đọc số (tránh kết luận nhầm)

- **Rảnh = 3–10 kbps là đúng**; chỉ kết luận lỗi khi ĐANG có traffic mà số vẫn nhỏ.
- So **`observed` (trung bình 12 s)**, đừng so dòng "Tốc độ tải xuống" (tức thời 1 s, nhảy loạn).
- **Watch item**: khi đường bị bão hoà, phép dò RTT qua tunnel có thể timeout và bị tính `loss=10%`
  (đã thấy 2 lần hôm nay). Ghi lại nếu thấy `bw: ramp … reason=loss-backoff` **trong lúc `observed`
  còn cao** ⇒ đó là hạ số oan, cần chỉnh ngưỡng (kèm `observed`, `rtt`, `loss`).
- Nếu test ở mạng có IPv6 hoặc đổi Wi-Fi ⇄ 4G: ghi lại dòng `net=` (khoá mạng) để biết số khai đang
  theo bộ nhớ của mạng nào.

### 7.4 Mẫu báo cáo nhanh (gửi 1 dòng là đủ)

```
mạng=<wifi-gw-… / 中国联通>  path=<Trực tiếp/Cầu WS>  Cloudflare=<down>/<up> Mbps
observed(kbps)=…  declared(kbps)=…  STABLE=<có/không>  rebuild/30min=…  loss-backoff oan=<có/không>
```


## 8. Việc còn lại (không nằm trong bản này)

1. ~~**Chưa test được trên máy**~~ → **đã nghiệm thu đạt trên máy thật 23/09, xem §6b** (nguồn
   byte đúng, phép tính khớp, số biết nhảy khi có tải, ramp phản ứng đúng).
2. Mac: căn 16 KB page (`libbwg.so`, `libbgojni.so`, `libandroidx.graphics.path.so`) + keystore.
3. `docs/RELEASE_PLAN_2026-09-24.md` §2.3 còn ghi 21/1.4.1 → cập nhật 29/1.4.3.
4. Kênh đo tốc độ riêng trong app (nút "Đo qua VPN" trong Diagnostics) để so trực tiếp với
   speedtest — hiện người dùng phải so bằng mắt giữa 2 ứng dụng.

## 9. Bài học cho iOS/macOS

Quy tắc: **bộ đếm byte phải phủ MỌI transport của tunnel**. Nếu bên iOS/macOS đang đọc bộ đếm
của *một* transport (ví dụ chỉ cầu WS/proxy) thì đổi đường là con số sai y hệt. Nguồn đúng:
bộ đếm của chính tiến trình (mọi socket) hoặc bộ đếm interface TUN nếu đọc được payload thật.
