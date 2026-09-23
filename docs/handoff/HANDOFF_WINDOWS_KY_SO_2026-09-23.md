# Handoff — Windows: bypass Trung Quốc + ký số bộ cài (bản ĐẦY ĐỦ cho PUBLISHER)

- **Agent:** worker (owner `windows`)
- **Task ID:** TASK-20260923-WIN-SIGN
- **Date:** 2026-09-23
- **Status:** `needs_review` → code **ĐÃ COMMIT + ĐÃ Ở `origin/main`**; còn chờ **nạp chứng chỉ** để ký bản phát hành
- **Người nhận chính:** PUBLISHER (kênh Windows) · **Đọc mục 0 trước**

---

## 0. Tóm tắt cho PUBLISHER — việc phải làm

### 0.1. Trạng thái kênh Windows NGAY BÂY GIỜ

| Câu hỏi | Trả lời |
|---|---|
| Có bản Windows nào đang chờ publish? | **KHÔNG.** Kênh Windows vẫn đang phát **1.4.4**, không đổi |
| Có cần claim/verify/publish gì cho Windows lúc này? | **KHÔNG.** Đừng publish gì cho Windows cho tới khi có bản mới + có chữ ký |
| Bản `1.4.5-localtest` trên máy chủ dự án là gì? | **Bản TEST của worker** để chứng minh fix bypass TQ. **KHÔNG phải bản phát hành.** Xem §0.3 |

### 0.2. Ba việc theo mốc

**A. Ngay bây giờ — không cần làm gì cho Windows.** Chỉ cần biết: từ nay bộ cài Windows **phải được ký số**
trước khi publish (§2, §3).

**B. Khi có chứng chỉ (chủ dự án đã chốt: cert sẽ nạp trên MÁY WINDOWS này):**

```powershell
# 1) nạp cert (một lần)
Import-PfxCertificate -FilePath <file.pfx> -CertStoreLocation Cert:\CurrentUser\My   # nếu có .pfx
#   (có token/HSM thì cài driver theo CA, cert tự vào Cert:\CurrentUser\My)

# 2) lấy thumbprint
Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3' } |
  Select-Object Subject, Thumbprint, NotAfter

# 3) build CÓ KÝ + cổng chặn cứng
$env:VPNFLOW_SIGN_CERT_THUMBPRINT = "<thumbprint>"
powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -Version <so-hieu> -RequireSigning

# 4) lấy bằng chứng (bắt buộc, xem §4)
$setup = Get-ChildItem windows\installer\out\VPNFlow-Setup-<so-hieu>.exe
$s = Get-AuthenticodeSignature $setup.FullName; $s.Status; $s.SignerCertificate.Subject; $s.TimeStamperCertificate.Subject
& "$env:LOCALAPPDATA\VPNFlowTools\signtool\signtool.exe" verify /pa $setup.FullName
```

**C. Khi phát hành bản Windows mới:** làm đúng runbook §2 (pre-gate + post-gate), **cộng thêm** 2 hạng mục
chữ ký ở §4 của tài liệu này. Nếu artifact **chưa ký** ⇒ **KHÔNG phát hành**.

### 0.3. Cảnh báo: đừng nhầm artifact test với artifact phát hành

Trên máy chủ dự án hiện có 2 file **KHÔNG BAO GIỜ ĐƯỢC PHÁT HÀNH**:

| File | Vì sao không được phát |
|---|---|
| `C:\Users\Minhn\Desktop\VPNFlow-Setup-1.4.5-localtest.exe` | Bộ cài **chưa ký**, gắn số `1.4.5` nhưng **không phải** bản 1.4.5 phát hành (`ProductVersion = 1.4.5-localtest+38a3e6f`) |
| `C:\Users\Minhn\Desktop\VPNFlow-1.4.5-localtest-portable.zip` | Bản portable test tay |

Cả hai đều có bản sao trong `.tmp/` (đã gitignore). `windows/installer/out/` cũng còn các bộ cài cũ
`1.4.1` → `1.4.4` — **chỉ 1.4.4 là bản đang phát**.

---

## 1. Trạng thái repo & đồng bộ (số liệu thật, kiểm ngày 23/09/2026)

| Hạng mục | Giá trị |
|---|---|
| `HEAD` | `f1c996f` (Merge `origin/main`) |
| `origin/main` | `f1c996f` — **local == origin, không có commit nào chưa push** |
| Commit của việc này | **`4c7da63`** `fix(windows): bypass Trung Quoc cho duong relay + ky so bo cai (NFR-WIN-002)` — **đã ở `origin/main`** |
| Working tree | **sạch** |
| Bảng việc chung | chỉ `[mac] ios` đang được giữ; claim `windows-app` của worker **đã release** |
| Kênh Windows đang phát | **1.4.4** (không đổi bởi việc này) |

---

## 2. Hai nhóm thay đổi

### 2.1. Fix lỗi "bật VPN không bypass được app Trung Quốc"

**Nguyên nhân gốc:** Windows có 2 đường tunnel. Bypass TQ chỉ tồn tại ở đường WireGuard; đường **relay
hysteria2-over-WS + sing-box** (đường **mặc định**, vì `Transport = Auto` thử relay TRƯỚC) chỉ có **13 tên
miền cứng** (Tencent + `.cn`).

**Đo thật:** đối chiếu 36 tên miền app TQ phổ biến ⇒ **chỉ 3 khớp**; **33 tên miền** (alipay.com,
taobao.com, tmall.com, alicdn.com, baidu.com, jd.com, meituan.com, dianping.com, amap.com, didiglobal.com,
bilibili.com, douyin.com, iqiyi.com, youku.com, weibo.com, zhihu.com, xiaohongshu.com, kuaishou.com,
163.com, unionpay.com, ccb.com, abchina.com, cmbchina.com, bankcomm.com, psbc.com, sf-express.com, ele.me,
pinduoduo.com, suning.com, cainiao.com, qunar.com, ctrip.com, wps.com) **đi hết qua tunnel** ⇒ server TQ
thấy IP nước ngoài ⇒ cắt kết nối.

**Cách sửa:** rule `ip_cidr` (danh sách APNIC đang phát sẵn) → `direct`, cộng DNS nội địa cho tên miền
dịch vụ TQ. Chi tiết ở §5 (EVID-03..05).

**Bài học phải nhớ:** tài liệu cũ chỉ định dùng `geoip:cn` — **không chạy được** trên core đang đóng gói.
`sing-box.exe 1.14.1` báo `FATAL: geoip database is deprecated in sing-box 1.8.0 and removed in sing-box
1.12.0` (EVID-06).

### 2.2. Hạ tầng ký số (NFR-WIN-002)

Vì sao: máy khách bật **Smart App Control** chặn file chưa ký ⇒ **không cài được VPNFlow** (chi tiết +
bằng chứng ở §5 và §6). Đã nối xong dây ký: app exe + DLL của mình + `flowvpnrelay.exe` (trong bộ publish),
rồi **cả Setup lẫn uninstaller** (`VPNFlow.iss`: `SignTool` + `SignedUninstaller` chỉ bật khi có
`/DSignedBuild`), kèm **cổng chặn cuối** xác minh chữ ký.

---

## 3. Chứng chỉ ký số — quyết định & cách nối vào

- **Chủ dự án đã chốt (23/09/2026):** chứng chỉ sẽ được nạp **trên MÁY WINDOWS này** ⇒ worker ký tại đây.
- **Hiện trạng máy này:** **KHÔNG có** chứng chỉ code-signing nào (cả `Cert:\CurrentUser\My` và
  `Cert:\LocalMachine\My` đều rỗng) ⇒ **chưa ký được bản nào**. `NFR-WIN-002` vì vậy **vẫn chưa đạt**.
- **`signtool` đã có sẵn trên máy** (không cần cài Windows SDK):
  `%LOCALAPPDATA%\VPNFlowTools\signtool\signtool.exe` — lấy từ gói NuGet `Microsoft.Windows.SDK.BuildTools`.
  `build.ps1` tự dò đường dẫn này, rồi tới Windows Kits, rồi PATH.
- **Cấu hình qua biến môi trường, KHÔNG hard-code cert/mật khẩu vào repo:**

| Biến | Ý nghĩa |
|---|---|
| `VPNFLOW_SIGN_CERT_THUMBPRINT` | thumbprint cert trong store — **KHUYẾN NGHỊ** (không có mật khẩu ở đâu cả) |
| `VPNFLOW_SIGN_PFX_PATH` + `VPNFLOW_SIGN_PFX_PASSWORD` | nếu dùng `.pfx` (mật khẩu không bao giờ in ra log; wrapper đọc từ env, không ghi vào file) |
| `VPNFLOW_SIGN_TIMESTAMP_URL` | mặc định `http://timestamp.digicert.com` |
| `VPNFLOW_SIGNTOOL` | chỉ định `signtool.exe` nếu để ở chỗ khác |

- **Cổng chặn:** đã cấu hình ký mà file phát hành không có chữ ký, hoặc `signtool verify /pa` không đạt ⇒
  `build.ps1` **DỪNG**. Không cấu hình gì ⇒ vẫn build được nhưng in **CẢNH BÁO TO**; `-RequireSigning` biến
  cảnh báo đó thành lỗi cứng (**đường phát hành nên dùng**). `-AllowUntrustedSignature` chỉ để **thử dây
  ký** bằng cert tự ký, **KHÔNG** dùng để phát hành.
- **Không ký lại binary bên thứ ba** (`sing-box.exe`, `wireguard-go.exe`, `wintun.dll`): ký đè lên chữ ký
  của người khác là việc không được phép làm.

---

## 4. Publisher phải VERIFY gì cho kênh Windows (pre-gate + post-gate)

| # | Hạng mục | Cách kiểm | Đạt khi |
|---|---|---|---|
| 1 | Số hiệu đọc **TỪ TRONG artifact** | `python3 scripts/check-publish-version.py --platform windows` (luật 1) | khớp số định phát |
| 2 | **Chữ ký của bộ cài** (MỚI) | `signtool verify /pa VPNFlow-Setup-<v>.exe` + `Get-AuthenticodeSignature` | `verify` exit 0 **và** `Status = Valid` |
| 3 | **Chữ ký của app exe** (MỚI) | `signtool verify /pa PrivateVPNWindows.App.exe` + `Get-AuthenticodeSignature` | `Status = Valid` |
| 4 | **Có timestamp** (MỚI) | `(Get-AuthenticodeSignature <file>).TimeStamperCertificate` | khác `$null` |
| 5 | **Uninstaller cũng đã ký** (MỚI) | sau khi cài: `Get-AuthenticodeSignature 'C:\Program Files\VPNFlow\unins000.exe'` | `Status = Valid` |
| 6 | Chạy post-gate sau upload (luật 2) | `scripts/check-publish-version.py --mode post --platform windows` | đọc version **đang phát** khớp mốc |
| 7 | Published artifact == artifact đã ký | so `sha256` (bộ cài **không được sửa sau khi ký**) | khớp tuyệt đối |

**Nếu hạng mục 2/3/4 không đạt ⇒ KHÔNG phát hành.** Lý do ở §5/§6: khách bật Smart App Control sẽ không
cài được, và **kết quả là may rủi** (xem §6).

`NFR-WIN-002` (`docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md:81`) cũng đòi: updater **từ chối** artifact sai
SHA256 hoặc sai chữ ký, và **không credential trong log**.

---

## 5. Bằng chứng đã có

| EVID | Nội dung | Kết quả |
|---|---|---|
| 01 | `dotnet test` (unit) | **Passed: 218, Failed: 0, Skipped: 0** (18 s) |
| 02 | `dotnet build` | succeeded, **0 Warning / 0 Error** |
| 03 | Config do **code mới** sinh, nạp bằng `sing-box.exe 1.14.1` thật | `check` **exit 0**, 221 KB, 0,08 s |
| 04 | `verify-relay.ps1 -ConfigOnly` | **exit 0**; `ip_cidr: 7537 dải -> direct`; `dns: remote=1.1.1.1, cn=223.5.5.5`; thứ tự rule `sniff → ip_is_private → ip_cidr → domain_suffix → hijack-dns` |
| 05 | Đo coverage tên miền TQ | trước **3/36** → sau **36/36** (có test chặn hồi quy) |
| 06 | `sing-box check` với `geoip: ["cn"]` | **FATAL** ⇒ `geoip` bất khả thi trên core 1.14.1 |
| 07 | SAC chặn bộ cài **chưa ký** | `os error 4551`; event `CodeIntegrity` **3077/3033/3118**; policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`; file bị chặn là `%TEMP%\is-XXXX.tmp\VPNFlow-Setup-1.4.5-localtest.tmp` (**stub Inno tự giải nén**, không phải code của mình) |
| 08 | SAC 30 ngày, nhóm theo file | `sing-box.exe` 16 lần (tất cả **19/09**); stub bộ cài 8; `koffi.node` 102; **`PrivateVPNWindows.App.exe` / `flowvpnrelay.exe` / `wireguard-go.exe` / DLL của mình: 0 lần** |
| 09 | Dây ký chạy thật (cert tự ký, đã xoá sau khi thử) | `signtool sign` exit 0; **timestamp** `CN=DigiCert SHA256 RSA4096 Timestamp Responder 2026`; `verify /pa` fail đúng dự kiến (chuỗi tin cậy không dựng được) |
| 10 | Inno ký Setup **và** uninstaller | log ISCC: `Running Sign Tool ... uninst.e32.tmp` → `Successfully signed`; `... VPNFlow-Setup-1.4.5.exe` → `Successfully signed`; `ISCC exit = 0` |
| 11 | `verify-relay.ps1` trước/sau khi sửa mã hoá | trước **25 lỗi parse** → sau **0 lỗi**; quét toàn repo: không `.ps1` nào khác bị |
| 12 | **E2E máy thật** (chủ dự án test 23/09 12:34) | log: `connect: transport đang dùng: singbox-hy-relay (relay=wss://api.meetflowai.site/relay/vn2hy) — KHÔNG đi qua WireGuard` |
| 13 | Code fix chạy thật trên máy thật | log: `china-bypass (relay): nhúng 7509 dải CIDR Trung Quốc đi thẳng vào cấu hình sing-box` |
| 14 | Config thật app sinh (đối chiếu bản 1.4.3) | `sing-box.json`: **1.647 B → 225.022 B**; `ip_cidr = 7509 dải -> direct`; `dns: remote=1.1.1.1, cn=223.5.5.5`; `default_domain_resolver = remote` |
| 15 | **Nhánh tải CDN chạy thật** | 7509 = 5494 (`cn.txt`) + 2015 (`cn6.txt`) — khớp đúng 2 danh sách đang phát ⇒ app tải từ CDN, không phải cache |
| 16 | Bản cài trên máy test đúng là bản build này | `PrivateVPNWindows.App.exe`: `ProductVersion = 1.4.5-localtest+38a3e6f`, `sha256 = f25ed913...a3b9e40` — khớp byte-for-byte |

---

## 6. Bộ cài CHƯA KÝ là may rủi — dữ liệu để publisher không chủ quan

Trên **chính máy này**, **cùng một file** (sha256 `8c42e597...4c9ed2`), trong ngày 23/09/2026:

| Thời điểm | Kết quả |
|---|---|
| 12:00:46, 12:01:11, 12:10:35, 12:10:43 | **BỊ SAC CHẶN** (event 3077/3033/3118 cho từng lần) |
| **12:30** | **CÀI ĐƯỢC** — registry `DisplayVersion = 1.4.5`, `unins000.exe` mtime `12:30:24`, và **không có** event chặn nào trong 12:27–12:36 |

Kiểm pháp y: `unins000.exe` trong `C:\Program Files\VPNFlow` là **`NotSigned`**, bộ cài là **`NotSigned`**,
và máy **không có chứng chỉ** ⇒ lần cài thành công đó **KHÔNG phải nhờ ký số**.

⇒ **Kết luận cho publisher:** "cài được trên máy test" **KHÔNG** phải bằng chứng bộ cài chưa ký là an toàn.
Cùng file đó đã bị chặn 4 lần. Khả năng (suy luận, chưa khẳng định): ngữ cảnh chạy khác nhau (các lần bị
chặn do tiến trình agent bị sandbox khởi chạy), và/hoặc tra uy tín ISG lúc được lúc không — chính repo đã
ghi ca `sing-box.exe` với `DefenderMadeCloudCall = false` là lúc bị chặn.

---

## 7. Validation CHƯA làm

| Việc | Lý do |
|---|---|
| Ký bằng chứng chỉ **THẬT** (`Status = Valid`) | Máy chưa có chứng chỉ (chủ dự án đã chốt sẽ nạp) |
| Đo **định lượng** "byte tunnel không tăng khi chỉ dùng app TQ" | Chủ dự án xác nhận ĐẠT bằng tay; agent không đo được số byte |
| `build.ps1` chạy trọn **có ký** | Chưa có cert ⇒ chưa chạy được nhánh ký đầy đủ (đã kiểm từng mảnh: signtool, wrapper, ISCC `/S` + `SignedUninstaller`) |
| Cổng chặn `scripts/check-publish-version.py` kiểm **chữ ký** | Script này **không** bị sửa trong việc này (WIP của người khác). Xem §9 câu hỏi 3 |

---

## 8. Rủi ro

- **Chưa ký được bản phát hành** ⇒ khách bật Smart App Control vẫn có thể không cài được (đã xảy ra 4 lần
  trên máy này). Đây là **rủi ro mất khách**, đã có trong spec từ trước (`WINDOWS_CLIENT_REQUIREMENTS.md:117`).
- Nếu mạng khách không tới được resolver nội địa `223.5.5.5` thì nhóm tên miền dịch vụ TQ mất phần DNS nội
  địa. Blast radius đã giới hạn có chủ ý: chỉ nhóm `.com`, **không** đụng `.cn`/Tencent.
- `sing-box.exe` từng bị SAC chặn 16 lần (19/09) rồi được cho qua (23/09). Uy tín ISG **có thể đổi lại**
  ⇒ lý do phụ để ký số, và lý do `ApplicationControlGuard` vẫn phải giữ.
- Quan sát phụ, **ngoài** phạm vi việc này: `%APPDATA%\VPNFlow\hysteria-relay\sing-box.log` đã **96 MB**
  sau một phiên — log **không được xoay vòng**.

---

## 9. Câu hỏi mở

1. **Số hiệu** cho bản Windows phát hành kế tiếp là gì? Bản test đang gắn `1.4.5-localtest` và
   **không được** dùng làm số phát hành.
2. **Loại chứng chỉ** sẽ nạp vào máy này: OV/EV (token/HSM) hay `.pfx`? Ảnh hưởng tới cách nạp và cách
   truyền tham số cho `build.ps1`.
3. Có bổ sung **bước kiểm chữ ký** vào `scripts/check-publish-version.py` (cổng pre/post) không? Hiện cổng
   đó **chưa** kiểm chữ ký — nếu publisher chỉ chạy cổng đó thì artifact chưa ký vẫn "đạt".
4. Có xoay vòng `sing-box.log` trong bản tới không (đang 96 MB/phiên)?

---

## 10. Việc tiếp theo (thứ tự)

1. Chủ dự án **nạp chứng chỉ** vào máy Windows này (xem §0.2.B).
2. Worker **ký + lấy bằng chứng** `Status = Valid` cho Setup **và** app exe, rồi cập nhật handoff này với
   EVID mới. (Nếu cần chứng chỉ, worker chỉ nhận qua biến môi trường, **không** qua file trong repo.)
3. Chủ dự án chốt **số hiệu** phát hành (§9.1).
4. Publisher: khi có bản mới, chạy pre-gate + **4 hạng mục chữ ký ở §4**, rồi post-gate, rồi mới email khách.

**Lưu ý về luật:** việc này do **worker** làm, **chủ dự án chỉ đạo trực tiếp** cho commit (khác mặc định
`AGENTS.md` §1 là agent chính commit). Worker đã **không push**; bản trên `origin/main` là do agent chính
đồng bộ (`f1c996f`).
