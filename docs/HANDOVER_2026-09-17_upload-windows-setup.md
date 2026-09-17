# HANDOVER 2026-09-17 — Upload bộ cài Windows lên kênh tải công khai

> **Việc này chạy trên MÁY MAC** (máy có khoá SSH đi node-1 + có `AUTH_TOKEN` admin).
> Máy Windows đã build xong bộ cài nhưng **không có credential SSH** nên không tự đẩy lên được.
>
> Người/agent chạy: đọc hết file này rồi làm tuần tự 6 bước. Không tự ý làm thêm việc khác.

---

## 0. Vì sao cần — trạng thái thật lúc bàn giao (đo trên production 17/09)

| URL | Kết quả | Nghĩa |
|---|---|---|
| `https://api.meetflowai.site/dl/VPNFlow-Setup-latest.exe` | **HTTP 401** `{"error":"Unauthorized"}` | Link trang `/buy` đang trỏ vào **sai host** |
| `https://meetflowai.site/dl/VPNFlow-Setup-latest.exe` | **HTTP 404** | Đúng host nhưng **file chưa được upload** |
| `https://api.meetflowai.site/v1/downloads/android` | HTTP 200, 96.5 MB | Route API thật, host api là đúng cho `/v1/*` |
| `GET /v1/app-version?platform=windows` | `installer_url = https://meetflowai.site/dl/VPNFlow-Setup-latest.exe` | Server đã khai đúng host |

⇒ Nút **"Download for Windows"** trên trang `/buy` hiện **chết với khách**. Cần 2 việc: **(A) upload file**, **(B) sửa link trang buy**.

---

## 1. Ràng buộc

- Chạy đúng các lệnh dưới đây. **Không** sửa code, **không** đổi cấu hình nào khác.
- **Không** in `AUTH_TOKEN`, khoá SSH, hay bất kỳ secret nào ra log/chat/báo cáo.
- Nếu bước verify không khớp (size/sha256) ⇒ **DỪNG**, không phát hành, báo lại.
- Bộ cài hiện **chưa ký số (unsigned)** — khách tải về sẽ gặp cảnh báo SmartScreen. Đây là tình trạng đã biết, không phải lỗi của bước upload.

---

## BƯỚC 0 — Đưa file bộ cài về máy Mac

File đang nằm trên **máy Windows** tại:
`C:\Users\Minhn\FPTVPN\windows\installer\out\VPNFlow-Setup-1.0.0.exe`

**Cách 1 — kéo qua SMB (máy Windows đang bật LanmanServer, IP LAN `10.193.44.107`):**

```bash
mkdir -p /tmp/fptvpn
mount_smbfs "//Minhn@10.193.44.107/C\$" /tmp/fptvpn     # sẽ hỏi mật khẩu tài khoản Windows
cp "/tmp/fptvpn/Users/Minhn/FPTVPN/windows/installer/out/VPNFlow-Setup-1.0.0.exe" /tmp/
umount /tmp/fptvpn
```

**Cách 2 — chép tay** (AirDrop / USB / cloud) rồi đặt file vào `/tmp/VPNFlow-Setup-1.0.0.exe`.

---

## BƯỚC 1 — Kiểm tra file trước khi phát (BẮT BUỘC)

```bash
cd /tmp
ls -l VPNFlow-Setup-1.0.0.exe
shasum -a 256 VPNFlow-Setup-1.0.0.exe
```

Phải khớp **CHÍNH XÁC**:

```
size   : 34859848 bytes
md5    : 495360d8bf51526f441c0aaa0c71a062
sha256 : 37fde1c1a83cc10051e29060bcfac6716b340c395bb694e3e031dfbe29c7169d
```

❌ Lệch size hoặc sha256 ⇒ file hỏng/thiếu (bài học vụ IPA 0 byte) ⇒ **DỪNG, tải lại**.

---

## BƯỚC 2 — Upload lên server bằng script có sẵn

```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN     # hoặc đường dẫn repo trên Mac
git pull                                      # lấy code mới nhất (có commit a5c848c)
scripts/upload-windows-release.sh /tmp/VPNFlow-Setup-1.0.0.exe 1.0.0
```

Script tự làm: đẩy file qua node-1 (`103.173.155.50`) → node-2 (`165.101.114.162`), đặt vào **2 chỗ**:

- `/var/www/dl/VPNFlow-Setup-1.0.0.exe` + `VPNFlow-Setup-latest.exe` (kênh tải theo IP)
- `/var/www/flowvpn/dl/VPNFlow-Setup-1.0.0.exe` + `VPNFlow-Setup-latest.exe` (kênh `/dl/*` của Caddy)

với `chown caddy:caddy` + `chmod 644` (thiếu quyền là Caddy trả 403), rồi **verify size + sha256 tại đích** và thử tải công khai.

Script in ra `XONG.` khi mọi thứ khớp. Nếu script báo `LỖI: size ở đích ... khác nguồn` hoặc `LỖI: link chưa tải được` ⇒ **DỪNG, báo lại**.

---

## BƯỚC 3 — Verify lại từ ngoài như khách

```bash
curl -sS -o /dev/null -w 'http://165.101.114.162/VPNFlow-Setup-latest.exe -> %{http_code} %{size_download}\n' \
  -r 0-1048575 http://165.101.114.162/VPNFlow-Setup-latest.exe

curl -sS -o /dev/null -w 'https://meetflowai.site/dl/VPNFlow-Setup-latest.exe -> %{http_code} %{size_download}\n' \
  -r 0-1048575 https://meetflowai.site/dl/VPNFlow-Setup-latest.exe
```

Mong đợi: **HTTP 200 hoặc 206** ở cả hai. (Trước khi upload, link thứ hai là **404**.)

---

## BƯỚC 4 — Sửa link trên trang `/buy` (không cần deploy)

Hiện link trang buy trỏ `api.meetflowai.site/dl/...` → 401. Sửa bằng API admin:

```bash
TOKEN="$(cat ~/.vpnflow-admin-token)"        # KHÔNG in giá trị này ra
curl -sS -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"installer_url":"https://meetflowai.site/dl/VPNFlow-Setup-latest.exe"}' \
  https://api.meetflowai.site/v1/admin/windows-version
```

Rồi kiểm lại link thật trên trang:

```bash
curl -sS "https://meetflowai.site/buy?lang=en" | grep -o 'https://[^"]*VPNFlow-Setup-latest\.exe' | head -1
```

Mong đợi: `https://meetflowai.site/dl/VPNFlow-Setup-latest.exe` (KHÔNG còn `api.meetflowai.site`).

> Đây là cách chữa cháy. Bản sửa gốc nằm ở commit **`a5c848c`** (`storeLinks()` dùng `siteBaseUrl()`
> cho link `/dl/`) — cần **deploy control-plane** để lần sau không tái diễn. Deploy theo
> `docs/DEVELOPMENT.md` §5b, và theo `docs/MEETFLOW_AI_OPS.md`: chạy `scripts/check-cp-features.mjs`
> trước khi restart, `systemctl restart flowvpn-cp` trên node-2.

---

## BƯỚC 5 — Báo cáo lại (theo mẫu `docs/templates/agentic-project/AGENT_HANDOFF.md`)

Gửi lại tối thiểu:

1. Output thật của `shasum -a 256` ở BƯỚC 1 và của script ở BƯỚC 2 (dán nguyên văn).
2. Mã HTTP + số byte đọc được ở BƯỚC 3 (cả 2 URL).
3. Link rút ra từ trang `/buy` ở BƯỚC 4.
4. Việc **chưa** làm / chưa chắc.

---

## Việc KHÔNG thuộc phạm vi file này

- Sửa code khác, sửa giá/gói, sửa trang buy ngoài `installer_url`.
- Đổi `latest_version` / `minimum_version` — server đang khai `1.0.0`, **khớp** bản này, không cần đổi.
- Dọn peer test `10.77.0.58` (`peer_id b74470e6-ee99-4b0d-a6eb-8a165f4e97e7`, tên `diag-win-test`) tạo lúc
  repro lỗi join-token — cần token admin, có thể dọn luôn ở máy Mac:
  ```bash
  curl -X DELETE -H "Authorization: Bearer $(cat ~/.vpnflow-admin-token)" \
    https://api.meetflowai.site/device/b74470e6-ee99-4b0d-a6eb-8a165f4e97e7
  ```

## Bối cảnh bản cài này

Bộ cài chứa 5 fix của phiên 16–17/09 (đều đã verify trên máy Windows thật):

| Commit | Sửa gì |
|---|---|
| `2b426ad` | Nối nút Connect vào tunnel thật (trước đó báo "Connected" giả), login email-OTP, danh sách server từ `/v1/nodes`, UI nhỏ hơn + cửa sổ giữa màn hình + icon khay hệ thống, log ra `%APPDATA%\VPNFlow\vpnflow.log` |
| `5beefda` | `wireguard-go` thoát exit 1 — bật `SeRestorePrivilege`/`SeTakeOwnershipPrivilege` để mở được UAPI pipe |
| `a66bab7` | Mất mạng sau khi Connect — thêm route loại trừ IP endpoint qua gateway vật lý |
| `7fbee92` | Chặn rò IPv6 (`::/1` + `8000::/1` qua tunnel) |
| `39fa259` | Route idempotent (xoá-rồi-thêm) — hết `The object already exists` |

Bằng chứng E2E: public IP từ 3 nguồn độc lập = `165.101.114.162`; `meetflowai.site/buy` 200;
`gstatic/generate_204` 204; monitor 10 phút 20/20 mẫu giữ đúng IP.
