# SỰ CỐ 26/09/2026 — server suy giảm, MỌI NỀN TẢNG chết cùng lúc

**Mức độ:** production, ảnh hưởng **toàn bộ khách** (iOS + Android + macOS cùng lúc).
**Xác nhận của chủ dự án:** *"chắc chắn lỗi phía server, vì cả android cũng chết theo cùng lúc"*.

## Bằng chứng đo được (agent Mac, ~21:45)

| Đo | Kết quả |
|---|---|
| 4 relay qua `api`, vòng 1 | `vn1hy=426` · **`vn2hy=000`** · `vn1wg=426` · **`vn2wg=000`** |
| 4 relay qua `api`, vòng 2 (vài giây sau) | `vn1hy=426` · `vn2hy=426` · `vn1wg=426` · **`vn2wg=000`** |
| CP `/v1/health` (2 cửa) | lúc đầu **rỗng**, sau đó **200** — chập chờn |
| `/v1/app-version`, `/install/ios` | 200 |
| SSH node-2 (`165.101.114.162:22`) | **timeout** |
| SSH node-1 (`100.76.147.111:22` qua Tailscale) | **timeout** |

**Cùng một URL, hai lần đo liên tiếp cho hai kết quả khác nhau** ⇒ server **drop gói ngẫu nhiên**, không phải chết hẳn.

## Chữ ký lỗi trên client (giống nhau ở CẢ BA nền tảng)

- **iPad build 55**: `TUNNEL_START_FAILED=0` (không hề fail kết nối) nhưng **32 lần `node sống nhưng KHÔNG chở`** + **21 lần `chiều về im`** ⇒ tự dựng lại transport liên tục, đỉnh **14 lần/giờ lúc 18h**.
- **macOS build 27**: relay `wsOpen=true` nhưng bộ đếm **đóng băng** (`udpFrames=96` không tăng), nhảy relay `vn1hy ↔ vn2hy` liên tục, và **KHÔNG hề có dòng `áp network settings`** ⇒ tunnel chưa từng cài route ⇒ "Connected" mà không có mạng quốc tế.
- **iPhone build 57**: cùng chữ ký.

⇒ **Không phải regression của build nào.** Chứng minh chéo: **Android cũng chết cùng lúc** (khác hoàn toàn mã nguồn).

## Giả thuyết khớp nhất: node bị dội/kiệt tài nguyên

Bàn giao `docs/handoff/HANDOFF_MACOS_1.4.7_RELEASE_2026-09-26.md` §4.4 ghi: node **đang bị brute-force SSH** và phiên trước đã chèn `iptables` (sai thứ tự) để chống. Luật đó **đã bị gỡ** lúc ~20–21h (để mở lại SSH) ⇒ **đợt dội có thể đã quay lại**.

Kiểu "drop ngẫu nhiên + SSH timeout + relay chập chờn + mọi client mất dữ liệu" khớp với **bảng `conntrack` đầy** hoặc **kiệt CPU/tài nguyên**, chứ không phải một dịch vụ cụ thể chết.

## Cần chạy trên console (theo thứ tự)

```bash
uptime ; free -m ; nproc                                  # tải + RAM
cat /proc/sys/net/netfilter/nf_conntrack_count
cat /proc/sys/net/netfilter/nf_conntrack_max              # count/max >= ~90% ⇒ ĐẦY
dmesg | tail -40 | grep -iE "table full|conntrack|nf_"
ss -s                                                     # so ket noi
journalctl -u caddy -n 50 --no-pager | tail -30
systemctl status flowvpn-cp relay-cf-vn1hy relay-cf-vn2hy relay-cf-vn1wg relay-cf-vn2wg --no-pager | grep -E "Active|●"
```

**Nếu `conntrack` đầy:**
```bash
sysctl -w net.netfilter.nf_conntrack_max=262144
echo 'net.netfilter.nf_conntrack_max=262144' >> /etc/sysctl.d/99-flowvpn.conf
# chống brute-force ĐÚNG THỨ TỰ (Tailscale phải được ACCEPT trước):
iptables -I INPUT 1 -i tailscale0 -j ACCEPT
iptables -I INPUT 2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -I INPUT 3 -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --set
iptables -I INPUT 4 -p tcp --dport 22 -m conntrack --ctstate NEW -m recent --update --seconds 60 --hitcount 6 -j DROP
netfilter-persistent save
```
(hoặc dùng `fail2ban` thay vì tự viết luật — ít sai thứ tự hơn)

## Việc kèm theo
1. **Đừng bật VPN trên máy khách** cho tới khi server ổn — bật lên chỉ làm mạng khách khó chịu thêm.
2. **Watchdog §7e.5 hiện CHƯA đủ**: nó chỉ kiểm relay trả `426`, mà lỗi hôm nay là **relay trả 426 nhưng KHÔNG chở gói**. Cần thêm phép kiểm **đường dữ liệu thật** (relay tự đo byte in/out mỗi phút; im ≥2 phút ⇒ báo Telegram).
3. **Poller trên Mac đã bị agent dừng** (`net.flowtech.notify-poller`) để không dội thêm vào SSH — **nhớ bật lại** khi server lành, vì nó cũng là kênh nhận tin từ server.
