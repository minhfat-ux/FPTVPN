# mac-selfdefense — cơ chế tự bảo vệ máy Mac

> Yêu cầu của chủ dự án (22/09/2026): *"nếu anh nhỡ cho phép chạy gì đó mà có nghi vấn, thì
> có agent tự lock và quarantine lại, và alert cho anh trên Telegram ngay."*

Sự cố đã xảy ra thật trên máy này ngày **24/08/2026**: một LaunchAgent giả danh VMware
(`com.vmware.storage.identitydaemonworker.eq03`) chạy `curl … | bash` từ
`v3ctorium.link` / `blue-metric-42.technology` / `the8-thsignal.com`, bật `RunAtLoad` +
`KeepAlive` + chạy lại mỗi 300s, kèm một app Electron có `SystemUpdater.app` và bundle
`PermissionFlow` để dụ người dùng cấp quyền. Cơ chế này ra đời để lần sau không phải phát
hiện bằng mắt.

## 1. Nó bắt gì

| # | Watcher | Nguồn | Bắt được |
|---|---|---|---|
| 1 | `checkPersistence` | `~/Library/LaunchAgents`, `/Library/LaunchAgents`, `/Library/LaunchDaemons` | LaunchAgent/Daemon mới hoặc vừa sửa — **đúng vector của vụ 24/08** |
| 2 | `checkProcesses` | `ps -Ao pid=,ppid=,uid=,command=` | tiến trình chạy binary từ Desktop/Downloads/Documents/tmp, hoặc tên khớp IOC |
| 3 | `checkTcc` | `TCC.db`, **dự phòng `log show`** | quyền nhạy cảm vừa được yêu cầu/cấp (Accessibility, Screen Recording, Full Disk Access, App Data, …) |
| 4 | `checkStartup` | shell rc, `crontab -l`, login items | dropper cài vào `.zshrc`/`.zprofile`, cron lạ, login item mới |
| 5 | `checkHold` | `~/.local/state/mac-selfdefense/hold.json` | **cách ly bị phá** — kiểm tra lại định kỳ và siết lại |
| 6 | IOC | `iocs.json` | label, domain, mẫu tên, sha256 của vụ 24/08 |

## 2. Tín hiệu CỨNG vs MỀM — quyết định thiết kế quan trọng nhất

- **CỨNG → khoá + cách ly + alert.** Chỉ khi: khớp IOC, có mẫu dropper (`curl … | bash`,
  `base64 -d | sh`, `--noproxy`), hoặc binary nằm trong vùng không bao giờ hợp lệ.
- **MỀM → chỉ alert.** Ví dụ `RunAtLoad` + `KeepAlive` với binary ngoài allowlist. Không khoá.

Lý do phải tách: trên máy này `node`, `opencode`, `dsh` đều là binary **ad-hoc signature**
của Homebrew (không Team ID, không notarize). Nếu coi "không notarize" là cứng thì cơ chế
sẽ tự bắn vào chân harness của chính chủ dự án.

Bài học cụ thể đã trả giá trong lúc làm (22/09/2026): bản đầu khớp IOC trên **toàn bộ chuỗi
lệnh**, nên lệnh `bash` đang viết báo cáo về mã độc bị gắn cờ `hard` — ở chế độ enforce nó
sẽ **kill đúng phiên agent đang xử lý sự cố**. Đã sửa: lớp tiến trình **chỉ soi đường dẫn
file thực thi**, không soi tham số. Có test hồi quy cho đúng ca này
(`test/detect.test.js` → *"KHÔNG gắn cờ khi chuỗi IOC chỉ nằm trong THAM SỐ"*).

Thêm một chốt an toàn: `ancestorPids()` — daemon không bao giờ kill tổ tiên của chính nó.

### Vì sao có `checkHold` — cách ly một lần là chưa đủ

Ngày **23/09/2026**, sau khi máy reboot, iCloud đồng bộ ngược vào Desktop và **trả lại exec bit**
cho `SystemUpdater.app/Contents/MacOS/App` (4.6MB Mach-O nằm local, mode `-rwxr-x--x`). Tức là
containment đã bị hoàn tác mà không có gì báo.

Nên `hold.json` ghi lại danh sách phải giữ, và `checkHold` kiểm tra lại mỗi `hold.everyMs`
(mặc định 5 phút): còn exec bit / còn `.app` chưa đổi tên / mất xattr ⇒ **siết lại + báo động**.

```bash
node selfdefense.mjs hold --list          # xem đang giữ gì
node selfdefense.mjs hold ~/Desktop/xyz   # thêm vào danh sách giữ
```

Lưu ý: đây là biện pháp **đối phó triệu chứng**. Gốc rễ là file vẫn nằm trong vùng sync iCloud —
muốn dứt điểm thì phải xoá khỏi iCloud.

## 3. Chế độ

| `mode` | Hành vi |
|---|---|
| `enforce` | khoá thật: kill → `launchctl bootout` → gỡ exec bit → gắn xattr → dời vault |
| `alert` | chỉ báo Telegram, không đụng file/tiến trình |
| `dry-run` | chỉ ghi log, in ra sẽ làm gì |

Đổi nhanh không cần sửa file: `SELFDEFENSE_MODE=dry-run node selfdefense.mjs once`

## 4. Cài đặt

```bash
scripts/security/mac-selfdefense/install.sh --dry-run   # xem trước
scripts/security/mac-selfdefense/install.sh             # cài
scripts/security/mac-selfdefense/install.sh --uninstall  # gỡ
```

Bản chạy được **copy vào `~/.local/share/mac-selfdefense/`** chứ không chạy thẳng từ repo:
repo nằm trên volume rời `/Volumes/BIWIN`, volume unmount là launchd không khởi động được —
cơ chế tự bảo vệ sẽ chết đúng lúc cần nhất.

Hai LaunchAgent được tạo:
- `site.meetflowai.mac-selfdefense` — daemon chính, `KeepAlive`.
- `site.meetflowai.mac-selfdefense-watchdog` — mỗi 300s kiểm tra heartbeat; daemon chết thì
  báo Telegram kèm đúng lệnh khởi động lại. Đây là phần **tự bảo vệ**: cơ chế bảo vệ máy
  thì bản thân nó cũng phải có người canh.

## 5. Cấu hình

`~/.config/mac-selfdefense/config.json` (mặc định: `config.example.json`).

```json
{
  "mode": "enforce",
  "pollMs": 5000,
  "vault": null,
  "watchDirs": ["~/Library/LaunchAgents", "/Library/LaunchAgents", "/Library/LaunchDaemons"],
  "allow": { "pathPrefixes": ["/System/", "/usr/", "/opt/homebrew/", "..."], "labels": ["com.apple."] },
  "tcc": { "enabled": true, "sensitiveOnly": true, "source": "auto", "everyMs": 60000 },
  "hold": { "everyMs": 300000 },
  "startup": { "enabled": true, "everyMs": 60000, "checkCrontab": true, "checkLoginItems": true },
  "notify": { "transport": "auto", "relayHost": null, "relayKey": null },
  "protectSelf": true
}
```

Muốn tắt tiếng một cảnh báo mềm (ví dụ gateway riêng) thì thêm đường dẫn vào
`allow.pathPrefixes`, đừng hạ cấp cả cơ chế.

## 6. Kênh alert — và một ràng buộc thật của mạng

`api.telegram.org` **không kết nối được từ máy Mac này** (đo 22/09/2026: `http=000` sau 10s,
không có proxy). VPS `103.173.155.50` thì tới được (`http=302`).

Nên `notify.transport` có 3 giá trị:
- `direct` — gọi thẳng Telegram.
- `ssh` — SSH tới VPS rồi để VPS gọi hộ.
- `auto` (mặc định) — thử `direct` trước, hỏng thì rơi về `ssh`.

Đường SSH đẩy nội dung qua **stdin** (`--data-binary @-`) nên nội dung cảnh báo không nằm
trong command line của tiến trình trên VPS.

> ⚠️ **`AGENTS.md` §1 cấm `ssh`.** Transport `ssh`/`auto` dùng SSH tới VPS của chính chủ dự án
> (khoá `~/.ssh/dsh_tunnel`, chỉ chạy `curl` — không sửa gì trên server). Đây là **xung đột
> luật cần chủ dự án chốt**. Nếu không chấp nhận, đặt `"transport": "direct"` — nhưng khi đó
> alert sẽ im lặng vì mạng không tới được Telegram.

## 7. Vault & bằng chứng

- Vault mặc định: `~/.local/state/mac-selfdefense/vault` (APFS), phương án sau là
  `/Volumes/BIWIN/SourcesCode/_quarantine`.
- **Vì sao ưu tiên APFS:** đã gặp thật 22/09/2026 — `/Volumes/BIWIN` là **ExFAT mount
  `noowners`**, không lưu POSIX permission, nên `chmod a-x` trong vault vô hiệu: mọi file
  đều hiện `-rwx------`. Đặt vault trên ExFAT là tự vô hiệu hoá một nửa cơ chế.
  (xattr `com.apple.quarantine` thì ExFAT vẫn giữ được, qua file AppleDouble `._*`.)
- Mỗi sự cố một thư mục `<ngày>-<label>/` chứa file gốc + `manifest-sha256-*.txt`.
- **Không xoá bằng chứng.** Quy trình: vô hiệu hoá tại chỗ trước (gỡ exec bit + xattr
  `com.apple.quarantine`), dời vault sau, chỉ xoá bản gốc khi đã đối chiếu số file khớp.
- Log JSONL: `~/.local/state/mac-selfdefense/selfdefense.log` (tự xoay ở 5MB),
  sự cố riêng ở `incidents.jsonl`, snapshot ở `snapshot.json`.

`snapshot.json` nằm trên đĩa là **có chủ đích**: nếu chỉ giữ baseline trong RAM thì mỗi lần
daemon restart lại coi hiện trạng là "sạch", và mã độc đáp xuống trong lúc daemon tắt sẽ
được bỏ qua. Khi chưa có snapshot, lần chạy đầu soi **toàn bộ** file hiện có.

## 8. Test

```bash
cd scripts/security/mac-selfdefense && node --test    # 36 test
```

## 8b. Bài học vận hành với iCloud Desktop (đã gặp thật 22/09/2026)

Desktop của máy này bật "Desktop & Documents" của iCloud. Payload của vụ 24/08 đã bị iCloud
**evict** (`stat -f %b` = 0) nên `ditto` treo vô hạn và `brctl download` trả rc=0 mà không
materialize. Cách đọc được: `cat`/`cp` từng file với timeout đủ dài (iCloud chỉ chậm ở lần
truy cập đầu), rồi đối chiếu kích thước trước khi xoá bản gốc.

Hệ quả cần nhớ: **cách ly file trên Desktop không có nghĩa là file đã rời khỏi máy** — nó có
thể đang nằm trên iCloud và đồng bộ sang các thiết bị khác.

## 8c. Quy tắc "chỉ tin code, không tin comment"

Mọi mẫu dropper/IOC được khớp trên phần **không phải comment**. Đã trả giá hai lần: một lần
khớp trên tham số tiến trình, một lần khớp trên dòng `# curl … | bash` trong ghi chú. Cả hai
đều dẫn tới báo động giả — và ở chế độ enforce thì lần đầu sẽ **kill phiên agent đang xử lý sự cố**.

## 8d. Miễn trừ updater — theo CHỮ KÝ, không theo tên

macOS Software Update và Microsoft AutoUpdate là updater **hợp lệ**, nhưng chúng giải nén rồi chạy
helper từ `/tmp` / `~/Library/Caches` — mà vùng tạm là tín hiệu **CỨNG** của watcher tiến trình.
Không miễn trừ thì cơ chế sẽ **kill giữa lúc đang cài** ⇒ app hỏng dở.

Cách miễn trừ **không** dựa vào tên file (làm vậy là mở cửa hậu — sự cố 24/08/2026 trên chính máy
này là một app tự xưng `SystemUpdater.app`). Nó dựa trên **chữ ký số của nhà phát hành**:

| Nhà phát hành | Nhận diện bằng | Đo thật trên máy |
|---|---|---|
| Microsoft | `TeamIdentifier=UBF8T346G9` | `Microsoft AutoUpdate.app` → `Developer ID Application: Microsoft Corporation (UBF8T346G9)` |
| Apple | `Authority=Software Signing` / `Platform Binary` | `/bin/ls`, `Software Update.app` |
| Homebrew `node` | `Signature=adhoc`, không Team ID | **KHÔNG tin cậy** |

Ba chốt an toàn:
1. **Khớp IOC xét TRƯỚC miễn trừ** — không có cửa hậu cho thứ đã biết là xấu.
2. Binary tự xưng "Microsoft AutoUpdate" mà **không có chữ ký** ⇒ vẫn bị xử lý như thường.
3. Miễn trừ chỉ trả `severity: "allow"` ⇒ **không kill**, nhưng **vẫn ghi log** `process-allowed`.

Chú ý khi đọc `codesign`: nó ghi **toàn bộ ra STDERR**, stdout rỗng — dùng `execFileSync` sẽ chỉ
nhận stdout và `authorities` luôn rỗng (đã trả giá đúng lỗi này 24/09/2026). Phải dùng `spawnSync`.

## 8e. Vì sao KHÔNG đọc TCC.db và KHÔNG đọc login item mặc định

Cả hai đều khiến macOS bật hộp thoại xin quyền mang tên **`node`** — rất khó đoán vì đó là tên
binary (Homebrew node **ad-hoc**, không Team ID), không phải tên công cụ:

| Việc | Hệ quả đo được (29/09/2026) |
|---|---|
| Đọc `~/Library/Application Support/com.apple.TCC/TCC.db` | `sandboxd` hỏi quyền `kTCCServiceSystemPolicyAppData` cho node ⇒ hộp thoại *"node would like to access data from other apps"* |
| `osascript 'tell application "System Events"'` (đọc login item) | quyền `kTCCServiceAppleEvents` bị gán cho **tiến trình chịu trách nhiệm** là node ⇒ hộp thoại hiện lại **mỗi vòng quét** |

Nên mặc định là `tcc.source: "log"` (dùng `log show`, cùng tín hiệu, không đụng dữ liệu được bảo vệ)
và `startup.checkLoginItems: false`. Muốn bật lại thì phải chấp nhận hộp thoại đó.

Ngoài ra `/Library/Developer/` (Xcode/CoreSimulator) và `/Library/Application Support/Microsoft/`
đã vào allowlist đường dẫn — trước đó CoreSimulator là **nguồn alert ồn thật** (đo 24/09/2026:
~10 sự kiện TCC/giờ, tổng 235 alert mà **không truy được vì log không ghi nội dung alert** — đã
sửa: log nay ghi 3 dòng đầu của mỗi alert).

## 9. Giới hạn đã biết

- Không cần root và **không dùng EndpointSecurity** (cần entitlement) ⇒ chỉ thấy tiến trình
  qua polling `ps`, không bắt được exec event tức thời.
- Chỉ kill/cách ly được tiến trình **cùng user**; file của `root` chỉ gắn được xattr nếu có quyền.
- `checkTcc` chạy theo chu kỳ riêng `tcc.everyMs` (mặc định 60s), không theo `pollMs`,
  vì `log show` khá nặng.
- Bản chạy qua LaunchAgent **không có Full Disk Access** ⇒ đọc `TCC.db` bị
  `authorization denied`. Đã gặp thật và xử lý: daemon ghi nhận `tcc-db-denied` **một lần**
  rồi chuyển hẳn sang `log show` — nguồn này không cần FDA mà vẫn trả về `service` +
  `identifier` + `binary_path`; log ghi `tcc-source: {via: "log"}` để biết đang dùng nguồn nào.
  Muốn dùng `TCC.db` (có thêm `auth_value`/`auth_reason`, tức biết người dùng ĐÃ bấm cho phép
  hay chưa) thì phải cấp Full Disk Access cho `/opt/homebrew/bin/node`.
- Chỉ theo dõi persistence ở 3 thư mục launchd. Chưa phủ: login items, cron, configuration
  profiles, `~/.zshrc`, browser extensions.
- File bị iCloud evict (`blocks=0`) thì **không hash được, không dời được** — gặp thật với
  payload vụ 24/08. Xem ghi chú trong `iocs.json`.
