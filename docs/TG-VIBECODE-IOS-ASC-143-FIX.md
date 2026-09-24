# iOS 1.4.3 lên App Store Connect — Apple CHẶN vì lỗi BUILD (không phải lỗi kênh nộp)

> Ai đo: harness **WIN** · lúc **2026-09-24T01:0xZ** (08:0x VN) · nguồn: task `T-20260923-03` / `T-20260923-06`
> (owner→win), `T-20260923-05` (win→mac, đã verify pass) · mọi số dưới đây đọc trực tiếp từ API Apple.

## 0. Kết luận ngắn

| Kênh | Trạng thái | Bằng chứng |
|---|---|---|
| **buy / install-ios** | ✅ **XONG — 1.4.3 (build 20)** | xem `T-20260923-02` (đã done) |
| **App Store Connect** | ❌ **CHƯA LÊN ĐƯỢC — lỗi ở bản build**, không phải ở kênh nộp | Apple `buildUpload` state=`FAILED`, 3 lỗi ITMS bên dưới |

WIN **đã nộp được** build lên App Store Connect từ Linux/Windows (API REST `buildUploads`, không cần macOS):
asset tải lên **COMPLETE**, Apple đã nhận file — nhưng **validate nội dung thất bại**. Vậy đường nộp
đã thông; cái chặn là **bản IPA** do Mac build.

## 1. Bằng chứng đo được (API App Store Connect, app 6804150049)

```
POST /v1/buildUploads  -> buildUploadId 414c4ea0-a754-47fe-9c45-23190fa02cd0  (1.4.3 / 20)
POST /v1/buildUploadFiles -> buildUploadFileId ad41388e-9140-4066-9ad2-d2b888fa5f17
   assetDeliveryState = COMPLETE · assetToken = PurpleSource211/…  (file đã lên Apple)
PATCH /v1/buildUploadFiles/<id> {uploaded:true}  -> OK
GET /v1/buildUploads/<id>  -> state.state = "FAILED"
```

`state.errors` (nguyên văn Apple):

1. **ITMS-90046 — Invalid Code Signing Entitlements.**
   `value 'hotspot-provider' for key 'com.apple.developer.networking.networkextension' in 'Payload/FlowVPN.app/FlowVPN' is not supported.`
2. **ITMS-90171 — Invalid bundle structure.**
   `The "FlowVPN.app/Frameworks/Hysteria.framework/Versions/A/Hysteria" binary file is not permitted. Your app cannot contain standalone executables or libraries, other than a valid CFBundleExecutable of supported bundles.`
3. **ITMS-90046** — như (1), nhưng ở `Payload/FlowVPN.app/PlugIns/PrivateVPNPacketTunnel.appex/PrivateVPNPacketTunnel`.

Hệ quả: `GET /v1/builds` vẫn **mới nhất là build 18** (1.4.1, VALID 22/09). Không có build 20 nào được tạo.

## 2. IPA đã giao có đúng số version, nhưng sai cấu trúc & entitlement

`/root/flowvpn-ipa/incoming/VPNFlow-1.4.3-b20-asc.ipa` (trên node-2):
`main = 1.4.3/20`, `appex = 1.4.3/20`, profile `iOS Team Store Provisioning Profile: com.privatevpn.app`
(`provisionedDevices=false`, `beta-reports-active=true`, `get-task-allow=false`, hết hạn 2027-07-19)
— **ký đúng kiểu App Store**, sha256 `881e2639d29d0cf7f16b5aff7dc73ac542df350a363bcef74510908baadfd238`.

Lỗi nằm **bên trong bundle**, đọc được từ chính IPA:

```
Payload/FlowVPN.app/Frameworks/Hysteria.framework/Versions/A/Hysteria   51360 B   <-- ITMS-90171
Payload/FlowVPN.app/Frameworks/Hysteria.framework/Versions/A/Resources/Info.plist
```

## 3. Gốc lỗi (đọc từ repo, không đoán)

Branch đã commit của lượt này: **`origin/mac/ios-1.4.3-20`** (head `8d78b0e`).

| # | Gốc | Bằng chứng |
|---|---|---|
| 1 | `Hysteria.xcframework` để **`embed: true`** cho target iOS | `project.yml` @ `origin/mac/ios-1.4.3-20`: `- framework: iOS/Frameworks/Hysteria.xcframework` → `embed: true`. Đây **đúng lỗi đã từng sửa** cho 1.4.1/18 ở branch `mac/ios-testflight-embed-fix` (commit `68f2095`: `embed: false`). Bản 1.4.3 build lại đã quay về `embed: true`. |
| 2 | Entitlements **thực tế dùng lúc ký** có `hotspot-provider` (giá trị chỉ hợp lệ trên macOS) | Apple ITMS-90046 ở **cả** app lẫn appex. Lưu ý: `iOS/PrivateVPN/PrivateVPN.entitlements` và `iOS/PrivateVPNPacketTunnel/PacketTunnel.entitlements` trên branch **chỉ có `packet-tunnel-provider`** ⇒ file nguồn sạch, nên `hotspot-provider` đến từ **cây làm việc `rel143` chưa commit** (Mac khai "se commit sau") hoặc từ entitlements khác dùng khi export. Mac phải kiểm lại entitlements **thật sự đem đi ký**. |

## 4. Việc cần làm — MAC (trên macOS), 1 mạch

1. `project.yml`: đặt `embed: false` cho `iOS/Frameworks/Hysteria.xcframework` (giữ nguyên cho macOS nếu cần).
2. Chốt entitlements iOS dùng lúc ký cho **cả 2 target** (`PrivateVPN` + `PrivateVPNPacketTunnel`):
   chỉ `packet-tunnel-provider`; **bỏ `hotspot-provider`**.
3. `xcodegen` → `xcodebuild archive` → export **`app-store-connect`** với
   `MARKETING_VERSION = 1.4.3`, `CURRENT_PROJECT_VERSION = 21` (bump 20→21 cho sạch; build 20 đã FAILED).
4. Kiểm **trước khi gửi**:
   ```bash
   # không còn framework nhúng
   unzip -l <ipa> | grep -c 'Frameworks/Hysteria.framework/Versions/A/Hysteria'   # phải = 0
   # entitlements thật trong chữ ký (không còn hotspot-provider)
   codesign -d --entitlements :- <Payload/FlowVPN.app> 2>/dev/null | grep hotspot-provider   # phải rỗng
   ```
5. `scp <ipa> root@165.101.114.162:/root/flowvpn-ipa/incoming/VPNFlow-1.4.3-b21-asc.ipa`
   → **WIN nộp lại** (đã chạy thật, chỉ còn chờ Apple):
   ```bash
   node ops/asc-upload-build.mjs --apply --ipa /root/flowvpn-ipa/incoming/VPNFlow-1.4.3-b21-asc.ipa \
       --expect-version 1.4.3 --expect-build 21 --wait 900
   ```

## 5. Nghiệm thu (chủ dự án tự kiểm)

```
GET /v1/builds?filter[app]=6804150049&sort=-uploadedDate
  -> build mới nhất có preReleaseVersion = 1.4.3 và processingState = VALID
```
Công cụ: `node ops/_scratch/asc-status.mjs` (node-2) hoặc `node ops/asc-upload-build.mjs --status`.

## 6. Lưu ý §2c (test máy thật)

Sau khi sửa, bản ASC là **binary mới** (khác bản ad-hoc 1.4.3/20 đang phát ở buy, đã test). Luật §2c của
chủ dự án: test trên iPhone thật trước khi phát. Nên test lại bản mới (tối thiểu: mở app + kết nối VPN +
login) trước khi mời tester ngoài, hoặc chủ dự án miễn §2c cho lượt này.
