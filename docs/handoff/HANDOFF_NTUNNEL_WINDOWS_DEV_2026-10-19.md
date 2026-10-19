# BÀN GIAO — Windows dev: port **N-tunnel (hút băng thông)** sang bản Windows

- **Từ:** harness Windows (bên Android) · **Cho:** dev Windows (`windows/`, `tools/hysteria-relay/`)
- **Ngày:** 19/10/2026
- **Tham chiếu bản đã chạy thật:** iOS `167ba9d` (build 79) · Android `a868ede` + `26e261a`
  (v37/1.4.5) · bàn giao Android: `docs/handoff/HANDOFF_ANDROID_NTUNNEL_WINDOWS_2026-10-19.md`
- **Yêu cầu gốc:** `docs/handoff/HANDOFF_ANDROID_NTUNNEL_WINDOWS_2026-10-20.md` (commit `80052c1`)

## 0. Vì sao (đo thật, không phải phỏng đoán)

Mạng dùng chung giới hạn tốc độ **theo TỪNG KẾT NỐI**: 19/10/2026 đo 3 lần trên cùng mạng —
1 luồng **4–12 Mbps**, 4 luồng 17–29, **8 luồng 72–81 Mbps**
(`docs/RESEARCH_SHARED_NETWORK_BANDWIDTH_2026-10-19.md`). App chỉ mở **một** tunnel ⇒ trần thực tế
~12 Mbps; nâng số khai không vượt được trần đó.

## 1. ĐỪNG NHẦM với cơ chế `transport.links` đã có

`tools/hysteria-relay` đã có **multipath**: `transport.links` mở N **WebSocket** song song và rải
**từng datagram** của **MỘT** kết nối QUIC lên đó (`wsrelay.go` → `MultiConn`, `mode` =
`roundrobin|sizehash|burst`; README `tools/hysteria-relay/README.md` §Multipath, mục 129–198).
Đo trên máy thật: **multipath chậm hơn ~4 lần** so với 1 link ⇒ hiện **chưa bật ở app nào**.

| | `transport.links` (đã có) | **N-tunnel (bàn giao này)** |
|---|---|---|
| Số kết nối | 1 QUIC, N WebSocket | **N QUIC**, mỗi cái tự có congestion control |
| Chia gì | chia **gói** của một luồng | chia **LUỒNG** (mỗi luồng đi trọn một tunnel) |
| Vượt được giới hạn nào | chặng Cloudflare↔node | **giới hạn theo từng kết nối của nhà mạng** |
| Rủi ro | đảo thứ tự gói (QUIC chịu được) | không đảo thứ tự TCP bên trong |

⇒ N-tunnel **không thay** multipath; hai thứ độc lập. Nếu bật cả hai thì số socket =
`tunnels × links` — đặt **trần tổng** (khuyến nghị ≤ 8) để không mở hàng chục WS.

## 2. Việc phải làm (theo file)

### 2a. `tools/hysteria-relay/runner.go` (phần chính)
1. `config`: thêm `Tunnels int \`json:"tunnels"\`` — **không khai / ≤0 = 1** (hành vi cũ y nguyên),
   kẹp `1..8`.
2. `serve()`: thay vì 1 client, dựng **N client**:
   - Mỗi client dùng `newClient(cfg)` như hiện tại (mỗi client tự có `wsFactory`/`links`/obfs riêng)
     — **cùng `server` + cùng `transport.url`** cho tất cả (bất biến F3: khác node ⇒ IP khách đổi
     giữa phiên ⇒ hỏng đăng nhập/thanh toán).
   - Bọc N client trong một wrapper kiểu `multiClient` implement đủ `client.Client`:
     `TCP(addr)`/`UDP()` chọn client theo **vòng tròn** (`atomic.AddUint32`), `Close()` đóng **mọi**
     client. Chia theo **luồng**, **không** chia theo gói.
   - Đưa wrapper đó vào TUN (`tun.go` đang nhận `client.Client` ⇒ không phải sửa nếu là interface).
3. **Số khai**: `upKbps/downKbps` trong config là số **MỘT luồng**. Với N>1, mỗi client phải nhận
   `perLane` (= số hiện tại) và **số khai hiệu dụng = perLane × N**; log rõ con số này
   (`n-tunnel: N=4 khai up=… down=… (đã ×N)`). Bên iOS/Android đều nhân ×N — không nhân thì Brutal
   bị khoá ở mức một luồng, bật N không nhanh hơn.
4. **Log/đo**: thêm dòng `[flowvpnrelay] n-tunnel: i/N sẵn sàng` khi từng tunnel lên, và tổng byte của
   **mọi** client (xem bẫy 4). Mọi thứ app đọc để hiện tốc độ phải là **số tổng**.

### 2b. `tools/hysteria-relay/tun.go`
- Chỉ cần nhận `client.Client` (interface) đúng như hiện tại. **Một** TUN, **một** vòng serve.

### 2c. C# — bật/tắt và truyền N
| file | việc |
|---|---|
| `windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayDefaults.cs` | thêm `DefaultTunnels = 1`, `MaxTunnels = 8`, `TunnelsChoices = {2,4,6,8}` (kẹp `1..8`, mặc định **TẮT**) |
| `windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayTunnel.cs` | `StartAsync(...)` nhận thêm `tunnels`; ghi `"tunnels": N` vào `flowvpnrelay.json` (cùng chỗ đang ghi `server/relayUrl/upKbps/downKbps`) |
| `windows/PrivateVPNWindows.App/ViewModels/AppSettings.cs` | lưu lựa chọn (khoá RIÊNG của Windows, đừng dùng chung khoá iOS/Android); mặc định 1 |
| `windows/PrivateVPNWindows.App/Views/SettingsView.axaml` | mục **“Tăng tốc”**: công tắc + chọn 2/4/6/8 + ghi chú “áp dụng ở lần kết nối sau” (giống iOS/Android) |

## 3. Ba (thực ra năm) bẫy — đều đã xảy ra thật

1. **Quên tunnel chính khi bọc wrapper** (lỗi thật iOS 19/10): bản đầu chỉ lấy các tunnel phụ khi
   `len>1` ⇒ với N=4 mất tunnel chính. Danh sách phải là **1 chính + (N−1) phụ**.
2. **`nil` client khi `Stop()` chen giữa `Connect()` và lúc ghi vào danh sách** (Android đã vá): ghi
   `nil` vào danh sách ⇒ nil-deref lúc chọn luồng. Kiểm `client != nil` trước khi thêm, trả lỗi nếu không.
3. **Số khai bị ghi đè về số một luồng** (lỗi thật Android, log `up=2081 down=6938` dù N=4): nếu app
   có nhịp "refresh bandwidth khi đổi mạng", nó sẽ ghi đè biến cấu hình — chốt số đã nhân vào biến cục
   bộ và gán lại **ngay trước** mỗi lần connect.
4. **Bộ đếm byte chỉ đọc một client/cầu** ⇒ Diagnostics báo thiếu đúng N lần và ramp tưởng mạng yếu
   rồi hạ số khai oan (lỗi thật Android, đã sửa). Cộng **mọi** client.
5. **Trần tổng socket**: `tunnels × links`; đặt trần và log số kết nối thực mở.

## 4. Nghiệm thu (phải có log thật, không "chắc là chạy")

1. **N=1 (hoặc không khai `tunnels`)**: hành vi + log **y hệt** bản đang phát (không thêm kết nối nào).
2. **N=4**: log có `n-tunnel: 1/4…4/4 sẵn sàng`; trên server/relay thấy **4 handshake** cùng một node;
   `tunnel UP`; và trên mạng bị giới hạn theo kết nối, tốc độ tải tăng theo bậc (mốc: 1 luồng
   4–12 Mbps, 8 luồng 72–81 Mbps). Không tăng ⇒ trần nằm ở relay/WS phía server, báo lại để xử lý server.
3. Tắt công tắc ⇒ lần kết nối sau về đúng 1 tunnel (không rò socket cũ: đếm kết nối trước/sau).
4. Rollback = không khai `tunnels` (mặc định 1) ⇒ bản phát hành cũ chạy y nguyên, không cần gỡ.

## 5. Việc cần chủ dự án quyết

1. Mặc định **TẮT** (như iOS/Android) hay bật sẵn 2?
2. Có chờ đo trên mạng TQ rồi mới phát, hay phát ngay kèm công tắc tắt?
3. Ai chịu trách nhiệm đo mức tăng trên máy khách (cần 1 máy ở mạng bị giới hạn theo kết nối).
