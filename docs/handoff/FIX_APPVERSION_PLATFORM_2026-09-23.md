# FIX BUG-APPVERSION-PLATFORM-001 — `/v1/app-version` trả sai kênh (23/09/2026)

- **Người làm:** DSH main agent (owner `windows`) — chủ dự án giao trực tiếp: *"những cái sai kiểu này, em tự fix đi"*.
- **Trạng thái:** ✅ **ĐÃ SỬA + ĐÃ DEPLOY + ĐÃ ĐO LẠI** trên production.
- **Sổ bug:** `.privatevpn/status/bugs.json` → chuyển `BUG-APPVERSION-PLATFORM-001` từ `open` sang **`resolved`**.

## 1. Lỗi
`GET /v1/app-version?platform=android-legacy` **không trả payload kênh legacy** mà rơi về kênh mặc định;
**mọi giá trị `platform` lạ** (`bogus-xyz`) cũng vậy. Nguyên nhân: `control-plane/src/app-version.js`
chỉ nhận `ios|android|windows|win` và **mặc định iOS** khi không khớp ⇒ không có tín hiệu lỗi nào.

Bằng chứng trước khi sửa (đo 23/09/2026):
```
platform=android-legacy -> platform=ios     latest=1.4.2   ← SAI KÊNH
platform=bogus-xyz      -> platform=ios     latest=1.4.2   ← giá trị lạ rơi về mặc định
```
(Mac ghi nhận cùng lỗi nhưng lúc đó mặc định rơi về `windows` — tức **kênh mặc định đã đổi giữa các lần đo**,
càng cho thấy kiểu lỗi im lặng này khó phát hiện.)

**Ảnh hưởng:** cổng chặn/audit hỏi kênh `android-legacy` **so nhầm kênh** (đúng loại lỗi từng gây "audit báo lệch oan"
cho macOS). **Khách không bị ảnh hưởng** — route tải APK legacy vẫn đúng.

## 2. Sửa (diff tối thiểu)
| File | Thay đổi |
|---|---|
| `control-plane/src/app-version.js` | Thêm `androidLegacyVersionPayload()` (dùng chung mốc `android_latest_version`, `apk_url` = link legacy) · `KNOWN_PLATFORMS` + `normalizePlatform()` + `isKnownPlatform()` · `UnknownPlatformError` · `versionPayloadFor()` xử lý `android-legacy`/`android7` TRƯỚC các nhánh UA và **ném lỗi khi `?platform=` lạ** |
| `control-plane/src/index.js` | Route `/v1/app-version` bắt `UnknownPlatformError` ⇒ **HTTP 400** `{error:"unknown_platform", platform, supported:[…]}` |
| `control-plane/test/app-version.test.js` | +4 test: kênh legacy đúng payload · alias `android7` · platform lạ ném lỗi · route có guard 400 |

Hợp đồng giữ nguyên: **không gửi `?platform`** (bản app cũ) vẫn chọn kênh theo User-Agent
(`CFNetwork`→ios, `okhttp`→android, `Windows NT`→windows).

## 3. Bằng chứng
```
node --test control-plane/test/app-version.test.js
  -> tests 25 / suites 0 / pass 25 / fail 0
node --check control-plane/src/app-version.js  -> exit 0
node --check control-plane/src/index.js        -> exit 0
```
Đo lại **sau deploy** qua `https://api.meetflowai.site` (23/09/2026):
```
platform=android-legacy -> HTTP 200  platform=android-legacy latest=1.4.4
platform=android7       -> HTTP 200  platform=android-legacy latest=1.4.4
platform=android        -> HTTP 200  platform=android     latest=1.4.4
platform=windows        -> HTTP 200  platform=windows     latest=1.4.6
platform=ios            -> HTTP 200  platform=ios         latest=1.4.2
platform=macos          -> HTTP 200  platform=macos       latest=1.4.0
platform=bogus-xyz      -> HTTP 400  {"error":"unknown_platform","supported":[…]}
(không gửi ?platform) + UA CFNetwork -> ios · okhttp -> android · Windows NT -> windows
```

## 4. Deploy — và **2 vấn đề hạ tầng phát hiện được**
Lệnh đã chạy (trên node-2):
```bash
# stage = bản LIVE + đúng 2 file đã vá (KHÔNG dùng workspace /root/flowvpn-agent — xem cảnh báo dưới)
cp -a /root/flowvpn-cp/src/. "$STAGE/src/"
install -m 644 /root/cp-patch-staging/app-version.js "$STAGE/src/app-version.js"
install -m 644 /root/cp-patch-staging/index.js        "$STAGE/src/index.js"
cd /root/flowvpn-agent
WS="$STAGE" LIVE=/root/flowvpn-cp bash scripts/server-agent/deploy-control-plane.sh --files app-version.js,index.js
# -> node --check OK · backup /root/flowvpn-cp/src-backup-20260923-104708 · health OK · exit 0
```

> ⚠️ **Vấn đề 1 — workspace deploy (`/root/flowvpn-agent`) KHÔNG dùng được:**
> (a) `git fetch origin` **thất bại** ("correct access rights") ⇒ server không lấy được code mới từ GitHub;
> (b) cây làm việc **lệch LIVE 11 file** (`admin-page.js`, `alerts.js`, `app-version.js`, `connection-stats.js`,
> `device-limit.js`, `guide-page.js`, `home-page.js`, `index.js`, `payments.js`, `support-page.js`, `tg-commands.js`)
> và đang có sửa dở chưa commit ⇒ chạy deploy mặc định sẽ **đẩy 11 file đó lên production**.
> Vì vậy lần này deploy bằng **stage = bản LIVE + 2 file đã vá** và `--files` để giới hạn đúng 2 file.

> ⚠️ **Vấn đề 2 — `index.js` LIVE KHÁC repo:** bản đang chạy khác bản trong repo **từ dòng 32** (khác cả khối import;
> LIVE 5864 dòng, repo 5904 dòng). Nên **không thể copy file từ repo lên thẳng** (sẽ kéo theo ~40 dòng khác chưa rõ nguồn).
> Lần này chỉ vá **trên chính file LIVE**. **Cần chủ dự án/orchestrator chốt:** bản nào là nguồn sự thật cho
> `control-plane/src/index.js`, và đồng bộ lại theo hướng nào.

## 5. Rollback
```bash
cp -a /root/flowvpn-cp/src-backup-20260923-104708/{app-version.js,index.js} /root/flowvpn-cp/src/
systemctl restart flowvpn-cp && sleep 2 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7778/health
```

## 6. Việc còn lại
1. **Chốt nguồn sự thật của `control-plane/src/index.js`** (repo vs LIVE) — xem §4 vấn đề 2; hiện repo và
   production đang là hai bản khác nhau, rủi ro cho mọi lần deploy tiếp theo.
2. **Sửa quyền git trên node-2** để `deploy-control-plane.sh` dùng lại được đúng workspace (hoặc chuyển sang
   quy trình stage-từ-LIVE như lần này và ghi vào runbook).
3. **Android 1.4.4 — đối chiếu artifact ↔ máy thật** vẫn treo: điện thoại SM-F9460 offline; khi kết nối lại
   phải cài đúng APK `145053e9…` (sha256) và đọc log `bw: sample`/`chon-duong`, rồi bổ sung vào sổ.
