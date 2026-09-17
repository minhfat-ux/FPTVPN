# Triển khai fBuddy lên node-2

Máy đích: **node-2** (`fcnvps2`) — `165.101.114.162`, nơi Caddy đang phục vụ `meetflowai.site` + `t1.meetflowai.site`
và control-plane `flowvpn-cp` (port 7778). fBuddy chạy như một service riêng ở **127.0.0.1:7790**, Caddy làm TLS.

> ⚠️ **Bài học đã trả giá khi thao tác:** SSH thẳng từ máy Windows vào `165.101.114.162` là đúng.
> Nếu `ssh root@103.173.155.50` (node-1) rồi từ đó `ssh root@165.101.114.162`, kết nối **quay lại chính node-1**
> (hostname trả `fcnvpn`, public IP `103.173.155.50`) — mọi lệnh sẽ chạy nhầm máy. Luôn kiểm tra `hostname` trước khi sửa.

## 0. Điều kiện

| Việc | Trạng thái |
|---|---|
| SSH vào node-2 bằng key DSH Windows | ✅ đã có (`dsh-windows-fptvpn`, khớp `~/.ssh/id_ed25519`) |
| Node ≥ 22.5 trên node-2 | ✅ v24.19.0 |
| Cổng 7790 trống | ✅ (7778 = flowvpn-cp, 3080 = harness, 80/443 = Caddy) |
| Dung lượng | ✅ còn ~12G/20G, RAM 961MB (unit giới hạn `MemoryMax=600M`) |
| **Bản ghi DNS `fbuddy.meetflowai.site`** | ❌ **cần tạo — xem bước 2** |

## 1. Build web rồi đẩy lên (từ Windows)

```powershell
cd "C:\Users\Minhn\FlowTech AI\fbuddy"
pwsh -File deploy\deploy.ps1
```

Script làm 6 bước: kiểm tra SSH → `npm --workspace web run build` → đóng gói tarball (bỏ `node_modules`, `data`)
→ `scp` lên `/tmp` → giải nén vào `/opt/fbuddy` + `npm install` cho server (bỏ devDeps) → chạy
`deploy/remote-setup.sh` → kiểm tra `https://fbuddy.meetflowai.site/api/health`.

Tuỳ chọn: `-SkipBuild` (dùng lại `web/dist`), `-SkipDeps` (đã có `server/node_modules` trên VPS).

## 2. DNS (một lần, cần xác nhận của chủ dự án)

Bản ghi cần thêm trong Cloudflare zone `meetflowai.site`:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `fbuddy` | `165.101.114.162` | Proxied (cam) |

Có thể tạo bằng API (token Cloudflare đã có trong drop-in của `flowvpn-cp` trên node-2 **và không bị in ra**):

```bash
# trên node-2 (hoặc copy sang rồi chạy)
bash /opt/fbuddy/deploy/dns-cloudflare.sh            # xem trước (dry-run)
bash /opt/fbuddy/deploy/dns-cloudflare.sh --apply    # ghi thật + chờ HTTP 200
```

Hoặc thêm tay trên Cloudflare Dashboard. **Sau khi bản ghi trỏ đúng, Caddy tự xin cert** — vì hostname mới đã
được thêm vào chính site block trong `/etc/caddy/Caddyfile`.

> Quy luật đã trả giá của hệ thống này: thêm route trong Node là **chưa đủ**; thiếu block Caddy là edge trả 404
> dù Node trả 200. Quên bản ghi DNS là Cloudflare trả **525**.

## 3. Việc `remote-setup.sh` làm trên node-2 (idempotent)

1. Tạo `/opt/fbuddy`, `/var/lib/fbuddy`, `/etc/fbuddy` (700).
2. Sinh `/etc/fbuddy/fbuddy.env` (600) với `FBUDDY_SECRET` random **một lần** — các lần deploy sau giữ nguyên.
3. Cài `/etc/systemd/system/fbuddy.service`, `daemon-reload`, `enable`.
4. Thêm block Caddy cho `fbuddy.meetflowai.site` → `reverse_proxy 127.0.0.1:7790`
   (**backup `.bak-fbuddy-<timestamp>` → `caddy validate` → `reload`; validate fail thì tự khôi phục**).
5. `systemctl restart fbuddy`, chờ service lên, `curl` `/api/health`.

Chạy lại thủ công khi cần:

```bash
ssh root@165.101.114.162
journalctl -u fbuddy -f            # log
systemctl restart fbuddy           # khởi động lại
curl -s http://127.0.0.1:7790/api/health
```

## 4. Kiểm tra sau deploy

```bash
curl -s https://fbuddy.meetflowai.site/api/health   # {"ok":true,...}
curl -sI https://fbuddy.meetflowai.site/            # 200 + text/html
```

Rồi mở trang, nhập email → **lấy mã đăng nhập** (hiện trên màn hình khi chưa có Resend key) → email đầu tiên
là **admin** → vào **Cài đặt** thêm provider (hoặc bật **Demo**) và dán **Resend API key** để gửi mã thật.

## 5. Cập nhật về sau

```powershell
pwsh -File deploy\deploy.ps1 -SkipDeps   # khi không đổi dependency
```

Dữ liệu nằm ở `/var/lib/fbuddy` (SQLite + tệp + artifact) **không** bị ghi đè khi deploy.
Backup: `cp -a /var/lib/fbuddy /root/fbuddy-backup-$(date +%F)`.

## 6. Rollback

```bash
# quay lại Caddyfile trước khi thêm fBuddy
cp -a /etc/caddy/Caddyfile.bak-fbuddy-<timestamp> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
systemctl disable --now fbuddy        # tắt app (dữ liệu vẫn còn ở /var/lib/fbuddy)
```

## 7. Biến môi trường (`/etc/fbuddy/fbuddy.env`, 600)

| Biến | Ý nghĩa |
|---|---|
| `FBUDDY_SECRET` | Ký JWT + mã hoá AES-256-GCM cho API key provider/MCP. **Đổi = mọi key đã lưu không đọc được.** |
| `FBUDDY_PUBLIC_URL` | `https://fbuddy.meetflowai.site` (CORS + cookie `Secure`) |
| `FBUDDY_HOST` / `FBUDDY_PORT` | `127.0.0.1` / `7790` |
| `FBUDDY_DATA_DIR` | `/var/lib/fbuddy` |
| `FBUDDY_RESEND_API_KEY` | (tuỳ chọn) gửi mã đăng nhập; có thể dán trong UI Cài đặt thay vì để đây |
