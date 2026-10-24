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

## 7. CẬP NHẬT 24/10 — máy là **RD03v2 (IPQ5018)**, chủ dự án chốt **phương án B**

Windows đọc firmware: `hardware=RD03v2, model=xiaomi.router.rd03v2, romversion=2.0.28`
⇒ **không dùng** image mainline RD03 (sẽ brick). Chỉ có port community:
`https://github.com/ADCDS/openwrt-xiaomi-ax3000t-rd03v2` (release v2.0.2), cài bằng xmir-patcher
fork nhánh `connect8-connect9` theo `RD03v2-INSTALL.md`. Vật tư cứu hộ: `recovery.bin >= 2.0.28`.

**Quyết định:** flash bản community, nhưng chạy **bản GON** vì RAM chỉ ~175 MB (~30 MB trống):
- **1 relay** (node-2, socks `127.0.0.1:1081`) + **sing-box** TPROXY (socks outbound) — KHÔNG chạy relay node-3.
- Hệ quả chấp nhận: **TV360 đi node-2** (chậm hơn ~10 s/phản hồi, đủ để dùng; không còn route node-3).
- Nếu RAM không đủ: bỏ `mixed-in`, chỉ TPROXY; tắt Wi-Fi 2.4G nếu không dùng.

**Bộ cài GON:** `http://192.168.100.6:8124/` (node2.json, flowvpnrelay-linux-arm64,
sing-box-single.json, setup.sh). Sau flash: `sh setup.sh`.

**Nghiệm thu:** `curl --socks5-hostname 127.0.0.1:1081 https://www.youtube.com/` = 200;
`free -m` còn >10 MB trống; TV xem YouTube/FPT Play ≥5 phút; TV360 chấp nhận chậm hơn.

**Rollback:** nếu flash lỗi → recovery.bin 2.0.28 qua TFTP; nếu không thiết lập được thì TV quay lại
proxy launcher (`127.0.0.1:18081` — điện thoại `.101` đang là gateway nhanh nhất).

## 8. Cập nhật từ harness Windows (24/10/2026 tối) — ĐỌC TRƯỚC KHI LÀM

**1. Router này KHÔNG phải RD03 v1.** Đọc từ chính firmware: `hardware=RD03v2`, `model=xiaomi.router.rd03v2`, `romversion=2.0.28` (RD03 v1 chạy 1.0.x) ⇒ **Qualcomm IPQ5018**, OpenWrt mainline KHÔNG hỗ trợ. Đừng dùng image RD03/MT7981. Đường đúng: `ADCDS/openwrt-xiaomi-ax3000t-rd03v2` (release v2.0.2) + patcher fork `ADCDS/xmir-patcher` nhánh `connect8-connect9` (`RD03v2-INSTALL.md`).

**2. Router GIỜ TRUY CẬP ĐƯỢC TỪ MẠNG NHÀ** (khác mục 1 của handoff cũ): đã cắm dây từ SK-D749 sang router; cổng tự nhận **WAN** ⇒ nó xin DHCP và có IP **WAN `192.168.100.9`** (động, cấp bởi SK-D749 `.1`; muốn cố định thì đặt DHCP reservation cho MAC `50:92:6a:70:4d:fb`). LAN nội bộ vẫn là `192.168.100.2` — **trùng dải với WAN**, cấu hình xấu, là lý do chính phải cài OpenWrt với LAN `192.168.50.1`.
Vào quản trị: `http://192.168.100.9/` (từ mạng nhà) hoặc `http://192.168.100.2/` (nối Wi-Fi `FPT_Minh`). Wi-Fi `FPT_Minh` / `abcde12345-`; mật khẩu web admin cũng là `abcde12345-` — đã kiểm bằng login API thật: POST **form-urlencoded** `username=admin&logtype=2&nonce=...&password=SHA256(nonce+SHA256(pw+key))` với `key=a2ffa5c9be07488bbb04a3a47d3c5f6a`, `nonce=0_<mac-client>_<unix>_<rand>` ⇒ **200 + token**.

**3. Chỗ patcher gốc bị kẹt (đã tìm ra):** `connect.py`/`install_fw.py` tạo `Gateway(detect_ssh=True)` ⇒ chết vì chưa có SSH; `detect_device()` không thấy model vì UI mới (Vue) không còn chuỗi `hardware = '...'`. Đã vá tạm ở `.tmp\xmir-patcher`: (a) fallback đọc `hardware`/`romversion` từ `init_info` ⇒ nhận `RD03V2`, `model_id=109`; (b) regex `nonce_key` từ `(.*)` → `(.*?)`.
**Lỗi cuối còn lại:** `web_login()` của patcher trả `401 not auth` dù cùng mật khẩu, trong khi login form-urlencoded tự viết (mục 2) trả **200** ⇒ thay `web_login()` bằng hàm đã chứng minh chạy đúng (hoặc tự login lấy `stok` rồi gán `gw.stok`) trước khi gọi `connect9`/`install_fw`.

**4. Đồ nghề đã chuẩn bị:** `.tmp\router-fw\` có `initramfs-factory-wifi.ubi` + `squashfs-sysupgrade.bin` + `sha256sums.txt` (đã đối chiếu khớp). Dùng bản **-wifi** để cài không cần dây: nó phát `OpenWrt-RD03v2-Installer` (WPA2, `rd03v2install`) khi chạy trong RAM.
`node-2:/root/rd03v2/sysupgrade-fptminh.bin` = ảnh sysupgrade **đã nhồi sẵn** Wi-Fi `FPT_Minh` + LAN `192.168.50.1` qua `/etc/uci-defaults/99-fptminh` (hệ thống OpenWrt mặc định bật lên với Wi-Fi TẮT) — sha256 `cfb9eddac5735ab6fe616252ab4a6a180c8139a465c4babb4b0f70bbc61ee20d`.

**5. Cảnh báo an toàn (từ lần chạy thử):** đường `cab_meshd sync config` của patcher **ghi đè mật khẩu admin web** (trường `web_passwd256`) ⇒ chủ dự án từng mất quyền vào router. Chỉ dùng `connect9` khi đã có phiên admin thật. Reset: giữ nút Reset ~8-10 s tới khi đèn nháy cam.

## 9. Chốt 24/10/2026 (chủ dự án) — chuyển TV sang mạng router **sau khi** flash xong

- Mac đang flash (báo cáo 19:07: router vẫn stock `2.0.28` tại `192.168.50.1`, chưa flash).
- **Điều kiện chuyển TV**: chỉ chuyển khi router đã chạy OpenWrt **và** gateway đã nghiệm thu
  (`curl --socks5 127.0.0.1:1081 https://www.youtube.com/` = 200 + `free -m` còn >10 MB).
  Chuyển sớm là TV mất mạng (LAN `.50.x` không với tới gateway `.100.x`).
- Khi chuyển: TV sang Wi-Fi của router (hoặc cắm dây LAN), rồi **xoá proxy cũ**
  (`adb shell settings delete global http_proxy`) + mở app VPNFlow một lần để nó tự dò lại.
- Guard TV (bản 1.1, commit `e8141d15`) giờ chọn gateway theo **thông lượng thật**
  (2 lần đo/2 kết nối, điểm = min, nhảy khi nhanh hơn ≥1.5×) và quét LAN `/24` nên IP động không
  còn là vấn đề.
