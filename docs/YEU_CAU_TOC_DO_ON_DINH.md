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
