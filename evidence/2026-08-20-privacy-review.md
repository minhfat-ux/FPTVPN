# Privacy review — NFR-PRIV-001 / AC-019 — 2026-08-20

Requirement: **NFR-PRIV-001** — *The app MUST NOT log or transmit personal data
beyond what is required for the VPN service* (AC-019: evidence from review).
SRS v0.1, baseline RS-20260819-01.

Scope reviewed:
- iOS: `iOS/PrivateVPN/**/*.swift` + `iOS/PrivateVPNPacketTunnel/**/*.swift`
  (10 files; `Vendor/` excluded — WireGuardKit adapter messages inspected only
  for what the app forwards to its logger)
- Control plane: `control-plane/src/*.js` (4 files) + `control-plane/scripts/wg-dry-run.js`
- Config surfaces: `Info.plist` (app + tunnel), entitlements (app + tunnel), `project.yml`
- Patterns searched: `print|NSLog|Logger(|os_log|debugPrint`, `console.log|error|warn`,
  `URLSession`, `fetch|http|https|createServer`, `SecItem|kSecClass`, `UserDefaults`,
  analytics/telemetry SDKs (firebase/amplitude/mixpanel/sentry/countly/telemetrydeck → 0 hits)

Method: static review of every log site, outbound network call, persistence
surface and permission declaration; each finding assessed against NFR-PRIV-001.

## Findings

| # | Điểm phát hiện (file:line) | Loại dữ liệu | Cần thiết? | Verdict | Khuyến nghị |
|---|------------------------------|--------------|-----------|---------|-------------|
| 1 | iOS `VPNManager.swift:91` — `deviceName: UIDevice.current.name` gửi trong POST /device | Tên thiết bị OS (thường chứa tên thật chủ sở hữu, vd "Minh's iPhone") | KHÔNG bắt buộc — field optional, server đã default `"device"`; chỉ phục vụ FR-ADMIN-001 hiển thị tên | **ISSUE (thấp)** | Không tự động gửi `UIDevice.current.name`. Cho phép người dùng nhập tên hiển thị tùy chọn, hoặc gửi tên chung chung/ẩn danh hóa. Xóa trường khỏi payload nếu không cần. |
| 2 | iOS `ControlAPIClient.swift:68-71` — body POST /device `{publicKey, deviceName}` | WireGuard public key (định danh thiết bị, không bí mật) | CÓ — lõi của FR-DEVICE-001/provisioning | PASS | Giữ nguyên. publicKey là dữ liệu tối thiểu bắt buộc cho đăng ký thiết bị. |
| 3 | iOS `VPNConfigStore.swift:42-44,78` — `controlPlaneToken` lưu **UserDefaults plaintext**, gửi qua header Authorization | Auth token (credential) | Token cần gửi (khi server bật AUTH_TOKEN); nhưng lưu trữ plaintext không bắt buộc | **ISSUE (thấp)** | Chuyển token vào Keychain (`kSecClassGenericPassword`, như keypair WireGuard) thay vì UserDefaults. Liên quan NFR-SEC. |
| 4 | iOS `PacketTunnelProvider.swift:78` — mọi message từ WireGuardAdapter + `error.localizedDescription` log với `privacy: .public` qua os_log | Nội dung log tunnel: endpoint host/IP của server (DNS64 messages), interface, error strings | Log tunnel cần thiết để debug; mức `.public` không bắt buộc | PASS (có khuyến nghị) | Dùng `.private` (hoặc privacy mặc định) cho message động chứa endpoint/error; giữ `.public` chỉ cho chuỗi cố định ("WireGuard tunnel started"). |
| 5 | iOS `KeychainStore.swift:62-77` — private/public key trong Keychain, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, không access group | Private key WireGuard | CÓ — bắt buộc (FR-DEVICE-002, AC-015) | PASS | Đạt chuẩn: private key không rời thiết bị, chỉ app truy cập, không backup ra ngoài. |
| 6 | iOS `Info.plist` (app):23-27 — chỉ `NSAllowsLocalNetworking`; **không yêu cầu quyền riêng tư nào** (location/contacts/photos/Bluetooth/camera...) | Quyền hạn (privacy permissions) | — | PASS | Tối thiểu đúng yêu cầu. `NSAllowsLocalNetworking` cần cho control-plane HTTP local dev; prod phải dùng HTTPS (NFR-SEC-002). |
| 7 | iOS entitlements (app + tunnel) — chỉ `networkextension packet-tunnel-provider`; không `keychain-access-groups` | Quyền hạn | CÓ | PASS | Đúng mức tối thiểu, keychain giới hạn trong app sandbox. |
| 8 | iOS `ContentView.swift:247-297` — diagnostics card hiển thị state/node/VPN IP/last error **trên màn hình**, không log, không gửi đi | Không có dữ liệu rời máy | — | PASS | AC-014 đạt (diagnostics không lộ secret). |
| 9 | iOS `SettingsView.swift:101-103` — hiển thị devicePublicKey on-device | publicKey (không bí mật) | — | PASS | Hiển thị cục bộ, không log/gửi thêm. |
| 10 | iOS toàn bộ — không có SDK analytics/telemetry (grep firebase/amplitude/mixpanel/sentry/countly/telemetrydeck = 0); `project.yml` chỉ dependency WireGuardKit | — | — | PASS | Giữ nguyên; không thêm telemetry SDK. |
| 11 | iOS `VPNManager.swift:154-169` — config WireGuard (gồm `privateKeyBase64`) truyền qua `NETunnelProviderProtocol.providerConfiguration` | Private key (trong NEVPNManager prefs — hệ thống quản lý, keychain-backed) | CÓ — cơ chế bắt buộc của NetworkExtension | PASS | Pattern chuẩn của WireGuard iOS; config không bị log. |
| 12 | iOS `VPNConfigStore.swift:21-41` — UserDefaults còn lại: endpoint, serverPublicKey, tunnelAddress, dns, allowedIPs, locationID, controlPlaneURL | Config không bí mật (public key, endpoint server) | CÓ | PASS | Hợp lý (trừ token — xem #3). |
| 13 | CP `index.js:179-183` — console.log cấu hình khởi động (port, interface, dryRun, pool CIDR) | Cấu hình server | Không bắt buộc nhưng không phải dữ liệu cá nhân | PASS | Giữ nguyên. |
| 14 | CP `index.js:100,137,162` — `console.error(err)` trong catch handler | Error objects; **không log request body** | — | PASS | Tốt: không log body (không lộ publicKey/deviceName/token). Giữ nguyên. |
| 15 | CP `wireguard.js:66` — dry-run log `wg set wg0 peer <PUBKEY> allowed-ips <IP>` (chỉ khi `DRY_RUN=1`) | Public key + assigned IP (định danh thiết bị, không bí mật) | Không bắt buộc | PASS (dev-only) | Chấp nhận được ở chế độ dev (key không bí mật); khuyến nghị không log peer key khi chạy prod / che bớt chuỗi. |
| 16 | CP `device-store.js:46-68` — devices.json lưu `{id, publicKey, deviceName, platform, assignedIP, createdAt, active}` | Registry thiết bị (cần cho FR-DEVICE-001, FR-REVOKE-001/002) | CÓ (trừ `deviceName`) | PASS (có ghi chú) | Việc lưu `deviceName` gắn với ISSUE #1; xem xét retention policy và xóa field nếu không còn dùng. |
| 17 | CP `index.js:120-140` — GET /devices + GET /status trả deviceName/publicKey/IP; **auth chỉ có hiệu lực khi env `AUTH_TOKEN` được set**; nếu rỗng → registry public | Registry thiết bị (tên, public key, IP) | CÓ (FR-ADMIN-001) | **ISSUE (thấp, phụ thuộc NFR-SEC-004)** | Prod bắt buộc đặt `AUTH_TOKEN` / server-side authorization (NFR-SEC-004 đang NOT_STARTED). Hiện tại chỉ an toàn ở môi trường dev. |
| 18 | CP `index.js:29-42,185-196` — TLS: HTTPS khi `TLS_CERT_FILE`+`TLS_KEY_FILE`; HTTP fallback cảnh báo rõ ràng | Transport encryption của dữ liệu truyền (publicKey, deviceName, token) | CÓ (NFR-SEC-002) | PASS | Prod bắt buộc TLS để bảo vệ dữ liệu khi truyền. |
| 19 | CP `wg-dry-run.js:5` — dev script log argv | — | — | PASS | Dev-only, không vào prod path. |

## Kết luận

- **Số điểm rà soát:** 19 (12 iOS + 7 control-plane).
- **ISSUE thật: 3 (đều mức thấp, chưa sửa code — chỉ ghi nhận):**
  1. **#1 — Truyền `UIDevice.current.name`** (tên thiết bị, có thể chứa tên thật) trong POST /device; không bắt buộc cho VPN service.
  2. **#3 — Auth token lưu plaintext trong UserDefaults** thay vì Keychain.
  3. **#17 — Endpoint admin (GET /devices, GET /status) không có auth khi `AUTH_TOKEN` rỗng** — phụ thuộc NFR-SEC-004 (NOT_STARTED).
- **PASS: 16** (một số kèm khuyến nghị giảm bề mặt log: #4, #15).
- Không có telemetry/analytics, không yêu cầu quyền riêng tư thừa, private key không rời thiết bị, không log request body ở control plane.
- **Trạng thái NFR-PRIV-001:** impl vẫn **NOT_STARTED** (chưa có fix); evidence này đáp ứng AC-019. Khuyến nghị xử lý 3 ISSUE trước khi close GATE 6.
