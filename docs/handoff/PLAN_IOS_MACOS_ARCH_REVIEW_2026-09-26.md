# KẾ HOẠCH XỬ 4 MỤC — `HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md`

- **Ngày:** 2026-09-26 · **Người lập:** Solution Architect (DSH harness Mac)
- **Nguồn:** `docs/handoff/HANDOFF_IOS_MACOS_ARCH_REVIEW_2026-09-26.md` (reviewer, `needs_review`)
- **Kết luận xác minh:** **cả 4 finding ĐÚNG** — em đã đọc từng dòng code được dẫn, không có mục nào sai.
- **Điểm đáng nói:** **F3 và F4 là do chính thay đổi 26/09 của em** (thêm 2 cửa `t1` + nới timeout). Em nhận, và sửa trước.

## 1. Bảng tổng — thứ tự làm, ai làm, ước lượng

| # | Mức | Việc | File | Ai | Ước lượng | Phụ thuộc |
|---|---|---|---|---|---|---|
| **F4** | Medium | Timeout lệch: 35 s < 4 cửa × 10 s | `HysteriaPacketTunnelProvider.swift`, `HysteriaTransport.swift` | **Mac (SA)** | 15 phút | — |
| **F3** | Medium | Relay chéo node (fallback toàn cục) | `iOS/…/VPNManager.swift`, `mac/…/VPNManagerMac.swift`, `HysteriaDefaults.swift` | **Mac (SA)** | 30 phút | — |
| **F1** | High | macOS chưa parity `TUNNEL_NO_TRAFFIC` | `mac/PrivateVPNMac/VPNManagerMac.swift` | **Mac (SA)** | 20 phút | — |
| **F2** | High | Update gate chưa so **build** | `control-plane/src/app-version.js` (**KHÔNG protected**) + `AppVersionService.swift`, `ControlAPIClient.swift` | Mac (client) **+ phối hợp deploy CP** | 1–2 h | cần deploy control-plane |

**Đề xuất nhịp:** gộp **F4 + F3 + F1** vào **một vòng build** (đều là client, không cần server) → test máy thật → rồi mới làm **F2** (cần deploy CP) ở đợt sau.

## 2. Chi tiết từng mục

### F4 — Timeout lệch (Medium) · SỬA NGAY

**Hiện trạng (đã đo):** `startTimeout = 35` nhưng `relayOpenGrace = 10` và **4** cửa vào
⇒ trần lý thuyết **40 s > 35 s** ⇒ provider có thể cắt ngang trước khi thử hết cửa.
Reviewer đúng; đây là **lỗi số học của em** khi thêm 2 cửa `t1` mà chỉ nới ngân sách 20 → 35.

**Sửa:** đừng viết số cứng — **tính từ hằng số** để không bao giờ lệch lại:

```swift
// HysteriaPacketTunnelProvider
private static let startTimeout: TimeInterval =
    HysteriaDefaults.relayOpenGrace * Double(HysteriaDefaults.relayURLCandidates.count + 1) + 5
```
- `relayOpenGrace` hiện `private` trong `HysteriaTransport` ⇒ **chuyển sang `HysteriaDefaults`**
  (một nguồn sự thật, và **test thuần logic kiểm được**).
- `+1` vì `relayCandidates = [relayURL] + relayURLCandidates`; `+5` là margin khởi động Go/QUIC.

**AC:** có **test thuần logic** khẳng định `startTimeout ≥ relayOpenGrace × (số cửa thực tế) + margin`.
Cổng: typecheck 0 lỗi · pure-logic PASS.

### F3 — Relay chéo node (Medium) · SỬA NGAY

**Hiện trạng (đã đo, và nặng hơn review mô tả):**
```swift
// iOS/PrivateVPN/VPNManager.swift:810
let relay = (node?.endpoint == endpoint ? node?.hysteriaRelayURL : nil)
    ?? HysteriaDefaults.relayURLCandidates.first ?? ""       // ← mượn relay của NODE KHÁC
"relayURLCandidates": HysteriaDefaults.relayURLCandidates,   // ← cả 2 node (4 mục)
```
Nếu node đang chọn **không** khai `hy_relay_url` ⇒ client dial relay của **node khác** trong khi
`serverHost` là node đã chọn ⇒ QUIC tới sai node, **im lặng** (đúng loại lỗi khó chẩn đoán).
Bản 26/09 của em còn **thêm 2 mục chéo node** (`t1/vn1hy`, `t1/vn2hy`) ⇒ làm nặng thêm.

**Sửa:** candidate **chỉ thuộc node đang chọn**. Node không khai relay ⇒ **UDP trực tiếp**, KHÔNG mượn.
Kèm: log rõ `dùng UDP trực tiếp (node không khai relay)` + gửi mã `relayURLMissing` (đã có sẵn ở macOS).

**AC:** quét code: không còn đường nào ghép `serverHost` của node A với relay của node B.
Test máy thật: chọn node không có relay ⇒ log ghi UDP trực tiếp và tunnel vẫn lên.

### F1 — macOS parity `TUNNEL_NO_TRAFFIC` (High)

**Hiện trạng (đã đối chiếu):**
```swift
// mac/…/VPNManagerMac.swift:312
guard code == TunnelDiagnosticCode.noTraffic || code == TunnelDiagnosticCode.startFailed else { return }
// …rồi HẠ tunnel cho CẢ HAI mã
```
```swift
// iOS/…/VPNManager.swift:363  — cố ý KHÁC
// `noTraffic` KHÔNG đủ để APP hạ tunnel (25/09/2026): extension có watchdog + dựng lại + tự đổi node
guard code == TunnelDiagnosticCode.startFailed else { … }   // chỉ startFailed mới hạ
```
⇒ macOS vẫn "tự ngắt" trong cửa sổ no-traffic mà extension **đang tự cứu** ⇒ đúng triệu chứng
khách phàn nàn, và **lệch** với bản iOS đã sửa.

**Sửa:** mirror iOS — `noTraffic` ⇒ log 1 lần + (tuỳ chọn) hiện cảnh báo, **KHÔNG** `stopVPNTunnel()`,
KHÔNG `stopProviderDiagnosticsPolling()`; chỉ `startFailed` mới hạ.
Xử lý cache: **chỉ xoá `TunnelConfigCache`/`ExitNodeCache` khi `startFailed`** (trả lời câu hỏi mở #3).

**AC:** macOS + mã `noTraffic` ⇒ tunnel **vẫn Connected**, log có dòng nói rõ "noTraffic nhưng KHÔNG hạ
(để extension tự cứu)"; không có `stopVPNTunnel` trong đường đó.

### F2 — Update gate theo **build** (High)

**Hiện trạng (đã đo cả 2 phía):**
- Client: `AppVersionService.isForcedUpdate/isUpdateAvailable` chỉ so `CFBundleShortVersionString`
  với `minimum_version`/`latest_version`; `AppVersionInfo` **không có** field build; `id` chỉ ghép version.
- Server: `/v1/app-version?platform=ios` **hôm nay KHÔNG trả build** (em gọi thật):
  ```json
  {"platform":"ios","minimum_version":"1.3.3","latest_version":"1.4.6","ipa_url":"…","ipa_manifest_url":"…"}
  ```
  Nhưng server **có** `ios_ipa_build` (admin `PATCH /v1/admin/ios-version`) và `manifest.plist`
  **đã** dùng nó (`bundle-version`). ⇒ Thiếu đúng một bước: **expose ra payload**.

**Sửa 2 phía:**
1. **Server** — `control-plane/src/app-version.js` (**KHÔNG nằm trong vùng bảo vệ**; khác `index.js`):
   thêm `latest_build` (và `minimum_build` nếu muốn chặn cứng theo build) cho `iosVersionPayload`
   và `macVersionPayload`, đọc `ios_ipa_build` / key mac tương ứng.
2. **Client** — `AppVersionInfo` thêm `latest_build: Int?`; so **`(version, build)`**:
   - `isForcedUpdate`: version < min, **hoặc** version == min && build < minBuild;
   - `isUpdateAvailable`: version < latest, **hoặc** version == latest && build < latestBuild;
   - `id` **gồm build** (`"\(min)-\(minBuild)-\(latest)-\(latestBuild)"`) để sheet SwiftUI refresh khi chỉ build đổi (đúng như reviewer nói).

**AC:**
- `curl /v1/app-version?platform=ios` có `latest_build`;
- test thuần logic: cùng `1.4.6` mà build `56` < `57` ⇒ `isUpdateAvailable == true`;
- build bằng nhau ⇒ `false` (không nhắc oan).

**Rủi ro/chặn:** cần **deploy control-plane** ⇒ phải phối hợp owner `windows` (deploy CP là việc của họ;
`index.js` là vùng bảo vệ). **Làm ở đợt riêng**, sau khi 3 mục client đã lên.

## 3. Trả lời 3 câu hỏi mở của reviewer

1. **Field build của `/v1/app-version` hôm nay là gì?** → **KHÔNG có field nào.** Server lưu
   `ios_ipa_build`; `manifest.plist` đã phát nó dưới khoá `bundle-version`. Việc cần làm là **expose**
   thành `latest_build` trong `app-version.js` (không phải đổi `index.js`).
2. **Thiếu `hy_relay_url` ⇒ lỗi cứng hay cho UDP trực tiếp?** → **UDP trực tiếp** (không mượn relay
   node khác), kèm log + mã `relayURLMissing` để UI nói rõ. Lý do: mượn relay node khác là **sai đích
   một cách im lặng** — tệ hơn hẳn việc chậm.
3. **macOS có xoá cache ở lần `noTraffic` đầu không?** → **Không** — chỉ xoá khi `startFailed`
   (mirror iOS). Xoá cache trong cửa sổ no-traffic có thể làm mất cấu hình đang tự cứu được.

## 4. Việc cần chủ dự án chốt

1. **Duyệt nhịp:** F4+F3+F1 một vòng build (client) → test máy thật → F2 (kèm deploy CP) đợt sau?
2. **F2:** có cho phép đụng `control-plane/src/app-version.js` + phối hợp deploy CP không?
3. **F3:** xác nhận "node không khai relay ⇒ UDP trực tiếp" là hành vi mong muốn (thay vì báo lỗi chặn)?

## 5. Bằng chứng xác minh của bản kế hoạch này

```text
Đọc code (dẫn dòng): mac/…/VPNManagerMac.swift:295-320 · iOS/…/VPNManager.swift:355-375
  · iOS/…/Services/AppVersionService.swift:18-45 · iOS/…/Services/ControlAPIClient.swift:300-320
  · iOS/…/VPNManager.swift:805-820 · control-plane/src/index.js:4402-4404 · app-version.js
Gọi thật: curl "/v1/app-version?platform=ios" -> KHONG co field build
Đo hằng số: startTimeout=35 · relayOpenGrace=10 · so cua=4  => 40s > 35s  (F4 DUNG)
Coordination: check + claim docs/handoff/PLAN_… trên node-2 (không ai giữ)
```

---

# PHẦN THI CÔNG — Nhịp 1 (F4 + F3 + F1) · xong 26/09/2026

## Trạng thái

| # | Mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| **F4** | Ngân sách phiên lệch | ✅ **XONG** | `sessionStartBudget = relayOpenGrace × maxRelayDoorsPerNode + 5` = **25 s**; **+2 test** kiểm bất biến |
| **F3** | Relay chéo node | ✅ **XONG** | `sameNodeRelayAlternates` (đổi host, GIỮ path) + **+5 test**; gỡ cả fallback toàn cục trong extension |
| **F1** | macOS parity `noTraffic` | ✅ **XONG** | macOS không hạ tunnel khi `noTraffic`; thêm cờ `noTrafficReported` (mirror iOS) |
| **F2** | Update gate theo build | ⏳ **CHƯA** | Cần deploy control-plane ⇒ Nhịp 2 (chờ chủ dự án) |

## Thay đổi cụ thể

| File | Sửa |
|---|---|
| `iOS/PrivateVPN/Services/HysteriaDefaults.swift` | Thêm `relayOpenGrace = 10`, `maxRelayDoorsPerNode = 2`, `sessionStartBudget` (**tính**, không số cứng); **thay** `relayURLCandidates` toàn cục bằng `sameNodeRelayAlternates(for:)` |
| `iOS/PrivateVPNPacketTunnel/HysteriaTransport.swift` | `relayOpenGrace` trỏ về `HysteriaDefaults` (một nguồn sự thật) |
| `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | `startTimeout` **tính** từ `HysteriaDefaults.sessionStartBudget`; fallback candidate trong bộ đọc cấu hình **chỉ suy từ relay của chính node** (gỡ danh sách toàn cục) |
| `iOS/PrivateVPN/VPNManager.swift` | `relayURL` = relay của ĐÚNG node; `relayURLCandidates` = cửa cùng node; **bỏ** fallback `relayURLCandidates.first` |
| `mac/PrivateVPNMac/VPNManagerMac.swift` | Y hệt iOS về relay; **F1**: tách `noTraffic` (KHÔNG hạ tunnel) khỏi `startFailed` (hạ) + cờ `noTrafficReported` |
| `scripts/ios-typecheck.sh` | **Mở rộng phủ macOS** (trước chỉ iOS) — bản review đánh giá parity macOS là rủi ro cao nhất mà lại không có cổng biên dịch nào |
| `scripts/ios-pure-logic-tests/main.swift` | **+7 test** (5 cho F3, 2 cho F4) |

## Bài học bắt được trong lúc làm (ghi để không lặp)

1. **Đụng tên hằng số**: `HysteriaDefaults` **đã có** `startTimeout = 20` với nghĩa KHÁC ("khi nào rơi về
   WireGuard"). Hằng mới của em ban đầu trùng tên ⇒ **lỗi biên dịch**. Đã đổi thành
   `sessionStartBudget`. ⇒ Trước khi thêm hằng số, **grep tên trước**.
2. **Cổng typecheck bắt được 1 chỗ sót thật**: fallback toàn cục trong
   `HysteriaPacketTunnelProvider` (dòng ~3955) mà em quên khi gỡ `relayURLCandidates`. Nếu không có
   cổng thì lỗi này chỉ lộ ra ở build archive.
3. **Cổng typecheck trước đây KHÔNG phủ macOS** ⇒ sửa macOS xong không có gì kiểm. Đã đóng lỗ hổng.

## Bằng chứng cổng (sau thi công)

```text
bash scripts/ios-typecheck.sh      -> extension 0 lỗi · app 0 lỗi · macOS 0 lỗi   (3 target)
bash scripts/ios-pure-logic-tests  -> 524/524 PASS, 0 FAIL   (trước Nhịp 1: 517)
python3 scripts/ios-lint-locks.py  -> ĐẠT
bash scripts/archive-appstore.sh ios adhoc -> ARCHIVE SUCCEEDED + EXPORT SUCCEEDED
bash scripts/ios-verify-ipa.sh … --version 1.4.6 --build 57 -> ✅ ĐẠT — được phép cài/phát hành
devicectl install                  -> iPhone OK · iPad: máy `unavailable` (khác mạng), cài sau
```

Bản build: **1.4.6 / build 57**.

## Việc còn lại

1. **iPad**: cài bản 57 khi máy về cùng mạng.
2. **Nghiệm thu máy thật** cho 57 (5G: còn `IPv6-chặn` tăng, không `errno=2`, Netflix OK).
3. **F1 cần test macOS thật**: cần một phiên macOS có mã `noTraffic` để xác nhận **không** bị hạ tunnel.
4. **F2 (Nhịp 2)**: chờ chủ dự án duyệt đụng `control-plane/src/app-version.js` + phối hợp deploy CP.
