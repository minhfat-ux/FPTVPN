# Bàn giao KEYSTORE RELEASE Android cho Windows (bus-311)

> Ngày: 2026-09-23 · Người giao: harness **MAC** (bus #311 do WIN giao) · Người nhận: harness **WIN**.
> Chủ dự án chốt 23/09: **Windows build + publish cho Windows VÀ Android** (Mac = iOS + macOS).
> Tài liệu này **KHÔNG chứa mật khẩu**. Mật khẩu nằm trong chính file `vpnflow-signing.properties`.

## 0. Kết luận ngắn

- Keystore đã ký bản **Android 1.4.3 / versionCode 29** đang phát là: **`vpnflow-release.jks`**, alias **`vpnflow`**.
- Cert **SHA-256**: `dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46`
  — **khớp đúng** cert mà Windows đọc được từ APK 1.4.3/29 (đã xác nhận ở bus-282).
- Đã đặt 2 file lên **node-1** tại `/root/keystores-incoming/` (thư mục `700`, file `600`).
- Windows: kéo về `C:/Users/Minhn/keystores/` → **verify sha256** → **xóa bản trên node-1** → báo lại qua bus.

## 1. Xác nhận keystore nào đã ký 1.4.3/29

Chạy trên Mac (không in mật khẩu):

```console
$ keytool -list -v -keystore ~/keystores/vpnflow-release.jks -alias vpnflow
Alias name: vpnflow
Owner: CN=Minh Nguyen Binh, OU=VPNFlow, O=VPNFlow, L=Hanoi, ST=Hanoi, C=VN
Valid from: Thu Aug 27 13:15:34 CST 2026 until: Mon Jan 12 13:15:34 CST 2054
         SHA256: DC:6E:48:4B:F8:EF:2E:EA:0D:CD:15:A9:19:2D:82:33:FE:A1:A0:50:68:B8:EE:44:86:CD:C5:3F:45:6B:5E:46
```

⇒ `dc6e484bf8ef2eea0dcd15a9192d8233fea1a05068b8ee4486cdc53f456b5e46` = cert release của 1.4.3/29. **ĐÚNG.**

**Cảnh báo:** `~/keystores/vpnflow-release.keystore` (bản cũ, không có trong tập chuyển) có cert **khác**
(`C7:24:A3:A8:...:9D:E3`). Nếu ký bằng file này thì khách đang cài **KHÔNG update được**. Chỉ dùng
`vpnflow-release.jks`.

## 2. Hai file đã chuyển + sha256 (khớp Mac ↔ node-1)

| File | Bytes | SHA-256 |
|---|---|---|
| `vpnflow-release.jks` | 2746 | `73fbc51a9e088f9ff4c2b99b4a13f6e7f2993d3ea85ae0caa2c29227af9e8411` |
| `vpnflow-signing.properties` | 151 | `3527884439dd47cbd81a26d7f2d571b35db3f478ca79c969acc62aa4e4f86a73` |

Nội dung `vpnflow-signing.properties` có 4 khoá `storeFile` / `storePassword` / `keyAlias` / `keyPassword`.
**Không dán nội dung này vào bus / chat / repo / log.** Giá trị `keyAlias` = `vpnflow`.

## 3. Vị trí trên node-1

- Máy: **node-1** (`fcnvpn`). Vào bằng tailnet `100.76.147.111` (key `~/.ssh/fpt_tunnel`) hoặc
  `103.173.155.50` nếu đường đó thông.
- Thư mục: `/root/keystores-incoming/` — quyền `700`, hai file quyền `600`, chủ `root`.

```console
$ ls -la /root/keystores-incoming/
drwx------ 2 root root 4096 ... .
-rw------- 1 root root 2746 ... vpnflow-release.jks
-rw------- 1 root root  151 ... vpnflow-signing.properties
$ sha256sum /root/keystores-incoming/*
73fbc51a...8411  vpnflow-release.jks        # khớp bảng §2
35278844...6a73  vpnflow-signing.properties # khớp bảng §2
```

## 4. Windows kéo về (rồi xóa bản trên node-1)

```powershell
# 1) tạo thư mục đích
New-Item -ItemType Directory -Force C:\Users\Minhn\keystores | Out-Null

# 2) kéo (dùng khoá SSH mà Windows đang dùng để vào node-1)
scp root@<node-1>:/root/keystores-incoming/vpnflow-release.jks          C:\Users\Minhn\keystores\
scp root@<node-1>:/root/keystores-incoming/vpnflow-signing.properties   C:\Users\Minhn\keystores\

# 3) verify sha256 PHẢI khớp bảng §2 (PowerShell)
Get-FileHash C:\Users\Minhn\keystores\vpnflow-release.jks          -Algorithm SHA256
Get-FileHash C:\Users\Minhn\keystores\vpnflow-signing.properties   -Algorithm SHA256

# 4) xóa bản trung chuyển trên node-1 rồi báo lại qua bus
ssh root@<node-1> "rm -f /root/keystores-incoming/vpnflow-release.jks /root/keystores-incoming/vpnflow-signing.properties; rmdir /root/keystores-incoming 2>/dev/null; ls -la /root/keystores-incoming 2>&1 || true"
```

Nếu sha256 **không khớp**: dừng, không ký, báo lại Mac qua bus để chuyển lại.

## 5. Cấu hình build trên Windows (điểm phải sửa)

`vpnflow-signing.properties` hiện ghi `storeFile` là **đường dẫn Mac**:
`/Users/minhnguyen/keystores/vpnflow-release.jks`. Trên Windows phải sửa thành đường dẫn Windows
(`C:/Users/Minhn/keystores/vpnflow-release.jks`, dùng dấu `/` hoặc escape `\\`) trước khi build.
Giữ `keyAlias=vpnflow`. **Không commit** file properties (đã nằm trong `.gitignore`) và không in ra log CI.

## 6. Backup offline phía Mac

Mac vẫn giữ bản gốc tại `~/keystores/` (quyền `700`) — gồm `vpnflow-release.jks`,
`vpnflow-signing.properties`, `vpnflow-keystore-password.txt`. Không file nào nằm trong git.

## 7. Quy tắc an toàn (đã tuân thủ)

- Không dán mật khẩu / nội dung keystore vào bus, chat, repo hay log — bus #311 chỉ có tên file + sha256 + alias + xác nhận cert.
- node-1 chỉ là **trung chuyển một lần**: Windows kéo xong + verify thì xóa.
- Keystore này là khoá phát hành app đã lên CH Play: mất/lộ = không thể cập nhật app cũ, phải tạo app mới.
