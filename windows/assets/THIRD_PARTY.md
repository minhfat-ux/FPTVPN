# Third-party binaries nhúng trong app Windows

Hai file dưới đây được đóng gói kèm app (copy ra cạnh `PrivateVPNWindows.App.exe`)
để app **tự lo tunnel WireGuard userspace**, người dùng không phải cài
"WireGuard for Windows". Chúng KHÔNG được sinh ra lúc build .NET — xem
`fetch-assets.sh` để tải/dựng lại.

| File | Kích thước | SHA-256 |
|---|---|---|
| `wintun.dll` | 427 552 bytes | `e5da8447dc2c320edc0fc52fa01885c103de8c118481f683643cacc3220dafce` |
| `wireguard-go.exe` | 3 079 680 bytes | `fd257c7f42284af3d361547940c83bb61f786b8a9ef57e88e49b8a52f39ec2e9` |

---

## 1. wintun.dll

- **Phiên bản:** Wintun 0.14.1 (bản `amd64`).
- **Nguồn:** https://www.wintun.net/builds/wintun-0.14.1.zip (tải ngày 2026-09-15).
- **Lệnh lấy file:**
  ```sh
  curl -sSL -o wintun-0.14.1.zip https://www.wintun.net/builds/wintun-0.14.1.zip
  unzip wintun-0.14.1.zip
  cp wintun/bin/amd64/wintun.dll windows/assets/wintun.dll
  ```
- **Giấy phép:** ⚠️ KHÔNG phải MIT. Bản `wintun.dll` dựng sẵn phát hành theo
  **"Prebuilt Binaries License"** của WireGuard LLC (khác với mã nguồn Wintun trên
  git.zx2c4.com vốn là MIT). Điều khoản cho phép phân phối lại DLL **khi đi kèm
  phần mềm khác chỉ dùng qua API `wintun.h`** — đúng cách app này dùng (nạp qua
  `wireguard-go.exe`), nhưng cấm reverse-engineer/sửa DLL và cấm dùng tên
  WireGuard/Wintun để quảng bá. Nội dung giấy phép đầy đủ:

```
Prebuilt Binaries License
-------------------------

1. DEFINITIONS. "Software" means the precise contents of the "wintun.dll"
   files that are included in the .zip file that contains this document as
   downloaded from wintun.net/builds.

2. LICENSE GRANT. WireGuard LLC grants to you a non-exclusive and
   non-transferable right to use Software for lawful purposes under certain
   obligations and limited rights as set forth in this agreement.

3. RESTRICTIONS. Software is owned and copyrighted by WireGuard LLC. It is
   licensed, not sold. Title to Software and all associated intellectual
   property rights are retained by WireGuard. You must not:
   a. reverse engineer, decompile, disassemble, extract from, or otherwise
      modify the Software;
   b. modify or create derivative work based upon Software in whole or in
      parts, except insofar as only the API interfaces of the "wintun.h" file
      distributed alongside the Software (the "Permitted API") are used;
   c. remove any proprietary notices, labels, or copyrights from the Software;
   d. resell, redistribute, lease, rent, transfer, sublicense, or otherwise
      transfer rights of the Software without the prior written consent of
      WireGuard LLC, except insofar as the Software is distributed alongside
      other software that uses the Software only via the Permitted API;
   e. use the name of WireGuard LLC, the WireGuard project, the Wintun
      project, or the names of its contributors to endorse or promote products
      derived from the Software without specific prior written consent.

4. LIMITED WARRANTY. THE SOFTWARE IS PROVIDED "AS IS" AND WITHOUT WARRANTY OF
   ANY KIND. WIREGUARD LLC HEREBY EXCLUDES AND DISCLAIMS ALL IMPLIED OR
   STATUTORY WARRANTIES, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, FITNESS
   FOR A PARTICULAR PURPOSE, QUALITY, NON-INFRINGEMENT, TITLE, RESULTS,
   EFFORTS, OR QUIET ENJOYMENT. THERE IS NO WARRANTY THAT THE PRODUCT WILL BE
   ERROR-FREE OR WILL FUNCTION WITHOUT INTERRUPTION. YOU ASSUME THE ENTIRE
   RISK FOR THE RESULTS OBTAINED USING THE PRODUCT. TO THE EXTENT THAT
   WIREGUARD LLC MAY NOT DISCLAIM ANY WARRANTY AS A MATTER OF APPLICABLE LAW,
   THE SCOPE AND DURATION OF SUCH WARRANTY WILL BE THE MINIMUM PERMITTED UNDER
   SUCH LAW. ALL EXPRESS OR IMPLIED CONDITIONS, REPRESENTATIONS AND
   WARRANTIES, INCLUDING ANY IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR
   A PARTICULAR PURPOSE OR NON-INFRINGEMENT ARE DISCLAIMED, EXCEPT TO THE
   EXTENT THAT THESE DISCLAIMERS ARE HELD TO BE LEGALLY INVALID.

5. LIMITATION OF LIABILITY. To the extent not prohibited by law, in no event
   WireGuard LLC or any third-party-developer will be liable for any lost
   revenue, profit or data or for special, indirect, consequential, incidental
   or punitive damages, however caused regardless of the theory of liability,
   arising out of or related to the use of or inability to use Software, even
   if WireGuard LLC has been advised of the possibility of such damages.
   Solely you are responsible for determining the appropriateness of using
   Software and accept full responsibility for all risks associated with its
   exercise of rights under this agreement, including but not limited to the
   risks and costs of program errors, compliance with applicable laws, damage
   to or loss of data, programs or equipment, and unavailability or
   interruption of operations. The foregoing limitations will apply even if
   the above stated warranty fails of its essential purpose. You acknowledge,
   that it is in the nature of software that software is complex and not
   completely free of errors. In no event shall WireGuard LLC or any
   third-party-developer be liable to you under any theory for any damages
   suffered by you or any user of Software or for any special, incidental,
   indirect, consequential or similar damages (including without limitation
   damages for loss of business profits, business interruption, loss of
   business information or any other pecuniary loss) arising out of the use or
   inability to use Software, even if WireGuard LLC has been advised of the
   possibility of such damages and regardless of the legal or quitable theory
   (contract, tort, or otherwise) upon which the claim is based.

6. TERMINATION. This agreement is affected until terminated. You may
   terminate this agreement at any time. This agreement will terminate
   immediately without notice from WireGuard LLC if you fail to comply with
   the terms and conditions of this agreement. Upon termination, you must
   delete Software and all copies of Software and cease all forms of
   distribution of Software.

7. SEVERABILITY. If any provision of this agreement is held to be
   unenforceable, this agreement will remain in effect with the provision
   omitted, unless omission would frustrate the intent of the parties, in
   which case this agreement will immediately terminate.

8. RESERVATION OF RIGHTS. All rights not expressly granted in this agreement
   are reserved by WireGuard LLC. For example, WireGuard LLC reserves the
   right at any time to cease development of Software, to alter distribution
   details, features, specifications, capabilities, functions, licensing
   terms, release dates, APIs, ABIs, general availability, or other
   characteristics of the Software.
```

---

## 2. wireguard-go.exe

- **Phiên bản:** wireguard-go `0.0.20250522` (hằng số `Version` trong `version.go`).
- **Nguồn:** https://github.com/WireGuard/wireguard-go
  (mirror của https://git.zx2c4.com/wireguard-go).
- **Commit dựng:** `ecfc5a8d54462e18e13c72173e2623d16d8e25a0` (2026-05-22).
- **Giấy phép:** MIT (WireGuard LLC). Nội dung đầy đủ:

```
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Cách dựng lại (cross-compile từ macOS → windows/amd64)

`wireguard-go` trên Windows là chương trình test/debug userspace (xem cảnh báo
trong `main_windows.go` của repo đó): nhận **đúng một** tham số là tên interface,
tự tạo adapter Wintun qua `wintun.dll`, rồi mở UAPI named pipe để nạp cấu hình.
Vì vậy `wintun.dll` **phải nằm cạnh `wireguard-go.exe`** (module wintun nạp DLL
bằng `LoadLibraryEx(..., LOAD_LIBRARY_SEARCH_APPLICATION_DIR | ...)`).

```sh
export GOROOT=/Volumes/BIWIN/SourcesCode/PrivateVPN/.tools/go
export GOPATH=/Volumes/BIWIN/SourcesCode/PrivateVPN/.tools/gopath
export PATH="$GOROOT/bin:$PATH"
export CGO_ENABLED=0 GOOS=windows GOARCH=amd64

git clone --depth 1 https://github.com/WireGuard/wireguard-go.git wireguard-go-src
cd wireguard-go-src
go build -trimpath -ldflags="-s -w" -o ../../windows/assets/wireguard-go.exe .
```

Go dùng để dựng: `go1.23.4 darwin/arm64` (đặt tại `.tools/go`, `go.mod` yêu cầu
`go 1.23.1`). Các module phụ thuộc: `golang.org/x/crypto v0.37.0`,
`golang.org/x/net v0.39.0`, `golang.org/x/sys v0.32.0`,
`golang.zx2c4.com/wintun v0.0.0-20230126152724-0fa3db229ce2`,
`gvisor.dev/gvisor v0.0.0-20250503011706-39ed1f5ac29c`.
