# macOS — KÝ DEVELOPER ID + NOTARIZE (quy trình chuẩn, đã chạy thật 20/09/2026)

> Mục đích: khách tải DMG về **mở được ngay**, không còn cảnh báo *“Apple không thể xác minh…”*.
> Trước đây DMG không ký/không notarize ⇒ Gatekeeper chặn (`source=no usable signature`).

## 0. Khoá & chứng chỉ (KHÔNG hỏi lại chủ dự án — đã có sẵn)
| Thứ | Ở đâu |
|---|---|
| `.p8` (App Store Connect API key) | Mac: `~/.vpnflow-asc/AuthKey.p8` · VPS: `/root/flowvpn-cp/data/apple-asc.json` (field `privateKey`, kèm `keyId`, `issuerId`) |
| keyId / issuerId | trong chính `apple-asc.json` (ví dụ keyId `8GW366…`, issuer `7a64d085…`) |
| Cert ký | `security find-identity -v -p codesigning` → **Developer ID Application: Minh Nguyen (G6XW3RN6LJ)** |
| altool dùng key | copy `.p8` vào `~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8` |

## 1. Tạo provisioning profile Developer ID bằng API (không cần portal, không cần Xcode account)
Profile Developer ID cho macOS **không cần UDID**. Tạo bằng script JS (Node có sẵn, không cần thư viện):
- JWT ES256: ký bằng `crypto.createSign('SHA256')` với `dsaEncoding: 'ieee-p1363'` (raw R||S — **bắt buộc**, DER sẽ sai).
- `aud: 'appstoreconnect-v1'`, `kid: <keyId>`, `iss: <issuerId>`, hạn 15 phút.
- Lấy bundle id: `GET /v1/bundleIds` → map theo `attributes.identifier`.
- Lấy cert: `GET /v1/certificates?filter[certificateType]=DEVELOPER_ID_APPLICATION`.
- Tạo: `POST /v1/profiles` với `attributes.profileType = **MAC_APP_DIRECT**`
  ⚠️ **KHÔNG** dùng `MAC_APP_DEVELOPER_ID` — API trả 409 *“not a valid value”* (đã mất thời gian vì lỗi này).
- `attributes.profileContent` (base64) → ghi ra `<bundle>.provisionprofile`.
Script tham chiếu: `/tmp/asc-profiles.mjs` (tạo lại nhanh: JWT + 3 request trên).

## 2. Ký (inside-out, KHÔNG dùng export của Xcode để tránh “Cloud signing permission error”)
```bash
ID="Developer ID Application: Minh Nguyen (G6XW3RN6LJ)"
APP=…/VPNFlow.app; APPEX="$APP/Contents/PlugIns/PrivateVPNMacPacketTunnel.appex"

# (a) nhúng profile vào app + extension
cp com.privatevpn.mac.provisionprofile                "$APP/Contents/embedded.provisionprofile"
cp com.privatevpn.mac.packet-tunnel.provisionprofile  "$APPEX/Contents/embedded.provisionprofile"

# (b) KÝ FRAMEWORK CON TRƯỚC (nếu bỏ bước này, notarize sẽ Invalid)
codesign --force --options runtime --timestamp --sign "$ID" "$APPEX/Contents/Frameworks/Hysteria.framework/Versions/A/Hysteria"
codesign --force --options runtime --timestamp --sign "$ID" "$APPEX/Contents/Frameworks/Hysteria.framework"

# (c) rồi mới tới extension và app (giữ nguyên quyền bằng entitlements hiện có)
codesign -d --entitlements :- "$APPEX" > /tmp/ext.ent ; codesign -d --entitlements :- "$APP" > /tmp/app.ent
codesign --force --options runtime --timestamp --sign "$ID" --entitlements /tmp/ext.ent "$APPEX"
codesign --force --options runtime --timestamp --sign "$ID" --entitlements /tmp/app.ent "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"      # phải "valid on disk"
spctl -a -vv "$APP"    # trước notarize sẽ là: rejected / source=Unnotarized Developer ID  ← ĐÚNG, không phải lỗi
```

## 3. DMG
```bash
mkdir dmgstage && cp -R "$APP" dmgstage/ && ln -s /Applications dmgstage/Applications
printf 'Hướng dẫn…\n' > "dmgstage/HƯỚNG DẪN.txt"
hdiutil create -volname VPNFlow -srcfolder dmgstage -ov -format UDZO -quiet VPNFlow-mac.dmg
codesign --force --timestamp --sign "$ID" VPNFlow-mac.dmg          # ký file DMG
```

## 4. Notarize + staple (thứ tự BẮT BUỘC)
```bash
xcrun notarytool submit VPNFlow-mac.dmg --key ~/.vpnflow-asc/AuthKey.p8 \
      --key-id "$KEYID" --issuer "$ISSUER" --wait        # phải: status: Accepted
xcrun stapler staple VPNFlow-mac.dmg                     # "The staple and validate action worked!"
xcrun stapler validate VPNFlow-mac.dmg
spctl -a -t open --context context:primary-signature -vv VPNFlow-mac.dmg   # accepted / Notarized Developer ID
```
⚠️ **Ký DMG SAU khi staple sẽ làm vé staple mất hiệu lực** ⇒ nếu ký lại, phải **submit + staple lại** (đúng thứ tự: ký → submit → staple).

### 4a. CỔNG CHẶN BẮT BUỘC (thêm 22/09/2026 — sau sự cố khách báo *"cài xong không mở được"*)
```bash
python3 scripts/check-publish-version.py --platform macos --file VPNFlow-mac.dmg --version 1.4.0 --build 14
```
Cổng này (chạy trên macOS) kiểm **4 thứ** và **chặn** nếu sai: `xcrun stapler validate` trên DMG,
`stapler validate` trên `.app` bên trong, `spctl -a -t open --context context:primary-signature`,
và `codesign --verify --deep --strict`. Trên máy không phải macOS nó báo `KHÔNG KIỂM ĐƯỢC` (exit 2),
**không** giả vờ đạt.

Vì sao cần: `spctl` trên **máy build** vẫn báo `Notarized Developer ID` dù DMG **chưa staple** (macOS
đối chiếu online), nên rất dễ tưởng đã xong — trong khi máy khách (nhất là khi mạng yếu/không mạng)
**không có vé** để đối chiếu ⇒ Gatekeeper chặn: *"không thể mở"*. Đúng ca 22/09/2026.

### 4b. LUẬT: KHÔNG BAO GIỜ bắt khách chạy lệnh (chủ dự án chốt 22/09/2026)

> Nguyên văn: *"đừng có bắt khách chạy lệnh gì cả, tập trung fix trên package của mình thôi"*.

**Cấm** đưa cho khách bất kỳ bước nào thuộc loại:
- `xattr -dr com.apple.quarantine …`, `spctl`, `codesign`, Terminal nói chung;
- "chuột phải → Open", "System Settings → Privacy & Security → Open Anyway";
- tải "bản đặc biệt"/bản vá tay.

**Khách chỉ làm 2 việc**: tải file rồi **bấm đôi**. Mọi thứ khác là **lỗi gói của mình** — phải sửa
trong gói, không đẩy sang khách.

Hệ quả bắt buộc:
1. **Cổng §4a phải ĐẠT trên CHÍNH FILE ĐANG PHÁT** trước khi gửi link cho khách — ĐẠT trên file vừa
   build ở máy là **chưa đủ** (lý do ở §4a). Ghi mốc "đã kiểm §4a trên file đang phát" (ngày + sha256)
   vào `release/releases.jsonl`.
2. Cổng **chưa ĐẠT ⇒ chưa phát hành, chưa gửi khách**. Đã lỡ phát hành thì **thay file ngay**, không
   kèm hướng dẫn vòng.
3. Khách đã nhận bản lỗi ⇒ xử lý bằng **phát hành bản đã staple** + báo khách **tải lại**; tuyệt đối
   không hướng dẫn khách vượt Gatekeeper.
4. Lỗi kiểu này **phải tìm ra trước khi khách báo**: cài lịch kiểm định kỳ **trên máy Mac**
   (`scripts/install-release-audit-watch.sh` → launchd `site.meetflowai.release-audit-watch`,
   mặc định 6 giờ/lần; nó tải file đang phát của **mọi kênh** rồi đọc version + kiểm DMG, alert Telegram
   khi lệch). **Server không làm được việc này** — không có `hdiutil`/`stapler`/`spctl`, chạy từ Windows
   cũng chỉ ra `KHÔNG KIỂM ĐƯỢC`. Đã kiểm 22/09/2026: trên node-2 **chưa** có timer/cron nào ⇒ lỗi này
   không ai bắt được trước khách.

**Vì sao có luật**: khách không phải kỹ thuật — mỗi dòng lệnh là một chỗ để bỏ cuộc; và nếu khách phải
vượt Gatekeeper bằng tay thì app đang phụ thuộc thao tác thủ công, cài lại/đổi máy là hỏng lại.
Sửa ở gói là sửa một lần cho mọi khách.

## 5. Phát hành
```bash
cp backup: mv /root/flowvpn-mac/VPNFlow-mac.dmg /root/flowvpn-mac/VPNFlow-mac-unsigned-<date>.dmg
scp/ssh cat > /root/flowvpn-mac/VPNFlow-mac.dmg
curl -sI https://t1.meetflowai.site/v1/downloads/mac     # 200 + content-length khớp
```

## 6. Lỗi đã gặp & cách xử
| Lỗi | Nguyên nhân | Xử |
|---|---|---|
| `exportArchive Cloud signing permission error` / `No profiles for 'com.privatevpn.mac'` | ASC key **không đủ quyền** tạo profile Developer ID qua Xcode cloud signing | Tạo profile bằng **API** (§1) rồi **ký tay** (§2) |
| `MAC_APP_DEVELOPER_ID is not a valid value` | sai enum | dùng **`MAC_APP_DIRECT`** |
| notarize **Invalid**: *“…/Hysteria.framework/…/Hysteria: binary is not signed with a valid Developer ID certificate / no secure timestamp”* | framework Go nhúng chưa ký | ký framework **trước** appex/app (§2b) |
| TestFlight: *90171 Invalid bundle structure … standalone executables* | App Store **cấm** binary rời trong framework (luật khác macOS) | phải **bỏ/đóng gói lại** framework cho bản App Store (chưa xong — xem manifest “Việc chưa xong”) |
| Khách vẫn thấy cảnh báo dù đã notarize | DMG chưa ký hoặc staple sai thứ tự | làm đúng §3–§4 rồi `spctl` kiểm lại |
