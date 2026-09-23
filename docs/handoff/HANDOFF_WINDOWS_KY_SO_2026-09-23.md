# Handoff — Windows: fix bypass Trung Quốc + hạ tầng ký số

- **Agent:** worker (owner `windows`)
- **Task ID:** TASK-20260923-WIN-SIGN
- **Date:** 2026-09-23
- **Status:** `needs_review` — **chưa commit** (agent chính commit), và **chờ chủ dự án chốt chứng chỉ ký số**

---

## 0. TL;DR cho PUBLISHER (đọc mục này trước)

1. **KHÔNG có bản Windows nào đang chờ publish.** Mọi thay đổi dưới đây **chưa commit**, chưa build
   bản phát hành, chưa upload. Đừng claim / verify / publish gì cho Windows ở thời điểm này.
2. **Từ nay bộ cài Windows PHẢI được KÝ SỐ trước khi publish.** Lý do và bằng chứng ở §5. Hạ tầng ký
   đã xong và **đã kiểm chứng chạy thật**; **còn thiếu chứng chỉ** (câu hỏi Q2 trong
   `docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md` — chủ dự án quyết mua OV/EV hay dùng Azure Trusted Signing).
3. Khi có bản Windows mới để phát: **bằng chứng phát hành phải thêm** output `signtool verify /pa` **và**
   `Get-AuthenticodeSignature` cho **cả** `VPNFlow-Setup-*.exe` **và** `PrivateVPNWindows.App.exe`
   (`Status = Valid`, có timestamp). Cách chạy: `docs/RELEASE_RUNBOOK.md` **§6b** (mới thêm).
4. `scripts/check-publish-version.py` **không** bị sửa trong việc này (đang là WIP của người khác). Nếu
   cổng chặn pre/post cần thêm bước kiểm chữ ký số thì làm ở việc riêng, đừng gộp vào diff này.

---

## 1. Summary

Hai nhóm việc, cùng một nguyên nhân gốc là khách báo *"bật VPN không bypass được app Trung Quốc"*:

**(a) Fix lỗi bypass Trung Quốc trên đường relay (hysteria2-over-WS + sing-box).** Windows có 2 đường
tunnel; bypass TQ chỉ tồn tại ở đường WireGuard, còn đường relay mặc định (`Transport = Auto` thử relay
TRƯỚC) chỉ có **13 tên miền cứng** (Tencent + `.cn`). Đo thật: **33/36** tên miền app TQ phổ biến
(alipay.com, taobao.com, baidu.com, jd.com, meituan.com, bilibili.com, douyin.com...) **không khớp** nên
đi hết qua tunnel. Đã sửa bằng rule `ip_cidr` (danh sách APNIC đang phát sẵn) + DNS nội địa cho tên miền
dịch vụ TQ.

**(b) Hạ tầng ký số (NFR-WIN-002).** Máy khách bật Smart App Control **chặn bộ cài chưa ký**
(`os error 4551`) ⇒ không cài được. Đã nối xong dây ký (app + Setup + uninstaller) và có cổng xác minh;
**chưa ký được bản thật vì repo chưa có chứng chỉ**.

**E2E máy thật: ĐÃ ĐẠT** (chủ dự án test 23/09/2026; agent xác minh chéo bằng log + config trên máy,
xem EVID-12..14).

---

## 2. Files Changed

| Path | Change Summary |
|---|---|
| `windows/PrivateVPNWindows.Core/Tunnel/SingBoxConfigBuilder.cs` | Rule `ip_cidr` (dải TQ) → `direct`; gộp danh sách tên miền TQ; DNS nội địa `223.5.5.5` cho 43 tên miền dịch vụ + `route.default_domain_resolver` |
| `windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayTunnel.cs` | Nạp `cn.txt` + `cn6.txt` rồi nhúng vào config sing-box (best-effort, không chặn kết nối) |
| `windows/PrivateVPNWindows.Core/Tunnel/ChinaBypass.cs` | `LoadAllAsync` (gộp IPv4+IPv6, dùng chung cache với đường WireGuard); `BuildRouteLoopScript` + `TryParseRouteResult` |
| `windows/PrivateVPNWindows.Core/Tunnel/WintunWireGuardDriver.cs` | 3 script route đếm theo **kết quả thật** (`-ErrorAction Stop` + `try/catch`), cảnh báo khi `0/N` |
| `windows/PrivateVPNWindows.Core.Tests/ChinaBypassTests.cs` | +8 test |
| `windows/PrivateVPNWindows.Core.Tests/SingBoxConfigBuilderTests.cs` | +4 test, gồm test chặn hồi quy 33 tên miền app TQ đã đo |
| `windows/installer/build.ps1` | Tham số + hàm ký số; ký binary của mình trong bộ publish; truyền `/DSignedBuild` + `/Ssigntool`; **cổng chặn cuối** xác minh chữ ký |
| `windows/installer/VPNFlow.iss` | `#ifdef SignedBuild` → `SignTool=signtool` + `SignedUninstaller=yes` |
| `windows/installer/verify-relay.ps1` | Đồng bộ với builder + **sửa lỗi mã hoá có sẵn** + thêm `-ConfigOnly` / `-LocalCidrs` + bước kiểm bypass TQ qua `clash_api` |
| `docs/RELEASE_RUNBOOK.md` | Thêm **§6b** Ký số bộ cài (NFR-WIN-002) |

---

## 3. Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Dùng `ip_cidr`, **không** dùng `geoip:cn` | `sing-box.exe 1.14.1` đóng trong repo báo `FATAL: geoip database is deprecated in sing-box 1.8.0 and removed in sing-box 1.12.0`. Tài liệu cũ (`cn-cidrs.txt`, `YEU_CAU_TOC_DO_ON_DINH.md`) chỉ định `geoip:cn` là **không chạy được** | `SingBoxConfigBuilder.cs` |
| DNS nội địa chỉ áp cho tên miền **dịch vụ TQ `.com`**, cố ý **không** áp cho `.cn`/Tencent | Nhóm `.cn`/Tencent đã đi thẳng theo tên miền nên không cần; giữ nguyên như vậy thì resolver nội địa có trục trặc cũng **không tạo hồi quy** cho thứ đang chạy tốt | `SingBoxConfigBuilder.BuildDnsRules` |
| Không đổi `route.final` (vẫn `hyrelay`) | Bypass chỉ đổi đường cho dải TQ, không đổi mặc định của tunnel | `SingBoxConfigBuilder.BuildRoute` |
| **Không ký lại** binary bên thứ ba (`sing-box.exe`, `wireguard-go.exe`, `wintun.dll`) | Ký đè lên chữ ký của người khác là việc không được phép làm | `build.ps1` bước 3d |
| Ký số là **tuỳ chọn có cảnh báo to**, `-RequireSigning` mới thành lỗi cứng | Chưa có chứng chỉ nên nếu bắt buộc ngay thì mọi build hiện tại sẽ chết. Đường phát hành nên dùng `-RequireSigning` | `build.ps1` khối tham số |
| `-AllowUntrustedSignature` chỉ để **thử dây ký**, không dùng phát hành | Cert tự ký không dựng được chuỗi tin cậy; cần một cờ riêng, tên nói rõ mục đích, để không âm thầm hạ cổng chặn | `build.ps1` bước 6b |
| Sửa luôn lỗi mã hoá của `verify-relay.ps1` | File bị mã hoá lệch 2 lớp sinh 77 ký tự nháy cong; PowerShell coi chúng là dấu nháy ⇒ **script test thiết bị chưa từng parse được** (25 lỗi). Không sửa thì không kiểm chứng được gì trên máy thật | `verify-relay.ps1` |

---

## 4. Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20260923-01 | unit tests (`dotnet test -c Release`) | **Passed: 218, Failed: 0, Skipped: 0** (18 s) |
| EVID-20260923-02 | build | Build succeeded, **0 Warning / 0 Error** |
| EVID-20260923-03 | config do **code mới** sinh, nạp bằng `sing-box.exe 1.14.1` thật | `check` **exit 0**, 221 KB, 0,08 s |
| EVID-20260923-04 | script test thiết bị `verify-relay.ps1 -ConfigOnly` | **exit 0**; `ip_cidr: 7537 dải -> direct`; `dns: remote=1.1.1.1, cn=223.5.5.5`; `default_domain_resolver = remote`; thứ tự rule `sniff → ip_is_private → ip_cidr → domain_suffix → hijack-dns` |
| EVID-20260923-05 | đo coverage tên miền TQ | trước: **3/36 khớp**; sau: **36/36** (có test chặn hồi quy) |
| EVID-20260923-06 | `sing-box check` với `geoip: ["cn"]` | **FATAL** (exit 1) — chứng minh `geoip` bất khả thi trên core 1.14.1 |
| EVID-20260923-07 | Smart App Control chặn bộ cài chưa ký | `os error 4551`; event `CodeIntegrity` **3077/3033/3118**; policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`; file bị chặn là `is-XXXX.tmp\VPNFlow-Setup-1.4.5-localtest.tmp` (stub Inno tự giải nén) |
| EVID-20260923-08 | SAC 30 ngày, nhóm theo file | `sing-box.exe` 16 lần (tất cả **19/09**, hôm nay 0); stub bộ cài 8; `koffi.node` 102; **`PrivateVPNWindows.App.exe` / `flowvpnrelay.exe` / `wireguard-go.exe` / DLL của mình: 0 lần** |
| EVID-20260923-09 | dây ký chạy thật (cert tự ký, đã xoá sau khi thử) | `signtool sign` exit 0, có **timestamp DigiCert**; `signtool verify /pa` **fail** đúng như dự kiến (chuỗi tin cậy không dựng được) |
| EVID-20260923-10 | Inno ký Setup **và** uninstaller | log ISCC: `Running Sign Tool ... uninst.e32.tmp` → `Successfully signed`; `... VPNFlow-Setup-1.4.5.exe` → `Successfully signed`; `ISCC exit = 0` |
| EVID-20260923-11 | `verify-relay.ps1` trước/sau khi sửa mã hoá | trước: **25 lỗi parse**; sau: **0 lỗi**; quét toàn repo: không `.ps1` nào khác bị |
| EVID-20260923-12 | **E2E máy thật** (chủ dự án test, 23/09/2026 12:34) | `vpnflow.log`: `connect: transport đang dùng: singbox-hy-relay (relay=wss://api.meetflowai.site/relay/vn2hy) — KHÔNG đi qua WireGuard` |
| EVID-20260923-13 | **Code fix chạy thật** trên máy thật | `vpnflow.log`: `china-bypass (relay): nhúng 7509 dải CIDR Trung Quốc đi thẳng vào cấu hình sing-box` |
| EVID-20260923-14 | **Config thật** app sinh ra (đối chiếu bản 1.4.3) | `sing-box.json`: **1.647 B → 225.022 B**; `ip_cidr = 7509 dải -> direct`; `dns.servers = remote=1.1.1.1, cn=223.5.5.5`; `default_domain_resolver = remote` |
| EVID-20260923-15 | **Nhánh tải CDN chạy thật** | 7509 = 5494 (`cn.txt`) + 2015 (`cn6.txt`) — khớp đúng 2 danh sách đang phát, tức app đã tải từ CDN (không phải cache/danh sách cục bộ) |
| EVID-20260923-16 | Bản cài trên máy test đúng là bản build này | `C:\Program Files\VPNFlow\PrivateVPNWindows.App.exe`: `ProductVersion = 1.4.5-localtest+38a3e6f...`, `sha256 = f25ed913...a3b9e40` — **khớp byte-for-byte** với bản agent build |

---

## 5. Vì sao Publisher phải đổi quy trình (bằng chứng EVID-07/08)

Máy harness Windows bật **Smart App Control** ở chế độ *Verified & Reputable*
(`VerifiedAndReputablePolicyState = 1`). Đo ngày 23/09/2026:

- Bấm bộ cài **chưa ký** ⇒ Windows chặn, **`os error 4551`**. Chủ dự án bấm Yes ở UAC vẫn không cài được
  (2 lần thử: lần 1 setup thoát `exit code 1`; lần 2 hộp thoại nâng quyền bị chặn).
- File bị chặn **không phải** app của mình mà là **stub của Inno Setup** (`%TEMP%\is-XXXX.tmp\...`).
- Hệ quả với khách: **khách bật Smart App Control sẽ không cài được VPNFlow** dù tải từ link buy.
  Trước đây repo mới chỉ đo được ca `sing-box.exe` bị chặn (`WINDOWS_HARNESS_TASK_1.4.0.md`), chưa đo ca
  *bộ cài*. Cách sửa bền đã nằm sẵn trong tài liệu đó: **ký số**.

---

## 6. Validation Performed

```text
dotnet test windows\PrivateVPNWindows.Core.Tests\PrivateVPNWindows.Core.Tests.csproj -c Release
  -> Passed! - Failed: 0, Passed: 218, Skipped: 0, Total: 218, Duration: 18 s

dotnet build windows\PrivateVPNWindows.Core.Tests\... -c Release
  -> Build succeeded. 0 Warning(s) 0 Error(s)

# config do CODE sinh (không phải bản sao tay) rồi cho core thật nạp
sing-box.exe check -c from-code.json   -> exit 0 (0,08 s), 7.537 dải CIDR

windows\installer\verify-relay.ps1 -ConfigOnly -LocalCidrs docs\routes\cn-cidrs.txt
  -> exit 0, "cau hinh HOP LE (sing-box check DAT)"

# dây ký (cert tự ký, đã xoá)
signtool sign ... -> Successfully signed ; TimeStamper = DigiCert SHA256 RSA4096 Timestamp Responder 2026
ISCC /DSignedBuild /Ssigntool=<wrapper> $f -> Setup + uninst.e32.tmp đều "Successfully signed"
```

---

## 7. Validation Not Performed

| Check | Reason |
|---|---|
| Đo ĐỊNH LƯỢNG "byte tunnel không tăng khi chỉ dùng app TQ" | Chủ dự án xác nhận ĐẠT bằng tay; agent không đo được số byte (cần phiên chạy thật + quyền Administrator) |
| Ký số bằng chứng chỉ THẬT (`Status = Valid`) | Repo **chưa có chứng chỉ code-signing** (Q2 chưa được trả lời) |
| Nhánh tải danh sách CIDR từ CDN bên trong app | Sandbox chặn TLS lúc đó; đã test bằng `-LocalCidrs` |
| `build.ps1` chạy trọn có ký | Cổng chặn "cây `windows/` còn thay đổi chưa commit" chặn trước bước ký. Đã kiểm chứng từng mảnh (signtool, wrapper, ISCC `/S` + `SignedUninstaller`) |

---

## 8. Risks

- **E2E máy thật ĐÃ ĐẠT** (EVID-12..15). Rủi ro còn lại: nếu mạng của khách không tới được resolver nội
  địa `223.5.5.5` thì nhóm tên miền dịch vụ TQ mất phần DNS nội địa. Blast radius đã giới hạn có chủ ý:
  chỉ áp cho nhóm `.com`, **không** đụng `.cn`/Tencent, nên không tạo hồi quy cho thứ đang chạy tốt.
- **SAC còn bật trên máy harness** ⇒ mọi bản Windows phát hành sẽ không cài/test được trên máy đó cho tới
  khi có chữ ký (hoặc tắt SAC).
- `sing-box.exe` từng bị SAC chặn 16 lần (19/09) rồi được cho qua (23/09). Uy tín ISG **có thể đổi lại**
  ⇒ đây là lý do phụ để ký số, và là lý do `ApplicationControlGuard` vẫn cần giữ.
- Side observation, **không** thuộc phạm vi việc này: `%APPDATA%\VPNFlow\hysteria-relay\sing-box.log`
  đã **95,8 MB** sau một phiên (22/09) — log không được xoay vòng.

---

## 9. Open Questions

1. **Q2 (đã có sẵn trong spec, chưa được trả lời):** mua **OV/EV code signing** hay dùng **Azure Trusted
   Signing**? Đây là việc **chặn** NFR-WIN-002.
2. Số hiệu cho bản phát hành kế tiếp là gì? Bản test trên máy chủ dự án đang gắn `1.4.5-localtest`
   (`ProductVersion = 1.4.5-localtest+38a3e6f`) — **chỉ để test**, không phải bản phát hành.
3. Có cần bổ sung bước kiểm chữ ký số vào `scripts/check-publish-version.py` (cổng pre/post) không?
4. Có xoay vòng log `sing-box.log` trong bản tới không (đang 95,8 MB/phiên)?

---

## 10. Next Recommended Step

1. Agent chính **review + commit** diff này (worker đã giữ claim `windows-app`, chưa commit theo luật).
2. Chủ dự án trả lời **Q2** (chứng chỉ). Khi có chứng chỉ:
   `$env:VPNFLOW_SIGN_CERT_THUMBPRINT = "<thumb>"; build.ps1 -RequireSigning` ⇒ lấy bằng chứng
   `signtool verify /pa` + `Get-AuthenticodeSignature` cho Setup **và** app exe.
3. ~~Chạy E2E thật~~ **ĐÃ XONG 23/09/2026**: bản test được cài vào `C:\Program Files\VPNFlow`
   (sha256 khớp bản build, EVID-16), test tay ĐẠT, máy ghi `transport đang dùng: singbox-hy-relay` +
   `china-bypass (relay): nhúng 7509 dải CIDR`. Việc còn lại của luồng này chỉ là **ký số** (mục 2).
4. Publisher: cập nhật quy trình theo §0 mục 2–3 (bộ cài Windows phải ký trước khi publish).
