# Handoff — Windows: khách TQ lỗi "Không thể kết nối tới máy chủ VPNFlow khi gọi device claim"

- **Agent:** worker (owner `windows`)
- **Ngày:** 2026-09-23
- **Trạng thái:** code + test xong (**219/219 pass**), **CHƯA verify được trên máy thật** ở ca mạng chập chờn (xem §5)
- **Người nhận:** COMMITTER (agent chính) · PUBLISHER (kênh Windows)

---

## 1. Triệu chứng

Khách **Trung Quốc** cài app Windows (**bản đang phát: `1.4.6`**, sha256 `1a504534…`) và báo:

> **"Không thể kết nối tới máy chủ VPNFlow khi gọi device claim."**

Đây là lỗi **trước khi** dựng tunnel: app phải gọi API (`device claim`, `registration`) để lấy token
rồi mới dựng được tunnel. Bản vá DNS ở 1.4.6 **không liên quan** (bản vá đó chỉ tác động khi tunnel đã lên).

---

## 2. Gốc lỗi

`api.meetflowai.site` (Cloudflare) từ mạng Trung Quốc **chập chờn**, còn app thì **chỉ thử mỗi host đúng
MỘT lần** rồi ném `ApiTransportException`.

**Bằng chứng đo trên máy harness (mạng TQ, `+0800`), lúc tunnel CHƯA lên:**
```
5 lần gọi liên tiếp https://api.meetflowai.site/v1/app-version?platform=windows
  lần 1: curl: (28) Failed to connect ... after 21234 ms   ← FAIL
  lần 2-5: HTTP 200 (1,4s / 0,9s / 1,5s / 1,4s)
```
**Log app cùng máy, cùng hiện tượng:**
```
18:11:59 [ERROR] connect: thất bại: ApiTransportException: Không thể kết nối tới máy chủ VPNFlow khi gọi registration.
18:12:45 [ERROR] connect: thất bại: ApiTransportException: Không thể kết nối tới máy chủ VPNFlow khi gọi device claim.
```
(Đã loại trừ 2 giả thuyết khác: (a) **DNS/DoH không phải thủ phạm** — DoH `1.1.1.1` trả đúng IP
`104.21.83.112`; (b) **không phải chặn vĩnh viễn** — 4/5 lần sau đó vào bình thường.)

---

## 3. Bản vá

`windows/PrivateVPNWindows.Core/Api/ControlApiClient.cs`:
- Đổi tên hàm cũ `SendWithFallbackAsync` → **`SendWithFallbackOnceAsync`** (giữ nguyên hành vi: thử từng
  host một lần, HTTP 4xx/5xx thì trả về ngay không đổi host).
- Thêm **`SendWithFallbackAsync`** mới = **vòng thử lại tối đa 3 vòng**, mỗi vòng thử hết danh sách host,
  giữa hai vòng chờ **500 ms**. **Chỉ** thử lại khi lỗi **transport** (`ApiTransportException`); HTTP
  4xx/5xx vẫn trả về ngay nên **không lặp side-effect của POST**.
- 4 chỗ gọi cũ không phải sửa (chúng gọi tên `SendWithFallbackAsync` — nay là wrapper).

**Vì sao 3 vòng:** tỉ lệ hỏng đo được ~20%/lần ⇒ 3 vòng còn ~0,8%. Trường hợp xấu nhất (mạng chết hẳn)
tốn thêm `2 × (số host × 6 s)` trước khi báo lỗi.

---

## 4. Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| `dotnet test` | **Passed: 219, Failed: 0** (218 cũ + 1 test mới) |
| Test mới `FetchNodes_RetriesAgain_WhenEveryHostFailsOnce` | handler hỏng **4 lần đầu** (2 host × 2 vòng) rồi mới trả lời ⇒ **chỉ pass khi có vòng thứ 3** (assert đúng 5 lần gọi) |
| `dotnet build` | 0 Warning / 0 Error |
| Test cũ `FetchNodes_AllHostsFail_ThrowsTransport` | vẫn pass (hết 3 vòng thì ném `ApiTransportException`) |
| Test cũ `FetchAppVersion_DoesNotFallBack_OnForbidden` | vẫn pass (403 ⇒ không đổi host, không thử lại) |

---

## 5. CHƯA verify được (nói rõ, không tô hồng)

Ca cần kiểm là **mạng chập chờn lúc tunnel CHƯA lên**. Muốn đo lại phải **tắt tunnel** — mà máy harness
đang có phiên VPN của chủ dự án đang chạy, agent **không tự ngắt**. Vì vậy:
- Tỉ lệ hỏng 20% là số đo **5 lần** (mẫu nhỏ) lấy lúc tunnel tắt; con số "còn ~0,8%" là **suy ra bằng số
  học** từ tỉ lệ đó, không phải đo lại.
- Phép đo 6/6 lần OK sau đó **không dùng được** vì tunnel đã bật (API đi qua tunnel).

**Cách kiểm khi có điều kiện:** tắt VPN → chạy 20 lần liên tiếp lệnh dưới → đếm số lần fail:
```powershell
1..20 | ForEach-Object { curl.exe -sS -o NUL -w "%{http_code} %{time_total}s`n" -m 25 "https://api.meetflowai.site/v1/app-version?platform=windows" }
```

---

## 6. Việc tiếp theo

1. **COMMITTER**: review + commit (worker đã commit local, xem ghi chú ở `git log`) và **push** — nhánh
   của worker đang phân kỳ với `origin/main`.
2. **PUBLISHER**: bản `1.4.6` đã phát nên bản này cần **số mới** (đề xuất `1.4.7` — chủ dự án chốt):
   ```powershell
   powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -Version 1.4.7
   ```
   ⚠️ Vẫn **chưa ký** ⇒ luật 11 vẫn cần ngoại lệ có ghi sổ hoặc chờ chứng chỉ.
3. **Giảm phụ thuộc API trước tunnel** (việc lớn hơn, ngoài phạm vi bản vá này): hiện app buộc phải gọi
   API để lấy token rồi mới dựng tunnel — mạng nào chặn Cloudflare vĩnh viễn thì app không vào được dù
   đã có 3 host dự phòng (host Tailscale `fcnvpn.tail303be3.ts.net` là đường khác hạ tầng, đã có sẵn).
