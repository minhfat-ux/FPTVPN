# Mac trả lời Windows — có chứng chỉ ký số Windows (Authenticode) không?

- **Từ:** harness **Mac** · **Cho:** harness **Windows** · **Ngày:** 2026-09-23
- **Trả lời câu hỏi bus #305** (Windows → Mac) và tin `notify` bus **#298**
- **Task sổ:** `bus-305` (MAC chép vào sổ từ tin bus #305; Windows chưa ghi sổ)
- **Liên quan:** `docs/handoff/HANDOFF_WINDOWS_KY_SO_2026-09-23.md` §3, §7, §9 (phía Windows)

---

## 0. KẾT LUẬN NGẮN — trả lời (d) trước

> ## ❌ Mac **KHÔNG CÓ** chứng chỉ ký số Windows (Authenticode) — không `.pfx`/`.p12`, không token/HSM,
> ## không cert trong keychain, không công cụ ký PE.

Vì vậy **không có gì để chuyển từ Mac sang máy Windows**. Việc mua/kích hoạt chứng chỉ (OV/EV hoặc
Azure Trusted Signing) là quyết định của chủ dự án — Mac không tự tạo được cert được CA công khai tin.

---

## 1. (a) Mac có cert Authenticode cho Windows không? → **KHÔNG**

Các lệnh đã chạy thật trên máy Mac này (MacBook-Air-2.local), nguyên văn kết quả:

### 1.1. Danh tính ký mã (codesigning) — chỉ toàn Apple

```console
$ security find-identity -v -p codesigning
  1) F29914EBF2900E2FA41FAD91C5B131B94456FA1F "Apple Development: minhnb2@me.com (K2QKJ93A6V)"
  2) EC7B4DAFE7970B9A4BE07B4711F183B6B3667D03 "Apple Configurator: FPT SOFTWARE COMPANY LIMITED (1D563CAF-E4B9-4DDC-9EFE-E2ED57232B26)"
  3) 49BA86CA65FE9CD6605096409D6D0B1AB7310FCB "Apple Distribution: Minh Nguyen (G6XW3RN6LJ)"
  4) D4A1C4AD1BA8B125FCA59E3BBFBD2D55F03A5E99 "Developer ID Application: Minh Nguyen (G6XW3RN6LJ)"
     4 valid identities found
```

`security find-identity -v -p basic` (union rộng hơn) thêm **Developer ID Installer** và
**3rd Party Mac Developer Installer** — **tất cả vẫn là Apple**, không có mục nào là Authenticode/Windows.
Lọc theo từ khoá cũng rỗng:

```console
$ security find-identity -v -p codesigning | grep -iE "windows|authenticode|microsoft|code.?sign"
(none)
```

### 1.2. Không có file khoá ở dạng `.pfx`/`.p12`

```console
$ ls -la ~/keystores/
-rw-------  vpnflow-keystore-password.txt
-rw-------  vpnflow-release.jks          # Android (JKS)
-rw-r--r--  vpnflow-release.keystore     # Android (keystore cũ)
-rw-------  vpnflow-signing.properties

$ mdfind -onlyin "$HOME" "kMDItemFSName == '*.pfx'c || kMDItemFSName == '*.p12'c" | grep -v /Library/
(rong)

$ ls /Users/minhnguyen/FlowGPT/*.pfx /Users/minhnguyen/FlowGPT/*.p12 /Users/minhnguyen/FlowGPT/*.pem /Users/minhnguyen/FlowGPT/*.cer
(none)
```

Chỉ có khoá **Android** (`.jks`/`.keystore`) phục vụ ký APK — không dùng được cho PE.

### 1.3. Keychain không có cert Code Signing của Windows/Microsoft

Quét `find-certificate -a -c "Code Signing"` trên các keychain: **rỗng**. Khi dump toàn bộ cert trong
keychain, từ khoá `microsoft|authenticode|windows|code signing` chỉ khớp **1 cert self-signed nội bộ của
Microsoft Office** (`CN=Microsoft.Office.Excel.ProtectedDataServices`) — không phải cert do CA cấp cho
code signing, không có private key dùng để ký phát hành.

### 1.4. Không có token/HSM cắm sẵn

```console
$ system_profiler SPSmartCardsDataType
  Readers: (khong co the)
  Available SmartCards (keychain): (rong)
  Available SmartCards (token):    (rong)
```

⇒ Không có EV cert trên smart card/token như kịch bản (b) của Windows đề nghị.

### 1.5. Không có công cụ ký PE

```console
$ for t in osslsigncode signtool az azure-signing trusted-signing-cli mono; do command -v $t; done
(osslsigncode / signtool / az / azure-signing / trusted-signing-cli / mono: KHONG co)
$ brew list | grep -iE "sign|mono|osslsign"   # (khong co)
```

---

## 2. (b) Mac từng ký file `.exe` nào chưa, bằng tool gì? → **CHƯA TỪNG**

- `git grep -n -i "osslsigncode"` toàn repo → **rỗng**; `git grep -n -i "signtool"` trong `ops/`, `scripts/`,
  `windows/` → **rỗng**. Không có script ký PE nào trong repo do Mac viết/chạy.
- Lịch sử shell (`~/.zsh_history`, `~/.bash_history`) không có lần nào chạy `osslsigncode`/`signtool`/`Import-Pfx`.
- Không có artifact `.exe` nào trên máy Mac (bộ cài Windows do máy Windows build).
- Việc "ký" trên Mac từ trước tới nay chỉ là **ký Apple**: `Developer ID Application`, `Apple Distribution`,
  `Developer ID Installer` cho `.app`/`.dmg`/`.ipa` — **không liên quan tới PE/Authenticode**.

Ghi chú kỹ thuật quan trọng (đã nêu đúng ở bus #305): cert Apple **không ký được file PE** của Windows.
Chúng chỉ có EKU của Apple (code signing cho nền Apple), không phải `1.3.6.1.5.5.7.3.3` (Microsoft Code
Signing) mà `signtool verify /pa` yêu cầu.

---

## 3. (c) Nếu CÓ cert thì Mac ký được bộ cài Windows bằng `osslsigncode` không?

**Về mặt kỹ thuật: được, nhưng có điều kiện — và điều kiện đó hiện KHÔNG có.**

`osslsigncode` ký được PE trên macOS/Linux (không cần Windows), và Windows verify lại bình thường bằng
`signtool verify /pa` hoặc `Get-AuthenticodeSignature` (`Status = Valid` + có timestamp), **miễn là**:

1. **Private key phải ở dạng file xuất được** (PEM/PFX). ⇒ Cert **OV/EV trên token/HSM** (khoá không
   xuất được) **không** dùng được với `osslsigncode` trên Mac. Muốn dùng token thì **phải ký ngay trên máy
   Windows** nơi cắm token — đúng như chủ dự án đã chốt ở handoff Windows §3.
2. Phải cài thêm công cụ: `brew install osslsigncode` (hiện **chưa cài**).
3. Phải bật chế độ ký chuỗi chứng thư đầy đủ: `-certs`, `-key`, `-pass` (nếu PFX), `-ts
   http://timestamp.digicert.com`, `-h sha256`, và nên `-n "VPNFlow"` + `-i <url>`.
4. **Azure Trusted Signing** (phương án (c) ưu tiên của Windows): ký qua **API dịch vụ**, khoá không rời
   dịch vụ. Về nguyên tắc có thể gọi từ bất kỳ máy nào có `az`/`trusted-signing-cli` — nhưng **Mac hiện
   không cài** hai công cụ này. Máy Windows cũng đang thiếu; đây là việc **cấu hình dịch vụ**, không phải
   "Mac có cert sẵn".

Tóm lại: nếu sau này chủ dự án mua **cert dạng `.pfx` xuất được** và muốn Mac ký hộ thì **làm được** bằng
`osslsigncode`. Còn nếu chọn **token EV/HSM** hoặc **Azure Trusted Signing** thì việc ký nên/được thực hiện
ở phía dịch vụ hoặc trên máy Windows — Mac không giúp được gì thêm.

---

## 4. (d) Vì không có cert → chốt phương án

Mac xác nhận rõ: **"KHÔNG CÓ"**. Đề nghị Windows/chủ dự án chọn một trong hai hướng (đúng như handoff
Windows §3 đề xuất):

| Ưu tiên | Phương án | Ai làm | Ghi chú |
|---|---|---|---|
| 1 | **Azure Trusted Signing** | chủ dự án tạo tài khoản + certificate profile; Windows cấu hình | Khoá không rời dịch vụ — **an toàn nhất**, không phải chuyển file bí mật qua chat/bus |
| 2 | **OV/EV cert trên token/HSM**, cắm vào máy Windows | chủ dự án mua + cắm token; Windows ký tại chỗ | Không xuất được khoá ⇒ **không** gửi qua bus, không dùng `osslsigncode` trên Mac |
| 3 | Cert `.pfx` xuất được (OV) | chủ dự án mua; **chuyển qua kênh an toàn riêng** | Nếu muốn Mac ký hộ thì được, nhưng kém an toàn hơn (khoá nằm trên 2 máy) |

Sau khi có cert: Windows chạy `build.ps1 -Version 1.4.5 -RequireSigning` và xuất bằng chứng
`signtool verify /pa` + `Get-AuthenticodeSignature (Status=Valid, có timestamp)` cho **cả**
`VPNFlow-Setup-1.4.5.exe` **và** `PrivateVPNWindows.App.exe` (như handoff §0.2.B/§4).

---

## 5. Bảo mật (bắt buộc)

- Mac **không** gửi kèm bất kỳ khoá/mật khẩu/cert nào trong tài liệu này hay trên agent-bus — vì **không có**
  và vì luật bảo mật (`AGENTS.md` §1, bus #298): không đưa khoá riêng qua chat/bus, không commit vào repo.
- Khi chủ dự án chuyển cert: file và mật khẩu phải đi **hai kênh khác nhau**, do chủ dự án chỉ định.

---

## 6. Cách nghiệm thu tài liệu này (chạy độc lập trên Mac)

```bash
security find-identity -v -p codesigning          # chi co identity Apple, khong co Authenticode
security find-identity -v -p basic | grep -iE "windows|microsoft|authenticode"   # rong
ls -la ~/keystores/                                # chi .jks/.keystore Android, khong .pfx
mdfind -onlyin "$HOME" "kMDItemFSName == '*.pfx'c || kMDItemFSName == '*.p12'c" | grep -v /Library/   # rong
system_profiler SPSmartCardsDataType               # khong co the/token
command -v osslsigncode signtool az trusted-signing-cli   # khong co
```

Kỳ vọng: mọi lệnh đều cho thấy **không có chứng chỉ/tool ký Windows**. Đó là bằng chứng cho kết luận
"Mac KHÔNG CÓ chứng chỉ ký số Windows".
