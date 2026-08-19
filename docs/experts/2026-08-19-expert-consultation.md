# Expert Consultation — PrivateVPN (2026-08-19)

> Deliverable của session `task_20260819_0195` (hermes -z 62787).
> Mục đích: cung cấp expert guidance TRƯỚC khi assign coding agent làm tiếp
> các task PrivateVPN — đúng yêu cầu của Minh: "trong các dự án, em cần dùng
> expert để assign cho agent code tiếp".

## Cơ chế (REAL pipeline, không fake)

- ExpertRegistry + ExpertRuntime (`runtime/culi/experts/`) + BrainRouter
- Provider: `deepseek_chat` (deepseek-chat, base https://api.deepseek.com,
  key từ keychain `com.culi.brain` account `deepseek`)
- Lưu ý kỹ thuật: `deepseek-v4-flash` trả content RỖNG với structured_schema +
  prompt dài → dùng `deepseek_chat` cho consultation (verified bằng test cô lập).
- Findings gốc: `/tmp/expert_findings.json` (đầy đủ, chưa cắt)

## Expert 1 — UI/UX Design Expert (`ui_ux_design_expert`)

Status: completed · Confidence: 0.0 (không có evidence sources — hạ theo
`require_evidence` policy; nội dung vẫn là guidance thực chất)

### Khuyến nghị: 4 màn hình (GATE 5 MVP UX & Diagnostics)

Nguyên tắc: tối giản, native SwiftUI (NavigationStack/List/Form/Toggle),
dark mode theo system, accessibility ≥17pt.

1. **ConnectView** (`Views/ConnectView.swift`, thay ContentView làm root):
   - Trung tâm: trạng thái VPN (icon, server name, IP), nút circle 80x80
     bật/tắt, timer kết nối (`TimelineView` iOS 16+)
   - Dưới: nút "Server" mở location list, nút "Settings" (gear)
   - Sửa `PrivateVPNApp.swift` set root
   - AC: đúng trạng thái connected/disconnected/connecting; nút gọi
     ControlAPIClient; timer chạy khi connected; dark mode đúng
2. **ServerListView** (`Views/ServerListView.swift`):
   - `List` + row: tên server, country/city, latency, checkmark cho server chọn
   - Sửa `VPNLocation.swift`: thêm latency + `Identifiable`
   - AC: list từ VPNLocation; chọn server cập nhật config + quay lại main;
     checkmark đúng
3. **SettingsView** (sửa file hiện tại):
   - `Form` sections: General (auto-connect, launch at login), Connection
     (kill switch + cảnh báo), About (version)
   - State: `@AppStorage`/UserDefaults
   - AC: toggle lưu được; kill switch có cảnh báo
4. **DiagnosticsView** (`Views/DiagnosticsView.swift`):
   - Sections: Log (text view), Latency (ping), Packet stats (sent/received)
   - AC: log cập nhật realtime; số liệu từ VPNManager

Thứ tự implement: 1 → 2 → 3 → 4.

## Expert 2 — Software Architecture Expert (`software_architecture`)

Status: completed · Confidence: 0.85 · Evidence: 3 sources (GATE 0-3 status,
iOS layering, blockers)

### (1) Thứ tự ưu tiên GATE 4-5-6 dưới blockers

**GATE 4 → GATE 5 → GATE 6 → GATE 7** (GATE 7 blocked tới khi có device).
- GATE 4 (Auth & Revocation) làm NGAY: chủ yếu backend, test được trong
  DRY_RUN mode không cần device.
- GATE 5 (UX & Diagnostics): phần không cần device (state handling, logging)
  làm song song.
- GATE 6 (Security Review): đan xen với GATE 4 (auth/revocation là code
  nhạy cảm bảo mật), formal review sau GATE 4+5 code xong, trước GATE 7.

### (2) Rủi ro kiến trúc phải xử lý trước GATE 4

- **Token storage/lifecycle**: Keychain bắt buộc (UserDefaults = critical
  vulnerability); thiết kế token manager + refresh/expiry rõ ràng.
- **Revocation**: control-plane phải hỗ trợ revoke ngay (blacklist/short-lived
  token + refresh); client không được dùng cached credentials sau revoke.
- **Auth handshake**: GATE 3 đang dùng static keypair → GATE 4 cần
  challenge-response chống replay/MITM.
- **Control-plane security**: `devices.json` plain file dễ tamper → HTTPS,
  auth cho admin endpoints, bảo vệ file/DB.
- **Error handling**: VPNManager/PacketTunnelProvider phải xử lý auth failure
  graceful (show error, retry), không crash tunnel.
- **Separation of concerns**: auth logic cô lập trong Services/, không trùng
  lặp (testability).

### (3) Việc làm ngay không cần device thật

1. GATE 4 backend: auth endpoints, token generation, revocation (Node.js,
   DRY_RUN + unit tests)
2. iOS TokenManager: Keychain-based storage + refresh (unit-testable)
3. UI state handling + mock VPNManager (simulator)
4. Diagnostics logging framework (simulator)
5. Security review prep: threat model + checklist GATE 6
6. Integration tests control-plane (in-memory DB, auth + revocation flows)

## Khuyến nghị assign agent (cho session kế tiếp / agent nhận task)

- **Ngay lập tức (không cần device)**: GATE 4 backend + iOS TokenManager
  (Keychain) + integration tests control-plane.
- **UI/UX**: theo Expert 1, thứ tự 1→2→3→4 (nếu session song song đang code
  UI, KHÔNG chạy build song song — build database lock
  `database is locked` đã xảy ra 2026-08-19 21:2x, DerivedData
  PrivateVPN-egzpokvgamzvdyarfhpyihytonur).
- Agent phải đọc `.privatevpn/memory/` (PROJECT_STATE, CURRENT_WORK,
  DECISIONS, VERIFIED_FACTS) trước khi nhận task (convention Culi).
