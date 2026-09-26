# Kiểm tra & báo publisher — Windows 1.4.4 (2026-09-22)

> ⚠️ **TÀI LIỆU ĐÃ CŨ — đọc kèm phần "Cập nhật 23/09" ở cuối trước khi dùng.**
> Bản 1.4.4 mô tả ở đây **không còn là bản đang phát**. Trạng thái thật lúc cập nhật (23/09/2026):
> mốc Windows đang phát là **1.4.5** (`/v1/app-version?platform=windows` → `latest_version=1.4.5`,
> `VPNFlow-Setup-1.4.5.exe?v=d6db58cb`, đã ghi sổ + tag `windows-v1.4.5`), và có **1.4.6 hotfix DNS
> đang chờ committer** (`HANDOFF_WINDOWS_1.4.6_DNS_HOTFIX_2026-09-23.md`).

- **Người kiểm**: DSH main agent (owner `windows`)
- **Yêu cầu**: "check bản Windows đã commit hết chưa, ok rồi thì báo publisher cho release bản mới lên các link buy"
- **Kết luận**: ✅ **Windows đã commit hết.** ✅ **Bản 1.4.4 ĐÃ được publisher phát lên link buy — không cần báo lại.**

## 1. Windows đã commit hết chưa? — RỒI

| Nội dung | Trạng thái |
|---|---|
| Source Windows (`windows/**`) | ✅ đã commit + push; `git status --porcelain -- windows/` **sạch** |
| `<Version>` trong csproj | ✅ `1.4.4` (khớp GitHub) |
| Commit build | ✅ `8466b18` (tag `windows-v1.4.4`) |
| Sổ phát hành | ✅ `release/releases.jsonl` có dòng publish 1.4.4 + dòng tag |
| Ghi sổ tài liệu | ✅ `docs/PUBLISHER_PROCESS.md` §6 + `docs/RELEASE_NOTES_1.4.4.md` |

Lưu ý kẻo hiểu nhầm: cây làm việc local **có hiện** `git status` báo 7 file trong `windows/**` là "sửa",
nhưng **cả 7 đều trùng khít blob trên GitHub** (`git hash-object` == `git rev-parse origin/main:<path>`).
Đây là rác do cơ chế restore ảnh chụp cũ ghi ra, không phải việc chưa commit. HEAD local (`7ae07f0`)
đang **lùi 20 commit** so với GitHub nên mới hiện như vậy.

## 2. Link khách tải — ĐÃ phát 1.4.4 (đo trên production, không chỉ đọc docs)

```
GET https://api.meetflowai.site/v1/app-version?platform=windows
{
  "latest_version": "1.4.4",
  "installer_url":  "https://meetflowai.site/dl/VPNFlow-Setup-1.4.4.exe?v=d9956056",
  "install_page_url": "https://t1.meetflowai.site/buy"
}

HEAD https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.4.exe      → HTTP 200 · 52.792.515 B
HEAD https://meetflowai.site/dl/VPNFlow-Setup-1.4.4.exe         → HTTP 200 · 52.792.515 B

GET  https://t1.meetflowai.site/buy  (trang khách bấm)
     → link Windows trên trang: VPNFlow-Setup-1.4.4.exe?v=d9956056
```

Số liệu khớp với sổ đăng ký (`size=52.792.515`, `sha256=d9956056…ae1be`, `/buy` trỏ `?v=d9956056`,
`marker_latest=1.4.4`) và cổng chặn đã **pre ĐẠT + post ĐẠT**.

## 3. Vì sao KHÔNG cần báo publisher lần nữa

Publisher **đã phát xong rồi**, bằng chứng nằm trong repo:

- `5d64ecf release(windows): phat 1.4.4 (khop moc commit) + ghi so + nhat ky` (22/09 18:14) — sửa
  `PUBLISHER_PROCESS.md` §6, `RELEASE_NOTES_1.4.4.md`, `releases.jsonl` (2 dòng: publish + tag).
- `docs/PUBLISHER_PROCESS.md` §6 ghi rõ 1.4.4: 🔒 LOCKED, setup 52.792.515 B · sha256 `d9956056…` ·
  `/buy` trỏ `?v=d9956056` · mốc `latest_version=1.4.4` · cổng pre/post ĐẠT · `dotnet test` 202/202.
- Bảng việc chung: `flowvpn-coord list` → **không ai đang giữ claim** (không có việc release đang treo).

Nếu em báo publisher "phát 1.4.4" lúc này là **báo trùng việc đã xong**, có nguy cơ khiến họ phát lại
cùng số 1.4.4 với hash khác — đúng thứ `docs/VERSIONING.md` §3.3 cấm (artifact bất biến).

## 4. Việc còn lại (không chặn release)

1. **1.4.4 không đổi chức năng** so với 1.4.3 (chốt của chủ dự án: chỉ khớp lại mốc commit build;
   `git diff 64e07c7..8466b18 -- windows` chỉ khác `<Version>` + `build.ps1`, không file `.cs` nào).
   ⇒ Chưa thấy bằng chứng nào về **email thông báo khách** cho 1.4.3/1.4.4 trong repo. Nếu muốn báo
   khách thì cần chủ dự án chốt (bản không đổi chức năng thường không cần làm phiền khách).
2. **HEAD local lùi 20 commit + 2 commit local chưa push** (`e7ab923`, `7ae07f0` — cơ chế versioning +
   sổ phát hành). Cần đồng bộ trước khi làm việc git tiếp, nếu không rất dễ commit thiếu ngữ cảnh.
3. `minimum_version` của Windows vẫn `1.0.0` ⇒ khách bản cũ **không bị ép** cập nhật (đúng như thiết kế).

## 5. Cập nhật 23/09/2026 — những dòng ở trên đã hết đúng

Tài liệu này viết lúc `main = 660d9c2`. Sau đó repo đi tiếp rất nhanh, nên **đừng dùng §1–§4 làm
trạng thái hiện tại**. Đối chiếu lại:

| Viết trong tài liệu | Thực tế 23/09/2026 |
|---|---|
| Windows đang phát **1.4.4** | **1.4.5** — `/v1/app-version?platform=windows` → `latest_version=1.4.5`, `VPNFlow-Setup-1.4.5.exe?v=d6db58cb`; sổ có dòng `publish v1.4.5` + tag `windows-v1.4.5` |
| §1 `<Version>` csproj = 1.4.4 | vẫn `1.4.4` (1.4.5 phát theo **ngoại lệ chữ ký** chủ dự án chốt 23/09, xem `HANDOFF_WINDOWS_KY_SO_2026-09-23.md`) |
| §4.2 "HEAD local lùi 20 commit + 2 commit chưa push" | **đã hết**: HEAD đã đồng bộ `main`; 2 commit local (`e7ab923`, `7ae07f0`) hoá ra là **bản cũ của cơ chế versioning đã có trên GitHub** (sổ 5 dòng vs 18 dòng) ⇒ đã bỏ, không mất gì |
| §4 chưa nhắc chữ ký số | **1.4.5 phát CHƯA KÝ** (ngoại lệ); máy Windows harness **không có cert ký số** (`Cert:\CurrentUser\My` + `Cert:\LocalMachine\My` với `-CodeSigningCert` đều rỗng) ⇒ `NFR-WIN-002` chưa đạt |

### Việc đang treo tại 23/09 (nguồn: các handoff mới hơn)

1. **Windows 1.4.6 — hotfix DNS khách TQ**: 4 commit **LOCAL chưa lên `origin/main`** (`e5f999c`,
   `f7ffbe2`, `a3ea7c9` + handoff), worker đã verify trên máy thật mạng TQ, **đang chờ COMMITTER**
   tích hợp. Chỉ 2 file code: `SingBoxConfigBuilder.cs` + test.
2. **Android đã phát tới 1.4.4 (code32)** — `release/releases.jsonl` có dòng `1.4.3 code29` (06:28) rồi
   `1.4.4 code32` (09:01); `/v1/app-version?platform=android` → `latest_version=1.4.4`. Nghĩa là fix
   MTU 1300 + 2 resolver (`38a3e6f`) **đã tới tay khách**, không còn là việc treo.
3. **Chứng chỉ ký số Windows** vẫn là việc của chủ dự án (nạp cert/HSM) — không tự làm được.

