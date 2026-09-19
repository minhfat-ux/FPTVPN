# Third-party binaries nhúng trong app Windows

Bốn file dưới đây được đóng gói kèm app (copy ra cạnh `PrivateVPNWindows.App.exe`):

- **`wintun.dll` + `wireguard-go.exe`** — app **tự lo tunnel WireGuard userspace**, người dùng
  không phải cài "WireGuard for Windows".
- **`flowvpnrelay.exe` + `sing-box.exe`** — đường **hysteria2 bọc trong WebSocket** (xem
  `windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayTunnel.cs`): `flowvpnrelay` mở SOCKS5 nội
  bộ đã đi qua relay WSS, `sing-box` nhận SOCKS5 đó làm outbound và lo TUN + định tuyến + DNS.

Chúng KHÔNG được sinh ra lúc build .NET — xem `fetch-assets.sh` để tải/dựng lại (script bỏ qua
file đã có và in sha256 của cả bốn file ở cuối).

| File | Kích thước | SHA-256 |
|---|---|---|
| `wintun.dll` | 427 552 bytes | `e5da8447dc2c320edc0fc52fa01885c103de8c118481f683643cacc3220dafce` |
| `wireguard-go.exe` | 3 079 680 bytes | `fd257c7f42284af3d361547940c83bb61f786b8a9ef57e88e49b8a52f39ec2e9` |
| `flowvpnrelay.exe` | 10 338 304 bytes | `cec746978ee30747183d0170cf7d75f925dabb183e8789398f808f4052189d75` |
| `sing-box.exe` | 59 290 624 bytes | `2ee729bd808ead2188f8d6f438c9babd8793d45a64ed44c9a7a5f11fe4f67715` |

ⓘ `flowvpnrelay.exe` là bản build của CHÍNH chúng ta (mã nguồn trong repo:
`tools/hysteria-relay/`), nên hash sẽ đổi mỗi lần build lại — cập nhật bảng này khi đổi.
`sing-box.exe` **cũng là bản build của chính chúng ta** từ source upstream v1.14.1 (không sửa mã
nguồn, chỉ khác cờ build) — xem §4 để biết vì sao KHÔNG dùng bản release tải sẵn.

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

- **Là gì:** hysteria2 client (hysteria `app/v2.12.2`) + **một** thay đổi duy nhất của chúng ta:
  thêm transport `wsrelay` để QUIC đi trong WebSocket. Bản CLI chính thức chỉ có transport UDP
  (`udp`/`udphop`) nên không nối được vào relay WebSocket sau Cloudflare — đường duy nhất còn đi
  được khi nhà mạng chặn thẳng IP node.
- **Mã nguồn phần của VPNFlow:** `tools/hysteria-relay/runner.go` (client + SOCKS5 TCP/UDP) và
  `tools/hysteria-relay/wsrelay.go` (`net.PacketConn` trên WebSocket; giao thức "1 binary WS
  message = 1 UDP datagram", đúng giao thức relay phía server đang chạy).
- **Cách dựng:** `TARGETS="windows/amd64" OUT_DIR=<workdir> bash tools/hysteria-relay/build.sh`
  — script clone hysteria tag **`app/v2.12.2`** rồi COPY hai file trên vào checkout
  (`app/flowvpnrelay/main.go`, `app/internal/wsrelay/wsrelay.go`); phần còn lại của hysteria
  không bị sửa, nhờ vậy import được package `internal/...` của chính module đó.
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

## 4. sing-box.exe

- **Phiên bản:** sing-box **v1.14.1** — **TỰ BUILD TỪ SOURCE** (tag `v1.14.1`), không tải bản
  release sẵn.
- **Vì sao không dùng bản release tải sẵn** (đo thật 19/09/2026, **đừng đổi lại**):
  hash của `sing-box-1.14.1-windows-amd64.exe` (`b838de45…`) nằm trong danh sách bị **Smart App
  Control** trên Windows 11 chặn — policy `VerifiedAndReputableDesktop`
  (`PolicyGUID {0283ac0f-fff1-49ae-ada1-8a933130cad6}`), event CodeIntegrity **3033/3077/3118**,
  `Requested Signing Level=2` / `Validated Signing Level=1`, **Status `0xc0e90002`**
  ("did not meet the Enterprise signing level requirements"). Defender quét chính file đó:
  *found no threats* — tức không phải mã độc, chỉ là hash bị đánh dấu.
  Đã chứng minh là **chặn theo hash**: cùng file đó chỉ cần đổi 4 byte PE checksum là **chạy được**,
  và bản tự build từ đúng source v1.14.1 cũng chạy bình thường trên máy bật Smart App Control.
  ⇒ Asset phát hành phải là bản do mình build; không sửa mã nguồn upstream, chỉ khác cờ build.
- **Lệnh build** (script `windows/assets/fetch-assets.sh` làm đúng lệnh này):
  ```sh
  git clone --depth 1 --branch v1.14.1 https://github.com/SagerNet/sing-box.git sing-box-src
  cd sing-box-src
  go build \
    -tags "with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_acme,with_clash_api,with_tailscale" \
    -trimpath -ldflags "-s -w -X github.com/sagernet/sing-box/constant.Version=1.14.1" \
    -o windows/assets/sing-box.exe ./cmd/sing-box
  ```
  (Build trên Windows bằng Go 1.27.1; `CGO_ENABLED=0`.)
- **Giấy phép:** **GPL-3.0-or-later** (© 2022 nekohasekai <contact-sagernet@sekai.icu>), kèm
  điều khoản cấm dùng tên/ám chỉ liên hệ với ứng dụng gốc khi chưa được đồng ý. Nội dung license
  đi kèm trong zip upstream:

```
Copyright (C) 2022 by nekohasekai <contact-sagernet@sekai.icu>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.

In addition, no derivative work may use the name or imply association
with this application without prior consent.
```

### Vì sao phân phối kèm một binary GPL là CÓ CHỦ ĐÍCH

Đây không phải sơ suất cần "dọn" sau:

1. **Quyết định của chủ dự án.** Chủ dự án đã duyệt dùng sing-box làm bộ TUN/định tuyến/DNS cho
   bản Windows **kể cả khi biết nó là GPL-3.0** (xem `docs/CHINA_TRANSPORT_ROADMAP.md`).
2. **Cách dùng tách tiến trình, không liên kết.** `sing-box.exe` được chạy như **tiến trình con
   riêng**, giao tiếp qua SOCKS5 (TCP/UDP) trên loopback — không nhúng mã, không link tĩnh. Đây
   là ranh giới rõ ràng giữa hai chương trình.
3. **Nghĩa vụ GPL-3.0 đã được đáp ứng bằng cách công khai nguồn:** ta phát hành **binary nguyên
   bản, không sửa**, kèm URL nguồn chính xác (tag `v1.14.1`) ở trên và bản license đầy đủ; bất kỳ
   ai nhận bộ cài đều tải được mã nguồn tương ứng từ chính URL đó. Ta **không** dùng tên
   "sing-box"/SagerNet để quảng bá sản phẩm (điều khoản "In addition…" ở trên).
4. **Rủi ro còn lại, ghi rõ để không quên:** nếu sau này có yêu cầu pháp lý/phát hành (ví dụ bán
   qua store có điều khoản cấm GPL), phương án thay thế đã có sẵn — dùng `flowvpnrelay.exe` +
   WireGuard/TUN tự viết, hoặc tách sing-box thành gói tải riêng do người dùng tự cài. **Chưa**
   làm vì chủ dự án đã chốt phương án hiện tại.

### Ghi chú kỹ thuật

- Bản `windows-amd64` **không** có `libcronet.dll` đi kèm: `objdump -p` cho thấy `sing-box.exe`
  chỉ import tĩnh `kernel32.dll`, các DLL khác (nếu có) được `LoadLibrary` khi dùng. Kiểm chứng
  lại `sing-box.exe version` trên máy Windows bằng `windows/installer/verify-relay.ps1`.
- Cấu hình do `SingBoxConfigBuilder.BuildSingBoxConfig` sinh ra đã được kiểm bằng
  `sing-box check -c` (v1.14.1), không lỗi.
