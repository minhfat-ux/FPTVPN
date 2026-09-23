# iOS 1.4.3 — đường BUILD/PUBLISH KHÔNG CẦN MÁY MAC (WIN tự làm được)

> Ai đo: harness **WIN**, 2026-09-23 **12:10–12:20Z** (19:10–19:20 VN) · nguồn: owner bus **#348**
> (“mac bị sleep rồi, nên cho phép windows build và publish bản ios 1.4.3 lên appstore và trang buy”).
> Mọi thứ dưới đây đọc bằng **API App Store Connect** chạy từ **node-2** (Windows điều khiển), không cần Mac.

## 1. Vì sao “WIN build iOS” không thể làm kiểu thường

Xcode/xcodebuild chỉ chạy trên macOS. Windows không biên dịch được app iOS ⇒ **không thể** build IPA tại máy WIN.
Nhưng **không cần máy Mac của dự án**: repo đã được nối với **Xcode Cloud** (hạ tầng macOS của Apple) và
WIN **điều khiển được nó qua API**. Đó là đường “Windows take over” thật.

## 2. Bằng chứng Xcode Cloud ĐÃ được cấu hình cho đúng app này (đọc 12:12Z)

```bash
# trên node-2 (khoá ASC: /root/flowvpn-cp/data/apple-asc.json), script ops/_scratch/asc-probe-ci.mjs
GET /v1/ciProducts?filter[app]=6804150049
→ ciProducts 882A8127-3E6C-484C-8E10-028A22CEF81A  name="FlowVPN"  productType=APP  createdDate=2026-08-23

GET /v1/ciProducts/882A8127-.../workflows
→ ciWorkflows 27EF970F-C793-44CA-BEE4-166E242DC7E7  name="Default"  isEnabled=true
   branchStartCondition: pattern "main" (autoCancel=true)  ← push lên main là TỰ CHẠY
   containerFilePath "PrivateVPN.xcodeproj"
   actions: [{ name "Archive - iOS", actionType ARCHIVE, scheme "PrivateVPN", platform IOS, isRequiredToPass true }]

GET /v1/ciProducts/882A8127-.../buildRuns?limit=5
→ đã có 5 build run (mới nhất 2026-09-08), commit sha + log đọc được qua API

GET /v1/ciProducts/882A8127-.../primaryRepositories
→ scmRepositories 1a24ebda-... httpCloneUrl=https://github.com/minhfat-ux/FPTVPN.git
     lastAccessedDate=2026-09-23T10:49:14Z   ← kết nối GitHub còn sống
```

`ci_scripts/ci_post_clone.sh` (đã có trên `origin/main`) tự cài `go` + `xcodegen`, sinh `PrivateVPN.xcodeproj`
từ `project.yml` và kiểm tra shared scheme — tức **máy CI sạch build được**, không cần Mac.

## 3. Hạ tầng ký & thiết bị cũng đã có sẵn (đọc bằng API, 12:13Z)

| Thứ | Đọc được |
|---|---|
| Chứng chỉ | `Apple Distribution: Minh Nguyen` ×2 (hết hạn 2027-09-15 / 2027-07-19), `Apple Development` ×2, `Mac Installer Distribution`, `Developer ID Application` |
| Bundle ID | `com.privatevpn.app` + `com.privatevpn.app.packet-tunnel` (seed `G6XW3RN6LJ`) |
| Thiết bị đã đăng ký | **9** (iPhone 14 Pro Max của anh `00008120-00010D102E40C01E`, iPhone 16 Pro Max ×2, iPhone 13 Pro Max, iPhone 15 Pro, iPhone 12 Pro Max, iPad…, MacBook Air) |
| Nhóm TestFlight | `External Testing` (public link `https://testflight.apple.com/join/Gtam9JjQ`), `External Test` (`…/1E2u6q7z`), `External` (`…/4SudDyM3`), nhiều nhóm internal |

⇒ WIN có thể **tạo provisioning profile** (Ad Hoc cho 9 UDID, hoặc App Store) và **nộp build** mà không cần Mac.

## 4. Việc WIN self-serve được và việc còn phải chốt

**Làm được ngay (không cần Mac, không cần ai thức):**
1. Gộp fix MTU (`origin/mac/ios-mtu-1300`, 23/09 15:41 +0800) vào `main` + **tăng `MARKETING_VERSION` 1.4.2 → 1.4.3**
   (`CURRENT_PROJECT_VERSION` 20) → push `main` ⇒ Xcode Cloud **tự build** trên macOS của Apple.
2. Theo dõi build run + log qua API (`/v1/ciBuildRuns/{id}`, `/v1/ciBuildActions`), tải artifact.
3. Tạo profile + nộp App Store Connect / TestFlight bằng API (`scripts/asc-beta.mjs submit`) — kênh **App Store Connect**.
4. Publish buy: đặt IPA + `PATCH /v1/admin/app-version {latest_version:"1.4.3", ipa_build:"20"}` (WIN đã có đường sẵn).

**Phải chốt trước khi làm (rủi ro thật, không tự quyết):**

| # | Điểm phải chốt | Vì sao |
|---|---|---|
| A | **Credential hysteria2 (`HYST_PASSWORD`/`HYST_OBFS`) cho build trên cloud** | `project.yml` lấy `HysteriaPassword: $(HYST_PASSWORD)` — giá trị **không nằm trong repo**. Nếu Xcode Cloud không có 2 biến này (Xcode Cloud env var, API không đọc được) thì build ra **app cài được nhưng KHÔNG kết nối được** — đúng sự cố “Invalid user” 22/09. Phải xác nhận trong Xcode Cloud → Settings, hoặc lấy giá trị từ cấu hình relay trên node-2 rồi đặt env cho workflow. |
| B | **Kênh buy cần IPA Ad Hoc** | Xcode Cloud ký ra bản **App Store/TestFlight**, KHÔNG phải Ad Hoc (Ad Hoc cần `codesign` trên macOS). Hai đường: (i) WIN re-sign trên Linux (zsign) bằng chứng chỉ Ad Hoc do WIN tạo qua API + profile 9 UDID — làm được nhưng mất thêm ~30–60 phút và là công cụ mới; (ii) đổi nút iOS trên buy sang **link TestFlight công khai** (đã có sẵn `https://testflight.apple.com/join/...`) — tức thì, nhưng đổi trải nghiệm khách và cần Beta App Review cho tester ngoài. |
| C | **§2c (test trên iPhone thật trước khi phát)** | Luật của chính chủ dự án (chốt 22/09). WIN không có iPhone ⇒ bản build trên cloud **chưa được test máy thật**; nếu phát luôn thì vi phạm luật này. Cần anh chốt: phát nóng, hay test trước rồi mới phát. |

## 5. Lệnh mẫu (chạy từ node-2; WIN điều khiển)

```bash
# kích build run cho 1 nhánh/tag (sau khi workflow đã bật)
curl -s -X POST https://api.appstoreconnect.apple.com/v1/ciBuildRuns \
  -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"data":{"type":"ciBuildRuns","relationships":{
        "workflow":{"data":{"type":"ciWorkflows","id":"27EF970F-C793-44CA-BEE4-166E242DC7E7"}},
        "sourceBranchOrTag":{"data":{"type":"scmGitReferences","id":"<REF_ID>"}}}}}'

# theo dõi
GET /v1/ciBuildRuns/<id>            # executionProgress, completionStatus, startReason
GET /v1/ciBuildRuns/<id>/actions    # từng action + log
```
(Đường chắc ăn nhất: push `main` — workflow có `branchStartCondition` pattern `main` nên tự chạy.)

## 6. Trạng thái sổ giao việc

- `T-20260923-02` (buy) / `T-20260923-03` (App Store Connect): mở lại — “mac bị sleep” không còn là rào cứng.
- `T-20260923-05` (giao Mac build+ký): **treo/huỷ theo lệnh chủ dự án (#348)** — WIN tự làm.
- `T-20260923-06`: việc “WIN take over build + publish iOS 1.4.3”.
