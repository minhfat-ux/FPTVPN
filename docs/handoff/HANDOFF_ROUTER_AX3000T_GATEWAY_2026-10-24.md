# HANDOFF — Router AX3000T làm gateway cho TV Xiaomi (chuyển cho harness Windows)

> Chuyển giao 24/10/2026. Lý do: router `192.168.100.2` **chỉ Windows với tới** (Mac ở LAN nhà
> `192.168.100.1`, router nằm sau NAT/khác lớp), nên phần flash + cấu hình do **harness Windows** làm.
> Không chứa secret trong file này.

## 1. Thiết bị & hiện trạng

| Hạng mục | Giá trị |
|---|---|
| Router | Xiaomi **AX3000T**, SSID `FPT_Minh`, mã `RD03` (V1, MediaTek MT7981B) — OpenWrt mainline hỗ trợ |
| LAN hiện tại | `192.168.100.2`, DHCP đã tắt (theo cấu hình của chủ dự án) |
| Truy cập được từ | **Windows `192.168.100.5`** (nối Wi-Fi `FPT_Minh` hoặc IP do router cấp) |
| Không truy cập được từ | Mac `192.168.100.6`, TV `.104` (LAN nhà) |
| Mật khẩu quản trị | **bằng mật khẩu Wi-Fi** — chủ dự án xác nhận; hỏi trực tiếp chủ dự án khi cần |

## 2. Mục tiêu cuối

Router chạy **OpenWrt/ImmortalWrt**, làm gateway cho TV:
- WAN: **DHCP** từ LAN nhà (`192.168.100.x`)
- LAN: `192.168.50.1/24` (mạng riêng cho TV, tránh trùng `192.168.100.x`)
- **sing-box + TPROXY**: mọi traffic của client đi qua tunnel VN, định tuyến theo tên miền:
  - `*.tv360.vn` → **node-3** (`103.6.235.39`, qua `flowvpnrelay` socks `127.0.0.1:1083`)
  - `fptplay.net / fptplay.vn / fpt.vn` → **node-2** (`165.101.114.162`, socks `127.0.0.1:1081`)
  - `youtube.com / googlevideo.com / ytimg.com / ggpht.com / googleapis.com` → node-2
  - còn lại → node-2
- Cho phép LuCI trên WAN để Mac quản trị (rule firewall), hoặc báo lại IP WAN cho Mac.

## 3. Bộ cài đã chuẩn bị sẵn (Mac đang phục vụ qua LAN)

Tải từ: **`http://192.168.100.6:8123/`** (chỉ trong lúc bàn giao; nếu tắt thì lấy lại từ Mac)

| File | Nội dung |
|---|---|
| `flowvpnrelay-linux-arm64` | Binary relay hysteria2 (transport wsrelay) build cho `linux/arm64`, static |
| `node2.json` | Config relay → node-2 (có credential — **không commit, không copy vào repo**) |
| `node3.json` | Config relay → node-3 (có credential) |
| `sing-box-router.json` | Config sing-box: tproxy 7893, socks outbound `127.0.0.1:1081/1083`, rule tên miền |
| `setup.sh` | Script cài trên router: chép binary + config, tạo init.d cho 2 relay, nft TPROXY, bật sing-box |

## 4. Các bước

1. **Flash OpenWrt** (chọn 1):
   - `xmir-patcher` (Python, hỗ trợ RD03): `git clone https://github.com/openwrt-xiaomi/xmir-patcher`, chạy `run.sh`/`run.bat`, chọn model AX3000T (RD03) → bật SSH → flash **factory image**.
   - Hoặc bật SSH bằng exploit web rồi `mtd write` factory image của OpenWrt (xiaomi_ax3000t).
   - Lưu ý: **không dùng image của RD03v2/IPQ5018** cho máy RD03.
2. Cấu hình mạng OpenWrt: WAN DHCP, LAN `192.168.50.1/24`, Wi-Fi (SSID tuỳ chủ dự án).
3. Copy bộ cài sang router (`scp` hoặc dán qua LuCI), chạy:
   ```sh
   sh setup.sh
   ```
4. Kiểm tra trên router:
   ```sh
   /etc/init.d/flowvpnrelay2 start; /etc/init.d/flowvpnrelay3 start
   tail -3 /var/log/flowvpnrelay2.log; tail -3 /var/log/flowvpnrelay3.log   # phải thấy READY
   curl -s -o /dev/null -w "%{http_code}\n" --socks5-hostname 127.0.0.1:1083 https://tv360.vn/
   curl -s -o /dev/null -w "%{http_code}\n" --socks5-hostname 127.0.0.1:1081 https://www.youtube.com/
   ```
5. Nối **TV** vào mạng router (Wi-Fi mới hoặc dây LAN), **xoá proxy** trên TV:
   `adb -s 192.168.100.104:5555 shell settings delete global http_proxy`
6. Nghiệm thu: TV mở **FPT Play** và **TV360**, xem liên tục ≥ 5 phút, không lỗi khu vực, không đứt.

## 5. Nghiệm thu & báo cáo

Báo lại cho Mac qua `flowvpn-notify --from windows --to mac --topic "..."`, kèm:
- IP WAN/LAN của router sau flash
- Kết quả 2 lệnh curl trong mục 4.4 (mã HTTP)
- Log READY của 2 relay
- Ảnh/ghi chú khi TV xem TV360 + FPT Play

## 6. Ghi chú an toàn

- `node2.json` / `node3.json` chứa mật khẩu tunnel: **không** commit vào git, không gửi qua kênh công khai.
- Nếu router không lên OpenWrt, giữ fallback hiện tại: TV dùng proxy `127.0.0.1:18081` (launcher 3.5 route TV360→`.6`, FPT→`.5`).
