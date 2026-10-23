# LOCKED — Gateway laptop Windows + app VPNFlow TV (23/10/2026)

> **Chủ dự án chốt 23/10/2026:** "OK tốt rồi thì lock code lại, không update gì nữa, cho đến khi anh
> finding được gì hơn."
>
> Từ mốc này: **không sửa code, không build, không cài bản mới** cho tới khi chủ dự án yêu cầu.
> Mọi số liệu dưới đây là bản ĐANG CHẠY THẬT, đo trên máy thật.

## 1. Repo / code

| Hạng mục | Giá trị |
|---|---|
| Commit khoá | `87febe0d` (phương án B) + `9c277982`/`git log` autostart — xem §8 |
| Commit trước đó cùng đợt | `789a75fb` (auto dò gateway + route domain fallback), `64ebdb47` (quét subnet 18081/18083) |
| App TV | `com.privatevpn.app.tv.dev` **versionCode 99**, APK 97.432.509 B (sha256 đổi theo bản 99) |
| Guard | `com.privatevpn.app.guard` (bản sửa: có INTERNET, dò cổng trên luồng riêng, danh sách gateway) |
| Watchdog của Mac | `com.tvflow.watchdog` — **đang disable** (nó cũng ép proxy về 1081, xung đột với ProxyDirector) |

## 2. Cấu hình đang chạy trên laptop (Windows = gateway)

IP laptop lúc khoá: **192.168.100.5** (DHCP đổi từ .11 → .5 trong ngày; app tự dò nên không cần sửa).

```
lan-proxy.exe -listen 0.0.0.0:18081
  -upstream socks5://127.0.0.1:1081, 1101, 1102, 1103     # 1081 = UDP trực tiếp (ưu tiên), 1101/1102/1103 = WS node1/2/3
  -route .tv360.vn=socks5://127.0.0.1:1103                # TV360 đi node3
  -direct .miwifi.com -direct .xiaomi.com -direct .mi.com -direct .miui.com   # TV tự kiểm mạng: đi thẳng
```

Relay (`flowvpnrelay-windows-amd64.exe`) chạy 4 tiến trình:

| Cổng | Cấu hình | Node ra |
|---|---|---|
| 1081 | `.tmp/gateway/pc-gateway-udp.json` (UDP trực tiếp) | Flow1 `103.173.155.50` |
| 1101 | vn1hy, **links=96** | Flow1 `103.173.155.50` |
| 1102 | vn2hy, **links=96** | Flow2 `165.101.114.162` |
| 1103 | vn3hy, **links=96** | Flow3 `103.6.235.39` |

**links=96 là mốc đo được tốt nhất** (1 luồng 78–112 KB/s, 3 luồng 1,57 Mbps); 192 link tệ hơn (0,75 Mbps); 20–48 link chỉ ~0,4 Mbps.

Discovery: `lan-proxy` nghe **UDP 18099**, trả `FLOWVPNGW1 <cổng>` khi nhận `FLOWVPNGW?`.

Con canh: `tools/lan-proxy/gateway-monitor.ps1` (chạy: `powershell -NoProfile -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-monitor.ps1`)
— mỗi 60 s kiểm **egress thật** từng cổng, hỏng 2 nhịp thì dựng lại relay/lan-proxy; log `.tmp\gw-monitor.log`.

## 3. Cấu hình trên TV

```
settings get global http_proxy         → 192.168.100.5:18081   (hoặc 192.168.100.3:18081 của Mac — app tự chọn)
app prefs: proxy_mode = auto
           proxy_gateway = 192.168.100.5:18081,192.168.100.3:18081
```

Logic auto trong `ProxyDirector` (v98):

1. **Tự dò gateway**: broadcast UDP 18099 (Windows trả lời) + **quét subnet /24 cổng 18081 và 18083** (bắt được gateway của Mac).
2. **Chấm điểm** từng tuyến: tải 128 KB **xuyên qua chính proxy đó** bằng `CONNECT` + TLS, điểm = kbps; mẫu < 16 KB coi như 0; nhớ 3 phút; mỗi nhịp đo tối đa 2 tuyến.
3. **Chọn**: còn gateway LAN nào sống ⇒ luôn dùng gateway điểm cao nhất (hysteresis 15% chỉ giữa các gateway); **hết gateway** mới dùng đường TV `127.0.0.1:1081`; không còn gì ⇒ `:0` (fail-open).
4. Chế độ `tv` / `gateway` khoá đúng một loại, không nhảy chéo.
5. Nút **Refresh**: đo lại toàn bộ tuyến + vào tuyến tốt nhất ngay + khởi động lại tunnel để đo lại/khai báo lại băng thông.

## 4. Số đo tại mốc khoá (23/10 ~20:30)

```
UDP trực tiếp (1081) : 1,63 MB/s  (UDP mở lại sau khi bị chặn nhiều giờ)
proxy .5 (DNS+route) : 1 luồng 538 KB/s · 3 luồng 2,72 MB/s (21,8 Mbps)
gateway Mac .3       : 62 KB/s lúc đo được, sau đó 0 B/s (Mac hay tắt) ⇒ app tự chuyển sang .5
```

Trước đó (19:23–20:19) UDP bị chặn và chỉ còn WS 25–30 KB/s/node ⇒ không đủ phát video.

## 5. Điều KHÔNG được làm khi còn khoá

- Không sửa code/build/cài APK, không đổi tham số lan-proxy/relay, không đổi prefs của app trên TV.
- Không bật lại `com.tvflow.watchdog` khi `ProxyDirector` còn chạy (hai bên giành đặt proxy).
- Không dùng địa chỉ IP hard-code cho gateway — luôn để app tự dò (DHCP đã đổi .11 → .5 → .3 trong 1 ngày).

## 6. Khi cần mở khoá

Chủ dự án yêu cầu → cập nhật lại mục 1/2/3 và commit `docs(lock): ...` mới. Việc còn treo (chưa làm vì
khoá): phần media của FPT Play/TV360 không đi qua HTTP proxy ⇒ muốn phủ 100% cần **TUN ở gateway**
(hoặc root TV theo kế hoạch của Mac).

## 7. Cập nhật 23/10/2026 22:00 — theo 2 handoff của Mac

- **A. Discovery theo nhu cầu** (`ProxyDirector`): prefs ưu tiên trước, gateway tự dò xếp sau; chỉ dò khi
  không còn tuyến nào sống / bấm Refresh / cache hết hạn; throttle ≤1 lượt/60 s, cache quét 10 phút;
  `mode=tv` không dò. Bằng chứng: log `tự dò được gateway 192.168.100.5:18081`, `quét subnet thấy
  192.168.100.6:18081, 192.168.100.5:18081, 192.168.100.6:18083`, chọn `.6` (71 kbps > 56 kbps).
- **B. Tự hồi tunnel khi ở nền** (`VpnKeepAlive`): dùng `setExactAndAllowWhileIdle` (app được cấp
  temporary power allowlist khi chuông nổ) thay `setAndAllowWhileIdle`; bắt lỗi bị từ chối ⇒ hẹn lại
  sau 20 s; thêm quyền `SCHEDULE_EXACT_ALARM`. Bằng chứng: sau `am kill` khi ở nền, +4 s service được
  yêu cầu, +9 s `local-proxy: nghe 127.0.0.1:1081`, +70 s `HTTP proxy (CONNECT) sẵn sàng`; `/proc/net/tcp`
  có dòng `:0439 … 0A` (LISTEN).
## 8. Cập nhật cuối 24/10/2026 — CHỐT BẢN KHOÁ

- **App TV: versionCode 100** (`87febe0d`). Chính sách auto = **phương án B**:
  * mặc định dùng gateway LAN điểm cao nhất;
  * đường App `127.0.0.1:1081` **được thi đấu** nhưng phải đạt `TV_WIN_MIN_KBPS = 2000 kbps` VÀ
    `>= 1.5x` gateway tốt nhất;
  * **Xác thực đường đo**: mỗi tuyến đo **2 lần trên 2 kết nối mới** (CONNECT + TLS thật), điểm = **min**
    ⇒ burst ảo không kéo được điểm. Log: `đo <addr> = X kbps (2 kết nối: a / b)`.
  * SCORE_TTL 5 phút (vì mỗi phép đo tốn 2×128 KB).
- **Gateway Windows tự bật/tắt theo mạng** (`tools/lan-proxy/gateway-autostart.ps1`):
  SSID `KT-617` hoặc IP `192.168.100.*` ⇒ bật monitor (tự dựng 4 relay + lan-proxy); mạng khác ⇒ dừng.
  Chạy qua **Scheduled Task "VPNFlow Gateway Watch"** (5 phút/lần) + shortcut Startup; có mutex
  single-instance và **wake-lock** (Windows không ngủ khi gateway chạy).
- **Dọn TUN**: `disable-tun-for-gateway.ps1` (Administrator) xử lý adapter `sing-tun Tunnel` mà script cũ
  không thấy. Sau reboot 23/10: `flowvpntun` sạch, route CF đi qua Wi-Fi.
- **Bằng chứng failover** (đo thật): tắt gateway Windows → proxy sang Mac `.6` sau **20 s**; bật lại →
  quay về `.5` sau **20 s**; log `đo .5 = 903 kbps` / `.6 = 0 kbps (SocketTimeout)`.
- Từ mốc này: **không sửa code nữa** cho tới khi chủ dự án yêu cầu.