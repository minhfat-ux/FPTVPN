# VPNFlow Windows 1.4.4 — release notes

> **TRẠNG THÁI: LOCKED** (chủ dự án chốt 22/09/2026: bản Windows đang chạy tốt, giữ máy để test).
> 1.4.4 **không thay đổi chức năng** so với 1.4.3 — chỉ **khớp lại mốc commit build** (xem dưới).
>
> Ngày build: 22/09/2026 · Nền tảng: **windows** · Người build: harness Windows
> Nguồn version: `windows/PrivateVPNWindows.App/PrivateVPNWindows.App.csproj` `<Version>`
> Quy trình: `docs/PUBLISHER_PROCESS.md` §0/§1 · Sổ phát hành: `release/releases.jsonl` (`docs/VERSIONING.md`)

## Vì sao có 1.4.4 (không phải sửa chức năng)

Bản 1.4.3 được build từ **cây làm việc** đang ở HEAD cũ (`7ae07f0`) nên app khai:

```
FileVersion    : 1.4.3
ProductVersion : 1.4.3+7ae07f0a653e1b6168e30c8efe4c36388359a32e   <-- SAI commit
```

trong khi sổ phát hành + tag ghi commit build = `64e07c7`. Đây đúng là mốc trả lời câu
*"bản khách đang chạy build từ mã nguồn nào"* ⇒ phải khớp.

**Không phát lại cùng số 1.4.3 với hash khác** vì `docs/VERSIONING.md` §3.3 quy định *artifact bất biến*
(một cặp `(platform, version)` chỉ ứng với **một** `sha256`; khách đã tải 1.4.3 rồi). Vì vậy tăng lên
**1.4.4**.

## Đã sửa gốc (chống tái diễn)

`windows/installer/build.ps1` nay:
1. **Xác định commit build** (`-Commit`, mặc định `git rev-parse HEAD` trong repo).
2. **DỪNG nếu `windows/` còn thay đổi chưa commit** — không bao giờ build từ cây bẩn nữa.
3. **Nhúng commit tường minh**: `/p:SourceRevisionId=<commit>` + `/p:InformationalVersion=<version>+<commit>`
   (trước đây để SDK tự lấy HEAD ⇒ phụ thuộc trạng thái cây làm việc).
4. **Cổng chặn 3c**: đọc lại `ProductVersion` trong exe và **DỪNG nếu không bằng** `<version>+<commit>`
   (cùng chỗ với cổng `FileVersion` ở 3b).

## Nội dung chức năng

Giống **hoàn toàn** 1.4.3 (chỉ khác hằng số version + chuỗi commit):

- **A7 IPv4** — app Trung Quốc đi đường riêng (`ChinaBypass` + `/dl/routes/cn.txt`, 5.494 prefix).
- **A7 IPv6** — đã **BỎ QUA** theo chốt của chủ dự án (mã vẫn nằm trong bản, vô hại: máy không có IPv6
  thì bỏ qua; máy có IPv6 thì chỉ mở đường cho dải TQ, phần còn lại vẫn chặn).
- **Sửa lỗi nghiêm trọng**: script PowerShell dò gateway chứa dấu `"` bị mất khi truyền `-Command`
  ⇒ máy có **Clash/Mihomo/Tailscale** thêm route loại trừ endpoint qua chính adapter ảo ⇒ vòng lặp,
  tunnel không lên (im lặng). Nay dùng `-EncodedCommand`.

## Bằng chứng đã chạy

| Mục | Kết quả |
|---|---|
| `dotnet test` (Core) | **202 pass / 0 fail** |
| Cổng chặn trước khi phát | **ĐẠT** (version trong artifact 1.4.4; mốc tiến từ 1.4.3) |
| Cổng chặn sau khi phát | **ĐẠT** (đọc version **bên trong** file đang phát) |
| Commit nhúng trong exe | `ProductVersion = 1.4.4+<commit build>` — **khớp** sổ + tag |
| Tải trọn qua CDN | size + sha256 khớp nguồn |

## Còn thiếu bằng chứng (không chặn phát hành)

1. **Ca Clash/Mihomo/Tailscale**: xác nhận tunnel **lên được** (ca lỗi chính của đợt này).
2. **WeChat/Alipay trên IPv4**: đăng nhập + giữ kết nối, **byte tunnel không tăng** (A7).
3. Cài/gỡ trên Windows 10 và Windows 11 sạch.

## Liên quan
- Sửa lỗi + A7 IPv6: `f64b462` · A7 IPv4 + dữ liệu: `2b9173d` / `92f60c9`
- Bản bị lệch mốc: 1.4.3 (`ProductVersion` ghi `7ae07f0`)
- Yêu cầu: `docs/YEU_CAU_TOC_DO_ON_DINH.md` §2d (A7) · Kế hoạch: `docs/DEV_PLAN_IOS_MACOS_TOC_DO.md`
