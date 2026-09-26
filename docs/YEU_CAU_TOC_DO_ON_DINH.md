# YÊU CẦU TỐC ĐỘ & ỔN ĐỊNH KHI XEM VIDEO — ÁP CHO **MỌI CLIENT** (Android / iOS / macOS / Windows)

> Ghi ngày 22/09/2026, từ yêu cầu trực tiếp của chủ dự án khi đo trên máy thật (Android, data
> China Unicom). Mục đích: **iOS và Mac nắm cùng một bộ điều kiện** để chỉnh lại yêu cầu & cách
> nghiệm thu cho app của mình. Bản gốc: `C:\Users\Minhn\vpnflow-android-142\YEU_CAU_TOC_DO_ON_DINH.md`.

## 1. Yêu cầu chính thức (22/09/2026 — áp cho **MỌI** nền tảng)

> **Tốc độ truyền qua VPN phải TĂNG DẦN kể từ lúc bắt đầu kết nối, cho tới khi đạt tốc độ tối thiểu
> để xem video streaming Full HD, rồi **STABLE** lại ở mức đó.**
> — chủ dự án, 22/09/2026

Ba vế bắt buộc, thiếu một vế là không đạt:
1. **Tăng dần** — ngay sau khi kết nối, băng thông phải leo lên theo năng lực mạng thật (không đứng
   ở mức thấp).
2. **Trong suốt** — người dùng **không được thấy mất mạng** trong lúc leo (nguyên văn trước đó:
   *"làm cho mạng tăng dần tốc độ lên mà người dùng không biết"*).
3. **Stable** — chạm mốc Full HD thì **khoá lại**: *"đừng reconnect lại nhiều lần để tránh mất mạng"*.
4. **Sau khi đã stable vẫn phải có KÊNH RIÊNG để dò xem còn lên được nữa không** (nguyên văn:
   *"khi đã vào trạng thái stable, có 1 kênh riêng để thử ramp lên được nữa hay không, nếu không lên
   được thì keep lại stable, nếu ramp được tiếp thì mới ramp"*). Kênh dò này **không được** làm hại
   phiên đang chạy. Chi tiết ở §2c.
5. **App Trung Quốc phải có ĐƯỜNG RIÊNG, không đi qua VPN** (nguyên văn: *"khi bật vpn, các app
   Trung quốc cần có đường riêng và không dùng vpn để connect vào. Ví dụ: wechat, alipay, meituan,
   didi, taobao..."*). Chi tiết + cách làm theo từng nền tảng ở §2d.
6. **ĐO MẠNG THỰC TẾ TRƯỚC, RỒI MỚI KHAI** (nguyên văn: *"Cần có 1 bước đo mạng thực tế trước rồi
   mới khai báo VPN, bên iOS đã cập nhật cái đó nhé!"*). Trước khi mở client với số khai băng thông
   (Brutal CC), app phải **đo băng thông THẬT của mạng nền** rồi lấy số đó làm số khai — không khai
   theo nấc đoán, và không đợi tunnel lên mới đo. Chi tiết ở §2e.
7. **Server quyết định đường tốt nhất** (nguyên văn: *"App có thể gửi về server các thông số để server
   quyết định cho app dùng đường nào là tốt nhất rồi mới đổi"*). App gửi số đo lên control plane,
   server trả về đường/node nên dùng, app **chỉ đổi khi server bảo** (và chỉ khi đang rảnh). Chi tiết
   + hợp đồng API ở §2f.

Nối tiếp tiêu chí đã ghi từ 19/09 (`docs/CHINA_TRANSPORT_ROADMAP.md` §TODO:
*"Yêu cầu tối thiểu cho mọi bản client: xem video streaming phải mượt — băng thông duy trì liên tục,
không chỉ burst ngắn"*).

## 2b. Máy trạng thái CHUNG — các nền tảng phải hành xử giống nhau

| Pha | Thời gian | Việc phải làm | Điều cấm |
|---|---|---|---|
| **START** | 0–15 s | Nối bằng đường "tốt nhất đã nhớ" (last-good transport), đo goodput mỗi 1 s (cửa sổ trượt 12 s) | Cấm thử tuần tự mọi cổng rồi mới vào đường đã biết là tốt |
| **RAMP** | 15–90 s | Nếu goodput < mốc Full HD **và** còn đường nhanh hơn chưa thử (trực tiếp QUIC/UDP → TCP relay → WS) ⇒ **nâng cấp đường**, tối đa **3 lần**, chỉ đi một chiều (không nhảy qua nhảy lại) | Cấm dựng lại khi đang có traffic thật; cấm để lộ interface VPN ra ngoài |
| **STABLE** | sau RAMP | Goodput ≥ mốc **bền 10 s** ⇒ **khoá** đường + số khai, ghi log `stable at <X> Mbps`. Phiên chạy tiếp bình thường, **vẫn chạy kênh dò** (§2c) | Cấm dựng lại phiên chính vì lý do tốc độ |
| **PROBE** | lặp lại trong lúc STABLE | Mở **kênh riêng** đo xem còn lên được nữa không (§2c); chỉ ramp khi kênh dò **chứng minh** có lãi | Cấm dò khi người dùng đang tải nặng; cấm để kênh dò làm rớt tốc độ phiên chính |
| **DEGRADED** | khi đường hỏng | Goodput < 2 Mbps **và** probe hỏng ⇒ chuyển đường/node kế tiếp; **phát hiện ≤ 15 s, có mạng lại ≤ 15 s** | Cấm để tunnel "UP" mà không chuyển gói quá 15 s |

Mốc Full HD dùng thống nhất: **8 Mbps duy trì** (YouTube 1080p ≈ 5 Mbps; 8 Mbps là mức có dư).
Mọi lần dựng lại transport **phải** giữ interface VPN (traffic khựng ≤ 1–3 s, không đổi mạng của máy).

## 2c. Kênh riêng để dò "còn lên được nữa không" (bắt buộc sau khi STABLE)

> Nguyên văn yêu cầu: *"khi đã vào trạng thái stable, có 1 kênh riêng để thử ramp lên được nữa hay
> không, nếu không lên được thì keep lại stable, nếu ramp được tiếp thì mới ramp"*.

**Nguyên tắc:** phiên đang chạy là bất khả xâm phạm. Kênh dò là **kênh thứ hai, độc lập**: không dùng
chung socket/đường với phiên chính và **không** đổi trạng thái UI (vẫn "Connected").

| Mục | Quy định |
|---|---|
| Dò cái gì | **Đường kế tiếp nhanh hơn** chưa dùng: QUIC/UDP trực tiếp → TCP relay trực tiếp → WS relay của **node khác**. (KHÔNG dò "số khai" — số khai không điều khiển chiều tải xuống, xem §3.1) |
| Cách dò | Mở transport dò trên socket/cổng riêng (đã `protect()`), chạy **burst 2–3 s hoặc 1–3 MB**, đo goodput thật, rồi **đóng ngay**. Không đụng phiên chính. |
| Khi nào dò | Chỉ khi phiên **rảnh** (không có traffic thật ≥ 5 s). Nhịp đầu **5 phút**; nếu không có lãi thì **giãn dần ×2 tới trần 30 phút** (tiết kiệm pin/data). Cấm dò khi người dùng đang xem video/tải. |
| "Lên được" | Goodput dò **≥ mức stable × 1,25** ở **2 lần liên tiếp** ⇒ **mới** ramp: chuyển đường (handoff trong suốt, khựng ≤ 3 s), đặt mức stable mới = đo được − 20%, quay lại STABLE. |
| "Không lên được" | Giữ nguyên mức stable, ghi log `probe: no gain (X vs Y) -> keep stable`, **không** dựng lại, **không** đổi gì. |
| Trần | Tối đa **1 kênh dò** cùng lúc; tối đa **3 lần ramp** mỗi phiên; ramp xong thì chạy lại PROBE. |
| Không được vi phạm | (a) tốc độ phiên chính không giảm > 10% trong lúc dò; (b) **0 lần** rời trạng thái Connected; (c) không dò khi pin yếu/chế độ tiết kiệm pin. |

## 2d. App Trung Quốc đi ĐƯỜNG RIÊNG (không qua VPN) — bắt buộc

> Nguyên văn yêu cầu: *"khi bật vpn, các app Trung quốc cần có đường riêng và không dùng vpn để
> connect vào. Ví dụ: wechat, alipay, meituan, didi, taobao..."*

**Vì sao:** đi full-tunnel thì traffic app TQ ra exit nước ngoài ⇒ server TQ thấy IP nước ngoài nên
cắt phiên: không đăng nhập được, "kết nối thất bại", hoặc chậm bất thường. (Việc này còn treo từ
19/09 — `docs/RELEASE_PLAN_2026-09-24.md` §2.2, `docs/CHINA_TRANSPORT_ROADMAP.md` §TODO.)

**Nguồn sự thật của danh sách:** `https://meetflowai.site/dl/routes/cn-apps.txt` (67+ gói, kèm tên
app). Thêm app mới **chỉ cần sửa file này**, không phải phát hành app.

| Nền tảng | Cách làm | Trạng thái |
|---|---|---|
| **Android** | Chính xác theo từng app: `VpnService.Builder.addDisallowedApplication(pkg)` cho các gói **đã cài**; danh sách nhúng sẵn trong `assets/cn-apps.txt` + tự cập nhật từ server ở luồng nền | **đã làm trong 1.4.3-dev** (`CnAppBypass.kt`) |
| **iOS / macOS** | **KHÔNG có API loại trừ theo app** cho VPN do app tự cài ⇒ phải chia theo **ĐÍCH ĐẾN**: route/rule `geosite:cn` + `geoip:cn` ⇒ `direct`, phần còn lại ⇒ tunnel (dùng đúng core sing-box/libbox đã tích hợp) | cần làm |
| **Windows** | Cùng core sing-box ⇒ dùng **cùng bộ rule** `geosite:cn`/`geoip:cn → direct` để ba nền tảng hành xử giống nhau | cần đối chiếu |

**Lưu ý chung:** danh sách app TQ và rule `geosite:cn` phải **tải/cập nhật ở luồng nền**, không được
chặn đường kết nối (bài học Windows 1.0.4 "connecting mãi"). Đo kiểm: bật VPN → WeChat/Alipay **đăng
nhập và giữ kết nối được**; đồng thời bộ đếm byte của tunnel **không tăng** khi chỉ dùng app TQ.

## 2e. ĐO MẠNG THỰC TẾ **TRƯỚC** RỒI MỚI KHAI (bắt buộc)

> Nguyên văn yêu cầu: *"Cần có 1 bước đo mạng thực tế trước rồi mới khai báo VPN, bên iOS đã cập
> nhật cái đó nhé!"*

**Vì sao:** số khai băng thông cho Brutal CC phải SÁT băng thông thật; nấc tĩnh (`MOBILE_*`,
`HY_*`) chỉ là đoán, mà đo **sau** khi tunnel lên thì **lần đầu trên một mạng mới vẫn khai theo nấc
đoán** (đúng lỗi Android trước 1.4.3).

| Mục | Quy định |
|---|---|
| Thời điểm | **Trước khi mở client** (trước khi số khai được truyền vào client), không phải sau khi tunnel lên |
| Cách đo | Tải một mẩu nhỏ qua socket **đã protect** (đi thẳng ra mạng nền): Android dùng 1,5 MB, tối đa 2,5 s, tối thiểu 200 KB mới coi là số hợp lệ (`NetworkPreMeasure.kt`, `Config.PREMEASURE_*`) |
| Nhịp | **Một lần cho mỗi mạng trong mỗi phiên** (đổi mạng thì đo lại) — không làm chậm các lần dựng lại sau đó (A5 vẫn phải ≤ 15 s) |
| Dùng số đo | Số đo TƯƠI thắng bộ nhớ (`BandwidthMemory`) khi chốt số khai; nhớ lại đỉnh cho lần sau |
| Đo hỏng | Lùi về số nhớ/nấc tĩnh — **không bao giờ chặn kết nối**, không ném lỗi |
| Bằng chứng | Log phải có dòng chứng minh số khai suy từ phép đo: Android `bw: DO MANG THUC TE truoc khi khai net=<key> = <X>kbps (mat <t>ms) - dung so nay lam so khai` |

## 2f. SERVER QUYẾT ĐỊNH ĐƯỜNG TỐT NHẤT (hợp đồng API + luật an toàn)

> Nguyên văn yêu cầu: *"App có thể gửi về server các thông số để server quyết định cho app dùng đường
> nào là tốt nhất rồi mới đổi"*.

**Vì sao:** mỗi máy chỉ thấy được đường của chính nó; server thấy được **tất cả** khách (node nào đang
tốt, relay nào đang chập, IP nào bị chặn theo vùng) ⇒ quyết định của server tốt hơn suy đoán cục bộ.

**Hợp đồng API (đề xuất — control plane chốt khi triển khai):**

```
POST /v1/route-report            (auth: token thiết bị như các API khác)
{
  "platform": "android|ios|macos|windows",
  "app_version": "1.4.3",
  "network":   { "type": "cell|wifi", "carrier": "中国联通",
                 "identity_hash": "<sha256(ssid|carrier)>", "raw_kbps": 21300 },
  "current":   { "transport": "ws", "node": "165.101.114.162",
                 "rtt_ms": 1800, "goodput_kbps": 6400, "stable_kbps": 6400,
                 "reconnects": 2, "window_s": 600 },
  "candidates":[ {"transport":"tcp","port":8443,"connect_ms":-1},
                 {"transport":"udp","port":8443,"result":"fail"},
                 {"transport":"ws","node":"103.173.155.50","rtt_ms":1500} ]
}
→ 200 {"recommended": {"transport":"tcp","port":8443,"node":"103.173.155.50","reason":"…"},
       "ttl_s": 1800}
   hoặc {"recommended": null}   // giữ nguyên đường đang dùng
```

**Luật an toàn (bắt buộc, áp cho mọi nền tảng):**
1. Chỉ ĐỔI khi server trả `recommended` **khác đường đang dùng** và `ttl_s` chưa hết; đổi theo đúng
   cơ chế §2c: **giữ nguyên interface VPN**, khựng ≤ 3 s, tối đa 3 lần/phiên, không đổi khi đang có
   traffic thật (rảnh ≥ 5 s).
2. **Không có quyết định của server NGAY thì app tự chọn cái tốt nhất** (nguyên văn: *"nếu không có
   quyết định của server ngay, thì app có thể chọn cái gì tốt nhất"*). Server là **kênh tối ưu**, không
   phải cổng chặn: timeout / lỗi / `recommended: null` ⇒ app dùng số đo của chính mình (kênh dò §2c +
   bộ nhớ theo mạng) để chọn đường tốt nhất, hoặc giữ nguyên nếu không chứng minh được đường nào hơn.

**Thứ tự quyết định (áp cho mọi nền tảng):**

| Ưu tiên | Nguồn | Điều kiện dùng | Nếu không có |
|---|---|---|---|
| 1 | **Server** (`/v1/route-report` → `recommended`) | Trả lời trong ≤ `SERVER_DECIDE_TIMEOUT_MS` (đề xuất 2000 ms), khác đường đang dùng, `ttl_s` còn hạn | xuống 2 |
| 2 | **App tự chọn tốt nhất** (kênh dò §2c + số đo + bộ nhớ theo mạng) | Kênh dò chứng minh có lãi (≥ 1,25×, 2 lần liên tiếp) | xuống 3 |
| 3 | **Giữ nguyên đường đang chạy** | luôn dùng được (mặc định an toàn) | — |

Mọi lần đổi (dù do server hay do app) đều theo đúng §2c: giữ interface VPN, khựng ≤ 3 s, tối đa
3 lần/phiên, chỉ đổi khi phiên rảnh ≥ 5 s, và **quay lại đường cũ 1 lần nếu đường mới không lên được**.

3. **Riêng tư:** chỉ gửi số liệu tổng hợp; định danh mạng gửi dạng **băm** (`identity_hash`), không
   gửi SSID/IP thô, không gửi nội dung traffic.
4. Nhịp báo: sau khi vào STABLE, sau mỗi lần kênh dò kết thúc, và khi đường suy giảm. Không báo dày
   hơn 1 lần/5 phút/thiết bị (tránh biến nó thành kênh đo tải).
5. Thứ tự triển khai: **sửa control plane trước (endpoint mới), commit rồi mới deploy** (luật repo
   §6b); bản app chưa có endpoint vẫn phải chạy đúng như hiện tại (server thiếu API ⇒ bỏ qua im lặng).





## 2. Tiêu chí nghiệm thu (số cụ thể, mọi client phải đạt)

| # | Tiêu chí | Ngưỡng |
|---|---|---|
| A1 | Băng thông **duy trì** (không phải burst) | **≥ 8 Mbps** liên tục trong **≥ 10 phút** (đủ Full HD 1080p, dư cho ~5 Mbps của YouTube 1080p) |
| A2 | Tăng tốc **dần & trong suốt** | Trong 60–90 s đầu, tốc độ phải leo lên mức mạng thật; **người dùng không thấy mất mạng**: interface VPN giữ nguyên, tối đa khựng 1–3 s nếu buộc phải dựng lại transport |
| A3 | **Khoá ở mức đã đạt** | Khi đã ≥ 8 Mbps ổn định ⇒ giữ nguyên mức đó; **chỉ** được đổi khi kênh dò (A6) chứng minh có lãi, hoặc khi tunnel chết thật |
| A4 | **Không reconnect oan** | Khi mạng ổn định: ≤ **1 lần** dựng lại transport / 30 phút, mỗi lần **phải có dòng log nêu lý do** |
| A5 | Hồi khi đường chết | Phát hiện ≤ **15 s** kể từ gói thật cuối; **có mạng lại ≤ 15 s** |
| A6 | Sau STABLE vẫn phải **dò xem lên được nữa không** | Có **kênh dò riêng** (không đụng phiên chính, không đổi UI); **không lên được ⇒ giữ nguyên mức stable**; chỉ ramp khi dò chứng minh ≥ **1,25×** ở 2 lần liên tiếp; tối đa 3 lần ramp/phiên |
| A7 | **App TQ đi đường riêng** | WeChat/Alipay/Meituan/Didi/Taobao… **đăng nhập + giữ kết nối** khi VPN bật; byte của tunnel **không tăng** khi chỉ dùng app TQ; Android dùng `addDisallowedApplication`, iOS/macOS/Windows dùng rule `geosite:cn`/`geoip:cn → direct` |
| A8 | **Đo mạng thực tế TRƯỚC khi khai** | Có bước đo thật **trước khi mở client**; log chứng minh số khai suy từ phép đo; đo hỏng thì lùi về số nhớ/nấc tĩnh và **không chặn kết nối**; chỉ đo 1 lần/mạng/phiên |
| A9 | **Server quyết định đường, không có thì app tự chọn** | App gửi số đo lên `/v1/route-report`; **chỉ đổi theo server khi có `recommended`** (khác đường đang dùng, `ttl_s` còn hạn, trả lời ≤ 2 s); server không trả lời ⇒ **app tự chọn đường tốt nhất** bằng kênh dò/bộ nhớ (hoặc giữ nguyên nếu không chứng minh được); định danh mạng gửi dạng **băm**; nhịp báo ≤ 1 lần/5 phút |
| A10 | **Hiện số live + trạng thái ramp trên màn hình** | Thẻ Diagnostics hiện **live mỗi 1 s**: tốc độ tải xuống, tải lên, **đo được của đường ramp**, **khai báo hiện tại**, và **khai báo còn lên được +X%** hoặc **"Đã tối đa ở thời điểm này"**; cộng đường đang dùng + mức đã khoá (stable); tunnel chưa phục vụ ⇒ `—` (không hiện số 0 gây hiểu nhầm) |

Tham chiếu Android (đo 22/09, sau bản vá 1.4.2): phát hiện đúng 15,5 s ✓; hồi **29 s** (chưa đạt A5,
trước vá là 41–51 s) — còn phải rút tiếp.

## 3. Sự thật kỹ thuật đã kiểm (áp cho MỌI client, đừng làm ngược)

1. **"Tăng dần" KHÔNG thể làm bằng cách nâng số khai băng thông (hysteria2 Brutal).**
   - Client hysteria2 chỉ đọc `BandwidthConfig{MaxTx,MaxRx}` **một lần lúc Connect**; không có API
     đổi giữa phiên (`hy-src/core/client/client.go` dùng thẳng `c.config.BandwidthConfig`).
   - Server của shop **đã bật `ignoreClientBandwidth: true`** (`docs/EXIT_NODE_RUNBOOK.md:16`,
     `docs/CHINA_TRANSPORT_ROADMAP.md:226`) ⇒ **không dùng** số client khai cho chiều tải xuống.
   - Đo thật: khai **3,8 Mbps vẫn tải 35 Mbps** (log 21/09); khai **12–13 Mbps tải 5,7–7,1 Mbps**
     (22/09). Tức "tăng số khai" không làm tăng tốc độ tải.
   - ⇒ Theo đúng yêu cầu §1, **"tăng dần" phải được thực hiện bằng ĐƯỜNG (transport) và NODE**:
     bắt đầu ở đường chắc-chạy-được, đo goodput, rồi **nâng cấp lên đường nhanh hơn** cho tới khi
     chạm mốc Full HD. Mỗi lần nâng cấp = 1 handshake mới ⇒ **phải trong suốt** (giữ interface VPN).
   - Hệ quả cho iOS/Mac: **đừng** thiết kế "ramp số khai để nhanh lên"; hãy làm theo máy trạng thái §2b.
2. **Tốc độ do đường + node + nhà mạng quyết định.** Số đo Android 22/09 (China Unicom, cùng URL
   `proof.ovh.net/files/10Mb.dat`): gốc (VPN tắt) **16,4 / 21,5 / 16,5 Mbps**; qua **cầu WS Cloudflare**
   **5,7–7,1 Mbps** (lúc đường khoẻ); có lúc **0,4–3 kbit/s** khi relay chập.
3. **Cầu WS là nút thắt lớn nhất cho streaming.** Trên máy thật 22/09 cầu WS chết sau **11–19 ping
   (~3,7–6,3 phút)** rồi OkHttp báo pong timeout 20 s; mỗi lần hồi mất **50–65 s** (đủ để vỡ video).
   Trước đó 19/09 đã sửa bug *"wsrelay cắt WS sau 10 phút bất kể traffic"* (`TRANSPORT_SPEED_2026-09-19.md`)
   — **nay vẫn chết sớm hơn 10 phút** ⇒ cần kiểm lại `wsrelay` (node-1/node-2) theo A4/A5.
4. **Sự cố relay 22/09 15:15–15:20** (ghi ở `.tmp/INCIDENT_WS_RELAY_2026-09-22.md`): `wss://api.meetflowai.site/relay/vn1hy`,
   `/vn2hy` và `wss://fcnvpn.tail303be3.ts.net:8443` đều **nhận upgrade 101 nhưng KHÔNG trả pong** và
   không chuyển dữ liệu — kể cả từ PC (không qua GFW). Node-1 còn TCP 8443 không mở, control plane
   `:7778` không phản hồi. ⇒ **Kiểm `wsrelay` trước khi kết luận client chậm.**

## 4. Việc iOS / macOS cần rà & chỉnh (đối chiếu trong code của mình)

1. **Ramp áp ở đâu?** Android 1.4.2 đang `apply=deferred-next-connect` (đổi số khai chỉ áp ở lần
   connect sau) ⇒ nếu **không bao giờ** dựng lại thì ramp **không bao giờ** có hiệu lực. iOS/Mac
   đang làm gì? Ghi rõ trong báo cáo.
2. **Mỗi lần đổi transport có làm mất interface VPN không?** (quyết định "mất mạng" hay "rò rỉ").
   Android: `ensureTun()` giữ TUN suốt phiên khi dựng lại transport (**không rò rỉ**, nhưng gói bị
   chặn ⇒ app thấy như mất mạng); khi **cả lượt** không tìm được đường thì `closeTun()` ⇒ máy **đi
   thẳng ra mạng nhà mạng, KHÔNG qua VPN**. Cần thống nhất hành vi giữa 3 nền tảng (nên chọn kiểu
   nào? — chủ dự án quyết; nếu chọn "không rò rỉ" thì phải chấp nhận mất mạng hoàn toàn khi relay chết).
3. **Có watchdog phát hiện "tunnel UP nhưng không có gói" không?** Android 1.4.2: probe hỏng 1 lần →
   hỏi lại ngay sau 1,5 s → hỏng cả hai ⇒ dựng lại (phát hiện 15,5 s). iOS hiện chỉ có supervisor
   15 giây đầu phiên rồi tự gỡ tunnel (`docs/RELEASE_PLAN_2026-09-24.md` §2.1) ⇒ **chưa đạt A5**.
4. **Lỗi hiển thị trạng thái**: Android vừa sửa — `onHysteriaUp()` không xoá thông báo nên UI đứng ở
   "State: Connected" kèm dòng "Message: Reconnecting…" sau **mỗi** lần reconnect (có ở mọi bản, kể cả
   1.4.0 khách đang dùng). iOS/Mac kiểm xem state/message có bị lệch tương tự không.
5. **16 KB page size**: APK Android bị Android 16 cảnh báo `libbwg.so`, `libbgojni.so`,
   `libandroidx.graphics.path.so` **chưa căn 16 KB** (ảnh `.tmp/shot.png`). Lib sinh từ
   `hysteria.aar` do **Mac build bằng gomobile** ⇒ nếu cùng toolchain thì iOS/macOS cũng nên kiểm
   (`check_elf_alignment.sh` của AOSP; Go ≥1.23 có `-Wl,-z,max-page-size=16384`).

## 5. Cách nghiệm thu (dùng CHUNG một cách đo để so được giữa các nền tảng)

```
# tải liên tục 10 phút, ghi tốc độ từng lượt 10MB (script mẫu: .tmp/ramp-android.sh)
for i in $(seq 1 60); do
  curl -s -o /dev/null -w "%{http_code} %{size_download} %{speed_download} %{time_total}\n" \
    -m 60 "https://proof.ovh.net/files/10Mb.dat"
done
```
- **Đạt** khi: ≥ 8 Mbps duy trì ≥ 10 phút, **0 lần** rời trạng thái Connected (đối chiếu log chẩn đoán
  của app), và nếu có dựng lại transport thì ≤ 1 lần/30 phút.
- Đo cả **gốc** (VPN tắt) cùng lúc để biết trần của nhà mạng — Android 22/09: gốc 16,4–21,5 Mbps.
- **Cảnh báo bẫy đo** (đã từng sai): `speed.cloudflare.com` cho số rất thấp trên đường RTT cao
  (máy thật 22/09: 493 kbps, jitter 992 ms) — dùng file lớn 1 luồng để đo băng thông duy trì.

## 2g. HIỆN SỐ LIVE + TRẠNG THÁI RAMP TRÊN MÀN HÌNH (bắt buộc, mọi nền tảng)

> Nguyên văn yêu cầu: *"trên màn hình, báo luôn tốc độ của đường đo ramp, nếu ramp được thì show luôn
> số % tốc độ có thể ramp lên thêm. Hoặc đã là maximize ở thời điểm hiện tại"* — và *"đưa vào phần
> Diagnostics ấy"*, *"nhìn chạy live thông số down/up giống của ookla luôn"*.

**Đặt ở đâu:** thẻ **Diagnostics** có sẵn của app (không thêm thẻ mới). Nhịp cập nhật **1 giây** —
đúng nhịp lấy mẫu sẵn có, KHÔNG thêm phép đo, không thêm pin.

**Các dòng bắt buộc:**

| Dòng | Nguồn số | Ghi chú |
|---|---|---|
| `Tốc độ tải xuống ↓` | delta byte RX của interface TUN mỗi 1 s | live kiểu Ookla |
| `Tốc độ tải lên ↑` | delta byte TX của TUN (dự phòng: bộ đếm TX của cầu WS) | |
| `Đo được (đường ramp)` | trung bình trượt 12 s của goodput qua tunnel (`sustained`) | cùng nguồn với dòng log `bw: sample observed=` |
| `Khai báo hiện tại` | số đang khai cho client (`declared`) | |
| `Khai báo còn lên được` | `(mục tiêu kế tiếp / khai báo − 1) × 100`; mục tiêu = `min(đo được × hệ số ramp, trần sức mạng)` | nhãn phải ghi rõ là **khai báo** còn lên được (không hứa tốc độ tải tăng, xem §3.1) |
| `Đã tối đa ở thời điểm này` | khi đo được ≥ **95% trần**, HOẶC kênh dò §2c vừa kết luận `no gain` | khớp luật "không lên được thì keep stable" |
| `Đường đang dùng` | transport + node (vd `Cầu WS · Hanoi-2`, `Trực tiếp QUIC · Hanoi-1`) | để nhìn là biết đang đi đường nào |
| `Mức đã khoá (stable)` | `stableKbps` của pha STABLE (§2b) | `—` khi chưa vào STABLE |

**Luật hiển thị:**
1. Tunnel chưa phục vụ (không có byte) ⇒ hiện `—`, **không** hiện `0` (tránh hiểu nhầm là mạng chết).
2. Số dùng đơn vị **Mbps, 1 chữ số thập phân**; tốc độ dưới 1 Mbps hiện theo kbps.
3. Không che trạng thái thật: khi cầu WS chập, số phải tụt về `—`/thấp đúng lúc — đó là tín hiệu để
   khách và kỹ thuật nhìn ra "khựng vì đường", không phải đoán.
4. Không đổi notification (chủ dự án đã chốt để sau) — chỉ màn hình chính.
## 2h. KHAI BÁO **AN TOÀN TRƯỚC**, RAMP SAU (bắt buộc, mọi nền tảng)

> Nguyên văn chủ dự án 22/09/2026: *"nên khai báo an toàn với ngưỡng mạng thật đã, rồi mới ramp tiếp"* —
> xuất phát từ lỗi đo được trên Android: app khai `up=8 Mbps / down=13,1 Mbps` (lấy `best` nhớ từ lúc
> mạng còn tốt) trong khi đường thật chỉ **56–152 kbps, loss 30–60%, RTT 2,3–2,8 s**. Với Brutal CC,
> **số `up` do client tự pace** nên khai vống ⇒ hàng đợi phình, mất gói tăng, cả chiều tải xuống sụp
> (đã ghi trong repo: *khai 100 Mbps trên 5G 13 Mbps làm tụt còn 0,6 MB/s*).

| # | Luật | Chi tiết |
|---|---|---|
| 1 | **Khởi điểm không bao giờ vống** | Có **số đo thật** ⇒ khai = **đo được × 0,8**. Chưa có số đo ⇒ `min(nấc tĩnh, số nhớ × 0,6)`; nếu đường đang **loss cao** thì **bỏ `best` cũ**, khởi điểm ≤ **4 Mbps down / 1 Mbps up** |
| 2 | **Ramp lên phải có điều kiện** | Chỉ ramp lên khi **loss thấp** và goodput chứng minh **2 lần liên tiếp**; **loss cao ⇒ CẤM ramp lên** dù goodput trông cao |
| 3 | **Hạ số khai áp NGAY** | Down-ramp (loss cao + goodput sụp) được **dựng lại MỘT lần khi phiên rảnh**, giữ nguyên interface VPN (khựng 2–3 s). Lý do: số khai chỉ áp ở lần connect sau ⇒ nếu đường sống lâu (như sau khi vá relay: 64 phút) thì **số khai sai dính suốt phiên**. Up-ramp vẫn để lần sau để không cắt stream |
| 4 | **Ưu tiên WS không được gán cứng** | Chỉ ưu tiên đường WS khi đường trực tiếp **đã được kênh dò xác nhận là không mở được** (§2c) — không suy ra từ việc "phiên trước chạy WS" |
| 5 | **Nhìn thấy được** | Thẻ Diagnostics phải hiện `up/down đang khai`, `đo được`, `loss%`, `rtt`, `đường đang dùng`, `% còn lên được` / `Đã tối đa ở thời điểm này` (§2g) — để nhìn màn hình là biết khai có vống hay không |

**Tiêu chí nghiệm thu A11:** sau khi kết nối ≤ 30 s, số khai `down` **không vượt quá 0,8 × goodput đo được**;
không có trường hợp loss ≥ 30% mà app vẫn khai > 2× goodput thực; khi loss cao kéo dài thì app **hạ khai
trong ≤ 15 s** (một lần dựng lại khi rảnh) chứ không chờ connect sau; và **không ramp lên** khi loss ≥ ngưỡng.
## 3b. CÔNG THỨC ĐÃ CHỨNG MINH TRÊN ANDROID v25 (22/09/2026) — iOS/macOS làm theo

**Kết quả đo thật (data China Unicom, 18:36–18:37):** app tự chọn **đường trực tiếp**, tự đo **8.387 kbps**
sau 5 s và chốt khai **7.128 kbps (≈0,85 × số đo)**; tải 4 lượt × 10 MB liên tục:
**11,4 / 11,7 / 10,5 / 9,8 Mbps — 4/4 lượt thành công, vượt ngưỡng Full HD (8 Mbps)**.
Trước đó (cùng máy, cùng mạng) các ô xấu chỉ **0,16–0,74 Mbps** vì app bám đường nhớ sẵn và khai 13,1 Mbps.

**Bốn thay đổi tạo ra kết quả đó (Android `HysteriaVpnService`):**
1. **Chọn đường bằng SỐ ĐO ở mỗi lượt kết nối** — probe TCP tới **node ĐANG DÙNG** (`runHost`), KHÔNG
   hardcode node khác (lỗi cũ: probe nhắm node-1 nên luôn báo "trực tiếp không mở được" ⇒ luôn chọn WS
   dù đường trực tiếp đang cho 16,9 Mbps).
2. **Khai = 0,85 × số đo**, và **bỏ số `best` nhớ sẵn khi đường đang loss cao** (§2h).
3. **Đổi đường MỘT CHIỀU** — gỡ hoàn tác; không "sang rồi về" (§2c/§2h luật 4).
4. **Dò cả hai chiều** nhưng chỉ sang khi đường kia **≥ 1,25×** ở **2 lần liên tiếp**, và chỉ khi phiên rảnh.

**Việc iOS/macOS cần rà (đối chiếu code hai bên):**
| Hạng mục | iOS hiện có | Cần bổ sung |
|---|---|---|
| Khai theo số đo | **Có** (`HysteriaBandwidthControl.downKbpsFromMeasurement` = 85%, `minTrustedMeasuredKbps`) | Bỏ `best` cũ khi loss cao; hạ khai áp **ngay khi rảnh** |
| Chọn đường theo số đo | **Chưa thấy** cơ chế probe-so-sánh-2-đường trước khi vào | Thêm: probe TCP tới node đang dùng + thời gian mở WS → chọn đường tốt hơn |
| Đổi đường một chiều | `applyBandwidthRampIfIdle` + `rebuildTransportForBandwidth` | Bảo đảm **không hoàn tác**, chỉ đổi khi dò chứng minh ≥ 1,25× (2 lần) |
| App TQ đi đường riêng | **Chưa có** (`NEAppRule` không dùng được cho VPN tự cài) | Chia theo **đích đến**: `geosite:cn` + `geoip:cn → direct` bằng core sing-box/libbox (§2d) |
| Hiện số live | **Chưa có** | Thẻ Diagnostics: down/up, đo được, khai báo, loss%, RTT, đường đang dùng, % còn ramp / "Đã tối đa" (§2g) |

**Quan trọng — phần server đã xong, iOS/macOS hưởng ngay không cần build lại client:**
`wsrelay` trên node-1/node-2 **đã được vá + deploy 22/09** (log mọi kết nối + `/healthz` + pong hai chiều
+ bắt lỗi UDP + backpressure + bỏ timer 10 phút). Bằng chứng: **cầu sống 64 phút** (trước 3,7–6,3 phút),
`pingsOut = pongsIn = 19`, `dropped=0`, `udpErrors=0`. Vì iOS/macOS dùng **cùng cầu WS/Cloudflare**, độ
chập do relay chết sẽ giảm cho cả hai nền tảng ngay tối nay.

---

## 2i. BA LỖI ĐÃ SỬA TRÊN ANDROID 23/09/2026 (v29 / v30 / v31) — **iOS/macOS PHẢI ÁP CÙNG**

Bối cảnh: chủ dự án báo (1) *"thông số trong Diagnostics không đúng với tốc độ đo từ speed Cloudflare"*,
(2) *"đang xem Netflix thì số khai tự tụt"*, (3) *"5G rất chậm"*. Cả ba đã tìm ra nguyên nhân gốc bằng
số đo trên máy thật, sửa trên Android; **iOS/macOS cùng thiết kế nên phải áp cùng** — nếu không, hai nền
tảng sẽ hành xử khác nhau trên cùng một mạng, đúng thứ §2b cấm.

### 2i.1 — B1: Bộ đếm byte để đo tốc độ **phải phủ MỌI transport** (nếu không, số hiện ra là rác)

**Triệu chứng:** Diagnostics báo **5 kbps** trong khi tunnel đang chở **4.463 kbps** — sai ~900 lần;
vòng ramp đọc chính con số rác đó nên tưởng mạng chết và kẹt số khai ở sàn 1.000 kbps.

**Bằng chứng (log máy thật Z Fold5, 22/09/2026):**
```
bw: sampler nguồn byte = cầu WS (app không đọc được /proc/net/dev)   ← nguồn SAI
tunnel: UP (hy-udp:50121)                                            ← transport TRỰC TIẾP
bw: sample net=中国联通 observed=5 declared=1000
bw: probe 1719546B/3082ms -> 4463kbps qua tunnel                     ← cùng lúc, chở thật 4.463 kbps
```

**Nguyên nhân:** bộ đếm dùng bộ đếm của **một transport** (bộ đếm của cầu WS). Khi đường chạy trực tiếp
(UDP/TCP tới node) thì bộ đếm đó **đứng yên** ⇒ số đo là rác.

**YÊU CẦU cho iOS/macOS:**
1. Nguồn byte phải là **số byte mà TIẾN TRÌNH nhận/gửi** (mọi socket của app — phủ cả đường trực tiếp lẫn
   cầu WS), hoặc bộ đếm interface TUN nếu đọc được payload thật. **Không** dùng bộ đếm của riêng
   proxy/cầu WS.
2. Chọn **một** nguồn cho mỗi phiên và **ghi log nguồn đang dùng**; khi **đổi đường** phải **chọn lại nguồn
   và reset mẫu** (trộn hai thang đo vào một phép trừ là số rác).
3. Ghi chú rõ trong code: nguồn theo UID đếm ở mức "trên dây" (đã mã hoá/đóng khung) nên nhích cao hơn
   payload vài %, và có tính traffic **không** qua tunnel của chính app (đo mạng trước khi nối).

**Nghiệm thu:** trong lúc **đang tải** (10 MB qua tunnel), số hiện trên màn hình phải **cùng bậc** với
`curl` đo song song (lệch ≤ ~20–30%). Lúc máy **rảnh** thì 3–10 kbps là **đúng** (chỉ còn keepalive) —
chỉ kết luận lỗi khi đang có traffic mà số vẫn nhỏ.

### 2i.2 — B2: **KHÔNG hạ số khai vì NHU CẦU thấp** — chỉ hạ vì ĐƯỜNG yếu

**Triệu chứng:** đang xem Netflix, số khai **tự tụt 4.018 → 2.812 kbps** giữa phiên. Vì Brutal CC pace
theo số khai ⇒ video tụt chất lượng ⇒ nhu cầu càng ít ⇒ trung bình càng thấp ⇒ lại tụt tiếp (vòng lặp ngược).

**Bằng chứng (log 23/09):** video adaptive tải **từng cụm rồi nghỉ** —
`1.911 → 7 → 1.795 → 5 → 1.094 → 768 → 431 → 2.006 → 17 kbps` — trong khi cửa sổ quyết định lấy
**trung bình 12 giây tính cả giây nghỉ**, nên kết luận sai "đường yếu":
```
bw: ramp observed=4034 old=3215 new=4018 reason=idle-reconnect
bw: ramp observed=591  old=4018 new=2812 reason=underrun-backoff  loss=10%   ← hạ oan
```

**YÊU CẦU cho iOS/macOS:**
1. Khi quyết định số khai, **chỉ tính các mẫu ĐANG CHỞ DỮ LIỆU** (Android dùng ngưỡng 200 kbps/mẫu 1 s);
   bỏ qua các giây nghỉ. Khi cửa sổ **không đủ** mẫu hoạt động thì quay về trung bình thường (để lúc mạng
   yếu thật vẫn phát hiện được).
2. **Hạ số khai chỉ khi hội đủ:** cửa sổ có **≥ 8/12 mẫu hoạt động** (tức đường ĐANG bị đẩy hết sức)
   **và** tốc độ tụt dưới **50%** số đang khai. Nhu cầu thấp **không** phải bằng chứng để hạ.
3. Giữ nguyên mọi luật cũ: hạ ngay khi mất gói/RTT vọt; đổi số khai **một chiều**, áp ở ranh giới an toàn
   (§2c/§2h).

**Nghiệm thu:** xem video 10 phút liên tục ⇒ **không** có lần hạ số khai nào trong lúc tốc độ lúc tải cụm
vẫn ≥ số đang khai; ngược lại, khi bóp băng thông thật (hoặc mạng yếu) thì phải thấy số khai hạ.

### 2i.3 — B3: **KHÔNG tin bắt tay TCP** khi chọn đường — có **bắt tay GIẢ**

**Triệu chứng:** trên Unicom **5G**, tunnel chỉ **13–109 kbps** dù mạng nền đo được **6,08 Mbps**; app
dựng lại – chết – dựng lại liên tục; trong khi trên Wi-Fi (đường trực tiếp thật) cùng máy chở **5,2 Mbps**.

**Bằng chứng (23/09/2026, VPN TẮT để đo raw):**

| Đích | `connect()` TCP | Ghi chú |
|---|---|---|
| node-2 `165.101.114.162:8443` | **2–4 ms** | *bất khả thi vật lý* — RTT thật TQ→VN phải 40–100 ms |
| node-1 `103.173.155.50:8443` | **2,7 ms** | cũng giả |
| `api.meetflowai.site:443` (Cloudflare) | 250–780 ms | **thật** ⇒ đường Cloudflare sống |
| Tốc độ raw 5G (Cloudflare `__down`) | **6,08 Mbps** | mạng nền tốt |

App vì thế tưởng đường trực tiếp nhanh gấp ~500 lần cầu WS và **chọn đúng đường không chở được gói nào**:
```
14:56:49 chon-duong: truc-tiep=4ms cau-WS=chua-biet -> uu tien TRUC TIEP
14:56:59 bw: sampler nguồn byte = cầu WS (đang qua cầu)        ← direct chết, phải rơi về cầu
14:57:21 probe#6 tunnel UP nhưng 2 lần liên tiếp không có gói nào qua -> dừng client để dựng lại
14:57:02 observed=13 kbps  loss=30%   rtt=2662ms
14:57:39 observed=22 kbps  loss=80%
```

**YÊU CẦU cho iOS/macOS:**
1. `connect()` tới node ở nước ngoài trả về **< 25 ms** ⇒ **bất khả thi** ⇒ coi như **KHÔNG mở được**
   (bắt tay giả của nhà mạng/GFW), **không** được ưu tiên đường trực tiếp và phải ghi log cảnh báo.
2. **Ghi nhớ "đường trực tiếp đã chết trên mạng này"** (bắt tay giả **hoặc** tunnel UP mà không có gói nào
   qua) và **giữ cho tới khi ĐỔI MẠNG** ⇒ những lượt dựng lại sau **ưu tiên cầu WS**, không chọn lại đường
   trực tiếp chỉ vì phép đo lại trả vài ms "đẹp".
3. Lưới an toàn "tunnel UP nhưng không có gói nào qua ⇒ dựng lại transport" phải **đặt cờ ở mục 2** khi
   đường đang dùng là đường trực tiếp.

**Nghiệm thu:** trên mạng có bắt tay giả, log phải có dòng "nghi bắt tay giả" + ưu tiên cầu WS, và
tốc độ phải lên lại ≥ 1 Mbps (thay vì 13–109 kbps).

### 3c. SỐ ĐO LÀM CHUẨN ĐỐI CHIẾU — dùng CHUNG để so giữa các nền tảng (23/09/2026)

| Phép đo | Số (Z Fold5) |
|---|---|
| Raw 5G không VPN → Cloudflare `__down` | **6,08 Mbps** (18.993.152 B / 25,0 s) |
| Raw 5G không VPN → CDN shop `meetflowai.site/dl/routes/cn.txt` | 0,2 Mbps (85.375 B / 3,3 s) — **đừng dùng làm nguồn đo chuẩn** |
| Qua tunnel trên **Wi-Fi** (đường trực tiếp `hy-tcp:8443`, probe 114 ms) | **5.247–5.311 kbps**, loss 0%, Netflix chạy tốt |
| Qua tunnel trên **5G** (bắt tay giả ⇒ rơi về cầu WS) | **13–109 kbps**, loss 30–80%, rtt 0–2.662 ms |
| `curl` qua tunnel (đo đối chứng, dùng trong test) | 13.753.216 B / 120 s = **917 kbps** |

**Cách đo dùng chung (mọi nền tảng phải cho kết quả cùng bậc):**
```bash
# 1) đo RAW (VPN TẮT)
curl -s -o /dev/null -w 'raw: %{speed_download}B/s size=%{size_download} t=%{time_total}s\n' \
  --max-time 25 'https://speed.cloudflare.com/__down?bytes=20000000'
# 2) đo QUA TUNNEL (VPN BẬT) — traffic của shell/curl cũng đi trong tunnel
curl -s -o /dev/null -w 'tunnel: %{speed_download}B/s size=%{size_download} t=%{time_total}s\n' \
  --max-time 25 'https://speed.cloudflare.com/__down?bytes=20000000'
# 3) kiểm bắt tay giả: so connect tới node với connect tới Cloudflare
curl -s -o /dev/null -w 'node:  tcp=%{time_connect}s\n' --connect-timeout 6 http://165.101.114.162:8443/
curl -s -o /dev/null -w 'cloud: tcp=%{time_connect}s\n' --connect-timeout 8 https://api.meetflowai.site/
```

**Phần server đã xong (23/09) — iOS/macOS hưởng ngay, không cần build lại:**
`wsrelay` đã được deploy bản mới (`sha256 acee1382…`): sửa lỗi bind UDP vào loopback khi upstream là host
**remote** (trước đó `relay-cf-vn1hy`/`vn1wg` chết 100%: `udp send: send EINVAL 103.173.155.50:8443`,
`out=0B`, `udpErrors=129`). Sau khi deploy: 4/4 unit `active`, `udpErrors=0`, và kiểm chứng thật bằng một
phiên WS: `#1 MỞ … #1 ĐÓNG sau 3.1s | in=3f/15B out=0f/0B | client-close 1005` — 3 frame đã gửi được tới
upstream remote, `lastError=null`.
