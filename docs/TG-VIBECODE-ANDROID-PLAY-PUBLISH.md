# TG /vibecode — PUBLISH MeetFlow AI Android lên Google Play (task `T-20260927-01`)

> Nguồn việc: **bus #512** (`owner → win`, 2026-09-27T17:01:30Z), nguyên văn:
> *"publish bản meetflow AI android lên google play"*. Sổ git: `ops/tasks/T-20260927-01/`.
> Máy làm: **WIN** (`DESKTOP-852P1LT`, Windows) · Ngày: 28/09/2026.
>
> **KẾT LUẬN NGẮN: `blocked` — không phải vì thiếu bản build, mà vì KHÔNG có credential
> Google Play nào cho agent.** AAB đã sẵn sàng và đã được kiểm (bên dưới); việc còn lại là
> một thao tác của chủ dự án (đăng nhập Play Console) — xem **§5**.

---

## 1. App nào là "meetflow AI android"

| Ứng dụng | package | Nhãn | Ở đâu |
|---|---|---|---|
| **MeetFlow AI** (app dịch/AI, đúng tên owner gọi) | `com.meetflow.translator` | *MeetFlow AI* | repo `minhfat-ux/MeetFlowAI`, thư mục `android/` |
| fBuddy (app khác, đang dựng) | `site.meetflowai.fbuddy` | *fBuddy* | `fbuddy/android` (mới ở mức khung 0.1.0) |
| VPNFlow (app VPN) | `com.privatevpn.app` | *VPNFlow* | `FPTVPN/android` |

Căn cứ: `_meetflow/android/app/src/main/res/values/strings.xml:3` → `app_name = "MeetFlow AI"`;
`_meetflow/android/app/build.gradle.kts:32` → `applicationId = "com.meetflow.translator"`.
Bản "play" của app này là **AAB**, bản "china" là **APK sideload** (`MEETFLOW_AI_OPS.md` §8).

## 2. Artifact đã sẵn sàng — bằng chứng đo được

Nguồn: node-2 `/var/www/flowvpn/dl/` (kênh `https://meetflowai.site/dl/...`), WIN tự tải về
`_work/play-publish-20260928/` rồi tự băm — không tin tên file.

| File | Byte | sha256 (WIN tự băm) |
|---|---|---|
| `MeetFlowAI-1.0.7-play.aab` (bản nộp Play) | 7 284 886 | `1f4ef09e2322f5f8cb2023de64b63ad405c6bb7c70da5051bde746790488a547` |
| `MeetFlowAI-1.0.7-china.apk` (sideload) | 4 397 108 | `a7b825d4ba32aa285b0789ee1ed32081b4b8377b811118a77bdabf6c2e88cd8d` |

Đối chiếu chéo hai artifact (cùng một bản build 1.0.7/8):

```
$ aapt2 dump badging MeetFlowAI-1.0.7-china.apk
package: name='com.meetflow.translator' versionCode='8' versionName='1.0.7' ...
minSdkVersion:'26'   targetSdkVersion:'36'   application-label:'MeetFlow AI'
native-code: 'arm64-v8a' 'armeabi-v7a' 'x86' 'x86_64'
$ zipalign -c -P 16 -v 4 ...   → Verification successful
$ apksigner verify --print-certs ...
Signer #1 certificate DN: CN=MeetFlow AI, OU=Mobile, O=MeetFlow AI, L=Hanoi, C=VN
Signer #1 certificate SHA-256 digest: 867baa1391b944aef01089da69769dbed3b778e766a3bfa0cf3d011e37ffcc9b
```

AAB (thứ Play nhận, **không** nhận APK) — đã bung nội dung để kiểm, không chỉ nhìn tên file:

```
$ node ops/play-upload-aab.mjs --preflight --aab MeetFlowAI-1.0.7-play.aab --expect-version 1.0.7
   ✅ Là file ZIP · ✅ base/manifest/AndroidManifest.xml (19084 byte) · ✅ BundleConfig.pb
   ✅ Có chữ ký JAR — META-INF/MEETFLOW.RSA
   ✅ Manifest khai package "com.meetflow.translator"
   ✅ Manifest khai versionName "1.0.7"        ✅ versionCode suy ra = 8
   ✅ chữ ký: jar verified                      (jarsigner, JDK 17 có sẵn trên WIN)
✅ AAB ĐẠT kiểm tĩnh — có thể nộp.
```

Mã nguồn cũng khớp: `gh api repos/minhfat-ux/MeetFlowAI/.../build.gradle.kts` → `versionCode = 8`,
`versionName = "1.0.7"`; commit gần nhất đụng `android/`: `666b330` (21/09) *"1.0.7 — sửa crash
release do R8 làm Gson đọc sai cache"*.
(Lưu ý: bản clone ở `FlowTech AI/_meetflow` trên máy WIN đang **cũ** — `af4c9a2`, còn 1.0.4/5; nguồn
1.0.7 có trên GitHub, không cần suy đoán.)

## 3. Trạng thái hai kênh phát hành

| Kênh | Trạng thái | Bằng chứng |
|---|---|---|
| Sideload (khách Trung Quốc) | **ĐANG PHÁT 1.0.7** | `GET https://api.meetflowai.site/v1/ai/app-version` → `{"platform":"android","latest_version_code":8,"minimum_version_code":3,"latest_version_name":"1.0.7", ...}` |
| **Google Play** | **CHƯA CÓ TRANG STORE** | `GET https://play.google.com/store/apps/details?id=com.meetflow.translator` → **404** (kiểm cả `com.privatevpn.app`, `site.meetflowai.fbuddy` → 404) |

⚠ Nói cho chính xác: 404 nghĩa là **chưa có bản công khai**. Không loại trừ khả năng app đã tồn tại
trong Play Console ở track kín (internal/closed) — muốn biết chắc phải có credential để gọi API (§6).

## 4. Vì sao agent KHÔNG nộp được — blocker + bằng chứng

Google Play chỉ nhận bản nộp qua **Play Console** (đăng nhập Google + 2FA) hoặc **Play Developer API**
(service account có quyền *Release*). WIN đã kiểm hết các đường có thể:

| Chỗ kiểm | Lệnh | Kết quả |
|---|---|---|
| Máy WIN | `Get-ChildItem ... -Include *.jks,*.keystore,keystore.properties` | chỉ có `vpnflow-release.jks` (app VPNFlow) — **không có keystore MeetFlow AI** |
| Máy WIN | tìm `play-admin.json` / `*service*account*.json` | **không có** |
| node-2 (165.101.114.162) | `find / -xdev -name play-admin.json` + `grep -rn PLAY_ /etc /opt /root` | **không có** |
| node-1 (103.173.155.50, backend MeetFlow AI) | `cut -d= -f1 /opt/meetflow/backend/.env` | danh sách khoá **không có** `PLAY_SERVICE_ACCOUNT_JSON/FILE`; `data/` không có `play-admin.json` |
| Control-plane | `control-plane/src/play-store.js:34` — `PLAY_PACKAGE_NAME` mặc định `com.meetflow.translator` | module **chỉ để xác thực purchase**, không có hàm upload; và cũng chưa được cấu hình credential |
| Play Console | — | tài khoản do **chủ dự án** giữ (tạo ~27/08/2026 với tư cách *individual*, khi đó đang **CHỜ VERIFY** — `.privatevpn/memory/DECISIONS.md:141`, `PROJECT_STATE.md:180`); trạng thái hiện tại không kiểm được từ máy |

Nói thẳng: **không có bí mật nào bị thiếu ở phía kỹ thuật — chỉ thiếu quyền truy cập của con người.**

## 5. Chủ dự án cần làm gì (chọn 1 trong 2 — mỗi cách đều ngắn)

### Cách A — tự nộp trong Play Console (~5 phút, không cần agent)

1. Đăng nhập https://play.google.com/console → tạo app (nếu chưa có):
   - Tên app: **MeetFlow AI** · Ngôn ngữ mặc định: tuỳ chọn · **App**: *App* · **Free**.
2. Vào app → **Test and release → Testing → Internal testing → Create new release** →
   upload file AAB: `https://meetflowai.site/dl/MeetFlowAI-1.0.7-play.aab`
   (sha256 `1f4ef09e…a547`, package `com.meetflow.translator`, versionCode **8**).
3. Điền các mục **App content** bắt buộc (Data safety, Content rating, Target audience,
   Ads, App access, **URL xoá tài khoản**, chính sách riêng tư…) — xem checklist §7.
4. **Save → Review release → Start rollout to Internal testing**, rồi thêm email tester để tải thử.

### Cách B — cấp cho agent đường tự động (khuyến nghị nếu muốn nộp nhiều bản về sau)

1. Google Cloud Console: bật **Google Play Android Developer API** → tạo **service account** →
   tạo **key JSON** (tải về).
2. Play Console → **Users and permissions → Invite new users** → dán email service account →
   cấp quyền **Release to testing tracks** (và *View app information*).
3. Dán nội dung JSON vào trang admin **"Kết nối Google Play"** (control-plane → tab AI Users) —
   đúng chỗ `control-plane/src/play-store.js` đang đọc (`data/play-admin.json`), hoặc đặt file vào
   node-2 `/root/flowvpn-cp/data/play-admin.json`.
4. Báo lại trong sổ việc; WIN sẽ chạy:
   ```bash
   node ops/play-upload-aab.mjs --status                     # xác nhận app + track
   node ops/play-upload-aab.mjs --apply \
        --aab /var/www/flowvpn/dl/MeetFlowAI-1.0.7-play.aab \
        --track internal --release-status draft
   ```
   (mặc định để **draft** — chủ dự án vẫn là người bấm rollout).

⚠ **App phải được tạo trong Play Console trước**: Play Developer API **không có** endpoint tạo app mới
(`--status` sẽ trả 404 và nói rõ điều này).

## 6. Công cụ đã dựng sẵn: `ops/play-upload-aab.mjs`

Viết theo đúng tiền lệ `ops/asc-upload-build.mjs` (WIN nộp App Store Connect khi không có macOS):
không dependency ngoài, không cần Java, không cần Play Console UI.

| Lệnh | Việc | Đã chạy thật? |
|---|---|---|
| `--preflight --aab <file>` | bung AAB, kiểm manifest/bundle config/chữ ký/package/version (không gọi mạng) | ✅ **đã chạy trên AAB thật** — ĐẠT (§2) |
| `--self-test` | sinh khoá RSA tạm → gọi Google → phải nhận `invalid_grant` ⇒ chứng minh request OAuth đúng khuôn dạng + máy ra được Internet TLS | ✅ **đã chạy thật**: Google trả `400 Invalid grant: account not found`, exit 0 |
| `--status` | đọc: app có trên Play chưa, từng track có release gì (mở edit tạm rồi xoá — không đổi bản phát hành) | ⚠ chạy được nhưng **dừng ở "không có credential"** (đúng như thiết kế) |
| `--apply --aab … --track internal --release-status draft` | nộp thật: edits → upload bundle → gắn track (+ release notes) → commit | ⛔ **CHƯA chạy được** (thiếu credential) — có `--dry-run` in đúng 4 bước HTTP |

Mức kiểm chứng trung thực: `build_checked` cho AAB (kiểm tĩnh đầy đủ), `not_checked` cho bước upload
(đường OAuth đã đo được tới Google, nhưng chưa có credential thật để đi hết).

## 7. Checklist còn lại trước khi bản Play chạy được với khách

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | Tạo app `com.meetflow.translator` trong Play Console | **chủ dự án** | API không tạo được app |
| 2 | Upload AAB 1.0.7/8 (§5) | chủ dự án / WIN sau khi có §5-B | artifact đã kiểm |
| 3 | Sản phẩm **Play Billing**: `meetflowai.pro.monthly`, `meetflowai.pro.yearly` + license testers | chủ dự án | app đọc đúng 2 ID này; thiếu ⇒ paywall trống |
| 4 | Store listing: icon 512×512, feature graphic 1024×500, ≥2 ảnh phone (1080–3840 px) | chủ dự án + WIN | WIN chụp được ảnh app trên máy Android nếu cần |
| 5 | App content: Data safety, Content rating (IARC), Target audience, Ads, App access, **URL xoá tài khoản**, khai **nội dung do AI tạo** | chủ dự án (+WIN soạn nháp) | bản nháp đã có: `docs/PLAY_SUBMISSION.md`, `docs/APP_STORE_METADATA.md` (cần cập nhật theo app AI) |
| 6 | Release notes 5 ngôn ngữ (≤500 ký tự/ngôn ngữ) | WIN soạn được | bản 1.0.7 có sẵn nội dung trong `GET /v1/ai/app-version` (`notes`) |
| 7 | Nếu tài khoản là **personal tạo sau 11/2023**: closed testing **≥12 tester × ≥14 ngày liên tục** trước khi xin production | **chủ dự án** | `FR-STORE-009`/`AC-057`; phải bắt đầu sớm vì là mốc thời gian cứng |
| 8 | Kênh Play dùng đúng flavour `play` (`WEB_PRO_ONLY=false`, chỉ Play Billing, **không** link mua ngoài) | đã đúng trong code | commit `ecc845d` — lý do: chính sách Payments của Play |

## 8. Rủi ro / điểm chưa chắc

- **Trạng thái tài khoản Play Console hiện tại**: tài liệu nội bộ chỉ ghi *"đang VERIFY"* (27/08/2026).
  Nếu tài khoản chưa verify xong thì mọi bước trên đều bị chặn thêm một lớp.
- **Chưa có keystore MeetFlow AI trên máy WIN** (`CN=MeetFlow AI`); keystore nằm ở máy Mac
  (`android/keystore/upload-keystore.jks` theo `MEETFLOW_AI_OPS.md` §8 — "dùng đúng keystore này cho
  mọi bản lên Play"). ⇒ WIN **không thể build thêm bản ký mới**; nhưng bản 1.0.7 đã ký sẵn nên đủ để nộp.
- **Release notes 5 ngôn ngữ**: bản `play-assets/RELEASE_NOTES_1.0.7.md` **không có** trên máy WIN
  (tài liệu trỏ `FChinaTranslator/play-assets/`, chỉ có trên Mac/không commit). WIN sẽ soạn lại từ
  `notes` của backend + commit `666b330` khi cần.
- **`docs/MEETFLOW_AI_OPS.md` §8 đang ghi 1.0.4** trong khi kênh thật đã 1.0.7 — tài liệu lệch thực tế,
  nên cập nhật để lần sau không ai nộp nhầm bản cũ.

## 9. Đã đọc

`docs/TASK-PROTOCOL.md` · `docs/AGENT-BUS.md` · `docs/TASK-WINDOWS-REWRITE.md` (không liên quan —
việc rewrite 22 mục) · `FPTVPN/docs/MEETFLOW_AI_OPS.md` §4, §8 · `FPTVPN/docs/PLAY_SUBMISSION.md` ·
`FPTVPN/docs/RELEASE-AND-PUBLISH.md` (GATE 6/7, §3.2, §6.2, §12.2) · `FPTVPN/docs/PUBLISHER_PROCESS.md` ·
`FPTVPN/control-plane/src/play-store.js` · `FPTVPN/.privatevpn/memory/DECISIONS.md:120-145` ·
`_meetflow/android/README.md`, `_meetflow/android/app/build.gradle.kts`, `.github/workflows/android-build.yml` ·
`fbuddy/AGENTS.md` (§6 publish store).
