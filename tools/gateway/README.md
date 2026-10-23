# Gateway VPN — cho TV / thiết bị **không có TUN**

> **Trạng thái:** ĐÃ CHỨNG MINH bằng đo thật trên máy build (20/10/2026). **CHƯA chạy trên box thật** —
> cần 1 thiết bị để nghiệm thu (xem §6).
>
> **Vì sao tồn tại thư mục này:** TV Xiaomi (MiTV-AFZP0, Android 14) có
> `# CONFIG_TUN is not set` trong kernel, `/dev/tun` không tồn tại ⇒ **mọi app dùng `VpnService` đều bất
> khả thi trên máy đó** (đo 19/10/2026: `Builder.establish()` lỗi 45 lần/5 phút, tunnel chưa từng lên —
> xem `docs/ANDROID_CHINA_ROM_TASKS.md` và mục §7 dưới đây).
> Gateway đặt VPN ở **một máy khác** (kernel Linux bình thường có TUN) ⇒ TV không cần cài gì,
> không cần quyền VPN, không cần TUN.

---

## 1. Kiến trúc

```
TV (kernel KHÔNG có TUN, không cài app)
  └─ gateway mặc định → [ GATEWAY BOX: linux arm64 / armv7 ]
        └─ hysteria2 client (auth + obfs salamander + Brutal CC)
              └─ node VN 103.173.155.50:8443 (UDP)
                    └─ internet với IP Việt Nam
```

TV chỉ thấy “gateway của tôi là 192.168.x.y”. Không app, không quyền, không TUN trên TV.

**Vì sao ổn định hơn VPN trên từng máy**

- Không phụ thuộc kernel/ROM của từng thiết bị (TV, đầu Android box, máy console…).
- Không bị ROM kill foreground service, không bị “auto-start”, không bị tối ưu pin.
- Một tunnel dùng chung cho nhiều thiết bị trong nhà ⇒ ít phiên hơn, ít handshake hơn.
- **Không sửa/đóng gói lại app của bên thứ ba** ⇒ hợp pháp như bán router VPN thông thường.

---

## 2. Hai chế độ

| Chế độ | TUN trên gateway | Khi nào dùng |
|---|---|---|
| **A. Tun mode** (khuyến nghị) | **Có** (`/dev/net/tun` + `CONFIG_TUN=y`) | Gateway là mini-PC/Debian/OpenWrt đầy đủ. Mọi app, mọi giao thức (TCP/UDP/ICMP) đi qua tunnel, không phải cấu hình gì trên TV. |
| **B. Proxy mode** (tproxy) | **KHÔNG cần** | Gateway là router firmware khoá TUN. Client chỉ mở SOCKS5/HTTP; gateway dùng `nftables TPROXY` + `redirect` để hút traffic. Phải tự xử lý UDP/QUIC và DNS ⇒ khó hơn, dễ lỗi hơn. |

Kiểm gateway có TUN:

```bash
ls -l /dev/net/tun && echo OK-TUN
zcat /proc/config.gz 2>/dev/null | grep CONFIG_TUN   # CONFIG_TUN=y hoặc =m
```

Không có TUN ⇒ chọn B, hoặc đổi box.

---

## 3. Phần cứng

| Yêu cầu | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | ARM64 4×A53 ≥1.2 GHz (hoặc x86-64) | ARM64 4×A55 / N100 |
| RAM | 512 MB | 1–2 GB |
| Mạng | 100 Mbps | 1 Gbps |
| Nguồn | Ổn định, chạy 24/7 | Có UPS nhỏ nếu bán cho khách |

Ví dụ: GL.iNet MT3000 / Beryl AX, FriendlyElec NanoPi R4S, mini-PC N100.
**Đừng** dùng router ARM cũ (một nhân, RAM 128 MB): hysteria phải làm QUIC + gVisor trong user space cho
từng gói, CPU yếu là trần băng thông ngay.

Băng thông cần cho TV: 2–8 Mbps cho 1 luồng FullHD; 15–25 Mbps cho 4K. Box ở trên đủ sức.

---

## 4. Build binary client

Client chính là **hysteria2 CLI upstream**, build thẳng từ source đang dùng cho app
(`C:\Users\Minhn\hy-src`, `app/main.go`). Không cần sửa gì trong `mobile.go` của Android.

```powershell
# Windows (máy build) — Go 1.27+, CGO_ENABLED=0 để binary tĩnh, chạy được trên mọi Linux
$env:CGO_ENABLED='0'
$env:GOCACHE="$PWD\.tmp\gocache"        # BẮT BUỘC trên máy bị sandbox (ghi cache ngoài workspace sẽ bị chặn)
Push-Location C:\Users\Minhn\hy-src\app
go build -trimpath -ldflags "-s -w" -o <out>\hysteria-windows-amd64.exe .          # để test trên PC
$env:GOOS='linux'; $env:GOARCH='arm64'
go build -trimpath -ldflags "-s -w" -o <out>\hysteria-linux-arm64 .               # gateway ARM64
$env:GOARCH='armv7'
go build -trimpath -ldflags "-s -w" -o <out>\hysteria-linux-armv7 .               # gateway ARM 32-bit
Pop-Location
```

Hoặc dùng `tools/gateway/build-client.ps1` (build cả 4 target vào `\.tmp\gateway\`):

```powershell
pwsh -File tools/gateway/build-client.ps1
```

Kết quả build thật (20/10/2026, Go 1.27.0, `exit=0`):

| Target | size (B) | sha256 |
|---|---:|---|
| `hysteria-linux-arm64` | 21.758.112 | `babb003581d9c109d61a652cd948f4ccc6bbc58028afde271485e6a103d96894` |
| `hysteria-linux-armv7` | 22.282.400 | `46736aaa5ab403fb18b415d01b40cfcf12ec933a1ce88698c4c1cb115127014f` |
| `hysteria-linux-amd64` | 23.609.504 | `6d395cb0acb6ea2ed9629e17a0ea1aca6b071061ec41e23803b46c61593450eb` |
| `hysteria-windows-amd64.exe` | 24.145.920 | `b17cee08d81dfdce36eb0034e74c20f9403d0afd4cd14ae1ca27dc7ab0aa3a0e` |

> Lưu ý: trên máy build bị sandbox, phải để `GOCACHE`/`GOTMPDIR` **trong repo** (script đã làm sẵn);
> cache Go mặc định nằm ngoài workspace nên `go build` sẽ bị từ chối ghi.

---

## 5. Cài trên gateway

### 5.1 Cấu hình

Chép `client-tun.yaml.template` (chế độ A) hoặc `client-proxy.yaml.template` (chế độ B)
→ `/etc/hysteria/client.yaml` và điền 3 giá trị (lấy từ `android/.../Config.kt`
của app, **không** commit giá trị thật vào repo):

- `<SERVER_IP>` — node VN (hiện `103.173.155.50`), cổng `8443/UDP`
- `<AUTH_PASSWORD>` — `Config.HY_PASSWORD`
- `<OBFS_PASSWORD>` — `Config.HY_OBFS`

App dùng **self-signed cert** ⇒ `tls.insecure: true` + `tls.sni = <SERVER_IP>` (đúng như `mobile.go`
đang làm: `ServerName: host`, `InsecureSkipVerify: true`). Sai 2 dòng này là handshake fail.

### 5.2 Chế độ A — tun mode (Debian/Ubuntu mini-PC)

```bash
# 0) TUN phải có
ls -l /dev/net/tun

# 1) binary + config
install -m755 hysteria-linux-arm64 /usr/local/bin/hysteria
install -d /etc/hysteria && install -m600 client.yaml /etc/hysteria/client.yaml

# 2) systemd
cat >/etc/systemd/system/hysteria-gateway.service <<'EOF'
[Unit]
Description=VPNFlow gateway (hysteria2 client, tun)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/hysteria client -c /etc/hysteria/client.yaml
Restart=always
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable --now hysteria-gateway

# 3) NAT: cho LAN đi qua tun0 (đổi eth0 theo tên card LAN)
sysctl -w net.ipv4.ip_forward=1
iptables -t nat -A POSTROUTING -o tun0 -j MASQUERADE
iptables -A FORWARD -i eth0 -o tun0 -j ACCEPT
iptables -A FORWARD -i tun0 -o eth0 -m state --state RELATED,ESTABLISHED -j ACCEPT
```

Chọn hướng cấp cho TV (cách nào cũng được, **TV không phải cấu hình gì** nếu chọn cách 2):

1. **TV trỏ gateway tĩnh** → IP của box. (Nhanh, khách không cần biết gì thêm.)
2. **Box làm router/AP cho TV** → bật `dnsmasq`/DHCP phát `option routers` = box. TV tự đi qua tunnel.

DNS: cho client đi qua tunnel (`dns` trong config) để tránh lộ DNS và tránh CDN trả IP ngoài ý muốn.

### 5.3 Chế độ B — proxy mode (không cần TUN)

```bash
# client chỉ mở SOCKS5 ở localhost (bỏ phần tun trong config)
# nftables: chuyển traffic TCP ra ngoài của TV vào SOCKS5 bằng TPROXY/redirect
# + UDP: TPROXY cho UDP, hoặc chấp nhận fallback TCP (một số app dùng QUIC sẽ chậm/không lên)
```

Chế độ này phải tự xử lý **UDP/QUIC** (FPT Play, YouTube dùng HTTP/3) — nếu không, app có thể treo phát
hoặc tự lùi về TCP. Chỉ dùng khi box buộc phải vậy.

---

## 6. Nghiệm thu (bắt buộc, có bằng chứng)

| # | Kiểm | Cách đo | Đạt khi |
|---|---|---|---|
| 1 | Client nối được node | log client `connected to server {"udpEnabled": true}` | có dòng đó, không lặp lại |
| 2 | **Gói tin thực sự qua node** | log server (node-1) `journalctl -u hysteria -f` khi bật/tắt client | thấy `client connected {"addr": "<ip-gateway>"}` rồi `disconnected` đúng thời điểm |
| 3 | Bằng chứng “chỉ node trả lời được” | qua proxy: `curl -x http://127.0.0.1:8080 http://127.0.0.1:7778/health` | server log ghi `reqAddr: 127.0.0.1:7778` ⇒ đích được dial **trên node** |
| 4 | IP ra ngoài | từ TV/gateway mở `https://api.ipify.org` | ra IP node VN (nếu gateway cùng IP node thì phép đo này vô nghĩa — dùng #2/#3) |
| 5 | Băng thông | `curl -o /dev/null -w '%{speed_download}\n' <file 10-50MB>` qua tunnel | ≥ 2× bitrate nội dung cần xem |
| 6 | Ổn định | xem TV 30 phút liên tục | không giật/không rớt; `journalctl` sạch |

**Đã đo được (20/10/2026, máy build Windows):** #1, #2, #3 **ĐẠT**.
Chi tiết: `client connected {"addr":"103.173.155.50:58923"}` lúc 15:25:47, và 15:26:56 server ghi
`reqAddr":"127.0.0.1:7778","error":"dial tcp4 127.0.0.1:7778: connect: connection refused"`.
Lưu ý phép đo #4 **không dùng được** trên máy này: máy build ra internet **cùng IP với node**
(`103.173.155.50`) nên IP trực tiếp và IP qua tunnel trùng nhau.

---

## 7. Việc còn lại / cảnh báo

1. **PHẢI test nội dung OTT trước khi bán.** IP node là **datacenter VN**; nhiều OTT chặn dải datacenter/VPN.
   Cách test rẻ nhất: bật VPN trên điện thoại → node VN → mở app OTT bằng tài khoản hợp lệ → xem được không.
   Nếu bị chặn ⇒ cần IP residential/ISP VN trước khi đụng tới phần cứng.
2. **Bảo mật — hysteria chưa bật `acl`:** đã đo thấy client có quyền dial **`127.0.0.1` của node**
   (`reqAddr: 127.0.0.1:7778`, log 20/10). Nghĩa là **mọi khách có credential hợp lệ đều chạm được các
   service nội bộ trên node** (control plane admin, guard, wsrelay…). Cần bật `acl` inline chặn
   `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`.
   **Đây là việc của server, không phải gateway** — ưu tiên trước khi phát gateway cho khách.
3. **Brutal CC:** `bandwidth.up/down` trong config là **mức của cả phiên** (hysteria gộp mọi TCP stream
   vào một QUIC session) ⇒ khai sát băng thông thật của đường khách. Khai cao hơn ⇒ nghẽn; khai thấp ⇒
   tự bóp. Khởi điểm thận trọng `20/50 mbps`, đo rồi chỉnh (xem `Config.kt` ghi chú 18/09).
4. **Cập nhật từ xa:** muốn bán “box cấu hình sẵn” thì cần đường cập nhật config (SSH key riêng / agent
   hỏi control plane). Chưa làm — nằm ngoài phạm vi bản này.
5. **Chưa chạy trên box thật.** Mọi bước §5 mới ở mức tài liệu + binary đã build; cần 1 box để đóng dấu
   nghiệm thu #4/#5/#6.

---

## 8. Liên quan

- Vì sao TV không dùng được app VPN: `docs/ANDROID_CHINA_ROM_TASKS.md` (mục T-AND-04 — fail-fast khi
  không tạo được TUN) + `docs/handoff/BUILD_ANDROID_1.4.6_38_2026-10-19.md`.
- Nguồn client: `C:\Users\Minhn\hy-src` (hysteria v2.12.2, dùng chung với AAR Android).
- Node/relay: `docs/EXIT_NODE_RUNBOOK.md`, `docs/SERVER_RECOVERY_RUNBOOK.md`.
