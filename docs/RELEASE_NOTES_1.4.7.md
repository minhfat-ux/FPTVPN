# VPNFlow Windows 1.4.7 — release notes

> Nền tảng: **windows** · Build: harness Windows · Quy trình: `docs/PUBLISHER_PROCESS.md`
> Nguồn version duy nhất: `windows/PrivateVPNWindows.App/PrivateVPNWindows.App.csproj` (`<Version>`)
> Sổ phát hành: `release/releases.jsonl` · Trạng thái: ✅ **ĐÃ PHÁT 24/09/2026** (harness Windows, owner `windows`)
> Commit code của bản vá: **`778cffc`** (`fix(windows): thu lai API 3 vong khi loi transport`)
> ⚠️ **ĐÍNH CHÍNH:** bản đầu của tài liệu này ghi commit `f1ddc41` — đó là **commit trùng KHÔNG nằm trên `origin/main`**
> (cùng patch-id `8bf01180…` với `778cffc`, chỉ `778cffc` được push). Mốc build thật của artifact: **`9330355`** (HEAD lúc build).

> **Đã phát:** Setup `VPNFlow-Setup-1.4.7.exe` · **52.789.147 B** · sha256 `7366003185fcc2fef1d2b838a4108a93b7f6ffbd15b577ab3a4cc29d96b5bfe4`
> · `/buy` → `?v=73660031` · mốc `latest_version=1.4.7` · tag `windows-v1.4.7` → `9330355` · cổng **pre ĐẠT** (chỉ 2 mục chữ ký `KHÔNG ĐẠT`
> theo ngoại lệ) + **post ĐẠT** · `dotnet test` 219/219. Vẫn `NotSigned` — ngoại lệ luật 11 **duyệt riêng cho 1.4.7**.

> ⚠️ **BẢN NÀY CHƯA KÝ SỐ — dự kiến vẫn `NotSigned`.** Luật 11 (`NFR-WIN-002`) yêu cầu bộ cài Windows
> **phải được ký** trước khi publish; máy harness Windows hiện **không có chứng chỉ Authenticode**
> (`Cert:\CurrentUser\My` + `Cert:\LocalMachine\My` với `-CodeSigningCert` đều rỗng).
> ⇒ Cần **ngoại lệ có ghi sổ** như 1.4.5/1.4.6, hoặc **chờ chứng chỉ**. Cổng chặn sẽ báo mục chữ ký
> `KHÔNG ĐẠT` ở chế độ `pre` và `ĐẠT` ở `post`.

## Có gì mới (1 tính năng sửa lỗi)

**Khách Trung Quốc hết lỗi "Không thể kết nối tới máy chủ VPNFlow khi gọi device claim".**

- **Triệu chứng thật:** khách TQ cài bản `1.4.6` báo không kết nối được. Đây là lỗi **trước khi** dựng
  tunnel (app phải gọi API `registration`/`device claim` để lấy token) — **không liên quan** bản vá DNS ở 1.4.6.
- **Gốc lỗi:** `api.meetflowai.site` (Cloudflare) từ mạng TQ **chập chờn**, trong khi app **chỉ thử mỗi host
  đúng MỘT lần** rồi ném `ApiTransportException`.
  Đo trên mạng TQ: 5 lần gọi liên tiếp → **1 lần timeout ~21 s**, 4 lần sau HTTP 200 trong 0,9–1,5 s
  (tỉ lệ hỏng ~20 %). Đã loại trừ DNS/DoH (DoH `1.1.1.1` trả đúng IP) và loại trừ "chặn vĩnh viễn".
- **Cách sửa:** thêm **vòng thử lại tối đa 3 vòng** quanh danh sách host, chờ **500 ms** giữa hai vòng.
  **Chỉ** thử lại khi lỗi **transport**; HTTP 4xx/5xx vẫn trả về ngay ⇒ **không lặp side-effect của POST**
  (không tạo trùng device/token).
  File: `windows/PrivateVPNWindows.Core/Api/ControlApiClient.cs`
  (`SendWithFallbackOnceAsync` giữ nguyên hành vi cũ, `SendWithFallbackAsync` là wrapper 3 vòng).
  4 chỗ gọi cũ không phải sửa.
- **Vì sao 3 vòng:** tỉ lệ hỏng ~20 %/lần ⇒ còn ~0,8 %. Xấu nhất (mạng chết hẳn) tốn thêm
  `2 × (số host × 6 s)` trước khi báo lỗi.

## Kiểm chứng đã có (trên máy harness Windows)

| Kiểm | Kết quả |
|---|---|
| `dotnet test windows/VPNFlow.Windows.sln -c Release` | **Passed: 219 · Failed: 0** (218 cũ + 1 test mới) — chạy lại 24/09/2026 |
| Test mới `FetchNodes_RetriesAgain_WhenEveryHostFailsOnce` | handler hỏng **4 lần đầu** rồi mới trả lời ⇒ **chỉ pass khi có vòng thứ 3** (assert đúng **5** lần gọi) |
| Test cũ `FetchNodes_AllHostsFail_ThrowsTransport` | vẫn pass (hết 3 vòng thì ném `ApiTransportException`) |
| Test cũ `FetchAppVersion_DoesNotFallBack_OnForbidden` | vẫn pass (403 ⇒ không đổi host, không thử lại) |

## CHƯA verify được (nói rõ)

Ca cần đo là **mạng chập chờn lúc tunnel CHƯA lên**. Muốn đo lại phải **tắt tunnel**, mà máy harness đang
có phiên VPN của chủ dự án ⇒ agent **không tự ngắt**. Tỉ lệ hỏng ~20 % là số đo **5 lần** (mẫu nhỏ); con số
"còn ~0,8 %" là **suy ra bằng số học**, không phải đo lại.

**Cách kiểm khi có điều kiện** (tắt VPN rồi chạy 20 lần, đếm số lần fail):
```powershell
1..20 | ForEach-Object { curl.exe -sS -o NUL -w "%{http_code} %{time_total}s`n" -m 25 "https://api.meetflowai.site/v1/app-version?platform=windows" }
```

## Artifact & kênh phát hành

- Route phát: `/dl/VPNFlow-Setup-<version>.exe` · trang khách tải: `/buy` (link có `?v=<sha8>`).
- Sau khi build + upload: chạy cổng chặn **cả 2 chế độ** và **ghi sổ** `release/releases.jsonl` + tạo tag
  `windows-v<version>`, rồi mới set mốc `latest_version`.
- Việc còn lại của publisher: xem `docs/handoff/HANDOFF_PUBLISHER_WINDOWS_1.4.7_2026-09-24.md`.
