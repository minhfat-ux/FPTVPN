# Phối hợp giữa các agent (orchestrator)

> Đọc file này trước khi sửa bất kỳ file nào trong repo. Đây là luật vận hành, không phải gợi ý.

## 1. Vì sao có file này

Cùng một repo đang có nhiều agent sửa song song:

| Máy | Vai trò | Ghi chú |
|---|---|---|
| **Harness Mac** | **Orchestrator** | Người phân xử khi hai máy muốn cùng vùng: nhường claim, xếp thứ tự, chốt phương án. Nơi báo khi gặp XUNG ĐỘT. |
| **Harness Windows** (máy anh Minh) | Contributor | Làm bản Windows/harness-windows, release Windows. Có SSH tới node-1/node-2. |
| **Agent trên server** (`/root/flowvpn-agent`, branch `master`) | Executor | Chạy việc qua `/task`, sửa file rồi deploy tại chỗ. |

Ngày 17/09/2026 đã xảy ra đúng loại conflict cần chặn: agent trên server đang sửa
`scripts/tg-bot/bot.mjs` thì harness Windows cũng sửa cùng file — hai bên không biết nhau.

## 2. Bảng việc (nguồn sự thật duy nhất)

- Nằm trên **node-2**: `/var/lib/flowvpn-coord/claims/`
- **Mỗi claim là một file JSON riêng** `<owner>-<area>.json` ⇒ hai máy ghi không bao giờ đè lên
  nhau; ghi bằng `temp + rename` nên không đọc phải file dở dang.
- Không dùng git làm nơi lưu: bảng việc phải tức thời và không sinh commit rác.
- Claim hết hạn mặc định sau **90 phút** (đổi bằng `--ttl`). Claim hết hạn **không** chặn người
  khác, nhưng vẫn hiện trong `list --all` để biết ai bỏ dở.

## 3. Luật bắt buộc

0. **Trước khi sửa file** → `check` vùng mình định đụng. Thấy `XUNG DOT` (exit code 1) thì
   **dừng lại**, nhắn orchestrator (Telegram), **không tự sửa**.
1. **Khi đang làm** → giữ `claim` cho vùng đó, ghi rõ `--files` (đường dẫn hoặc thư mục) và
   `--note` ngắn. Việc dài hơn TTL thì `claim` lại để gia hạn.
2. **Xong việc** → `release` (mặc định `done`). Bỏ dở thì `release --status cancelled`.
3. **Một vùng chỉ một người viết.** Không force-push, không sửa file ngoài vùng đã claim.
   **Harness Mac (orchestrator) phân xử** khi hai máy cùng muốn một vùng. Mỗi máy vẫn tự
   commit/push phần việc của mình lên `main` (không chờ duyệt, để không chặn tiến độ); chỉ
   orchestrator được đổi luật trong file này và được force-push (gần như không bao giờ cần).
4. **Báo cáo** theo mẫu `docs/templates/agentic-project/AGENT_HANDOFF.md` kèm bằng chứng lệnh
   đã chạy — như cũ.

## 4. Lệnh theo từng máy

**Trên server (agent `/task`):**

```bash
flowvpn-coord list
flowvpn-coord check scripts/tg-bot/bot.mjs
flowvpn-coord claim --owner server --area tg-bot --files scripts/tg-bot/bot.mjs --note "sua long-poll"
flowvpn-coord release --owner server --area tg-bot
```

**Từ harness Windows:**

```powershell
.\scripts\coord\coord.ps1 list
.\scripts\coord\coord.ps1 check scripts/tg-bot/bot.mjs
.\scripts\coord\coord.ps1 claim -Area tg-bot -Files "scripts/tg-bot/bot.mjs" -Note "sua long-poll"
.\scripts\coord\coord.ps1 release -Area tg-bot
```

**Từ harness Mac:**

```bash
ssh root@165.101.114.162 flowvpn-coord list
ssh root@165.101.114.162 flowvpn-coord check scripts/tg-bot/bot.mjs
ssh root@165.101.114.162 flowvpn-coord claim --owner mac --area ios --files ios/ --note "build IPA"
ssh root@165.101.114.162 flowvpn-coord release --owner mac --area ios
```

Mã nguồn của tool: `scripts/coord/flowvpn-coord.mjs` (bản chạy trên server:
`/usr/local/bin/flowvpn-coord`). Kiểm tra logic: `node scripts/coord/flowvpn-coord.mjs selftest`.

## 5. Vùng (area) — đặt tên theo thư mục, không theo cảm hứng

Ví dụ đang dùng: `tg-bot`, `control-plane`, `windows-app`, `harness-windows`, `ios`, `android`,
`release`, `docs`. Claim theo thư mục khi sửa lan nhiều file (`windows/PrivateVPNWindows.App`),
theo file khi chỉ đụng một chỗ (`scripts/tg-bot/bot.mjs`).

## 6. Hook chặn commit (nên bật trên mọi máy)

Luật "check trước khi sửa" chỉ có tác dụng nếu agent nhớ. `.githooks/pre-commit` bắt đúng lúc
commit — không thể quên. Bật một lần cho mỗi clone:

```bash
git config core.hooksPath .githooks
git config coord.owner windows        # windows | mac | server
# server/Mac gọi trực tiếp bảng việc:
git config coord.cmd "flowvpn-coord"
# Windows (đi qua node-1):
git config coord.cmd "ssh -o BatchMode=yes -J root@103.173.155.50 root@165.101.114.162 flowvpn-coord"
```

- Commit file nằm trong claim của máy khác ⇒ **bị chặn** (exit 1), in rõ ai đang giữ.
- **Fail-open**: mất mạng / không gọi được bảng việc thì chỉ cảnh báo rồi cho qua — hook không
  được phép treo việc.
- Chưa đặt `coord.owner` thì hook bỏ qua (kèm cảnh báo).

## 7. Đổi vai orchestrator

Bảng ở §1 là nguồn sự thật: **harness Mac = orchestrator**, harness Windows = contributor.
Muốn đổi nữa thì sửa đúng bảng đó và commit — chỉ orchestrator (Mac) được sửa file này.

## 8. Vùng bảo vệ — CHỈ harness Windows được sửa

> Thêm ngày 18/09/2026 sau sự cố: `control-plane/src/home-page.js` (trang chủ
> `meetflowai.site`) bị máy khác ghi đè, làm **mất bản mới nhất chưa commit**. Bản đó phải
> khôi phục từ backup trên server.

Các đường dẫn sau là **vùng bảo vệ**, chỉ owner `windows` được commit/deploy:

| Vùng | Vì sao |
|---|---|
| `control-plane/src/home-page.js` | Trang chủ FlowTech / landing page `meetflowai.site` |
| `control-plane/src/index.js` | Route + dữ liệu đổ vào trang chủ (plans, reviews, popup, /assets) |
| `control-plane/assets/**` | Logo/brand assets phục vụ từ `/assets/...` |
| `flowgpt/web/public/promo.*` | Popup quảng cáo hệ sinh thái |

**Luật:**

1. Máy khác **không** sửa/không deploy các đường dẫn trên. Cần thay đổi thì nhắn
   orchestrator ↔ harness Windows qua Telegram và **xin handoff** (ghi rõ file + lý do).
2. Máy khác vẫn được `check`/`list` bình thường; `check` sẽ báo XUNG ĐỘT khi Windows đang giữ claim.
3. **Trước khi deploy CP**: commit trước, deploy sau. Bản chưa commit là bản dễ mất nhất.
4. Trước khi ghi đè file trên server, luôn tạo backup có timestamp:
   `cp -a <file> <file>.bak-<viec>-$(date +%Y%m%d-%H%M%S)`.
5. Hook `.githooks/pre-commit` **chặn cứng**: commit vào vùng bảo vệ khi `coord.owner ≠ windows`
   sẽ bị từ chối (kiểm tra local, không fail-open). Ghi đè có ý thức: `ALLOW_PROTECTED=1 git commit ...`.

