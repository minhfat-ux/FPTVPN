# AGENTS.md — luật bắt buộc cho MỌI agent làm việc trong repo này

> File này được nạp tự động khi một agent (opencode, codebuddy, Codex, …) mở repo.
> Đọc hết trước khi sửa bất kỳ file nào. Nếu brief bạn nhận **xung đột** với file này → **dừng lại và báo**, đừng tự quyết.

## 0. Vai trò
- **Agent chính (DSH/main agent) = người giao task, review, commit, push, deploy.** Chịu trách nhiệm cuối.
- **Publisher tách theo kênh (chủ dự án chốt 23/09/2026)**: **harness Mac** phát hành **iOS + macOS**
  (IPA ad-hoc/TestFlight, DMG); **harness Windows** phát hành **Windows + Android** (`.exe`, APK
  modern/legacy). Không tự publish kênh không thuộc phần mình — chi tiết: `docs/PUBLISHER_PROCESS.md` §0 luật 12.
- **Bạn (worker) = chỉ sửa file trong phạm vi được giao.** Bạn KHÔNG sở hữu trạng thái cuối của repo.
- Chủ dự án (người) là người quyết định cuối cùng.

## 1. Cấm tuyệt đối
- ❌ `git add/commit/push/checkout/merge/rebase/stash` — mọi thao tác git. Agent chính làm việc đó.
- ❌ `ssh`, `scp`, sửa file trên server production, gọi API production có thay đổi dữ liệu.
- ❌ Sửa file ngoài danh sách trong brief. Không "tiện tay" format lại, đổi tên, hay refactor file khác.
- ❌ Thêm dependency mới, đổi `package.json`/`build.gradle`/`Podfile` trừ khi brief yêu cầu rõ.
- ❌ Đưa secret/credential/token/khoá riêng vào code, doc, log, hay nội dung báo cáo. Nếu thấy secret đang bị lộ → báo, KHÔNG copy nó vào chỗ khác.
- ❌ Nới lỏng test (đổi assertion thành luôn-đúng, xoá case, `skip`) để "cho pass".

## 2. Nguồn sự thật (theo thứ tự)
1. Code production trong repo.
2. Docs repo-backed (`docs/**`), đặc biệt `docs/SRS.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`.
3. `.privatevpn/status/*.json` (trạng thái requirement/bug).
4. Chat/lịch sử hội thoại = **context, không phải sự thật**.

Nếu brief nói một đằng, code nói một nẻo → **theo code**, và ghi rõ phát hiện đó trong báo cáo.

## 3. Convention bắt buộc
- Đọc thêm: `docs/templates/agentic-project/RULES.md`, `docs/AGENTIC_PROJECT_WORKFLOW.md` (§5, §10b), `docs/DEVELOPMENT.md` (§4 code conventions, §5c Android, §6 commit conventions).
- **Diff tối thiểu**: chỉ đụng đúng phần cần thiết; giữ nguyên style, naming, thứ tự import của file xung quanh.
- **Comment**: chỉ thêm khi thực sự cần giải thích "vì sao"; viết cùng ngôn ngữ với comment xung quanh (repo này thường dùng tiếng Việt cho ghi chú nghiệp vụ, tiếng Anh cho code/API).
- **Test**: control-plane dùng Node built-in runner — `node --test`, file `control-plane/test/*.test.js`, `import test from "node:test"; import assert from "node:assert/strict";`. Android/iOS: không thêm framework mới.
- **Ngôn ngữ commit/docs**: theo file đang sửa, không tự dịch lại toàn bộ.
- Không tạo file mới nếu chỉ cần sửa file có sẵn (trừ khi brief yêu cầu file mới).

## 4. Bằng chứng & báo cáo (bắt buộc)
- **Không có bằng chứng = chưa xong.** Kể lể ("tôi đã sửa xong") không phải bằng chứng.
- Báo cáo cuối theo mẫu `docs/templates/agentic-project/AGENT_HANDOFF.md`, gồm tối thiểu:
  1. **Files changed** — bảng `path | thay đổi gì`
  2. **Lệnh đã chạy + kết quả thật** (ví dụ `npm test` → `28 pass / 0 fail`) — dán output, không tóm tắt suông
  3. **Quyết định & giả định** (nếu có), kèm lý do
  4. **Điểm chưa chắc / việc còn lại / blocker**
- Không tự commit, không tự deploy. Bàn giao diff + bằng chứng cho agent chính để verify.

## 5. Khi bị chặn
Dừng và báo ngay (không tự xử theo hướng khác) nếu: brief mâu thuẫn với file này, cần quyền ngoài phạm vi, test không thể pass vì lý do ngoài phạm vi, hoặc phát hiện vấn đề bảo mật/rò rỉ dữ liệu.

## 6. Phối hợp nhiều máy — BẮT BUỘC trước khi sửa file
Repo này có nhiều agent sửa song song: **harness Mac (orchestrator)**, **harness Windows**, và
**agent trên server** (`/root/flowvpn-agent`). Trước khi sửa bất kỳ file nào, phải hỏi bảng việc
chung (nguồn sự thật: `node-2:/var/lib/flowvpn-coord/claims/`):

```bash
flowvpn-coord check <đường-dẫn-file> --owner <windows|mac|server>   # exit 1 = có người khác đang giữ
flowvpn-coord claim --owner <owner> --area <vùng> --files <p1,p2> --note "<việc đang làm>"
flowvpn-coord release --owner <owner> --area <vùng>
flowvpn-coord list
```

- `check` báo **XUNG DOT** (exit code 1) → **dừng lại**, nhắn orchestrator qua Telegram, không tự sửa.
- Đang làm thì phải giữ `claim`; xong thì `release`. Claim hết hạn sau 90 phút (gia hạn bằng
  cách `claim` lại).
- Chi tiết + lệnh cho từng máy: `.privatevpn/coordination/PROTOCOL.md`.

### 6a. Task do guard phát hiện — PHẢI có approve của chủ dự án
`flowvpn-guard` trên server tự phát hiện khách mới chưa cài/chưa chạy được và tạo **task** ở
`/var/lib/flowvpn-coord/tasks/`. Trước khi sửa bất cứ gì cho một task:

```bash
flowvpn-coord task list          # việc đang mở (kèm bằng chứng + khách bị ảnh hưởng)
flowvpn-coord task claim <id> --owner <mac|windows|server>   # LỖI nếu task chưa được approve
```

Task ở trạng thái `pending_approval` **không được thi hành**: chủ dự án approve trên Telegram
(`/approve <id>`). Sửa xong thì `flowvpn-coord task done <id> --note "<đã sửa gì + bằng chứng>"`;
không sửa thì `flowvpn-coord task reject <id> --reason "<lý do>"` để guard không đề xuất lại.
- Mã nguồn tool: `scripts/coord/flowvpn-coord.mjs` (`selftest` để tự kiểm tra logic).

### 6b. Vùng bảo vệ — chỉ harness Windows được sửa

Các đường dẫn sau **chỉ owner `windows`** được commit/deploy (xem `PROTOCOL.md` §8):

- `control-plane/src/home-page.js` (trang chủ `meetflowai.site`)
- `control-plane/src/index.js`, `control-plane/assets/**`
- `flowgpt/web/public/promo.*`

Máy khác cần thay đổi → xin handoff qua Telegram + đợi nhường claim. Hook `.githooks/pre-commit`
chặn cứng commit vào vùng này khi `coord.owner ≠ windows` (muốn ghi đè có ý thức:
`ALLOW_PROTECTED=1 git commit ...`). **Deploy control plane: commit trước, deploy sau.**

## 7. iOS — băng thông, đổi mạng & BUILD (BẮT BUỘC đọc trước khi sửa/build)

> Chi tiết cơ chế + số liệu + bảng nghiệm thu: `docs/IOS_TUNNEL_BANDWIDTH_AND_NETWORK_CHANGE.md`.
> Mục này chỉ chứa **bất biến** và **cổng chặn** — vi phạm là tái tạo sự cố đã có thật.

### 7a. Cổng BẮT BUỘC trước khi CÀI / PHÁT HÀNH bản iOS
```bash
eval "$(bash scripts/dev-hysteria-build-env.sh)"      # BẮT BUỘC: thiếu ⇒ IPA rỗng credential
bash scripts/archive-appstore.sh ios adhoc
bash scripts/ios-adhoc-export.sh --no-upload
bash scripts/ios-verify-ipa.sh build/ios-adhoc-export/ipa/FlowVPN.ipa --version <V> --build <N>
```
- `archive-appstore.sh` có cổng: thiếu `HYST_PASSWORD`/`HYST_OBFS` ⇒ **exit 3, không build**.
- `ios-verify-ipa.sh` là cổng cuối: credential khác rỗng · extension cùng số version/build ·
  **không** nhóm keychain `com.privatevpn.shared` · `codesign --verify --deep --strict` ·
  profile ad-hoc có UDID + `get-task-allow=false`.
- ❌ Bỏ bất kỳ bước nào ⇒ **không được cài lên máy khách**. (Build 33/25-09-2026: thiếu env credential
  ⇒ IPA rỗng ⇒ extension `TUNNEL_START_FAILED: providerConfiguration thiếu khoá "hysteria"` ⇒ khách
  bấm Connect là **"bật lên tắt ngay"**.)

### 7b. Cổng trước khi build
- `bash scripts/ios-pure-logic-tests/run.sh` → **PASS hết** (hiện 389/389).
- `python3 scripts/ios-lint-locks.py` → **ĐẠT** (không có lời gọi lấy **một `NSLock` bất kỳ** lồng
  nhau trong tầng tunnel — xem §7c; cổng này bắt đúng lỗi đã giết mọi nhịp iOS suốt build 25→34).
- ❌ **`swiftc -parse` KHÔNG đủ** (chỉ kiểm cú pháp: build 33 `-parse` PASS mà archive vẫn FAIL vì thiếu hàm).
  Phải `swiftc -typecheck` (kèm shim `NWPath`) cho các file đã sửa.
- ❌ **Không build trong lúc một agent đang sửa file** (build 33 lần 1 fail đúng vì lý do này).
- ❌ **Không build khi ổ đĩa gần đầy.** Volume repo là exFAT dùng chung; ca thật 25/09/2026:
  `/Volumes/BIWIN` đầy **100% (466G/466G, còn 232Mi)** ⇒ `sed: No space left on device`, build chết
  giữa đường (`build/` 59G + `.privatevpn/tmp` 11G, phần lớn là cache `dd-*`/`DerivedData` mỗi lần build).
  Trước khi build: `bash scripts/clean-build-cache.sh --dry-run` xem sẽ dọn gì, rồi
  `MIN_FREE_GB=10 bash scripts/clean-build-cache.sh` (chỉ dọn khi trống < 10 GB; `KEEP=2` giữ 2 bản
  mới nhất mỗi loại). Script **không bao giờ** xoá source/docs/.git/release/`build/ios-adhoc-export/ipa`
  hay `build/*.md` (bằng chứng §2c).

### 7c. Bất biến trong code
- ❌ KHÔNG bật `allowsTransportRebuild` cho đường tự-áp số khai **trong phiên** (build 29: tunnel tự ngắt
  rồi **không nối lại được**). Dựng lại transport chỉ chạy cho **đổi mạng**, là đường RIÊNG.
- ❌ KHÔNG để nhịp watchdog/hiển thị chung hàng đợi với lời gọi **CHẶN** (đã có ca watchdog **câm 0 nhịp**).
- ❌ KHÔNG đổi cách đo goodput sang "tính cả bắt tay" (sai **7×**: 5.409 vs 38.272 kbps); chỉ bỏ mẫu khi
  **phần ĐỌC** mỏng (<200 ms hoặc <200 KB).
- ❌ KHÔNG dùng khoá bộ nhớ chung `wifi|if:en0` khi đã đọc được SSID; **không bao giờ** khai số Wi-Fi lên 4G/5G.
- ❌ KHÔNG để đỉnh đo của mạng CŨ được ghi cho mạng MỚI (phải reset số đo khi đổi mạng thật).
- ✅ Số khai: **số đo TƯƠI luôn thắng bộ nhớ**; nấc tĩnh theo loại mạng (Wi-Fi 30/100 · di động 8/12);
  mạng mới + đo hỏng ⇒ khởi điểm thận trọng rồi để ramp leo.
- ❌ KHÔNG gọi hàm **có `flowLock.lock()` bên trong** trong lúc **đang giữ `flowLock`** — `flowLock` là
  `NSLock` **KHÔNG tái nhập** ⇒ **tự khoá chết** và giữ khoá tới hết phiên. Ca thật build 25→34
  (25/09/2026, 26 phiên máy thật): nhịp watchdog gọi `currentTransport()` (hàm này `lock()` lần nữa)
  trong vùng đã khoá ⇒ chết ngay **nhịp đầu +15 s**; mọi thứ cần `flowLock` (nhịp lấy mẫu 1 s, nhịp
  hiển thị Diagnostics, đồng hồ canh watchdog, giám sát lưu lượng) **chết lặng**, còn cầu
  `packetFlow↔fd` vẫn chở gói và vẫn in nhịp 5 s nên log trông "bình thường".
  **Dấu hiệu trong `relay.log`**: mỗi phiên chỉ có **đúng 2 dòng `bw: sample`** (+5 s và +15 s) rồi im,
  **0 nhịp tim** (`giám sát sống-còn: nhịp`), thẻ Diagnostics đứng im, không ramp, không dò được đổi mạng.
  Trước khi thêm lời gọi vào vùng đã khoá: đọc thẳng trường (`transport`, `bridge`…) hoặc dùng biến thể
  `…Locked()` **không** lấy khoá — và tên phải nói đúng (`idleWindowStartLocked()` hiện TỰ lấy khoá).

### 7d. Nghiệm thu phải bằng LOG MÁY THẬT
```bash
xcrun devicectl device copy from --device <id> --domain-type appDataContainer \
  --domain-identifier com.privatevpn.app.packet-tunnel --source Documents --destination <dir>
xcrun devicectl device copy from --device <id> --domain-type systemCrashLogs \
  --source . --destination <dir>/crash          # BẮT BUỘC từ 25/09/2026
python3 scripts/ios-log-acceptance.py <dir>/relay.log --crash-dir <dir>/crash
                                                # exit 1 = có phiên KHÔNG ĐẠT
```
Cổng `ios-log-acceptance.py` đếm theo TỪNG phiên: nhịp lấy mẫu còn sống tới hết phiên, nhịp tim
watchdog, số lần đổi mạng/dựng lại/link mở lại/tự gỡ, gói bỏ. Đã chứng minh hai chiều: build 24
(nhịp lấy mẫu 36 mẫu/477 s, 4 nhịp tim) ⇒ ĐẠT; build 25→34 (2 mẫu rồi im, 0 nhịp tim) ⇒ **KHÔNG ĐẠT**.
Bảng 6 ca + tiêu chí đạt nằm ở tài liệu đầu mục này. "Chắc là chạy" KHÔNG tính là nghiệm thu.

**Ba lỗi đã LỌT cổng cũ ngày 25/09/2026 — cổng đã được siết (đừng gỡ các tiêu chí này):**
1. **CHIỀU VỀ ĐÓNG BĂNG một chiều** (Mac 19:42–19:43, relay `vn1hy`: 17 khoảng 5 s máy gửi 1277 gói
   mà `Go→packetFlow` không tăng một gói) — 3 khoảng liên tiếp như vậy ⇒ KHÔNG ĐẠT. WS mở +
   handshake xong + watchdog có nhịp **không** chứng minh đường còn chở chiều về.
2. **Jetsam/crash của extension**: phiên nào chứa mốc `JetsamEvent`/`PrivateVPNPacketTunnel-*.ips`
   thì phiên đó KHÔNG ĐẠT (ca thật: `reason=per-process-limit`, `rpages=3202` ≈ 51 MB, extension bị
   iOS giết mà log **không** có dòng `stopTunnel`). Thiếu `--crash-dir` = nghiệm thu **thiếu**.
3. **Phiên đầu file** (trước mốc `build: version=` đầu tiên) vẫn được chấm với nhãn build `?` — ca
   một chiều ở (1) nằm đúng trong phần đầu file, cổng cũ bỏ qua nguyên ca.


### 7e. Thao tác production & debug — LUẬT AN TOÀN (thêm 26/09/2026, sau sự cố thật)

> Ca thật: agent chặn `relay-cf-vn2hy` trên node-2 để test failover **nhưng chính SSH đang đi qua tunnel đó**
> ⇒ lệnh "mở lại" không bao giờ chạy, relay nằm chết ~25 phút, **không có watchdog nào tự khôi phục**,
> và client (macOS) không failover sang `vn1hy` nên khách mất mạng. Ba lỗi chồng nhau — luật dưới đây chặn cả ba.

1. **Trước khi dừng/chặn BẤT KỲ dịch vụ nào trên đường khách đi** (`relay-cf-*`, `wsrelay-*`, `wgrelay-*`,
   caddy, `flowvpn-cp`, guard): phải có **lệnh tự hồi chạy TÁCH khỏi phiên hiện tại** được đặt TRƯỚC đó, ví dụ
   ```bash
   ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162 \
     'nohup sh -c "sleep 40; systemctl start relay-cf-vn2hy" >/dev/null 2>&1 & echo scheduled'
   ```
   Không có dòng `scheduled` ⇒ **không được** dừng dịch vụ.
2. **Không bao giờ thao tác lên chính đường mà phiên điều khiển của mình đang dùng.** Máy Mac vào internet
   **qua tunnel**, nên SSH tới node-2 cũng đi qua tunnel ⇒ tắt relay = tự cắt đường cứu hộ. Muốn test phải
   dùng **node/relay KHÁC** với relay đang chở phiên, hoặc đường ngoài tunnel (Tailscale `100.76.147.111` → node-1 → node-2).
3. **Sau mọi thao tác: kiểm lại trạng thái thật, không tin lệnh đã chạy** — dịch vụ `active` **và** mọi relay
   phải trả `HTTP 426` (WebSocket sẵn sàng):
   ```bash
   for r in vn1hy vn2hy vn1wg vn2wg; do curl -s -o /dev/null -w "$r=%{http_code} " https://api.meetflowai.site/relay/$r; done
   ```
   Kết quả mong đợi: cả bốn `=426`. Xong phải kiểm tunnel trên máy khách vẫn `Connected`.
4. **Bí mật không được vào argv**: `xcodebuild … HYST_PASSWORD=…` khiến credential hiện trong `ps` cho mọi
   tiến trình cùng máy đọc được (phát hiện 26/09/2026). Dùng `export HYST_PASSWORD=…` rồi gọi `xcodebuild` không kèm
   tham số; và **kiểm build đang chạy bằng `pgrep -f xcodebuild >/dev/null`, KHÔNG dùng `pgrep -fl`** (in cả argv).
5. **Watchdog phía server ĐÃ CÓ (26/09/2026)** — `flowvpn-health-watch` (systemd timer 45 s + cron dự phòng `*/2`)
   trên node-2: kiểm 8 unit đường khách + 4 relay phải trả `426`, tự `start`/`restart` (không bao giờ `stop`),
   chống rung 60 s/unit, gửi **Telegram cho mọi harness/agent** (2 tin: PHÁT HIỆN + KẾT QUẢ, ESCALATE nếu
   không tự khôi phục được) và lưu bản vào `/var/lib/flowvpn-coord/inbox/{mac,windows,server}/`.
   Đã kiểm chứng: dừng `relay-cf-vn2wg` → phát hiện sau **41 s** → tự `start` lại → 2 tin Telegram
   (`message_id` 1656/1657) → `flowvpn-safe-status` 8/8 unit `active+enabled`, 4 relay `=426`.
   **Dùng `flowvpn-safe-stop <unit> [giây]`** (tự đặt auto-restore tách phiên và **từ chối** nếu unit đang chở
   phiên điều khiển — exit 3) và `flowvpn-safe-status` sau mỗi lần test. Chi tiết + đường cứu hộ khi tunnel chết:
   `docs/SERVER_RECOVERY_RUNBOOK.md`. Luật (1)+(2) ở trên vẫn bắt buộc dù đã có watchdog.
