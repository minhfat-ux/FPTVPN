# iOS rò IPv6 trên 5G — "Connected nhưng KHÔNG có VPN" · THI CÔNG + NGHIỆM THU

- **Ngày:** 2026-09-26 · **Người làm:** Solution Architect (DSH harness Mac)
- **Chủ dự án chốt:** 5G là IPv6 ⇒ đây là gốc; **duyệt thiết kế**; máy thật = iPhone của chủ dự án.
- **Trạng thái:** ✅ đã thi công + 4 cổng tự động ĐẠT · ⏳ **chờ nghiệm thu máy thật 5G** (AC-1/AC-2)

## 1. Nguyên nhân

`HysteriaPacketTunnelProvider.networkSettings(options:)` chỉ áp **IPv4**
(`ipv4Settings.includedRoutes = [0.0.0.0/0]`), **không có `ipv6Settings`**, và `includeAllNetworks`
không được đặt ở đâu trong `iOS/`.

⇒ Trên 5G (IPv6), lưu lượng IPv6 **không vào tunnel**, đi thẳng ra giao diện 5G. App vẫn hiện
"Connected" vì `NEVPNStatus` chỉ nói tunnel interface đã lên. Hệ quả: đích ưu tiên IPv6 ⇒ **không
qua VPN**; DNS trả AAAA ⇒ app thử IPv6 trước rồi chờ ⇒ **"mất mạng"**.

## 2. Bẫy 22/09 phải tránh (đã tránh)

Bản `18f8c82` đặt `includedRoutes = [::/0]` mà **không loại trừ relay** ⇒ `api.meetflowai.site`
(có AAAA) bị hút vào tunnel ⇒ tunnel không có IPv6 ⇒ ĐEN ⇒ "mất mạng khi connect"
(`DEV_PLAN_IOS_MACOS_TOC_DO.md` §5b bước 1c). Bản đó đã gỡ hẳn `ipv6Settings` — nhưng gỡ hẳn thì RÒ.

## 3. Đã thi công

| File | Thay đổi |
|---|---|
| `iOS/PrivateVPNPacketTunnel/HysteriaPacketTunnelProvider.swift` | `networkSettings`: thêm `ipv6Settings` — địa chỉ `2001::ffff:ffff:ffff:fff1/126`, `includedRoutes = [::/0]`, `excludedRoutes` = **dải IPv6 Cloudflare** + **dải IPv6 TQ (`cn6.txt`)** + `fe80::/10`. Thay khối comment "A7 IPv6 — ĐÃ BỎ" bằng giải thích đầy đủ + vì sao phải loại trừ |
| `iOS/PrivateVPN/Services/HysteriaDefaults.swift` | Thêm `relayIPv6ExcludedCIDRs` (7 dải Cloudflare, nguồn chính thức) + sửa comment `tunIPv6CIDR` (đã hết đúng) |
| `scripts/ios-pure-logic-tests/main.swift` | +6 test chốt bất biến (xem §4) |
| `scripts/ios-pure-logic-tests/run.sh` | Nạp thêm `HysteriaDefaults.swift` để test được danh sách loại trừ |
| `scripts/ios-typecheck.sh` | **MỚI** — cổng `-typecheck` theo §7b (trước đây §7b bắt buộc nhưng repo không có dụng cụ) |
| `scripts/check-relay-ipv6-exclusion.py` | **MỚI** — kiểm bất biến chống rò bằng dữ liệu DNS sống |

**Go giữ nguyên** (`tunIPv6CIDR = ""`): đọc `tools/hysteria-android/mobile.go:243-251` xác nhận
chuỗi rỗng ⇒ `Inet6Address = nil`, **không lỗi**; gói IPv6 vào tunnel bị tầng Go BỎ ⇒ app lùi về IPv4
(Happy Eyeballs). Không phải build lại AAR.

**Cố ý KHÔNG bật `includeAllNetworks`**: nó khoá cứng mọi thứ vào tunnel nên làm tăng mạnh rủi ro
"mất mạng"; chỉ cân nhắc sau khi bản này chạy tốt trên máy thật.

## 4. Kiểm chứng ĐÃ CHẠY ĐƯỢC (không cần máy chủ dự án)

```text
1. bash scripts/ios-typecheck.sh          -> extension: 0 lỗi · app: 0 lỗi
2. python3 scripts/ios-lint-locks.py      -> ĐẠT (không khoá lồng nhau)
3. bash scripts/ios-pure-logic-tests/run.sh -> 505/505 PASS, 0 FAIL (trước bản vá: 499)
4. python3 scripts/check-relay-ipv6-exclusion.py -> ĐẠT (chạy 3 lần liên tiếp đều ĐẠT)
```

### 4.1 Bất biến cốt lõi — kiểm bằng DNS SỐNG

```text
✅ api.meetflowai.site  2606:4700:3034::6815:5370  ⊂ 2606:4700::/32
✅ api.meetflowai.site  2606:4700:3036::ac43:af8a  ⊂ 2606:4700::/32
✅ t1.meetflowai.site   2606:4700:3036::ac43:af8a  ⊂ 2606:4700::/32
✅ t1.meetflowai.site   2606:4700:3034::6815:5370  ⊂ 2606:4700::/32
Cloudflare công bố 7 dải IPv6 — đã phủ hết.
```

⇒ Kết nối của extension tới relay **luôn** đi thẳng, **không thể** bị hút vào tunnel ⇒ bẫy 22/09
không tái diễn. Script còn bắt ca Cloudflare thêm dải mới (lúc đó danh sách hardcode sẽ cũ).

### 4.2 Cổng CÓ RĂNG — đã thử nghiệm ÂM

Tạm bỏ `2606:4700::/32` khỏi mã nguồn ⇒ cổng báo **HỎNG, exit 1**, chỉ đúng 4 địa chỉ relay vi phạm
+ dải còn thiếu; khôi phục ⇒ **ĐẠT, exit 0**. (Không có bước này thì không biết cổng có thật sự bắt lỗi.)

### 4.3 6 test thuần logic mới

`danh sách loại trừ không rỗng` · `phải có 2606:4700::/32` · `mọi dải parse được thành NEIPv6Route`
· `route 2606:4700::/32 phải có mặt` · `Go vẫn nhận tunIPv6CIDR rỗng` · `địa chỉ utun IPv6 hợp lệ`.

## 5. KHÔNG kiểm được ở đây — và vì sao (nói thẳng)

1. **Nghiệm thu 5G thật (AC-1/AC-2)** — cần iPhone của chủ dự án. Mac này chỉ có IPv6
   **link-local** (`en0: fe80::…`) nên **không tái hiện được** ca 5G.
2. **Build thật (xcodebuild): ĐÃ CỐ Ý KHÔNG CHẠY.** Ổ dữ liệu còn **2,5 GiB / 228 GiB (99%)** —
   chạy build lúc này là đúng cách làm đầy đĩa, y sự cố AGENTS §7b đã ghi
   (`sed: No space left on device`, build chết giữa đường). **Phải dọn trước khi build:**
   `bash scripts/clean-build-cache.sh --dry-run` rồi `MIN_FREE_GB=10 bash scripts/clean-build-cache.sh`.
3. Không cài bản sửa lên Mac (đang chạy VPNFlow thật của chủ dự án) — tránh làm hỏng mạng máy
   đang ngủ. Đây là quyết định có ý thức, không phải bỏ sót.

## 6. TIÊU CHÍ NGHIỆM THU

### AC-0 — tự động, chạy được ngay (ĐÃ ĐẠT)
`scripts/ios-typecheck.sh` 0 lỗi · `ios-lint-locks.py` ĐẠT · `ios-pure-logic-tests` PASS hết ·
`check-relay-ipv6-exclusion.py` ĐẠT.

### AC-1 — HẾT RÒ IPv6 (máy thật, **5G**, ngắt Wi-Fi)
- `curl -6 https://ifconfig.co` khi VPN bật **phải KHÔNG trả IP nhà mạng** (trả IP exit node, hoặc
  thất bại/timeout — cả hai đều ĐẠT; trả IP nhà mạng = **KHÔNG ĐẠT**).
- `https://test-ipv6.com` không hiện IP gốc của khách.

### AC-2 — KHÔNG tái diễn bẫy "mất mạng khi connect"
- Tunnel lên trong **≤10 s** trên 5G; `api.meetflowai.site` **vẫn tới được** ngay sau khi lên.
- Trong `relay.log`: `ws-relay: heartbeat` có `framesFromRelay`/`bytesFromRelay` **TĂNG** (không đứng 0).
- **0** phiên kết thúc mà thiếu `stopTunnel`.
- Duyệt web + YouTube bình thường trên 5G **≥10 phút**.

### AC-3 — Không hồi quy Wi-Fi
Wi-Fi vẫn chạy như trước: `bridge` tăng hai chiều, `SYN vào` ≈ `SYN-ACK về`, tốc độ không giảm bậc.

### AC-4 — Bằng chứng bắt buộc
`relay.log` từ iPhone **lúc đang ở 5G** (có mốc `bw: net=cell|if:pdp_ip0`) + **ảnh** `curl -6`
trước/sau khi bật VPN + `python3 scripts/ios-log-acceptance.py <dir>/relay.log --crash-dir <dir>/crash`
**exit 0**.

## 7. Runbook test trên iPhone (cho chủ dự án / phiên sau)

```bash
cd /Volumes/BIWIN/SourcesCode/PrivateVPN
# 0) BẮT BUỘC: dọn đĩa trước (hiện chỉ còn 2,5 GiB)
bash scripts/clean-build-cache.sh --dry-run
MIN_FREE_GB=10 bash scripts/clean-build-cache.sh
# 1) build + ký (thiếu env ⇒ IPA rỗng credential ⇒ "bật lên tắt ngay")
eval "$(bash scripts/dev-hysteria-build-env.sh)"
bash scripts/archive-appstore.sh ios adhoc
bash scripts/ios-adhoc-export.sh --no-upload
bash scripts/ios-verify-ipa.sh build/ios-adhoc-export/ipa/FlowVPN.ipa --version <V> --build <N>
# 2) cài lên iPhone, NGẮT Wi-Fi, để 5G, bật VPN → đo AC-1/AC-2
# 3) kéo log + crash rồi chấm điểm
xcrun devicectl device copy from --device <id> --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel --source Documents --destination /tmp/ios5g
xcrun devicectl device copy from --device <id> --domain-type systemCrashLogs \
  --source . --destination /tmp/ios5g/crash
python3 scripts/ios-log-acceptance.py /tmp/ios5g/relay.log --crash-dir /tmp/ios5g/crash
```

## 8. Việc còn lại / rủi ro

1. **Nghiệm thu máy thật 5G** (AC-1/AC-2/AC-4) — chưa xong thì **chưa được coi là xong** (§7d).
2. **Dọn đĩa trước khi build** — chặn cứng hiện tại (2,5 GiB).
3. `cn6.txt` lúc connect có thể còn rỗng (nạp nền) ⇒ phiên ĐẦU có thể chưa loại trừ dải TQ; không
   ảnh hưởng tính đúng của việc chống rò (relay đã loại trừ tĩnh), chỉ là IPv6 TQ chưa đi thẳng ngay.
4. macOS dùng **chung** file này ⇒ bản vá áp cho cả macOS. Mac của chủ dự án lúc đo chỉ có IPv6
   link-local nên chưa thấy khác biệt; cần để ý khi Mac vào mạng có IPv6.
5. Không đụng `scripts/security/mac-selfdefense/*` (việc của phiên khác).
