# WINDOWS CODE SIGNING — nghiên cứu & phương án ký số cho bộ cài VPNFlow

> Lập 23/09/2026 (owner `windows`), sau khi phát `1.4.5` **chưa ký** theo quyết định của chủ dự án.
> Đọc kèm: `docs/PUBLISHER_PROCESS.md` §0 **luật 11** (bắt buộc ký + bằng chứng), `docs/RELEASE_RUNBOOK.md` §6b,
> `docs/handoff/HANDOFF_WINDOWS_KY_SO_2026-09-23.md` (§5, §6, EVID-07..10, EVID-17/18).

## 0. Vì sao phải ký (số liệu thật, không phải lý thuyết)
- Máy khách bật **Smart App Control (SAC)** **chặn bộ cài chưa ký**: `os error 4551`, event `CodeIntegrity`
  **3077/3033/3118**; file bị chặn là **stub tự giải nén của Inno** (`%TEMP%\is-XXXX.tmp\...`), không phải code của mình.
- Trên máy harness này (SAC = On): cùng **một file** chưa ký bị chặn **4 lần** (12:00–12:10) rồi **cài được** lúc 12:30
  ⇒ chưa ký là **may rủi**, không phải "luôn hỏng".
- **Mọi bản đã phát đều chưa ký** (kiểm bằng `Get-AuthenticodeSignature`): `VPNFlow-Setup-1.4.0 → 1.4.5` = `NotSigned`.
- Kênh Windows hiện rất nhỏ (**3 thiết bị** `windows` + 1 `win32` trên tổng 68) ⇒ rủi ro SAC ảnh hưởng ít khách **ở thời điểm này**,
  nhưng SAC là mặc định bật dần trên Windows 11 mới ⇒ **nợ kỹ thuật tăng dần**.

## 1. Bốn đường ký — so sánh
| # | Đường | Cách hoạt động | Cần gì | Ưu | Nhược |
|---|---|---|---|---|---|
| **A** | **OV code signing + token/HSM** | Cert OV, khoá riêng nằm trong **token USB/HSM**; `signtool sign /sha1 <thumbprint>` (nhập PIN) | Hồ sơ doanh nghiệp + token (CA gửi) | Rẻ nhất; đã khớp sẵn `build.ps1` (`-SignCertThumbprint`); ký offline được | Phải cắm token ở **đúng máy ký**; SmartScreen chỉ hiện tên nhà phát hành, **uy tín tích luỹ dần** |
| **B** | **EV code signing + token/HSM** | Như A nhưng xác minh chặt hơn | Hồ sơ + token | **SmartScreen tin ngay** (không cảnh báo "unknown publisher") | Đắt hơn; xác minh lâu hơn; vẫn cần token |
| **C** | **Cloud signing (không cần token)** — SSL.com **eSigner CKA**, DigiCert **KeyLocker**, Sectigo… | Khoá nằm trên HSM của nhà cung cấp; cài **plugin/adapter** để `signtool.exe` dùng khoá cloud (eSigner CKA gắn vào `signtool`/`certutil`), hoặc CLI riêng | Thuê bao dịch vụ + cấu hình adapter + xác thực (MFA/token API) | Không phải cắm token; chạy được trong CI/không người; hợp máy build từ xa | Thuê bao định kỳ; phụ thuộc mạng + nhà cung cấp; cần cấu hình lại dây ký (wrapper) |
| **D** | **Azure Artifact Signing** (tên cũ *Trusted Signing*) | Microsoft giữ cert (3 ngày), ký qua dịch vụ; `signtool sign /dlib Azure.CodeSigning.Dlib.dll /dmdf metadata.json` | Azure subscription + account + identity validation + certificate profile + role | Không token, cert managed, giá theo SKU | ❌ **Public Trust KHÔNG có cho tổ chức tại Việt Nam**; nhánh Individual chỉ **US/Canada**; identity validation **1–20 ngày làm việc** |

### Vì sao D bị loại (trích tài liệu Microsoft)
> *"Public Trust certificates are available to organizations in the **United States, Canada, the European Union, the United Kingdom, Australia, New Zealand, Japan, South Korea, Singapore, Switzerland, Norway, and Israel**. Individual developers must be located in the **United States or Canada**. These geographic restrictions do not apply to Private Trust certificates."*
> — [Quickstart: Set up Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)

**Việt Nam không nằm trong danh sách** ⇒ chỉ còn **Private Trust** (chỉ nội bộ tổ chức tin, khách hàng **không** tin) ⇒ vô dụng cho phân phối.
Nếu chủ dự án có **pháp nhân** ở một nước trong danh sách thì D là lựa chọn tốt (không token, quản lý cert tự động).

## 2. Ràng buộc kỹ thuật chung (áp cho A/B/C)
- Chuẩn **CA/B Forum**: cert OV/EV **bắt buộc khoá riêng trên thiết bị bảo mật** (token/HSM FIPS 140-2 L2+ / CC EAL4+) ⇒
  không còn kiểu "file `.pfx` để trên đĩa". Vì vậy các nhà cung cấp mới có dịch vụ **cloud signing** (mục C).
- **Bắt buộc có timestamp** (`/tr <URL> /td SHA256`). Không timestamp ⇒ chữ ký hết hạn là bộ cài thành "chưa ký".
- **Ký TRƯỚC khi upload**; sau khi ký **không được sửa file** (sha256 ghi vào sổ phải là file đã ký).
- Ký **cả** `VPNFlow-Setup-*.exe` **và** `PrivateVPNWindows.App.exe`, và **uninstaller** (`unins000.exe`) —
  cấu hình Inno hiện đã có: `#ifdef SignedBuild` → `SignTool=signtool` + `SignedUninstaller=yes`
  (điều khiển bởi `build.ps1` qua `/DSignedBuild` + `/Ssigntool=<wrapper>`).

## 3. Nối vào repo — hiện trạng & việc phải thêm
Hiện `windows/installer/build.ps1` đã có sẵn dây ký **theo cert trong store**:
- `-SignCertThumbprint` / `VPNFLOW_SIGN_CERT_THUMBPRINT` (khuyến nghị: không dùng mật khẩu file)
- `-SignTimestampUrl` / `VPNFLOW_SIGN_TIMESTAMP_URL` (mặc định `http://timestamp.digicert.com`)
- `-SigntoolPath` / `VPNFLOW_SIGNTOOL` (để trống thì tự dò, có nhánh tìm `%LOCALAPPDATA%\VPNFlowTools\signtool\signtool.exe`)
- `-RequireSigning` (biến cảnh báo thành **lỗi cứng** — **đường phát hành nên dùng**)
- `-AllowUntrustedSignature` (**chỉ để thử dây ký**, không dùng phát hành)
- Cổng chặn cuối trong `build.ps1` xác minh chữ ký sau khi build.

| Phương án | Cần thêm gì vào `build.ps1` |
|---|---|
| A/B (token) | **Không phải sửa code**: cắm token → cài cert vào store → `$env:VPNFLOW_SIGN_CERT_THUMBPRINT=<thumb>` → `build.ps1 -RequireSigning` |
| C (cloud) | Thêm nhánh `-SignMode <esigner|keylocker>` + **wrapper** để Inno gọi được (adapter biến `signtool` thành client cloud); truyền credential qua biến môi trường, **không** để trong repo |
| D (ATS) | Thêm nhánh `signtool sign /dlib <Azure.CodeSigning.Dlib.dll> /dmdf metadata.json` + metadata theo region; cài `Microsoft.Azure.ArtifactSigningClientTools` (`winget` có sẵn trên máy này) |

**Máy Windows này đã có sẵn nền để ký**: `winget`, .NET SDK 8, PowerShell, và **root CA `Microsoft Identity Verification Root Certificate Authority 2020`** (chuỗi tin cậy của ATS) đã nằm trong Root store. Thiếu: `signtool` (Windows SDK) / adapter cloud / token.

## 4. Bằng chứng bắt buộc khi phát hành (luật 11 — không có thì KHÔNG phát)
```powershell
signtool verify /pa /v <VPNFlow-Setup-x.y.z.exe>
signtool verify /pa /v <PrivateVPNWindows.App.exe>
(Get-AuthenticodeSignature <file>) | Select-Object Status, TimeStamperCertificate   # Status = Valid
(Get-AuthenticodeSignature 'C:\Program Files\VPNFlow\unins000.exe').Status           # sau khi cài
```
Cộng thêm: `sha256` của **file đã ký** khớp file đã upload (cổng `--mode post` đọc version trong file đang phát).

## 5. Đề xuất & việc cần chủ dự án quyết
1. **Chọn đường**: nếu ưu tiên rẻ + đơn giản → **A (OV + token)**; nếu muốn hết cảnh báo "unknown publisher" ngay → **B (EV)**;
   nếu không muốn quản lý token và muốn ký tự động → **C (cloud signing)**. **D chỉ khi có pháp nhân ở nước eligible.**
2. **Hồ sơ cần chuẩn bị** (cho A/B/C): giấy phép đăng ký doanh nghiệp, email trên **domain công ty** (nhận mail xác minh),
   số điện thoại doanh nghiệp, người đại diện + giấy tờ tuỳ thân, có thể thêm hoá đơn/địa chỉ. Thời gian xác minh **tuỳ CA (thường vài ngày tới ~2 tuần)**.
3. **Báo giá**: giá thay đổi theo CA/thời hạn — bảng giá tham chiếu tại thị trường VN: [BKNS — bảng giá Code Signing](https://www.bkns.vn/ssl/bang-gia-code-signing.html)
   và so sánh [OV vs EV](https://www.bkns.vn/nen-chon-chung-chi-ov-hay-ev-code-signing.html); tài liệu nhà cung cấp:
   [SSL.com eSigner CKA (dùng `signtool` với khoá trên cloud)](https://www.ssl.com/how-to/automate-ev-code-signing-with-signtool-or-certutil-esigner/),
   [DigiCert KeyLocker](https://knowledge.digicert.com/jp/tutorials/certcentral-keylocker-manual),
   [SSL.com — bắt đầu với cert code signing](https://www.ssl.com/how-to/getting-started-with-your-code-signing-certificate-installation-configuration-and-your-first-signing-operation/).
4. **Sau khi có cert**, em (owner `windows`) sẽ: cài dây ký đúng phương án đã chọn → sửa `build.ps1` nếu là C/D → build `-RequireSigning` →
   lấy đủ bằng chứng ở §4 → phát hành bản kế tiếp (đề xuất `1.4.6`) và **chấm dứt ngoại lệ luật 11**.

## 6. Bảo mật (bắt buộc)
- **Không** commit cert, `.pfx`, mật khẩu, token API vào repo/chat/log.
- Token/HSM: giữ PIN riêng; ký ở máy có kiểm soát.
- Cloud signing: credential chỉ nằm ở biến môi trường/secret manager; **bật MFA**; ghi log mỗi lần ký (audit trail của nhà cung cấp).
