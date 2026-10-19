# Third-party binaries nhúng trong app Windows

Ba file dưới đây được đóng gói kèm app (copy ra cạnh `PrivateVPNWindows.App.exe`):

- **`wintun.dll` + `wireguard-go.exe`** — app **tự lo tunnel WireGuard userspace**, người dùng
  không phải cài "WireGuard for Windows".
- **`flowvpnrelay.exe`** — đường **hysteria2 bọc trong WebSocket** (xem
  `windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayTunnel.cs`): MỘT tiến trình lo cả
  hysteria2-over-WS + SOCKS5 nội bộ **lẫn TUN + auto-route + bypass Trung Quốc** (khối `tun`
  trong cấu hình JSON, xem `tools/hysteria-relay/tun.go`).

Chúng KHÔNG được sinh ra lúc build .NET — xem `fetch-assets.sh` để tải/dựng lại (script bỏ qua
file đã có và in sha256 của cả ba file ở cuối).

| File | Kích thước | SHA-256 |
|---|---|---|
| `wintun.dll` | 427 552 bytes | `e5da8447dc2c320edc0fc52fa01885c103de8c118481f683643cacc3220dafce` |
| `wireguard-go.exe` | 3 079 680 bytes | `fd257c7f42284af3d361547940c83bb61f786b8a9ef57e88e49b8a52f39ec2e9` |
| `flowvpnrelay.exe` | 12 788 736 bytes | `ce6fd67c7407979bb8db4dd0acc809ceef77f21b5336076d2053d322ba3c974e` |

ⓘ `flowvpnrelay.exe` là bản build của CHÍNH chúng ta (mã nguồn trong repo:
`tools/hysteria-relay/`), nên hash sẽ đổi mỗi lần build lại — cập nhật bảng này khi đổi.

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

---

## 3. flowvpnrelay.exe

- **Là gì:** hysteria2 client (hysteria `app/v2.12.2`) + **hai** thay đổi của chúng ta: transport
  `wsrelay` để QUIC đi trong WebSocket, và khối cấu hình `tun` để chính binary này dựng TUN +
  auto-route + bypass Trung Quốc. Bản CLI chính thức chỉ có transport UDP (`udp`/`udphop`) nên
  không nối được vào relay WebSocket sau Cloudflare — đường duy nhất còn đi được khi nhà mạng
  chặn thẳng IP node.
- **Mã nguồn phần của VPNFlow:** `tools/hysteria-relay/runner.go` (client + SOCKS5 TCP/UDP),
  `tools/hysteria-relay/wsrelay.go` (`net.PacketConn` trên WebSocket; giao thức "1 binary WS
  message = 1 UDP datagram", đúng giao thức relay phía server đang chạy) và
  `tools/hysteria-relay/tun.go` (TUN dùng lại client TUN có sẵn của hysteria
  `app/internal/tun` → `apernet/sing-tun` → `wintun.dll`; in `TUNREADY`/`TUNFAIL` cho app).
- ⚠️ **Asset phải được build LẠI mỗi khi sửa `tools/hysteria-relay/`** — `fetch-assets.sh` chỉ
  build khi `windows/assets/flowvpnrelay.exe` CHƯA có, nên file cũ sẽ nằm lại và app sẽ chờ mãi
  dòng `TUNREADY`. Xoá file cũ rồi chạy `bash windows/assets/fetch-assets.sh`.
  (Đã có thật 13/10/2026: asset cũ `cec7469…` build 19/09/2026 **chưa có phần TUN** — khi chạy với
  cấu hình có khối `tun` nó chỉ in `READY … socks5=…`, không tạo adapter `flowvpntun`, không in
  `TUNFAIL`. Asset hiện tại `ce6fd67c…` đã có `TUNREADY`/`TUNFAIL`/`flowvpntun` và bộ chia DNS `dns.go`.)
- **Cách dựng:** `TARGETS="windows/amd64" OUT_DIR=<workdir> bash tools/hysteria-relay/build.sh`
  — script clone hysteria tag **`app/v2.12.2`** rồi COPY ba file trên vào checkout
  (`app/flowvpnrelay/main.go`, `app/flowvpnrelay/tun.go`, `app/internal/wsrelay/wsrelay.go`);
  phần còn lại của hysteria không bị sửa, nhờ vậy import được package `internal/...` của chính
  module đó.
- **Dependency thêm vào bản build:** `github.com/gorilla/websocket v1.5.3` (dependency duy nhất).
- **Go dùng để dựng:** `go1.26.6 darwin/arm64`, `CGO_ENABLED=0`, `-trimpath -ldflags "-s -w"`.
- **Giấy phép:** MIT (© apernet) cho hysteria + BSD-3-Clause (© Gorilla WebSocket Authors) cho
  `gorilla/websocket` + phần do VPNFlow viết. Nội dung hai giấy phép:

```
MIT License (hysteria — https://github.com/apernet/hysteria)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

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

```
BSD 3-Clause License (gorilla/websocket — https://github.com/gorilla/websocket)

Copyright (c) 2013 The Gorilla WebSocket Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

  Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

  Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

  Neither the name of the copyright holder nor the names of its contributors
  may be used to endorse or promote products derived from this software
  without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## 4. Vì sao KHÔNG còn `sing-box.exe` (bỏ 13/10/2026)

- **Quyết định:** bỏ hẳn `sing-box.exe` khỏi sản phẩm Windows. Khách báo lỗi
  13/10/2026: app yêu cầu `sing-box.exe` **phải có chữ ký** — máy khách bật **Smart App
  Control** thì WDAC chặn binary bên thứ ba chưa ký/chưa "uy tín" (đo thật trên máy harness:
  CodeIntegrity **3033/3077/3118**, Win32 **4551** "Application Control policy has blocked").
  Ta **không kiểm soát được chữ ký của binary ngoài**, còn binary của chính mình thì chạy bình
  thường trên đúng máy đó ⇒ cách triệt để là bỏ hẳn phụ thuộc đó.
- **Việc của nó nay ở đâu:** TUN + auto-route + bypass Trung Quốc nằm trong **chính
  `flowvpnrelay.exe`** (build từ `tools/hysteria-relay/`): dùng client TUN có sẵn của **hysteria
  v2** (`app/internal/tun` → **`apernet/sing-tun`** → `wintun.dll` mà app vốn đã ship cho đường
  WireGuard). Cấu hình mang khối `tun` (xem §3 và `tools/hysteria-relay/tun.go`), app chờ dòng
  `TUNREADY` rồi tự đặt DNS lên adapter TUN bằng `netsh` (1.1.1.1 + 8.8.8.8).
- **Hệ quả:** app chỉ còn MỘT tiến trình con cho đường relay; không còn binary GPL-3.0 nào trong
  bộ cài; `windows/assets/fetch-assets.sh` không tải/build sing-box nữa.
- **Bối cảnh lịch sử** (giữ lại để không ai "khôi phục" nhầm): bản sing-box phát hành trước đây
  là **v1.14.1 tự build từ source** (không dùng bản release tải sẵn vì hash của bản release nằm
  trong danh sách bị Smart App Control chặn theo hash — `PolicyGUID
  {0283ac0f-fff1-49ae-ada1-8a933130cad6}`, Status `0xc0e90002`). Việc tự build chỉ **né được chặn
  theo hash**, không giải quyết được yêu cầu chữ ký ⇒ vẫn phải bỏ.

