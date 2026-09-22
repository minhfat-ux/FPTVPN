# VPNFlow Windows 1.4.3 — release notes

> **TRẠNG THÁI: LOCKED** — chủ dự án chốt 22/09/2026 (*"bản windows mới cài đang chạy khá tốt, có thể
> lock windows được rồi, đang vẫn cắm để testing"*). Windows **đóng băng ở 1.4.3**: không sửa/không phát
> hành gì thêm cho tới khi có yêu cầu mới. Máy test vẫn được cắm để theo dõi.
>
> Ngày build: 22/09/2026 · Nền tảng: **windows** · Người build: harness Windows
> Nguồn version: `windows/PrivateVPNWindows.App/PrivateVPNWindows.App.csproj` `<Version>`
> Quy trình: `docs/PUBLISHER_PROCESS.md` §0/§1 · Sổ phát hành: `release/releases.jsonl` (`docs/VERSIONING.md`)

## Sửa lỗi

### 1. Máy có Clash / Mihomo / Tailscale: tunnel không lên (lỗi im lặng)
Script PowerShell dò gateway vật lý chứa dấu `"` bên trong, và `ProcessStartInfo.Arguments` với
`-Command "<script>"` làm **PowerShell 5.1 mất dấu `"`** ⇒ script vỡ cú pháp. Đo thật 22/09/2026
bằng đúng cơ chế C# của app:

| | exit | stdout |
|---|---|---|
| script như bản 1.4.2 | `1` | *(rỗng)* — `Expressions are only allowed as the first element of a pipeline` |
| cùng script, bỏ dấu `"` bên trong | `0` | `10.193.44.1\|Wi-Fi` |

**Hậu quả**: `TryGetPhysicalGatewayAsync` luôn trả `null`. Khi default route thuộc **adapter ảo**
(Clash/Mihomo/Tailscale — rất phổ biến), app ghi một dòng WARN rồi dùng **chính gateway adapter ảo**
để thêm route loại trừ endpoint ⇒ **vòng lặp định tuyến, tunnel không lên**. Lỗi im lặng: không có
gì trong log chỉ ra script bị vỡ.

**Cách sửa**: `RunPowerShellAsync` dùng `-EncodedCommand` (Base64 UTF-16LE) ⇒ không còn vấn đề
trích dẫn. Đã chuyển cả 6 chỗ gọi PowerShell trong driver sang helper này. Đã kiểm 2 lệnh
PowerShell còn lại (`RemoveInterface`, `GetDefaultRoute`) là an toàn vì không có `"` bên trong script.

### 2. App Trung Quốc đi đường riêng — bổ sung **IPv6** (A7)
Trước 1.4.3: tunnel chỉ định tuyến IPv4 nên app **chặn IPv6** bằng `::/1 + 8000::/1`; dải IPv6 của
Trung Quốc do đó bị **đen hoàn toàn** (WeChat/Alipay phải chờ fallback IPv4).

Từ 1.4.3: tải thêm `https://meetflowai.site/dl/routes/cn6.txt` (2.015 prefix IPv6, sinh từ APNIC)
và thêm route đi thẳng qua NIC vật lý cho đúng các dải đó. Theo luật **prefix dài nhất thắng**,
chỉ dải TQ đi thẳng; **phần IPv6 còn lại vẫn bị chặn** (không rò IP thật ra ngoài).

Vì sao không đưa `::/0` vào tunnel: **server không có IPv6** (đo 22/09: `curl -6` fail, không default
route, `forwarding=0`) ⇒ tunnel IPv6 sẽ đen hết. Đây là thiết kế đã chốt, không phải thiếu sót.

## Thay đổi kỹ thuật (không thấy trên UI)
- `ChinaBypass`: thêm `DefaultListUrlV6`, `ParseIpv6Cidrs`, `IsValidIpv6Cidr` (chuẩn hoá về địa chỉ
  mạng), `LoadIpv6Async`; tách `ParseList`/`LoadListAsync` dùng chung cho IPv4 + IPv6.
- `WintunWireGuardDriver`: `_chinaBypassRoutesV6`, `ApplyChinaBypassV6Async`,
  `TryGetPhysicalGatewayV6Async`, dọn route IPv6 khi ngắt tunnel; bỏ zone id (`%17`) trong NextHop
  link-local; NextHop `::` = route on-link nên không truyền `-NextHop`.
- Máy **không có IPv6** ra Internet ⇒ bỏ qua hoàn toàn phần bypass IPv6 (không thêm route nào).
- Thêm `scripts/check-china-bypass-ipv6.ps1` để kiểm chứng trên máy có IPv6.

## Bằng chứng đã chạy
- `dotnet test` (Core): **202 pass / 0 fail** (trước 1.4.2: 191) — thêm 19 test IPv6 cho
  `ChinaBypass` + 11 test cho driver.
- Test chống tái phát chạy **thật** `powershell.exe`:
  `RunPowerShellAsync_giu_nguyen_dau_ngoac_kep_trong_script` và
  `Probe_gateway_that_chay_duoc_khong_loi_cu_phap` (cả 2 script, exit 0).
- Dữ liệu IPv6 đã phát: `https://meetflowai.site/dl/routes/cn6.txt` → HTTP 200, 30.353 B,
  sha256 `f17b40be6c4668867a3f6dbb8e2fe838fc1e5f08ace119a3ea225d10a9c7d60e`.
- Kiểm độc lập danh sách: 2.043 dải APNIC CN IPv6 → phủ đủ, **0 dải mất**, **0 prefix bịa**.

## CHƯA kiểm chứng (bắt buộc phải test trước khi coi là xong)
1. **Ca máy có Clash/Mihomo/Tailscale**: xác nhận tunnel **lên được** — đây là ca lỗi CHÍNH của 1.4.3,
   phải test trước tiên.
2. **App Trung Quốc (WeChat/Alipay) trên IPv4**: đăng nhập + giữ kết nối được khi VPN bật, và
   **byte của tunnel KHÔNG tăng** khi chỉ dùng app TQ (tiêu chí A7 — chỉ xét IPv4).
3. Phần cài đặt/gỡ cài đặt trên Windows 10 và Windows 11 sạch.

### IPv6 — BỎ QUA (chủ dự án chốt 22/09/2026: *"bỏ qua ipv6 đã"*)
Phần **A7 IPv6** (dải TQ đi thẳng trên IPv6) **không còn là hạng mục phải kiểm chứng**. Mã đã nằm trong
1.4.3 và **vô hại**: máy không có IPv6 thì bỏ qua hoàn toàn; máy có IPv6 thì chỉ mở đường cho dải TQ,
phần IPv6 còn lại **vẫn bị chặn như trước 1.4.3** (không rò IP thật, không nới lỏng bảo mật).
Vì vậy **không cần phát hành bản mới để gỡ**. Không dùng `scripts/check-china-bypass-ipv6.ps1` nữa
(giữ lại trong repo làm tài liệu, không nằm trong điều kiện phát hành).

## Liên quan
- Commit sửa gốc: `f64b462` (Windows) · dữ liệu: `92f60c9` (`cn6.txt`) · `2b9173d` (`cn.txt`)
- iOS/macOS đã làm tương ứng ở `18f8c82` (bundle `cn.txt`/`cn6.txt` + bịt rò IPv6).
- Yêu cầu: `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2d (A7) · Kế hoạch: `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md` §0b
