# Handoff → PUBLISHER: Windows 1.4.7 (API retry cho khách Trung Quốc) — 24/09/2026

- **Từ:** COMMITTER (DSH main agent, owner `windows`)
- **Cho:** **PUBLISHER kênh Windows** (theo luật 12: harness Windows phát hành Windows + Android)
- **Trạng thái:** ✅ code đã **commit + push** (`f1ddc41`, nằm trên `origin/main`) · ⏳ **CHỜ BUILD + PHÁT**
- **Việc trước đó:** bàn giao gốc của worker: `docs/handoff/HANDOFF_WINDOWS_API_RETRY_2026-09-23.md`

---

## ✅ ĐÃ XONG 24/09/2026 (publisher harness Windows cập nhật)

| Hạng mục §5 | Kết quả thật |
|---|---|
| Artifact | `windows/installer/out/VPNFlow-Setup-1.4.7.exe` · **52.789.147 B** · sha256 `7366003185fcc2fef1d2b838a4108a93b7f6ffbd15b577ab3a4cc29d96b5bfe4` |
| Mốc build | build commit **`9330355ddbf4ad23253c28f15bcc10c0476b59c5`** (HEAD, cây `windows/` sạch) · app `.exe` `ProductVersion = 1.4.7+9330355…` (cổng 3c ĐẠT) |
| `dotnet test` | **Passed: 219 · Failed: 0** (chạy lại trên chính commit này, 24/09) |
| Cổng `pre` | ĐẠT: version 1.4.7 · ProductVersion · app exe FileVersion · mốc `1.4.6 → 1.4.7` (tiến). **2 mục chữ ký `KHÔNG ĐẠT`** ⇒ exit 1, đúng dự kiến — **chủ dự án đã duyệt ngoại lệ riêng cho 1.4.7** (xem §0 `PUBLISHER_PROCESS.md`) |
| Upload + cổng `post` | sha256 khớp ở **cả hai docroot** (`/var/www/dl`, `/var/www/flowvpn/dl`) + tải lại qua CDN khớp sha256 · **post ĐẠT (exit 0)**: đọc từ file đang phát = 1.4.7, mốc khớp, route HTTP 200 · 52.789.147 B |
| `/buy` + mốc | `/buy` trỏ `https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.7.exe?v=73660031` · `latest_version=1.4.7` (kênh ios/android/macos **không đổi**) |
| Sổ + tag | `release/releases.jsonl` +2 dòng (publish + tag) · tag **`windows-v1.4.7`** → `9330355` |
| Backup bản cũ | `VPNFlow-Setup-latest.bak-1a504534-20260924-091713.exe` (cả hai docroot); bản `VPNFlow-Setup-1.4.6.exe` vẫn còn nguyên |
| Chữ ký | `Get-AuthenticodeSignature`: **`NotSigned`** cho **cả** Setup và app `.exe`; `Cert:\CurrentUser\My` + `LocalMachine\My -CodeSigningCert` **rỗng** ⇒ **NGOẠI LỆ có ghi sổ** |

**⚠️ ĐÍNH CHÍNH hash trong handoff này:** mục "Trạng thái" ở trên ghi commit `f1ddc41` — đó là **commit trùng không nằm
trên `origin/main`** (cùng patch-id `8bf01180cc7a2a4296d86164563c71a4b06a326e` với **`778cffc`**, chỉ `778cffc` được push).
Mốc thật đã ghi sổ + tag là build commit `9330355ddbf4ad23253c28f15bcc10c0476b59c5`.

**Email khách:** theo luật 7 + §5 (`PUBLISHER_PROCESS.md`) **harness Windows không tự gửi email khách** — đã bàn giao
số liệu (version 1.4.7 · link `?v=73660031` · sha256 · 3 gạch đầu dòng từ release notes) cho publisher Mac qua bus
+ sổ giao việc. **Không được hứa "hết cảnh báo Windows"** (bản vẫn `NotSigned`).

---

## 0. TL;DR — 3 việc phải làm

| # | Việc | Trạng thái chặn |
|---|---|---|
| 1 | **Build `1.4.7`** rồi chạy cổng chặn `pre` + upload + `post` + ghi sổ + tag + set mốc | **CẦN ngoại lệ chữ ký** (máy không có cert) |
| 2 | **Ghi sổ + nhật ký** bản `1.4.7` | sau khi có artifact thật |
| 3 | **Email khách** (theo luật 7, publisher của kênh gửi) | sau khi phát xong + có bằng chứng |

> ⚠️ **ĐỪNG publish kênh không thuộc phần mình** (luật 12). iOS/macOS là việc của harness Mac.

## 1. Trạng thái kênh Windows ngay lúc viết

| Câu hỏi | Trả lời |
|---|---|
| Bản đang phát? | **1.4.6** — `VPNFlow-Setup-1.4.6.exe?v=1a504534` · 52.792.253 B · mốc `latest_version=1.4.6` |
| 1.4.7 đã có artifact chưa? | **CHƯA.** Mới có code + release notes. Chưa build, chưa ghi sổ, chưa tag |
| Có phải phát gấp không? | **Có căn cứ**: khách TQ **đang bị** lỗi không kết nối được (bàn giao gốc §1) |

## 2. Vì sao có bản này

Khách Trung Quốc báo **"Không thể kết nối tới máy chủ VPNFlow khi gọi device claim"** — lỗi **trước khi**
dựng tunnel. Gốc: `api.meetflowai.site` từ mạng TQ chập chờn (~20 % lần hỏng, đo 5 lần) mà app chỉ thử
mỗi host **một lần**. Bản vá: **3 vòng thử**, chờ 500 ms, **chỉ** retry lỗi transport.
Chi tiết + bằng chứng: `docs/RELEASE_NOTES_1.4.7.md` và bàn giao gốc.

## 3. Lệnh build (đúng nguồn version)

```powershell
# nguồn version DUY NHẤT: windows/PrivateVPNWindows.App/PrivateVPNWindows.App.csproj <Version>
powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -Version 1.4.7
```

- `build.ps1` **DỪNG nếu `windows/` còn thay đổi chưa commit** (cổng chống "build từ cây bẩn") ⇒ phải
  commit/push trước khi build.
- Build xong phải đọc lại `ProductVersion` = `1.4.7+<commit>` (**cổng 3c**) — lệch là DỪNG.

## 4. Cổng chặn — BẮT BUỘC, cả 2 chế độ

```bash
python3 scripts/check-publish-version.py --platform windows --file <Setup.exe> --app-exe <App.exe> --version 1.4.7 --mode pre
# upload lên /var/www/flowvpn/dl/ ...
python3 scripts/check-publish-version.py --platform windows --version 1.4.7 --mode post
```

- **Luật 11 (chữ ký)**: cổng đọc **bảng Certificate PE**. Máy này **không có chứng chỉ Authenticode**
  ⇒ mục chữ ký sẽ báo `KHÔNG ĐẠT` ở `pre`. **Không được tự ý bỏ qua**: hoặc chờ cert, hoặc **xin ngoại lệ
  có ghi sổ** như 1.4.5/1.4.6 (`docs/PUBLISHER_PROCESS.md` §0 ngoại lệ luật 11).
- Cổng cũng **từ chối phát lùi** — mốc đang `1.4.6` nên `1.4.7` hợp lệ.

## 5. Bằng chứng phải nộp (không có = chưa xong)

| # | Hạng mục | Nguồn |
|---|---|---|
| 1 | `dotnet test` — **219 pass / 0 fail** | đã chạy ở máy harness 24/09 (bàn giao gốc §4) |
| 2 | Cổng `pre` + `post` — dán output thật | §4 |
| 3 | `ProductVersion` đọc từ **chính file đang phát** = `1.4.7+<commit>` | cổng 3c / `sigcheck` |
| 4 | size + `sha256` **đo trên node-2** (không lấy từ tên file) | `sha256sum` trên node-2 |
| 5 | `/buy` trỏ `?v=<sha8>` | `curl -s https://t1.meetflowai.site/buy \| grep VPNFlow-Setup` |
| 6 | Dòng sổ `release/releases.jsonl` (origin=`publish`) + tag `windows-v1.4.7` | `git tag -l` |
| 7 | Chữ ký: `signtool verify /pa` + `Get-AuthenticodeSignature` cho **cả** Setup và app .exe | nếu chưa ký ⇒ ghi rõ **ngoại lệ** |

## 6. Cách ghi sổ (append-only — KHÔNG sửa dòng cũ)

Sổ là `release/releases.jsonl`; script: `scripts/release-record.mjs` (xem `docs/VERSIONING.md`).
Nếu vì lý do nào đó chưa đo được `internal_version`, ghi **`null` kèm lý do** — **không suy diễn** từ tên file.

## 7. Việc còn treo của kênh (ngoài 1.4.7)

1. **Windows 1.4.6 chưa có release notes** (`docs/RELEASE_NOTES_1.4.6.md` không tồn tại). Hoặc bổ sung,
   hoặc chấp nhận thiếu và ghi rõ — bàn giao này **không** tự tạo để tránh ghi sai số liệu.
2. **`NFR-WIN-002` (buộc ký số) vẫn CHƯA đạt.** Máy harness Windows không có cert; Mac đã xác nhận cũng
   không có chứng chỉ Authenticode (bus #305/#307). Việc này cần chủ dự án quyết (mua cert / dùng HSM).
3. **1.4.5 → 1.4.6 → 1.4.7 đều `NotSigned`.** Email cho khách **KHÔNG được hứa "hết cảnh báo Windows"**;
   khách bị Smart App Control chặn thì **ghi nhận để đo lường**.
