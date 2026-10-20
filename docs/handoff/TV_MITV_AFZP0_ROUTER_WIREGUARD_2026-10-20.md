# Hướng dẫn: VPN mức ROUTER cho TV `MiTV-AFZP0` (WireGuard → VPS1)

> Mục đích: đưa **toàn bộ** traffic của TV (kể cả đường phát video/DRM mà app không phủ được)
> đi qua IP Việt Nam của VPS1, nhờ vậy FPT Play phát được và không phụ thuộc việc ROM kill app.

## 1. Vì sao cần router (tóm tắt bằng chứng)

TV này **không có TUN** (kernel thiếu `CONFIG_TUN`) nên VPNFlow chạy chế độ **proxy hệ thống**.
Proxy chỉ phủ những app dùng HTTP stack của Java; đường **phát video + license DRM** của FPT Play
dùng socket native nên **đi thẳng**, lệch IP với phiên đăng nhập ⇒ FPT Play trả `RD_002` khi bấm
vào phim. Router WireGuard phủ **mọi gói tin** ở tầng IP nên không còn lệch.

## 2. Thông số đã tạo sẵn trên VPS1 (20/10/2026)

```
Server      : 103.173.155.50:443/UDP        (wg0, đang active)
Server pub  : N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=
Mạng VPN    : 10.77.0.0/24   (server = 10.77.0.1)
Peer TV     : public Sm78z/9DSbslZjoQyKujywE7ssv2vsvsNQIPpvBHzX0=
              IP     10.77.0.60/32
File cấu hình client (BÍ MẬT, KHÔNG commit):
  C:\Users\Minhn\VPNFlow-tv\wg-router-tv.conf
```

Máy chủ đã được cấu hình:

```
/etc/wireguard/wg0.conf    (đã backup: wg0.conf.bak-<thời điểm>)
peer mới thêm bằng: wg set wg0 peer <pub> allowed-ips 10.77.0.60/32
```

Thu hồi sau này (nếu cần):

```bash
ssh root@103.173.155.50
wg set wg0 peer Sm78z/9DSbslZjoQyKujywE7ssv2vsvsNQIPpvBHzX0= remove
# và xoá khối [Peer] tương ứng trong /etc/wireguard/wg0.conf
```

## 3. Cài trên router GL.iNet (khuyến nghị, ~10 phút)

Router cắm điện, **không cần cắm dây**: dùng chế độ Repeater để nối vào Wi-Fi tòa nhà, rồi phát
Wi-Fi riêng cho TV.

1. Nối máy tính/điện thoại vào Wi-Fi của router → mở `http://192.168.8.1`.
2. **Internet** → **Repeater** → chọn Wi-Fi tòa nhà (`KT-617`) → nhập mật khẩu → Apply.
3. **VPN** → **WireGuard Client** → **Add Manually** (hoặc upload file `.conf`):
   - dán nguyên nội dung `wg-router-tv.conf` ở mục 2 (hoặc upload chính file đó),
   - bấm **Apply/Connect**, đợi trạng thái **Connected**.
4. **Network → LAN**: giữ Wi-Fi phát của router (ví dụ `VPNFLOW-TV`), mật khẩu tự đặt.
5. Trên TV: Cài đặt → Mạng → nối vào `VPNFLOW-TV`.

Kiểm tra: trên TV mở bất kỳ trang xem IP (hoặc app), IP phải là **103.173.155.50**.

## 4. Cài trên OpenWrt (nếu dùng router OpenWrt sẵn có)

```sh
opkg update && opkg install wireguard-tools kmod-wireguard luci-proto-wireguard
# tạo interface wg0 từ file cấu hình
uci set network.wg0=interface
uci set network.wg0.proto='wireguard'
uci set network.wg0.private_key='<PrivateKey trong wg-router-tv.conf>'
uci add_list network.wg0.addresses='10.77.0.60/32'
uci set network.wgpeer=wireguard_wg0
uci set network.wgpeer.public_key='N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8='
uci set network.wgpeer.allowed_ips='0.0.0.0/0'
uci set network.wgpeer.endpoint_host='103.173.155.50'
uci set network.wgpeer.endpoint_port='443'
uci set network.wgpeer.persistent_keepalive='25'
uci set network.wgpeer.route_allowed_ips='1'
uci commit network && /etc/init.d/network restart
```

## 5. Sau khi TV đi qua router — cần làm gì trên TV

1. **Tắt proxy hệ thống** để không đi hai lớp: trong app VPNFlow bấm Disconnect, hoặc:
   ```
   adb shell settings put global http_proxy :0
   ```
2. (Tuỳ chọn) Gỡ app VPNFlow khỏi TV cũng được — router đã lo toàn bộ; giữ lại cũng không sao
   miễn là app **không** đặt proxy hệ thống.
3. Mở FPT Play → chọn phim → phải phát bình thường (không còn `RD_002`).

## 6. Nghiệm thu (dán số thật vào đây khi làm xong)

```
# trên router
wg show                      → latest handshake <…>s ago, transfer > 0
# trên TV (qua router)
IP thoát = 103.173.155.50
FPT Play: <tên phim> phát OK, độ phân giải <…>, đo tốc độ <…> Mbps
```

Nếu tốc độ vẫn thấp: WireGuard thường nhanh hơn WS-over-Cloudflare, nhưng trần cuối cùng vẫn là
đường ra quốc tế của mạng tòa nhà (đo 20/10/2026: 34-40 Mbps direct, 0,04-4 Mbps qua tunnel).
