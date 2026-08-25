# FPT Harness — Cài đặt Windows + Expose qua VPS

Bản cài **1-click cho Windows**, mirror đúng kiến trúc bản Mac:

```
Windows
│  DSH 127.0.0.1:3080
│
└── SSH reverse tunnel (OpenSSH built-in, Task Scheduler, port 13081)
          ▼
VPS 127.0.0.1:13081   (không public)
          ▼
nginx gate 127.0.0.1:3082  (auth cookie, dùng chung login 9090)
          ▼
Caddy HTTPS dhs-win.meetflowai.site
```

**Khác bản Mac**: dùng **Task Scheduler** thay launchd; port tunnel **13081** (không đụng 13080 của Mac); domain riêng `dhs-win.meetflowai.site` (có thể đổi). Không cần cài gì thêm — Windows 10/11 có sẵn OpenSSH (`ssh`, `ssh-keygen`).

---

## Cách cài

### Bước 1 — Copy lên máy Windows

**Cách nhanh nhất: dùng file `fpt-harness-windows-bundle.zip` (self-contained, đã đóng sẵn
bên cạnh file này).** Giải nén ra, bên trong có sẵn `patches/`, `profile/`, `vps/` — copy
nguyên folder `windows/` sang máy Windows là chạy được, không thiếu gì:

```text
windows/                      ← giải nén ra thư mục này
├── install-fpt-harness.ps1   ← chạy cái này
├── README-WINDOWS.md
├── patches/                  ← ĐÃ CÓ (theme, logo, favicon)
├── profile/                  ← ĐÃ CÓ (browse-picker)
└── vps/                      ← ĐÃ CÓ (script chạy trên VPS)
```

Hoặc nếu dùng package đầy đủ `fpt-harness-package/`: copy cả thư mục (windows/ + patches/ + profile/ + vps/ cùng cấp — installer tự tìm patches ở cả 2 chỗ).

### Bước 2 — Chạy installer (PowerShell, user thường — KHÔNG cần admin)

```powershell
cd đường-dẫn-có-install-fpt-harness.ps1
powershell -ExecutionPolicy Bypass -File install-fpt-harness.ps1 -VpsIP 103.173.155.50
```

Installer sẽ tự:
1. Cài **Node.js LTS** + **Python 3.12** (qua winget) nếu thiếu
2. Cài **DSH**: `npm install -g @deepseek-ai/dsh`
3. Áp **patch FPT**: theme FlowVPN, logo Culi, favicon, browse-picker (backup `.fpt.bak`)
4. Cài **profile** pin browse picker vào `%USERPROFILE%\.dsh\profiles\web`
5. Tạo **SSH key** `%USERPROFILE%\.ssh\dsh_tunnel` (riêng tunnel)
6. Tạo **Task Scheduler** `FPT-DSH-Server` + `FPT-DSH-Tunnel` (tự chạy khi login)
7. Hỏi **password SSH VPS** 1 lần để cài pubkey lên `authorized_keys`

> Muốn đổi domain/port: `... -Domain dhs-win.meetflowai.site -TunnelPort 13081`

### Bước 3 — Thêm site Windows trên VPS

Sao chép `windows/vps/add-windows-site.sh` lên VPS rồi chạy (root):

```bash
bash add-windows-site.sh dhs-win.meetflowai.site 13081
```

Script sẽ:
- Tạo **nginx gate `127.0.0.1:3082`** → `127.0.0.1:13081` (auth dùng chung login `9090`)
- Thêm **Caddy site** `dhs-win.meetflowai.site` → `3082` (HTTPS tự động)
- Backup Caddyfile `.bak-windows`, validate trước khi reload — an toàn chạy lại

### Bước 4 — DNS

Trỏ **A record**: `dhs-win.meetflowai.site` → IP VPS. (Có thể tạo subdomain trên Cloudflare/hosting provider.)

### Bước 5 — Đăng xuất/đăng nhập Windows (hoặc reboot)

Task Scheduler tự chạy:
- `FPT-DSH-Server` → `dsh web` (DSH local 127.0.0.1:3080)
- `FPT-DSH-Tunnel` → `ssh -R 127.0.0.1:13081:127.0.0.1:3080`

Mở từ mọi thiết bị: **https://dhs-win.meetflowai.site** (login user `dhs` / pass mặc định `fgMR6h53TC5kMmRW`).

---

## Kiểm tra

```powershell
# DSH local
curl http://127.0.0.1:3080/          # 200

# Tunnel process
Get-Process ssh | Select-Object Id, Path

# Task Scheduler
schtasks /query /tn "FPT-DSH-Tunnel"
schtasks /query /tn "FPT-DSH-Server"

# Log tunnel
Get-Content "$env:TEMP\dsh-tunnel.out.log"
```

Trên VPS:

```bash
ss -tlnp | grep 13081    # phải là 127.0.0.1:13081 (KHÔNG public)
curl -I http://127.0.0.1:13081   # phải tới DSH Windows (200)
curl -I https://dhs-win.meetflowai.site   # HTTPS public
```

---

## Failure behavior (giống bản Mac)

| Sự cố | Kết quả |
|---|---|
| DSH Windows chết | Remote DSH mất — không ảnh hưởng gì khác |
| Tunnel chết | Remote DSH mất — Task Scheduler restart sau 1 phút, local DSH vẫn chạy |
| VPS/Nginx chết | Remote DSH mất — local Windows vẫn bình thường |

**Không bao giờ**: sửa proxy Windows, chặn traffic browser, chạy root, mở port public, dynamic port. Đúng nguyên tắc "DSH → SSH tunnel → VPS nginx".

---

## Ghi chú

- **Port 13081** là mặc định cho Windows; nếu anh muốn chạy cả Mac + Windows song song thì giữ nguyên (Mac dùng 13080, Windows 13081).
- Nếu máy Windows có **sẵn OpenSSH** (Windows 10 1809+): không cần cài gì thêm.
- Chạy lại installer bất kỳ lúc nào đều an toàn (idempotent).
- Log Windows: `%TEMP%\dsh-tunnel.out.log`; DSH logs nằm trong `%USERPROFILE%\.dsh\`.
