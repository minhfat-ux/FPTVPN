# VPNFlow — Windows Client Requirements (FR-WIN-* / NFR-WIN-*)

- **Trạng thái:** DRAFT → **PROPOSED** (CR-0005) — chờ owner duyệt + trả lời Q1–Q6
- **Ngày:** 2026-09-13 (bản v2 — sau review độc lập của worker opencode, đã verify lại từng phát hiện)
- **Nguyên tắc bất biến:** **không fork/không sửa backend** — client Windows dùng lại coordinator production
  `https://api.meetflowai.site` (theo `docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md`).

## 0. Những gì review độc lập đã bắt được và đã sửa trong bản v2

| # | Phát hiện (đã verify lại) | Xử lý trong v2 |
|---|---|---|
| 1 | `/v1/peers/heartbeat` **không tồn tại** trong `control-plane/src` (Android gọi nhưng fail im lặng ở chế độ WG legacy) | Ghi rõ: Windows **không** dùng heartbeat; giữ kết nối bằng reconnect + kiểm tra định kỳ bằng `/v1/devices` (§6) |
| 2 | Prompt cấm UI hiện endpoint IP / public key / token (`FLOWVPN_ANDROID_WINDOWS_PROMPT.md:46-47`) | FR-WIN-010 viết lại: chỉ hiện trạng thái an toàn + tên location + lỗi thân thiện |
| 3 | SRS A7 + ARCHITECTURE + prompt yêu cầu **WireGuardNT** cho Windows, mâu thuẫn với hysteria2 | §7: nêu rõ **đề nghị supersede** (lý do: GFW chặn WG UDP) và xin owner duyệt qua CR-0005 |
| 4 | `/v1/app-version` chỉ trả cấu hình **iOS** (`control-plane/src/index.js:2111`) | §6: yêu cầu backend thêm kênh version theo nền tảng (Windows) trước khi làm auto-update |
| 5 | Thiếu định nghĩa **device key ổn định** cho chế độ hysteria (không có WG key) | FR-WIN-006 bổ sung: sinh + lưu `device_key` ổn định theo bản cài, tên `windows-<short-id>` |
| 6 | Kiến trúc **user-mode app vs privileged service** và DPAPI theo user chưa nêu | §3: mô tả app user-mode + helper có quyền, IPC, token theo user; ghi chú multi-user/RDP |
| 7 | "TUN cần admin đúng 1 lần" chưa chính xác (tạo adapter wintun cần elevation) | NFR-WIN-005 viết lại: installer tạo adapter (elevation một lần), connect không elevate |
| 8 | AC chưa đo được + sai format (repo dùng `AC-NNN`) | §8: AC-024…AC-030 kèm **lệnh PowerShell kiểm chứng** |
| 9 | Thiếu hạng mục: đổi mạng/sleep-resume, DNS/IPv6 leak, revocation, update khi đang Connected, đa ngôn ngữ/paywall/legal | Thêm FR-WIN-012…FR-WIN-016 |
| 10 | Lỗi nhỏ: trỏ sai tên `controls`, registry chưa có dòng AC | Đã sửa (§12) + cập nhật `REQUIREMENTS_REGISTRY.md` |

## 1. Mục tiêu & phạm vi

**Mục tiêu:** client Windows native cho khách Trung Quốc + quốc tế, dùng đúng transport đã kiểm chứng trên Android
(hysteria2 + TCP relay), cùng tài khoản/gói, cùng giới hạn 3 thiết bị, cùng branding/UX.

**Trong phạm vi Phase 1**
- Windows 10 22H2+ và Windows 11, **x64 + arm64**
- Đăng nhập email-OTP; chọn node động từ `/v1/nodes`; một nút Connect/Disconnect (một hành động)
- Transport hysteria2 (UDP 8443/28443/54443 + obfs salamander), **TCP relay dự phòng**, Brutal CC, nhớ transport
- Hai chế độ: **TUN mode** (wintun, toàn bộ traffic) và **proxy mode** (SOCKS5/HTTP cục bộ + system proxy, không cần admin)
- Giới hạn 3 thiết bị qua `/v1/devices/claim` (platform `windows`)
- 5 ngôn ngữ **EN/VI/ZH/JA/KO** (theo SRS A7) + paywall/legal link/one-tap flow tương đương iOS/macOS
- Tray icon, khởi động cùng Windows (tuỳ chọn), auto-update có xác minh SHA256 + Authenticode
- Installer ký code-signing + uninstaller sạch

**Ngoài phạm vi Phase 1 (deferred):** kill switch, split tunneling, WireGuard legacy mode, multi-hop,
Microsoft Store + billing qua Microsoft, Windows Server/LTSC, IPv6-only network.

> ⚠️ Vì **kill switch chưa có**, ứng dụng phải cảnh báo rõ: khi tunnel chết, traffic có thể đi trực tiếp
> (không đảm bảo no-leak) — ghi trong UI/FAQ.

## 2. Kiến trúc đề xuất (§3 chi tiết triển khai)

- **App user-mode** (WinUI 3/WPF) + **privileged helper service** chạy dưới SYSTEM:
  - Helper: tạo/quản lý adapter **wintun**, cài route/DNS, chạy **hysteria2 core**; expose IPC (named pipe, ACL chặt).
  - App: UI, đăng nhập, chọn node, lưu token bằng **DPAPI theo user**, giao tiếp helper qua IPC.
  - Multi-user/RDP: token là per-user (DPAPI), còn tunnel là tài nguyên máy ⇒ quy định "1 user hoạt động tại một thời điểm" (ghi rõ assumption).
- **Transport**: hysteria2 core (Go) + wintun; TCP relay khi UDP bị chặn (framing 2-byte BE — tương thích `tools/node-setup/relay.go`).
- **Thứ tự kết nối (học từ Android)**: tạo socket transport (được protect khỏi tunnel — trên Windows: bind socket ra interface vật lý / route exception) →
  **connect trước**, chỉ khi thành công mới bật route vào tunnel ⇒ transport fail không làm mất mạng của máy.
- **Proxy mode**: local SOCKS5/HTTP chỉ listen `127.0.0.1`, không mở ra LAN (rủi ro open-proxy), set system proxy qua WinINET và **khôi phục khi thoát**.

## 3. Functional requirements

| ID | Requirement | Ghi chú |
|---|---|---|
| FR-WIN-001 | Đăng nhập email-OTP qua `/v1/auth/email/start|verify`; token lưu **DPAPI (per-user)**; không log token | Không plaintext |
| FR-WIN-002 | Danh sách node động từ `/v1/nodes`; hiển thị **tên location** (không hiện IP/key); nhớ lựa chọn | Theo prompt:46-47 |
| FR-WIN-003 | hysteria2 (UDP + obfs) chính, TCP relay dự phòng, Brutal CC (up/down cấu hình), **nhớ transport đã thành công** | Cùng server/credential như Android |
| FR-WIN-004 | **TUN mode**: toàn bộ traffic qua wintun (0.0.0.0/0). **Proxy mode**: SOCKS5/HTTP localhost + system proxy, không admin | Adapter do installer tạo khi cài |
| FR-WIN-005 | Disconnect/exit khôi phục **route + DNS + system proxy**; auto-reconnect backoff; UI phản ánh trạng thái thật (không optimistic) | Kế thừa triết lý `VPNState` |
| FR-WIN-006 | Claim thiết bị: sinh **device_key ổn định theo bản cài** (UUID/khóa lưu DPAPI) + tên `windows-<short-id>`; gặp `403 device_limit_reached` → dialog liệt kê thiết bị, logout thiết bị cũ rồi tự thử lại | Dùng `/v1/devices/claim` |
| FR-WIN-007 | Kiểm tra **revocation** khi connect + mỗi 5 phút (`/v1/devices`); bị thu hồi → ngắt tunnel, yêu cầu đăng nhập lại | Không silent-fail |
| FR-WIN-008 | Auto-update: đọc kênh version theo nền tảng, tải artifact, xác minh **SHA256 + Authenticode**, giữ kênh rollback | Cần backend (§6) |
| FR-WIN-009 | Tray: trạng thái + connect/disconnect + mở cửa sổ + thoát; tuỳ chọn khởi động cùng Windows; đóng cửa sổ = thu xuống tray (không ngắt tunnel) | |
| FR-WIN-010 | Diagnostics **an toàn**: Connected/Disconnected/Connecting/Failed + tên location + lỗi thân thiện + transport đang dùng; **không** hiện coordinator URL/token/endpoint IP/public key/private key | Theo prompt:46-47 |
| FR-WIN-011 | Uninstaller gỡ sạch: adapter wintun + route/DNS/system proxy + dữ liệu cục bộ | |
| FR-WIN-012 | Xử lý **đổi mạng** (Wi-Fi ↔ Ethernet ↔ hotspot), **sleep/resume**, Modern Standby: tự phát hiện và reconnect; không để route treo | Mới (từ review) |
| FR-WIN-013 | **Chống leak DNS/IPv6**: DNS qua tunnel (hoặc DNS của tunnel), tắt IPv6 ra ngoài tunnel nếu không hỗ trợ; kiểm tra DNS leak khi Connected | Mới |
| FR-WIN-014 | **Update khi đang Connected**: thông báo + chỉ cài khi user đồng ý; nếu cài thì ngắt tunnel an toàn rồi khôi phục sau khi update | Mới |
| FR-WIN-015 | Tương đương iOS/macOS: paywall/premium gate, link privacy/terms/support, đăng nhập/đăng xuất, **xoá tài khoản** (`DELETE /v1/account`) | Mới (parity) |
| FR-WIN-016 | Đa ngôn ngữ **EN/VI/ZH/JA/KO** với tên ngôn ngữ đầy đủ + cờ (theo SRS A7) | Mới |

## 4. Non-functional requirements (đo được)

| ID | Requirement | Ngưỡng + cách đo |
|---|---|---|
| NFR-WIN-001 | Hiệu năng | 3× `iperf3 -c <node> -t 30` qua tunnel; **trung vị ≥80%** baseline hysteria CLI cùng máy/node. CPU idle: `Get-Counter '\Process(VPNFlow*)\% Processor Time'` trung bình **<15%/tổng 4 core** |
| NFR-WIN-002 | Bảo mật phát hành | Installer + EXE: `signtool verify /pa` **và** `Get-AuthenticodeSignature` = `Valid` (có timestamp); updater **từ chối** artifact sai SHA256 hoặc sai chữ ký. Không credential trong log |
| NFR-WIN-003 | Không để lại rác hệ thống | Kill tiến trình khi Connected → sau 10s: **không** còn route 0.0.0.0/0 của app, không còn DNS của app, proxy key không đổi |
| NFR-WIN-004 | UX/branding | Vùng nội dung 390±4 × 760±4 DIP; gradient `#051525`→`#0a1f3a`; accent `#33c773`; kèm screenshot làm evidence |
| NFR-WIN-005 | Quyền hệ thống | Proxy mode: integrity Medium (`whoami /groups`), **không** có UAC prompt. TUN mode: elevation **chỉ khi cài/khởi động helper**, reconnect không elevate |

## 5. Acceptance criteria — đánh số theo repo (AC-024…AC-030)

| AC | Requirement | Tiêu chí (đo được) |
|---|---|---|
| AC-024 | FR-WIN-001/002/004 | Sau Connect, cả hai nguồn đều trả IP node: `(Invoke-RestMethod https://api.ipify.org)` và `(Invoke-RestMethod https://ifconfig.me/ip)` (fallback TQ: `https://myip.ipip.net`). PASS = cả hai bằng public IP của node đã chọn |
| AC-025 | FR-WIN-003 | Từ mạng TQ: từ lúc bấm Connect tới HTTPS đầu tiên trong tunnel **≤15s** (`Measure-Command { Invoke-WebRequest https://www.gstatic.com/generate_204 }`). Ép chặn UDP bằng `New-NetFirewallRule -DisplayName block-hy -Direction Outbound -Protocol UDP -RemotePort 8443,28443,54443 -Action Block` → PASS = log ghi `TCP relay` và GET vẫn thành công |
| AC-026 | FR-WIN-005/012 | `Disable-NetAdapter -Name Wi-Fi -Confirm:$false` rồi bật lại → reconnect **≤30s**, và **không** có lúc nào UI hiện Connected trong khi adapter wintun không tồn tại |
| AC-027 | FR-WIN-005/013 | Chụp trước/sau: `Get-NetRoute -DestinationPrefix 0.0.0.0/0`, `Get-DnsClientServerAddress -AddressFamily IPv4`, `netsh winhttp show proxy`, `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'`. PASS = sau Disconnect **giống hệt** trước connect; DNS của app không còn trong danh sách |
| AC-028 | FR-WIN-006 | Seed trước bằng API (3× `POST /v1/devices/claim` với token review); máy Windows là thiết bị thứ 4 → dialog hiện **đúng 3 thiết bị**; logout 1 → connect thành công |
| AC-029 | NFR-WIN-003 | `Stop-Process -Name VPNFlow -Force` khi Connected → sau ≤10s default route khôi phục và `Invoke-WebRequest https://www.msftconnecttest.com/connecttest.txt` trả 200 |
| AC-030 | FR-WIN-008 | `Get-FileHash .\VPNFlowSetup.exe -Algorithm SHA256` trùng giá trị kênh version; `Get-AuthenticodeSignature .\VPNFlowSetup.exe` = `Valid`; sau update `GET /v1/devices` với token cũ vẫn thấy thiết bị (giữ đăng nhập) |

## 6. Thay đổi cần ở backend (coordinator) — **không fork, chỉ thêm**

1. **Kênh version theo nền tảng**: `/v1/app-version` hiện trả cấu hình iOS (`index.js:2111`), `/v1/ai/app-version` trả Android MeetFlowAI.
   Cần thêm dữ liệu cho **Windows** (ví dụ `?platform=windows` → `latest_version`, `minimum_version`, `installer_url`, `sha256`) — dùng `AppConfigStore` sẵn có.
2. **Không dùng heartbeat**: `/v1/peers/heartbeat` không tồn tại; giữ kết nối bằng reconnect + kiểm tra `/v1/devices` định kỳ.
3. **Device claim**: dùng nguyên `/v1/devices/claim` (đã có, đã test) với `platform=windows`; giới hạn 3 thiết bị dùng chung.
4. **Auth hysteria (Q6)**: hiện mọi client dùng chung 1 auth password (nằm trong APK/AAB). Với Windows (file EXE dễ trích xuất), đề xuất **bổ sung auth `userpass` theo user** trước khi phát hành Windows — cần owner quyết.

## 7. Hài hoà với tài liệu hiện có

| Tài liệu | Nội dung hiện tại | Đề xuất |
|---|---|---|
| `docs/SRS.md` A7 (dòng 310) | "Windows … WinUI 3 với **WireGuardNT**/official WireGuard tunnel integration" | **Supersede**: data plane là **hysteria2 core + wintun** (WireGuardNT không có obfs/QUIC nên bị GFW chặn UDP; đã kiểm chứng trên Android). WireGuardNT để dành cho Phase sau/non-China |
| `docs/ARCHITECTURE.md` (dòng 209) | như trên | Cập nhật cùng nội dung khi CR-0005 được ACCEPTED |
| `docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md` | branding, coordinator, `/v1/nodes` động, cửa sổ ~390×760, cấm hiện endpoint IP/key, tên thiết bị `windows-<id>` | Giữ nguyên — spec này bám theo |
| `docs/SRS.md` §3 | "non-iOS clients", "billing/subscriptions" là **out of scope** | CR-0005 đề nghị đưa **Windows client** vào scope; phần billing của Windows vẫn dùng web buy page (không phải Play/Store billing) — ghi rõ trong CR |

## 8. Rủi ro

- **Chưa có code-signing cert** → SmartScreen cảnh báo, mất khách; NFR-WIN-002 không đạt.
- **Wintun + elevation + antivirus** (Windows Firewall/AV chặn wintun/hysteria) → cần runbook cài đặt cụ thể.
- **ARM64**: cần build + ký cho `windows/arm64` (kể cả wintun arm64).
- **Open proxy localhost**: chỉ listen 127.0.0.1, xác thực cục bộ cho SOCKS/HTTP.
- **Không có kill switch** ⇒ không đảm bảo no-leak khi tunnel chết (phải cảnh báo).
- **Modern Standby/fast startup** có thể để lại route/DNS ⇒ NFR-WIN-003 + FR-WIN-012 phải test thật.

## 9. Câu hỏi cần owner quyết (chặn việc code)

| ID | Câu hỏi | Ảnh hưởng |
|---|---|---|
| Q1 | Mặc định **TUN** hay **proxy**? | Kiến trúc, trải nghiệm cài đặt |
| Q2 | Đã có **code-signing cert** chưa? (chưa → mua EV/OV hay tạm chấp nhận SmartScreen) | NFR-WIN-002 |
| Q3 | Phát hành **trực tiếp** hay thêm **Microsoft Store**? | Kênh bán |
| Q4 | Có cần **WireGuard legacy mode** trên Windows? | Khối lượng code |
| Q5 | Hỗ trợ **Windows Server/LTSC** và **IPv6-only**? | Ma trận test |
| Q6 | Cho phép bổ sung **per-user hysteria auth** (userpass) trước khi phát hành Windows? | Bảo mật (không còn mật khẩu chung trong EXE) |

## 10. Lộ trình đề xuất

| Phase | Nội dung | AC liên quan |
|---|---|---|
| P1 | Proxy mode + auth OTP + node list + tray (không admin) | AC-024 (một phần) |
| P2 | TUN mode (wintun) + full-tunnel + reconnect + device claim/limit + revocation + DNS/IPv6 | AC-024/025/026/027/028 |
| P3 | Auto-update (cần backend kênh version) + installer ký + uninstaller + start-with-Windows | AC-029/030 |
| P4 (tuỳ chọn) | Kill switch, split tunneling, Store, WireGuardNT mode | — |

## 11. Truy vết

- CR: **CR-0005** (`docs/REQUIREMENTS_CHANGELOG.md`, PROPOSED)
- Registry: `FR-WIN-001…016`, `NFR-WIN-001…005`, `AC-024…AC-030` trong `docs/REQUIREMENTS_REGISTRY.md`
- Traceability: `docs/REQUIREMENTS_TRACEABILITY.md`
- Nền tảng tái sử dụng: `docs/CHINA_TRANSPORT_ROADMAP.md`, `docs/DEVICE_LIMIT.md`,
  `tools/node-setup/relay.go`, `tools/hysteria-android/README.md`, `control-plane/`
