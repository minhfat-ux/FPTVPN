# Sự cố 2026-09-26 — siết SSH về VPNFlow làm mất SSH của chính mình

## Yêu cầu
> "cơ chế đăng nhập vào VPS chỉ khi dùng chính VPNFlow của mình đăng nhập và ssh nhé!"

## Đã làm
1. Khảo sát (đọc) trước khi đổi: nguồn SSH hợp lệ 14 ngày, không có lần nào đăng nhập bằng **mật khẩu**
   (`Accepted password = 0` ở cả 2 node), sshd node-2 đã tắt password, node-1 thì đang bật.
2. Viết `ops/vpsflow-ssh-lock.sh` (thực tế: `ops/vps-guard/../vpnflow-ssh-lock.sh`) — bảng nft `inet vpnflow_ssh`:
   chỉ `accept` cổng 22 từ danh sách cho phép (loopback + dải client VPNFlow + Tailscale + IP 2 node), còn lại `drop`;
   kèm drop-in sshd `20-vpnflow-only.conf` (chỉ dùng khoá).
3. Bật **timer cứu hộ 10 phút** (`systemd-run --on-active=10min`) trước khi áp, áp lên cả 2 node, thử SSH mới → **thành công**
   trên cả 2 node, rồi **huỷ timer cứu hộ** và cài unit persistent `vpnflow-ssh-lock.service`.

## Hậu quả
- Sau khi cài unit (chạy `apply` lần 2 qua systemd), SSH từ máy Mac **mất hoàn toàn**: `Connection timed out during banner exchange`
  (đường public IP) và `Operation timed out` (đường Tailscale `100.76.147.111`).
- Chẩn đoán loại trừ: `http://165.101.114.162:80` **vẫn 200** qua đúng tunnel đó ⇒ tunnel còn sống, gói tới được node,
  nên thủ phạm là rule cổng 22 (không phải mạng, không phải sshd chết, không phải Caddy).
- Cả 2 node đều bị ⇒ mất luôn đường deploy. Harness WIN + anh Minh đã được báo (Telegram + agent-bus #475).

## Khôi phục (1 dòng, chạy từ bất kỳ máy nào còn vào được)
```bash
ssh -i ~/.ssh/fpt_tunnel root@103.173.155.50  '/usr/local/sbin/vpnflow-ssh-lock.sh rollback'
ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162 '/usr/local/sbin/vpnflow-ssh-lock.sh rollback'
```
`rollback` = xoá bảng `inet vpnflow_ssh`, xoá drop-in `20-vpnflow-only.conf`, `reload ssh` ⇒ SSH mở lại như cũ.
Khi chưa có SSH: mở app VPNFlow trên Mac (kết nối lại) hoặc Tailscale (`Tailscale up`) rồi chạy lệnh trên.

## Nguyên nhân (giả thuyết mạnh nhất, chưa xác minh được từ trong node)
Nguồn thật của Mac không khớp `set allow4` như tính toán — nhiều khả năng gói SSH của Mac **không** đi qua tunnel ở
tầng 4 (app VPNFlow định tuyến riêng cho cổng 22), nên source tại node là IP thật của Mac (ngoài danh sách) ⇒ bị `drop`.
Điều này khớp với: cổng 80 qua tunnel OK, cổng 22 không tới; và tunnel của app không ổn định suốt ngày hôm nay.
Cần xác minh bằng cách **ghi log source IP ngay trên node** (bảng nft tạm có `log prefix`) trước khi bật drop.

## Bài học (đã ghi vào quy trình)
1. **Không huỷ timer cứu hộ** cho tới khi thay đổi đã chạy ổn qua nhiều giờ và đã thử từ **2 đường độc lập**
   (VPNFlow + Tailscale) — lần này em huỷ sau khi thử đúng 1 lần/mỗi node.
2. **Đo từ phía node trước khi chặn**: thêm rule `log` + đếm gói theo từng nguồn, xác nhận đúng IP rồi mới `drop`.
3. Ưu tiên **bind sshd vào địa chỉ VPN** (`ListenAddress 10.77.0.1`, `10.78.0.1`, `127.0.0.1`) thay vì lọc theo source IP:
   không có listener trên `eth0` thì Internet không thể bắt tay TCP, mà cũng không phải đoán danh sách nguồn.
   Đường vào sẽ là `ssh root@10.77.0.1` (node-1) rồi từ node-1 sang node-2 — đúng tinh thần "chỉ qua VPNFlow".
4. **Sửa luôn 1 lỗi phát hiện trong lúc cứu hộ**: `POST /agent-bus/push` nhận `title`/`body`, KHÔNG phải `text`
   ⇒ cảnh báo của guard (và tin cứu hộ đầu tiên) tới harness với nội dung **rỗng**. Guard đã được sửa để gửi đúng schema.
5. Brute-force SSH gộp thành **1 cảnh báo/đợt** (trước đây mỗi IP một tin ⇒ Telegram bị spam).

## Trạng thái mong muốn sau khi khôi phục
- `nft list table inet vpnflow_ssh` = không còn (đã rollback) hoặc được thay bằng phương án `ListenAddress`.
- sshd: `PasswordAuthentication no` (cả 2 node), `PermitRootLogin prohibit-password`.
- Guard vẫn chạy 2 phút/lượt và sẽ báo nếu cổng 22 mở lại ra Internet (bộ luật `ssh-exposure` — sẽ bổ sung).
