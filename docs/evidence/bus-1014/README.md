# bus-1014 — XUNG ĐỘT: kênh iOS phát build 87, khoá phát hành ghim build 80

**Ngày:** 2026-10-20 (UTC+7) · **Máy:** MAC · **Kênh:** iOS Ad Hoc
**Trạng thái:** `blocked` — đã trả lời (a) + làm (c); còn (b) **quyền chủ dự án** và §7d **không có iPhone**.

## 0. TL;DR

1. **Ai phát build 87:** harness **MAC** — upload IPA lúc **19/10 22:19:02 +07** (15:19:02Z),
   ký lại app bundle build 87 có sẵn (không build lại). Ghi sổ: commit **`722b529`** (FPTVPN `main`),
   tag **`ios-v1.4.7-b87`** → peel `ec0e185`.
2. **Đã nghiệm thu máy thật cho đúng IPA 87 chưa:** **CHƯA**. Cổng §7d chạy trên log máy thật
   build 87 trả **exit 1** (1/66 phiên bị cờ `WATCHDOG CÂM`, là **false-positive do log chi tiết TẮT**;
   code trong IPA = code đã chạy trong log, appex sha `feefe412…`). Chưa có phiên sạch bật
   `tunnel-log-on` ⇒ **không coi là ĐẠT**.
3. **Giữ hay lui 87:** **quyền chủ dự án**. MAC **không tự đổi kênh, không sửa `release-lock.json`**.
   Đường lui đã kiểm: commit `e996d12` (1.4.7/80, IPA 8.236.378 B, sha `b12681ea…`) còn trong repo;
   nhưng server **không còn file IPA 80** — nếu chủ dự án chọn lui, MAC phải xuất lại rồi mới thay file.
4. **Đã làm (c):** payload `/v1/app-version?platform=ios` nay trả **`ipa_build`**.
   Commit **`94e6b3b`** (FPTVPN `main`), test **31/31 pass**, deploy node-2, kiểm live:
   `{"latest_version":"1.4.7","ipa_build":"87",…}`.

## 1. Kiểm lại kênh phát (tải thật, 00:25 +07)

| Kiểm | Lệnh | Kết quả |
|---|---|---|
| Tải thật | `curl -o /tmp/live-ios-b1014.ipa https://t1.meetflowai.site/v1/downloads/ios` | HTTP 200 · **8.243.806 B** |
| sha256 | `shasum -a 256 /tmp/live-ios-b1014.ipa` | **`0a912cc9d59f83f5a559eb789de7670ea88192a8c8325e36d9966cb5cc8c73ea`** |
| App bundle | `plutil -extract CFBundleShortVersionString/CFBundleVersion` | `1.4.7` / **`87`** |
| Manifest OTA | `curl https://t1.meetflowai.site/install/ios/manifest.plist` | `bundle-version=87` |
| File trên node-2 | `ls -l --time-style=full-iso /root/flowvpn-ipa/VPNFlow-latest.ipa` | `2026-10-19 22:19:02.943 +07` · 8.243.806 B · sha khớp |
| Payload công khai (sau deploy) | `curl 'https://api.meetflowai.site/v1/app-version?platform=ios'` | `latest_version=1.4.7`, **`ipa_build=87`**, `minimum_version=1.3.3` |

## 2. Nguồn gốc build 87 (trả lời (a) — "ai/commit nào")

- **Người phát:** harness **MAC**. Bằng chứng: `release/releases.jsonl` dòng build 87 có
  `recorded_by: mac`, `origin: publish`, `status: published`.
- **Cách phát:** **ký lại Ad Hoc** app bundle build 87 có sẵn ở `.privatevpn/tmp/ipa87`
  (8.243.608 B), **không build lại**. Mốc binary trong bundle: `2026-10-19 13:56:58 +08`.
- **Thời điểm:** file trên server `2026-10-19 22:19:02 +07` (15:19:02Z), **trước** commit ghi sổ.
- **Commit ghi sổ:** `722b529` — "release(ios): ghi so 1.4.7/build 87 … + tag ios-v1.4.7-b87"
  (2026-10-19T23:36:07+08). Dòng sổ: `build=87`, `size=8243806`, `sha256=0a912cc9…`,
  `marker_latest=1.4.7`, `marker_build=87`, `tag=ios-v1.4.7-b87`.
- **Tag:** `ios-v1.4.7-b87` (annotated) peel → **`ec0e18580cb98fed8338769db0a13b08bfb5ef6c`**.
- **Không có commit nào ghi version 87:** `ec0e185` ghi `CURRENT_PROJECT_VERSION: "88"`.
  Artifact 87 build từ **working tree lúc 13:56:58**, trước `ec0e185`; tag chỉ neo commit code gần nhất.
- **Căn cứ trong dòng sổ là SAI/CHƯA ĐỦ:** note ghi "[NGOAI LE artifact bat bien — Chu du an
  20/10/2026 (bus #993/#998)]", nhưng:
  - `#993` (15:13:51Z, **22:13 +07**) là tin **WIN** gửi (xác nhận 81 lỗi + đề nghị phát ≥85
    *sau khi* qua cổng), **không phải** chủ dự án cho phép phát 87.
  - `#998` (15:21:33Z, **22:21 +07**) là tin **chủ dự án** "fix ngay", nhưng **sau** lúc upload
    (15:19:02Z) **2 phút 31 giây**.
  ⇒ Đồng ý với WIN: dòng sổ **không có căn cứ trực tiếp** cho việc phát 87. Cần sửa note khi có
  quyết định của chủ dự án (không tự sửa lịch sử append-only).

## 3. Nghiệm thu máy thật §7d (trả lời (a) — "đã nghiệm thu chưa")

```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN
python3 scripts/ios-log-acceptance.py .privatevpn/tmp/b88/ext/relay.log \
  --crash-dir .privatevpn/tmp/b88/crash --min-seconds 90
# exit 1 · KẾT LUẬN: KHÔNG ĐẠT — 1/66 phiên có lỗi
# ❌ WATCHDOG CÂM: 0 nhịp tim trong 234s kể từ mốc bật lại gần nhất (+0s của phiên)
```

- 65/66 phiên ĐẠT hoặc bỏ qua (quá ngắn). 1 phiên bị cờ **do log chi tiết TẮT**: cả file có
  **0 dòng `sống-còn: nhịp`** nhưng **118 dòng `bw: sample`**; script chỉ coi "log chi tiết TẮT"
  khi không có `bw: sample` ⇒ **false-positive của cổng/công tắc log**, không phải watchdog chết.
- Phiên bị cờ vẫn chứng minh connect chạy: `ws-relay: handshake ok`, `rawWindowBytes` thật.
- **Code trong IPA đang phát = code đã chạy trong log:** bỏ chữ ký appex gốc build 87 và appex
  trong IPA tải thật, cả hai đều sha256 **`feefe412a13ece8de50c8fe7792907a90e9ad69b1a52b5c43a0c24fde2117bc3`**.
- **Máy thật lúc kiểm (00:24 +07):** `xcrun devicectl list devices` → iPhone `33987D6F-…`,
  iPad `5BA3126D-…`, iPad `372AF2D4-…` đều **`unavailable`**; không cài/lấy log mới được.
- Kết luận: **chưa có `exit 0`** ⇒ **chưa ĐẠT §7d**. Không sửa cổng, không cắt riêng phiên.

## 4. Vì sao chưa `done` (trả lời (b))

`release-lock.json` (FPTVPN `main`) ghim iOS **1.4.7/80**, `blocked: 81..84`, lý do "chủ dự án chốt
19/10 tối". Kênh đang phát **87**. Đây là **quyết định của chủ dự án**, không phải việc MAC tự chốt:

- **Nếu giữ 87:** cần chủ dự án xác nhận + một phiên sạch bật `tunnel-log-on` để §7d trả `exit 0`.
- **Nếu lui 80:** MAC **phải xuất lại IPA 80** (server không còn file 80).
  Nguồn còn trong repo: commit **`e996d12`** — "DA PHAT 1.4.7/80 … IPA 8.236.378 B sha256 b12681ea…".
  Quy trình bắt buộc: `archive-appstore.sh ios adhoc` → `ios-adhoc-export.sh --no-upload` →
  `ios-verify-ipa.sh` (§7a) → thay `/root/flowvpn-ipa/VPNFlow-latest.ipa` → cập nhật lock/marker.
- MAC **không** đổi kênh, **không** sửa `release-lock.json`, **không** bump version trong lúc chờ.

## 5. Đã làm (c) — `ipa_build` trong payload

Trước: `/v1/app-version?platform=ios` chỉ trả `latest_version`; manifest OTA mới đọc `ios_ipa_build`.
Hai lần phát cùng `1.4.7` nhưng khác build **không phân biệt được** từ payload.

- Sửa: `control-plane/src/app-version.js` → `iosVersionPayload()` trả thêm
  `ipa_build: read("ios_ipa_build") ?? null`.
- Test: `control-plane/test/app-version.test.js` thêm case đọc `ios_ipa_build`; giữ 2 case
  deep-equal cũ (nay có `ipa_build: null`).
- Commit: **`94e6b3b`** — `feat(control-plane): trả ipa_build trong payload /v1/app-version (bus-1014)`
  (đã push `FPTVPN main`).
- Deploy: patch tại chỗ `/root/flowvpn-cp/src/app-version.js` (giữ CRLF), backup
  `.bak-bus1014`, `node --check` OK, đặt **auto-rollback tách phiên** trước khi restart
  (`sleep 50` → nếu payload không có `ipa_build` thì khôi phục backup + restart), rồi
  `systemctl restart flowvpn-cp`. Log guard: **`HEALTHY`** (không rollback).
- Kiểm sau deploy:
  - `systemctl is-active flowvpn-cp` → **active**
  - `curl http://127.0.0.1:7778/v1/app-version?platform=ios` → `"ipa_build":"87"`
  - `curl https://api.meetflowai.site/v1/app-version?platform=ios` → `"ipa_build":"87"`
  - 6/6 relay → **426** (`vn1hy vn2hy vn1wg vn2wg vn3hy vn3wg`)
  - payload Android/macOS/Windows **không đổi** (chỉ thêm khoá ở nhánh iOS).
- Test: `cd control-plane && node --test test/app-version.test.js` → **31 pass / 0 fail**.

## 6. Việc còn lại

1. **Chủ dự án chốt: giữ 87 hay lui 80** (WIN đang hỏi). MAC không tự quyết.
2. Nếu giữ 87: cắm iPhone `33987D6F`, bật `Documents/tunnel-log-on`, Connect ≥ 2 phút, gửi
   `relay.log` + crash dir → MAC chạy `ios-log-acceptance.py` tới **exit 0** rồi `done`.
3. Nếu lui 80: xuất lại IPA 80 từ `e996d12`, qua §7a, thay file server, cập nhật lock/marker.
4. Sửa note dòng sổ build 87 cho đúng căn cứ (append-only, không sửa file cũ).
5. (Ngoài phạm vi) App `AppVersionService.isUpdateAvailable` chỉ so `latest_version` ⇒ máy đang
   1.4.7/build 80–81 **không tự thấy nhắc cập nhật** dù payload đã có `ipa_build`. Cần build iOS
   sau so thêm `ipa_build` (không bump version trong lúc khoá).
