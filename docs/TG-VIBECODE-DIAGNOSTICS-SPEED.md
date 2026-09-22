# TG /vibecode — "tốc độ download trong Diagnostics chưa đúng, đo ra rất chậm nhưng vẫn xem được Netflix"

> Task sổ: `T-20260922-18` (chép bus #232, owner → win) · người làm: **WIN** · ngày 22/09/2026
> Nguyên văn chủ dự án (bus #232, 13:38:12Z):
> *"có vẻ tốc độ download trong diagnotics đang chưa đúng, đo ra tốc độ rất chậm nhưng anh vẫn xem được netflix"*

## 0. Kết luận ngắn

Số "tốc độ tải xuống" trên thẻ **Diagnostics** **không phải là phép đo sức mạnh đường truyền** —
nó là **lưu lượng đang chảy qua tunnel trong đúng 1 giây vừa rồi** (đồng hồ bị động). Vì vậy:

- Khi **không có gì đang tải qua tunnel** (mở app VPN lên xem là đúng lúc app video đã bị iOS
  treo ở nền ⇒ video ngừng tải) ⇒ số về **rất thấp hoặc `—`**.
- Khi Netflix đang chạy (app Netflix ở tiền cảnh) ⇒ tunnel tải vài–vài chục Mbps bình thường.

Hai điều đó **không mâu thuẫn**: "số trên thẻ thấp" và "Netflix xem được" là hai chuyện khác nhau.
⇒ Chưa có bằng chứng phép tính bị sai đơn vị; cái sai là **ngữ nghĩa của dòng đó so với kỳ vọng
"giống Ookla"** — và §5 (quy trình nghiệm thu) đang dùng đúng con số bị động này làm số nghiệm thu
trên iPhone, nên **quy trình §5 chưa dùng được**.

## 1. Số đó ở đâu ra (đọc từ code, không suy đoán)

Chỉ có **một** chỗ trong toàn bộ sản phẩm hiện có hiện "tốc độ download" trong Diagnostics:

| Bước | Nơi | Nội dung |
|---|---|---|
| 1 | `iOS/PrivateVPN/ContentView.swift:672-716` (origin/main) | thẻ Diagnostics, 8 dòng A10; dòng `diagDown` = `RampStatus.formatRate(report?.downKbps)` |
| 2 | `iOS/PrivateVPN/VPNManager.swift:250-282` | app hỏi extension **mỗi 1 s** (`sendProviderMessage`), gán `liveDiagnostics = report` |
| 3 | `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift:571-590` | `bandwidthStep()` mỗi 1 s: `liveDownKbps = deltaIn * 8 / 1000 / liveDt` |
| 4 | `…/HysteriaPacketTunnelProvider.swift:675-693` | `bandwidthBytes` = bộ đếm byte của **cầu `TunnelBridge`** (`fromGoBytes` = byte tunnel trả về máy); dự phòng: `utunPacketCounters` (`ifi_ibytes`) |
| 5 | `…/HysteriaTransport.swift:976-999` | `pumpLoop()` cộng `fromGoBytes += count - 4` mỗi gói Go→packetFlow |
| 6 | `iOS/PrivateVPNPacketTunnel/RampStatus.swift:107-112` | `formatRate`: `< 1 Mbps` hiện `kbps`, còn lại `Mbps` 1 số thập phân; `nil/0` ⇒ `—` |

Nguồn gốc: commit **`c5d7564`** *"feat(ios): A10 §2g so live tren the Diagnostics + A11 …"*
(REQ-A10-A11, Mac làm 10:12Z hôm nay; WIN đã `verify pass` **trên giấy** và đã ghi rõ hạn chế
*"số live + hành vi ramp trên máy thật chưa được xác nhận"* — nhận xét đó nay đúng là chỗ vỡ).

Bằng chứng "chỉ iOS có": `git grep liveDiagnosticsRows origin/main` ⇒ chỉ `iOS/**`;
`git grep "Mbps\|kbps" origin/main -- mac/` ⇒ **không có** dòng nào trong app macOS; Android
(`ui/MainScreen.kt` DiagnosticsCard) và Windows (`windows/…/Views/MainView.axaml`) cũng chỉ có
State/Location/Message.

### Phép tính — đã soát, **không sai đơn vị**

```
liveDownKbps = Int(Double(deltaIn) * 8 / 1_000 / liveDt)     // deltaIn: byte; ×8 ⇒ bit; /1000 ⇒ kbps
```

- `deltaIn = bytes.inbound - previous.inbound`, `bytes.inbound = counters.fromGoBytes`
  (Go → packetFlow = **chiều xuống**). Không bị lẫn chiều lên/xuống.
- `utunPacketCounters` lấy đúng `ifi_ibytes` (in) / `ifi_obytes` (out), không lẫn.
- `formatRate(kbps)` chia 1000 để ra Mbps ⇒ 40 000 kbps hiện `40.0 Mbps`.
- Điều kiện `liveDt >= 0.5 && liveDt <= 5` chỉ bỏ mẫu khi bộ đếm bị dựng lại (delta âm) — không
  tạo sai số hệ thống.

⇒ Nếu số trên màn hình thấp thì **lưu lượng qua tunnel trong giây đó thật sự thấp**, không phải
lỗi hệ số.

## 2. Vì sao "nhìn thấy số thấp" gần như là **tất yếu** trên điện thoại

Dòng này là **đồng hồ bị động** (đúng chữ §2g: *"delta byte RX của interface TUN mỗi 1 s"*), không
phải phép đo chủ động. Hệ quả trên iPhone/iPad:

1. Muốn **nhìn thấy** số, app VPNFlow phải ở **tiền cảnh**.
2. Ở tiền cảnh ⇒ app video (Netflix/YouTube) bị **iOS treo ở nền** ⇒ **video ngừng tải**.
3. Tunnel lúc đó chỉ còn lưu lượng nền (app tự gọi API, iCloud…) ⇒ `deltaIn` rất nhỏ
   ⇒ màn hình hiện `vài chục kbps` hoặc `—`.
4. Bấm quay lại Netflix ⇒ tunnel lại vài–vài chục Mbps, nhưng lúc đó **không còn nhìn thấy thẻ**.

Nói cách khác: **trên điện thoại, con số này không bao giờ cao trong lúc khách đang nhìn nó** —
trừ khi có một tiến trình tải ở nền (cập nhật App Store, tải file kiểu background…).

Đối chiếu với kỳ vọng: §2g viết *"nhìn chạy live thông số down/up **giống của ookla**"*. Ookla **chủ
động** bơm tải để đo; bản đang chạy **không** bơm gì (cố ý: *"KHÔNG thêm phép đo, không thêm pin"*).
Đây là **khoảng lệch giữa ý định §2g và cách làm §5b-1e**, không phải lỗi số học.

## 3. Hệ quả: quy trình nghiệm thu §5 trên iPhone **chưa dùng được**

`scripts/measure-tunnel.sh` (commit `72a4d63`, P1-3) ghi rõ:

> *"Trên iPhone KHÔNG chạy được script này: lấy số ở thẻ **Diagnostics** của app (A10) và chụp ảnh."*

Với đồng hồ bị động, ảnh chụp đó **không phải** số đo đường truyền ⇒ **không được dùng làm mốc
§5 (≥ 8 Mbps duy trì 10 phút)**. Chủ dự án đang đọc đúng con số đó và kết luận "chưa đúng" — kết
luận của anh **đúng về mặt quy trình**.

## 4. Cách kiểm chứng dứt điểm (1 lệnh, không cần build lại)

Chạy **trên máy Mac** (extension macOS dùng CHUNG `HysteriaPacketTunnelProvider.swift`, cùng ghi ra
`relay.log`), so **số trong log** với **tốc độ thật của curl trong cùng lúc**:

```bash
# (a) bật VPNFlow trên Mac, rồi chạy 1 luồng tải lớn qua tunnel
bash scripts/measure-tunnel.sh --label tunnel --minutes 1        # in Mbps thật từng lượt

# (b) đọc dòng đối chiếu của extension (10 s/lần, CÙNG nguồn số với thẻ Diagnostics)
xcrun devicectl device copy from --device <UDID> \
  --domain-type appDataContainer --domain-identifier com.privatevpn.app.packet-tunnel \
  --source Documents/relay.log --destination /tmp/relay.log
grep -E "bw: sample observed=" /tmp/relay.log | tail -20
```

- Log `bw: sample observed=<đo được> down=<live> up=<live>` (in ở `HysteriaPacketTunnelProvider.swift:631-635`).
- **Dự đoán:** trong lúc (a) đang chạy, `observed`/`down` ≈ số Mbps của (a); lúc rảnh, cả hai ≈ 0.
  ⇒ phép tính đúng, kết luận mục 0 đúng.
- **Nếu ngược lại** (log thấp trong lúc (a) đang tải thật) ⇒ có bug thật trong chuỗi A10 và phải
  soi `TunnelBridge`/`utunPacketCounters` trên máy thật.

## 5. Việc nên làm (chờ chủ dự án chốt hướng)

| # | Hướng | Nội dung | Ai |
|---|---|---|---|
| A | **Sửa nhãn + thêm số có nghĩa** (nhỏ, làm ngay) | Đổi `diagDown/diagUp` thành nhãn nói rõ là lưu lượng hiện tại (vd *"Đang truyền ↓"*), và thêm 1 dòng **"Đỉnh phiên ↓"** (`peakDownKbps` — đã có sẵn trong `BandwidthControl`) để luôn có một con số nói lên sức đường đã đạt | Mac (iOS) |
| B | **Nút "Đo tốc độ"** (đúng ý "giống Ookla") | Bấm ⇒ tải 1 luồng 2–3 MB qua tunnel (chính là kênh dò §2c đã thiết kế), hiện kết quả tại chỗ. Đây là thứ §5 cần để nghiệm thu trên iPhone | Mac (iOS/macOS) — thuộc A6/§2c |
| C | **Sửa quy trình §5** (docs) | iPhone: chỉ đọc số SAU KHI có luồng tải thật đang chạy (hoặc chờ (B)); nếu chưa có (B) thì dùng log `bw: sample observed=` làm số nghiệm thu thay vì ảnh thẻ Diagnostics | owner chốt → Mac/WIN ghi docs |

WIN **không tự sửa** `iOS/**` (vùng của Mac, đang giữ claim; theo `AGENTS.md` §6 phải
`flowvpn-coord check` trước khi đụng file — WIN không có đường SSH sang node-2 từ phiên này).

## 6. Chưa chắc / cần thêm dữ liệu

- **Chưa rõ chủ dự án đọc dòng nào**: `Tốc độ tải xuống ↓` (1 s, bị động) hay
  `Đo được (đường ramp)` (trung bình 10 s, cũng bị động) — cả hai đều tụt khi rảnh, nhưng cần ảnh
  chụp màn hình để chốt.
- **Chưa rõ anh đọc trên máy nào**: origin/main **không có** dòng nào trong app macOS; nếu anh đọc
  được số trên **app Mac** thì Mac đã port A10 sang macOS ở nhánh `mac/hotel-test` (nhánh này
  **không có trên origin** ⇒ WIN không đọc được để soát).
- Nếu số **thấp kể cả lúc đang tải thật** (log ở mục 4 cũng thấp) ⇒ bug thật, phải mở lại việc và
  Mac đo trên máy thật.

## 7. Đã đọc

`scripts/measure-tunnel.sh` · `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2g/§2h/§5 · `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md` (A10/A11, §4.4, §5b-1e) ·
`docs/CLIENT_TELEMETRY_AND_BW_POLICY.md` · `iOS/PrivateVPN/ContentView.swift` · `iOS/PrivateVPN/VPNManager.swift` ·
`iOS/PrivateVPN/Services/ControlAPIClient.swift` (`TunnelStatusReport`) · `iOS/PrivateVPNPacketTunnel/RampStatus.swift` ·
`iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` · `iOS/PrivateVPNPacketTunnel/HysteriaBandwidthControl.swift` ·
`iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift` · `project.yml` (target iOS/macOS) · commit `c5d7564`, `72a4d63`.
