# VERSIONING — cơ chế version cho app VPNFlow (4 nền tảng)

> Chốt 22/09/2026 (yêu cầu chủ dự án). **Nguồn sự thật: `release/releases.jsonl` (sổ, append-only) + git tag neo commit.**
> Đọc kèm: `docs/PUBLISHER_PROCESS.md` (§2b — chỉ phát hành bản mới nhất đã test), `docs/RELEASE_RUNBOOK.md`.
> Phạm vi: **ios · macos · android · android-legacy · windows**. Không áp cho control-plane/harness.

## 0. Vì sao có cơ chế này (lỗi thật, không phải phòng xa)
Ba lần liên tiếp "nhìn bề ngoài không thấy sai" — vì có **3 thứ version khác nhau** hay bị lẫn:
**version trong file** · **mốc phiên bản trên server** · **tên file/ghi chú trong docs**.

| Ca thật | Lệch ở đâu |
|---|---|
| Windows 1.4.1 (21/09) | installer tên `VPNFlow-Setup-1.4.1.exe`, app bên trong khai `FileVersion 1.0.0.0` |
| macOS (20/09) | route `/v1/downloads/mac` phát DMG `1.3.3/13` **5 ngày** trong khi mốc quảng bá `1.4.0` |
| macOS (22/09) | DMG trên node-2 **đổi lúc 11:56** (21.458.057 B) mà **không ai ghi sổ**; docs vẫn ghi 23.972.080 B |
| iOS (22/09) | sha256 IPA **đang phát** (`37dcb9a7…`) khác cả 2 hash ghi trong `docs/RELEASE_ARTIFACTS_2026-09-19.md` |

⇒ Sổ này **tách bạch 3 thứ đó thành 3 field**, không cho phép suy diễn lẫn nhau.

## 1. Sổ đăng ký: `release/releases.jsonl`
- **Append-only**: mỗi dòng là 1 JSON = 1 lần ghi nhận (phát hành mới, hoặc backfill số liệu đang phát).
- **Không sửa/xoá dòng cũ.** Sai thì thêm dòng mới; thu hồi thì thêm dòng `status: "rolled_back"`.
- Lý do: bảng markdown trong `PUBLISHER_PROCESS.md` §6 đã từng **bị xoá nhầm 14 dòng** trong commit
  `7defd33` (22/09) và phải khôi phục — sổ sửa được là sổ không đáng tin.

| Field | Ý nghĩa | Bắt buộc |
|---|---|---|
| `at` | thời điểm ghi sổ (ISO-8601 UTC) | ✅ |
| `platform` | `ios` \| `macos` \| `android` \| `android-legacy` \| `windows` | ✅ |
| `version` | version **định phát / đang phát** (semver `MAJOR.MINOR.PATCH`) | ✅ |
| `build` | iOS `CFBundleVersion` · Android `versionCode` · macOS build · Windows: để trống | — |
| `channel` | route phát (`/v1/downloads/ios`, `/dl/VPNFlow-Setup-<v>.exe`, …) | ✅ |
| `artifact` | đường dẫn file thật trên node-2 | ✅ |
| `size` / `sha256` | số liệu **đo từ file thật** (không lấy từ docs) | ✅ |
| `artifact_mtime` | mtime file trên node-2 (biết bản nào vừa bị thay) | ✅ |
| `marker_latest` | giá trị `latest_version` đã set trên server | ✅ |
| `marker_build` | `ipa_build` (chỉ iOS) | — |
| `internal_version` / `internal_build` | version **đọc từ bên trong artifact** — `null` = CHƯA kiểm | ✅ (null được, kèm lý do) |
| `commit` | commit dùng để **build** (không phải commit publish) | — |
| `commit_source` | căn cứ xác định commit (`docs/…`, `git log`, …) | khi có `commit` |
| `tag` | tag git đã tạo (`ios-v1.4.0`) | — |
| `status` | `published` \| `rolled_back` | ✅ |
| `verified_by` / `evidence` | ai test + ngày, dẫn chứng (điều kiện #3 của §2b) | — |
| `origin` | `publish` (phát hành thật) \| `backfill` (ghi lại số liệu đang phát) | ✅ |
| `recorded_by` | `windows` \| `mac` \| `server` | ✅ |
| `notes` | cảnh báo/lệch cần người đọc | — |

## 2. Git tag (neo version vào commit)
- Tên: **`<platform>-v<version>`** → `ios-v1.4.0`, `macos-v1.4.0`, `android-v1.4.1`, `windows-v1.4.2`.
- **Annotated**, body gồm: `sha256` + `size` + commit build + ngày + người verify.
- Tag trỏ **commit dùng để build**, không trỏ commit publish — để trả lời được câu "bản khách đang chạy
  build từ mã nguồn nào".
- Không tạo lại/không sửa tag đã có (repo cấm force-push; tag là mốc bất biến).
- Lệnh: `node scripts/release-record.mjs tag --platform ios` (chỉ chạy khi dòng sổ đã có `commit`).

## 3. Luật tăng version — ai sở hữu nguồn nào
| Nền tảng | Nguồn version (duy nhất) | Ai được tăng | Ràng buộc |
|---|---|---|---|
| iOS | `project.yml` (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`) | harness Mac | `build` **tăng đơn điệu**, kể cả khi version không đổi |
| macOS | `project.yml` (`MARKETING_VERSION`) + `mac/**/Info.plist` | harness Mac | như iOS |
| Android | `android/app/build.gradle.kts` (`versionName`, `versionCode`) | harness Mac | `versionCode` **+1 đơn điệu** mỗi lần phát (kể cả phát lại) |
| Windows | `windows/PrivateVPNWindows.App/PrivateVPNWindows.App.csproj` `<Version>` | harness Windows | `.iss` và `build.ps1` **lấy từ csproj**, không tự khai |

**Luật chung:**
1. **Publisher không tự đổi version.** Bên build tăng version + build artifact; publisher chỉ verify, ghi sổ, phát hành.
2. **Không phát hành lùi**: version/build mới phải **lớn hơn** bản đang phát trên cùng kênh (cổng chặn đã ép).
3. **Artifact bất biến**: một cặp `(platform, version)` chỉ được ứng với **một** `sha256`. Cùng version mà khác
   hash ⇒ dừng, hỏi bên build (hoặc phát hành version mới).
4. `minimum_version` **không** đặt trừ khi chủ dự án chốt (giữ nguyên luật `PUBLISHER_PROCESS.md` §4).

## 4. Lệnh
```bash
# xem bản đang phát mỗi kênh (dòng published mới nhất mỗi nền tảng)
node scripts/release-record.mjs list

# kiểm tra sổ: lùi version, artifact bất biến, thiếu bằng chứng/commit/tag
node scripts/release-record.mjs verify            # exit 1 = có lỗi cứng
node scripts/release-record.mjs verify --strict   # cảnh báo cũng tính là lỗi

# ghi sổ sau khi phát hành (append-only; tự từ chối nếu lùi version hoặc trùng version khác hash)
node scripts/release-record.mjs append --platform ios --version 1.4.1 --build 17 \
    --sha256 <hash> --size <bytes> --marker-latest 1.4.1 --marker-build 17 \
    --internal-version 1.4.1 --commit <sha-build> \
    --verified-by "iPhone 15 / iOS 18.2" --evidence "evidence/e2e/…"

# tạo tag neo commit cho dòng published mới nhất
node scripts/release-record.mjs tag --platform ios
```

## 5. Nối vào quy trình phát hành
Thứ tự đầy đủ (bổ sung vào `PUBLISHER_PROCESS.md` §1 — xem §7 "việc tồn"):
```
… 5. VERIFY link phát hành (200 + size khớp)
   5b. CHẠY LẠI CỔNG sau upload (--mode post) — đọc version TRONG file đang phát
   6. SET MỐC version
→  6b. GHI SỔ: node scripts/release-record.mjs append …      (bắt buộc, kèm sha256 đo được)
→  6c. TAG:   node scripts/release-record.mjs tag --platform <p>
   7. RELEASE NOTES + nhật ký (§6 chỉ là bản đọc của sổ)
   8. EMAIL …
```
- `scripts/check-publish-version.py` (cổng chặn) và `scripts/audit-releases.py` (audit toàn kênh) **đọc sổ**
  làm nguồn đối chiếu thứ 4 — chưa nối xong, xem §7.
- Bảng markdown `PUBLISHER_PROCESS.md` §6 giữ để người đọc, nhưng **số liệu phải khớp sổ**.

## 6. Backfill 22/09/2026 — số liệu THẬT đo từ node-2
Lấy bằng `ssh -J … root@165.101.114.162 'sha256sum + stat'` và `GET /v1/app-version` (không lấy từ docs):

| Nền tảng | Version (mốc) | Size | sha256 (rút gọn) | mtime file | Ghi chú |
|---|---|---|---|---|---|
| iOS | 1.4.0 (build 16) | 8.135.823 B | `37dcb9a7…3b653` | 20/09 21:51 | ⚠️ hash **khác** hash trong `RELEASE_ARTIFACTS_2026-09-19.md` |
| Android modern | 1.4.0 | 96.536.145 B | `dee9f823…89e4ff3` | 19/09 22:25 | khớp bản đóng băng Android trong docs |
| Android legacy | 1.4.0 | 96.536.152 B | `4cbe474e…a289a902` | 19/09 22:25 | docs chỉ khớp size |
| macOS | 1.4.0 | **21.458.057 B** | `f1b802da…b8fa65c` | **22/09 11:56** | ⚠️ docs ghi 23.972.080 B ⇒ file đã bị thay, chưa ai ghi |
| Windows | 1.4.2 | 52.794.169 B | `60ea6f31…df786c6` | 22/09 10:33 | khớp dòng nhật ký 1.4.2 |

Các dòng backfill để `internal_version: null` (chưa đọc được version **bên trong** artifact: DMG cần macOS,
APK cần `aapt2`, IPA cần giải nén + plist) — cố ý, để không biến suy đoán thành "sự thật".

## 7. Việc tồn
1. **Xác nhận commit build** cho 4 bản đang phát ⇒ tạo 4 tag backfill (cần chủ dự án/bên build xác nhận, không đoán).
2. **Audit DMG macOS mới (22/09 11:56)** trên máy Mac: đọc version trong file + so mốc; xác định ai thay, vì sao.
3. **Nối cổng chặn**: `check-publish-version.py` + `audit-releases.py` đọc `release/releases.jsonl` (đang là việc
   của phiên khác — phải claim + phối hợp trước khi sửa).
4. ~~**Chuẩn hoá release notes**: docs đang tham chiếu `release/<platform>/RELEASE_NOTES_<ver>.md` nhưng repo
   **không có file nào** (chỉ có `docs/RELEASE_NOTES_1.2.4.md`) ⇒ chốt đường dẫn mới và bắt buộc tồn tại trước khi phát hành.~~
   **ĐÃ CHỐT 22/09/2026 (Windows 1.4.3):** đường dẫn là **`docs/RELEASE_NOTES_<version>.md`** — KHÔNG dùng
   `release/<platform>/…` vì **`release/` bị `.gitignore`** (chỉ dành cho artifact build; chỉ mình
   `release/releases.jsonl` được force-track). Release notes **phải được track** thì mới là bằng chứng.
   Ví dụ đầu tiên: `docs/RELEASE_NOTES_1.4.3.md`.
5. Thêm 2 dòng trỏ về tài liệu này trong `PUBLISHER_PROCESS.md` (§1 bước 6b/6c và §4).
