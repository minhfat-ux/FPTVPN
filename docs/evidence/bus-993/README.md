# bus-993 — iOS 1.4.7 build 81 không connect (reopened) → đã ghi sổ/tag build 87, còn §7d

**Ngày:** 2026-10-20 (UTC+7) · **Máy:** MAC · **Kênh:** iOS Ad Hoc
**Trạng thái:** `blocked` — đã xong mục ghi sổ + tag; **chưa có log máy thật cho đúng IPA 87 đã ký lại** (§7d).

## 1. Chủ dự án xác nhận + nguyên nhân gốc

- Bus #993 (win → mac): *"xac nhan voi Mac, ban build 81 cua iOS bi loi khong connect duoc nhe!"*
- Bus #998 (owner → mac): *"kiểm tra lại bug mà bản 81 đang không connect được, fix ngay"*.
- Nguyên nhân gốc: commit `26c0f37` đặt `state = .connecting` **trước** chốt chống bấm đôi; chốt thấy
  `.connecting` rồi `return` ⇒ mọi cú bấm Connect bị nuốt, app kẹt `.connecting`, không tunnel.
- Bản sửa: `37e1148` — bỏ chỗ đặt `.connecting` trước chốt (build 85), đã kiểm trên iPhone thật.
- Build 87 phát ngay = app bundle build 87 có sẵn (`.privatevpn/tmp/ipa87`, 8.243.608 B) **ký lại Ad Hoc**,
  không build lại. N tunnel trong build 87 **mặc định 1 (TẮT)**; build 88 (`27eb6e6`, N=4 mặc định)
  **không phát** vì biên bản N=4 ghi "chưa đạt".

## 2. Đã đóng mục "ghi sổ + tag" (WIN yêu cầu)

- Repo: `minhfat-ux/FPTVPN` (GitHub), nhánh `main`.
- Commit ghi sổ: **`722b529`** — `release(ios): ghi so 1.4.7/build 87 ... + tag ios-v1.4.7-b87`.
- Tag: **`ios-v1.4.7-b87`** → `ec0e18580cb98fed8338769db0a13b08bfb5ef6c`.
  - `ec0e185` là commit chứa thay đổi **nối dây N tunnel**; commit này ghi `CURRENT_PROJECT_VERSION: "88"`.
  - **Không có commit nào ghi version 87**: artifact 87 build từ working tree lúc `2026-10-19 13:56 +08`
    (trước `ec0e185`), nên tag neo commit code gần nhất và ghi rõ điều này trong annotation.
  - Đã `git push origin main` + `git push origin ios-v1.4.7-b87` (thành công).
- Dòng sổ `release/releases.jsonl` có đủ: `build=87`, `sha256=0a912cc9…`, `size=8243806`,
  `marker_latest=1.4.7`, `marker_build=87`, `internal_version=1.4.7`, `internal_build=87`,
  `commit=ec0e185…`, `tag=ios-v1.4.7-b87`, `allow-rehash` + lý do chốt của chủ dự án.

## 3. Bằng chứng kênh phát (MAC kiểm độc lập, 20/10)

| Kiểm | Kết quả |
|---|---|
| `GET https://api.meetflowai.site/v1/app-version?platform=ios` | `latest_version=1.4.7`, `minimum_version=1.3.3` |
| Tải thật `https://t1.meetflowai.site/v1/downloads/ios` | HTTP 200 · **8.243.806 B** · sha256 **0a912cc9d59f83f5a559eb789de7670ea88192a8c8325e36d9966cb5cc8c73ea** |
| `manifest.plist` | `bundle-version=87`, `bundle-identifier=com.privatevpn.app` |
| Giải nén IPA | app + `PrivateVPNPacketTunnel.appex` đều `1.4.7 / 87` |
| `codesign --verify --deep --strict` | app + appex **valid on disk / satisfies DR** |
| Entitlements appex | `get-task-allow=false`, `application-identifier=G6XW3RN6LJ.com.privatevpn.app.packet-tunnel` |
| Appex có core N? | `_MultitunnelConnectSlot` có mặt; nhưng **app truyền N=1 mặc định** (giá trị `?? 1` trước `27eb6e6`) |

## 4. §7d — chưa làm được vì không có iPhone

- `xcrun devicectl list devices` (20/10): iPhone `Minh's iphone` (`33987D6F-…`, iPhone 14 Pro Max) và
  2 iPad đều **`unavailable`**, `tunnelState: unavailable`, `transportType: nil`.
- Thử cài thật:
  `xcrun devicectl device install app --device 33987D6F-... /tmp/live-check-ios.ipa`
  → **lỗi 1011**: `CoreDeviceService was unable to locate a device matching the requested device identifier`.
- Log build 87 trên máy thật **có sẵn** ở `.privatevpn/tmp/b87*` (phiên 13:57–14:11, iPhone 33987D6F;
  4 `handshake ok` = N=4), nhưng:
  - Đó là **bản test trước khi ký lại**, không phải đúng IPA đang phát.
  - Chạy `python3 scripts/ios-log-acceptance.py .privatevpn/tmp/b87n1b/relay.log` trên log **cộng dồn**
    cho kết quả **KHÔNG ĐẠT 8/23 phiên** — lỗi thuộc các build 80/81/85 cũ trong cùng file; không dùng
    làm nghiệm thu cho IPA 87 được.
- Vì vậy **không coi là xong**: cần chủ dự án cắm iPhone (hoặc gửi `Documents/app.log` + `relay.log`)
  rồi chạy cổng §7d trên **một phiên sạch của đúng IPA 87**.

## 5. Việc còn lại (chủ dự án)

1. Cắm iPhone `33987D6F` vào Mac (hoặc bật "Connect via network"), cài lại từ
   `https://t1.meetflowai.site/install/ios` (Safari), bấm **Connect**.
2. Gửi `Documents/app.log` + `Documents/relay.log` (hoặc cho Mac kéo bằng `xcrun devicectl device copy from`).
3. Mac chạy: `python3 scripts/ios-log-acceptance.py <relay.log> --crash-dir <crash>` — exit 0 mới đạt.
4. Sau đó `done` lại bus-993/bus-990 kèm log + kết quả cổng.

## 6. Ghi chú

- `release-lock.json` vẫn ghim iOS **build 80** (chủ dự án chốt 20/10) trong khi kênh đã phát 87 để sửa
  lỗi connect. Cần chủ dự án chốt lại khoá (80 hay 87) trước lần phát sau — **không tự sửa khoá**.
- `release-record.mjs verify --platform ios` vẫn báo 8 lỗi **lịch sử** (các cặp sha 1.4.6/macOS 1.4.7 cũ
  chưa được đánh dấu ngoại lệ); dòng build 87 mới không thêm lỗi mới.
- Các lệnh/kiểm tra ở trên chạy trên MAC; riêng ghi sổ + tag thực hiện qua clone sạch trong workspace
  (sandbox không cho ghi trực tiếp `/Volumes/BIWIN/SourcesCode/PrivateVPN`) rồi push lên `origin/main`.
