# Khoá gateway Windows không được chết — sự cố thật 24/10/2026 (00:20 → 02:37)

> Bối cảnh: chủ dự án báo *"gateway của windows và android không tự sống cho TV, anh vừa phải bật app"*
> và chốt *"đừng bao giờ để gateway hay relay của laptop chết"*.
> Đây là biên bản điều tra + sửa, **chỉ** phần laptop (Android gateway ghi ở §6).

## 1. Bằng chứng: gateway đã chết thật, 2 giờ 17 phút

| Bằng chứng | Số liệu thật |
|---|---|
| Sự kiện Modern Standby (`System`, id 506/507) | vào **00:20** → ra **02:44:51** (thêm nhiều lần ngủ ngắn trước đó: 01:07, 01:22, 01:40, 02:04, 02:22) |
| `.tmp/gw-autostart.log` | dòng cuối trước sự cố: **`2026-10-24 00:01:28`**, sau đó **im 2,5 giờ** |
| Task `VPNFlow Gateway Watch` | `Last Run Time 00:20:01` (khi đó bị mutex nên không làm gì), `Next Run Time 02:50` ⇒ **không có nhịp nào chạy trong lúc ngủ** |
| Cấu hình task (trước khi sửa) | `DisallowStartIfOnBatteries = True`, `StopIfGoingOnBatteries = True` (máy đang **pin 28 %**), `StartWhenAvailable = False` (nhịp bị lỡ **không** chạy bù khi thức) |
| `Get-NetTCPConnection` lúc 02:45 | chỉ `18081` LISTEN; `1081/1101/1102` **không có ai nghe** |
| `curl -x http://127.0.0.1:18081` | **`HTTP/1.1 502 Bad Gateway`** ⇒ lan-proxy sống nhưng **không có upstream nào sống** |
| Tiến trình relay lúc 02:45 | **4 instance** `flowvpnrelay-windows-amd64.exe`, **tất cả cùng** `-c …\pc-gateway-udp.json` (01:46, 02:40, 02:42, 02:45), **không cái nào** LISTEN |

Cộng lại: laptop ngủ → mọi dịch vụ dừng; thức dậy thì monitor cũ không dựng lại được đường ra, nên TV
mất mạng cho tới khi chủ dự án tự mở app.

## 2. Ba lỗi gốc (không phải "mạng yếu")

### (a) Task không được phép chạy khi dùng pin + không chạy bù nhịp bị lỡ
`DisallowStartIfOnBatteries=True` + `StopIfGoingOnBatteries=True` + `StartWhenAvailable=False`
⇒ laptop rút sạc là **không còn nhịp canh nào**, ngủ dậy cũng không có nhịp chạy bù.

### (b) Relay WS (1101/1102) **chưa bao giờ** lên được — BOM trong file cấu hình
Monitor sinh cấu hình bằng `Set-Content -Encoding UTF8` (PowerShell 5.1 **thêm BOM**). Relay là Go:
```
[flowvpnrelay] phân tích cấu hình: invalid character '\ufeff' looking for beginning of value
```
⇒ từ trước tới nay **chỉ UDP 1081 sống**, hai đường WS dự phòng **chết 100 %**. Đây là lý do "một đường
chết là hết": thiết kế có 3 đường nhưng thực tế chỉ có 1.
Sửa: ghi bằng `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))` (không BOM) — đo sau sửa:
`1101 READY sau 4 s`, `1102 READY sau 5 s`.

### (c) Monitor không dọn process "xác" và không kiểm tra đã bind hay chưa
`Start-Relay` chỉ giết process **đang giữ cổng**; process kẹt (sống nhưng không bind) **không ai giết**
⇒ mỗi lần "dựng lại" lại đẻ thêm một xác (đúng 4 xác ở §1). Nó cũng không đợi cổng thật sự trống trước
khi bật process mới ⇒ process mới bind thất bại rồi kẹt luôn.

## 3. Đã sửa gì (đều có bằng chứng ở §4)

| File | Thay đổi |
|---|---|
| `tools/lan-proxy/gateway-monitor.ps1` | ghi config **không BOM**; `Wait-PortFree` (đợi cổng trống thật rồi mới bật); `Wait-Port` xác nhận **đã LISTEN** (30 s, ghi `READY sau Ns`); thất bại thì giết **đúng pid vừa bật** + ghi 2 dòng lỗi cuối vào log; `Remove-RelayZombies` dọn process sống mà không nghe cổng (ngưỡng 120 s); `Test-Egress` **2 URL × 2 lần** (1.1.1.1 + gstatic) chống báo chết oan; `Test-LocalNet` — laptop mất mạng nội bộ thì **không** dựng lại relay (tránh nhấp nháy vô ích); ngưỡng 3 nhịp lỗi liên tiếp; có lỗi thì nhịp **20 s** thay vì 60 s; ghi `.tmp/gw-monitor.heartbeat` mỗi nhịp |
| `tools/lan-proxy/gateway-autostart.ps1` | nhịp tim: monitor còn process nhưng **heartbeat cũ > 240 s** ⇒ giết + bật lại (kiểu "chết lặng"); phát hiện **máy vừa thức** (khoảng cách nhịp > 2×chu kỳ + 15 s) ⇒ dọn sạch + dựng lại ngay; giữ wake-lock **mỗi nhịp** |
| `tools/lan-proxy/install-gateway-task.ps1` (mới) | đăng ký lại task: `AllowStartIfOnBatteries`, `DontStopIfGoingOnBatteries`, `StartWhenAvailable`, `ExecutionTimeLimit=0`, `MultipleInstances=IgnoreNew`, `RestartCount=3/1m`; **3 trigger**: đăng nhập, 5 phút/lần, và **sự kiện thức dậy** (`Kernel-Power` 507/1). Chạy lại được nhiều lần, không cần admin |

## 4. Nghiệm thu (đo bằng lệnh thật, log `.tmp/gw-monitor.log`)

| Ca | Cách làm | Kết quả |
|---|---|---|
| Relay bị giết sạch | `Stop-Process` **toàn bộ** `flowvpnrelay*` + `lan-proxy` | dựng lại: `1081 READY sau 2 s`, `1101 READY sau 4 s`, `1102 READY sau 3-5 s`; `18081` egress `ip=103.173.155.50 loc=VN` |
| Tự hồi end-to-end (3 lần) | giết sạch rồi đo tới khi `4/4` cổng + egress OK | **171 s → 123 s → 130 s** (đều **không cần bàn tay người**; thời gian còn lại chủ yếu là chờ nhịp 20-60 s và WS bắt tay 24 link) |
| Monitor bị giết | `Stop-Process` tiến trình `gateway-monitor.ps1` | autostart bật lại sau **58 s** (pid đổi 13436 → 12496) |
| Task cấu hình | `Get-ScheduledTask` | `AllowStartIfOnBatteries True`, `StopIfGoingOnBatteries True`(=không dừng), `StartWhenAvailable True`, 3 trigger (Logon + Daily/5m + Event) |
| Ổn định | đo lại qua gateway 6 lần × 15 s | **6/6** `ip=103.173.155.50`, không nhịp nào lỗi |

## 5. Giới hạn còn lại (nói thẳng, không hứa)

1. **Gập nắp / ngủ máy vẫn có thể xảy ra** (Modern Standby S0 của Windows không bị `SetThreadExecutionState`
   chặn khi đóng nắp). Wake-lock chỉ chặn ngủ do **idle**. Khi có ngủ: thức dậy là tự dựng lại
   (trigger sự kiện + phát hiện khoảng trống nhịp), **không cần mở app**, nhưng TV có thể mất mạng
   **~1-2 phút** trong lúc đó.
2. **TV đang đi qua gateway khác**: lúc kiểm tra, `settings get global http_proxy` trên TV =
   **`192.168.100.6:18081`** (Mac), không phải laptop `.5`. Đó là chính sách "chọn đường tốt nhất"
   của app, không phải lỗi.
3. Nếu **mất điện / tắt máy** thì không có gì tự chạy cho tới khi đăng nhập lại (task trigger đăng nhập
   lo việc đó), còn trước khi đăng nhập thì không có gateway.
4. Đây vẫn là **một máy laptop**: không có nhân bản. Muốn "không bao giờ chết" theo nghĩa tuyệt đối thì
   phải có gateway thứ hai (Mac hoặc điện thoại) — xem §6.

## 6. Gateway Android (điện thoại) — trạng thái lúc kiểm tra 03:12

- App còn sống (`pid 10529`), `tun0 100.100.100.101/30` **vẫn tồn tại**, cổng **18081 đang LISTEN**.
- Nhưng đẩy traffic qua thì **`HTTP/1.1 502`** (và TLS fail) ⇒ **tun0 còn nhưng tunnel bên trong đã chết**;
  app chưa tự dựng lại tunnel.
- Đây là **lỗi riêng của app** (không phải hạ tầng laptop): cần cho keepalive kiểm tra *đường ra thật*
  qua proxy nội bộ và khởi động lại tunnel khi 502 — chưa sửa trong lần này.

## 7. Hai chỉnh sửa sau khi quan sát 10 giờ chạy liên tục (24/10 chiều)

### 7a. Nhấp nháy relay: 237 lần dựng lại chỉ vì đường UDP, trong khi WS vẫn tốt

Log 04:00-13:20 cho thấy `da bat lai` **273 lần** (1081: 237, 1101/1102: ~63 mỗi cái, lan-proxy: 57).
Đo lại thì đường **UDP/QUIC 1081 tới node-1 bị mạng tại chỗ chặn** —
`connect error: http3: parsing frame failed: timeout: no recent network activity` — trong khi 1101/1102
vẫn ra internet bình thường. Chính sách cũ (2 nhịp lỗi là dựng lại) làm cả gateway rung theo một đường
hỏng, dù TV chỉ cần **một** đường sống.

Sửa trong `gateway-monitor.ps1`:
- Đo egress **một lượt cho cả 3 đường** trước khi quyết định; biết "còn đường nào sống không".
- Còn đường khác sống ⇒ chỉ thử lại đường hỏng sau **10 nhịp** (~10 phút); **không còn đường nào** ⇒
  dựng lại sau **3 nhịp**. Test-LocalNet vẫn chặn trường hợp mất mạng nội bộ.
- Vòng lặp chỉ chạy nhịp 20 s khi **thật sự** có sự cố (thiếu cổng / proxy không ra được / không còn
  đường nào), còn bình thường 60 s.
- Đo sau sửa: **3,5 phút không có lần dựng lại nào**, `ket_noi_TV` vẫn nhận kết nối.
- Đồng thời **vô hiệu hoá bản sao cũ `.tmp\gateway-monitor.ps1`** (đổi tên `*.old-20261024`): chính bản
  này chạy nền suốt 9 giờ và sinh phần lớn số lần dựng lại ở trên.

### 7b. Router mới trong nhà: `FPT_Minh` (Xiaomi AX3000T / model `xiaomi.router.rd03v2`)

- Đăng nhập admin được bằng API: `POST /cgi-bin/luci/api/xqsystem/login` với body
  **form-urlencoded** `username=admin&logtype=2&nonce=<nonce>&password=SHA256(nonce+SHA256(pw+key))`,
  `key = a2ffa5c9be07488bbb04a3a47d3c5f6a`, `nonce = "0_<mac-client>_<unix-time>_<rand>"`;
  trả `{"token": "..."}` (JSON body cùng tham số bị **401 Invalid token** — phải là form).
- Trạng thái đo được: `inited=1` (đã cấu hình), `connect=0` (WAN chưa có internet — chưa cắm dây),
  LAN `192.168.31.1/24`, DHCP cấp `192.168.31.11`.
- Chủ dự án đã đổi: SSID **`FPT_Minh`** + mật khẩu **WPA2** (`abcde12345-` — đã kiểm: kết nối được,
  nhận DHCP), LAN IP **`192.168.100.2`**, **tắt DHCP** ⇒ dùng như **access point**; phải cắm dây
  LAN–LAN (từ SK-D749 vào cổng **LAN** của Xiaomi, **không** dùng cổng WAN).
- Vì vậy `gateway-autostart.ps1` nay coi **`FPT_Minh` và dải `192.168.31.`** cũng là "mạng nhà"
  (tham số `-HomeSsid`/`-HomeSubnet` nhận **danh sách phẩy**), để laptop đổi sang Wi-Fi đó thì gateway
  **không bị tắt** như trước.

