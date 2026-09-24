#!/usr/bin/env python3
"""Gửi email thông báo Windows 1.4.7 (retry API cho khách Trung Quốc) cho khách ĐANG DÙNG Windows.

Nội dung chỉ nêu thứ ĐÃ có trong bản release (xem `docs/RELEASE_NOTES_1.4.7.md`), lấy từ
`docs/handoff/HANDOFF_PUBLISHER_WINDOWS_1.4.7_2026-09-24.md`:
(1) khách Trung Quốc hết lỗi "Không thể kết nối tới máy chủ VPNFlow khi gọi device claim";
(2) app thử lại API tối đa 3 vòng khi lỗi mạng, CHỈ retry lỗi transport (không lặp side-effect POST);
(3) lỗi xảy ra TRƯỚC khi dựng tunnel nên bản vá DNS 1.4.6 không liên quan.

⚠️ Bản 1.4.7 CHƯA KÝ SỐ ⇒ email TUYỆT ĐỐI KHÔNG hứa "hết cảnh báo Windows". Phần "Lưu ý" nói thẳng
là bộ cài chưa ký, và xin khách bị Smart App Control chặn báo lại (kèm thông báo) để đo lường.

Chạy trên node-2 (qua ssh):
  python3 send-windows-1.4.7-announcement.py --recipients    # chỉ LIỆT KÊ người nhận
  python3 send-windows-1.4.7-announcement.py --test          # chỉ gửi tới ALERT_EMAIL
  python3 send-windows-1.4.7-announcement.py                 # gửi cho khách Windows
  python3 send-windows-1.4.7-announcement.py --email a@b.com # gửi 1 địa chỉ
  python3 send-windows-1.4.7-announcement.py --verify        # hỏi lại trạng thái các mã đã lưu
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = "--test" in args
LIST = "--recipients" in args
VERIFY = "--verify" in args
IDS_FILE = "/root/flowvpn-cp/data/.announce-windows-1.4.7-ids.json"

conf = "/etc/systemd/system/flowvpn-cp.service.d"
env = {}
for name in os.listdir(conf):
    if name.endswith(".conf"):
        for line in open(os.path.join(conf, name), encoding="utf-8", errors="replace"):
            line = line.strip()
            if line.startswith("Environment="):
                b = line[len("Environment="):].strip().strip('"')
                if "=" in b:
                    k, v = b.split("=", 1)
                    env[k.strip()] = v.strip().strip('"')

api_key = env.get("RESEND_API_KEY", "")
alert = env.get("ALERT_EMAIL", "")
if not api_key:
    raise SystemExit("KHONG co RESEND_API_KEY")

BUY = "https://t1.meetflowai.site/buy"
DL = "https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.7.exe?v=73660031"
FROM = "VPNFlow <support@meetflowai.site>"
SUBJECT = ("VPNFlow 1.4.7 cho Windows — sửa lỗi kết nối cho khách Trung Quốc / "
           "VPNFlow 1.4.7 for Windows — connection fix for customers in China / "
           "VPNFlow 1.4.7 Windows 版——修复中国用户连接错误")

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.7 cho Windows — sửa lỗi kết nối</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow 1.4.7</b> cho Windows, sửa lỗi khách ở Trung Quốc
     <b>không kết nối được</b> tới máy chủ VPNFlow.</p>
  <ul>
    <li><b>Đã sửa:</b> khách Trung Quốc hết lỗi <i>"Không thể kết nối tới máy chủ VPNFlow khi gọi
        device claim"</i>.</li>
    <li><b>Cách sửa:</b> app tự <b>thử lại API tối đa 3 vòng</b> khi lỗi mạng, chờ 500 ms giữa hai
        vòng. <b>Chỉ thử lại lỗi transport</b> (mất kết nối/timeout); lỗi HTTP 4xx/5xx vẫn trả về ngay
        nên <b>không lặp side-effect của POST</b> (không tạo trùng thiết bị/token).</li>
    <li><b>Lưu ý về phạm vi:</b> lỗi xảy ra <b>trước khi dựng tunnel</b> nên <b>bản vá DNS 1.4.6
        không liên quan</b> — bản 1.4.6 vẫn đúng và 1.4.7 không làm thay đổi cấu hình DNS.</li>
  </ul>
  <p>Đo trên mạng Trung Quốc: 5 lần gọi liên tiếp thì 1 lần timeout ~21 s (tỉ lệ hỏng ~20 %); với 3 vòng
     thử lại, tỉ lệ hỏng còn ~0,8 %. Bộ test của app: <b>219/219 pass</b>.</p>
  <p><b>Cách cập nhật:</b> tải bộ cài tại <a href="{BUY}">t1.meetflowai.site/buy</a> (hoặc
     <a href="{DL}">tải trực tiếp</a>), chạy tệp vừa tải và bấm <b>Next</b>. Không cần gỡ bản cũ;
     dữ liệu đăng nhập được giữ nguyên. Khuyến nghị cập nhật vì đây là bản sửa lỗi kết nối.</p>
  <p><b>Lưu ý:</b> bộ cài 1.4.7 hiện <b>chưa được ký số</b> (chúng tôi đang hoàn tất chứng chỉ),
     nên Windows có thể hiện cảnh báo khi chạy bộ cài. Đây là cảnh báo dựa trên chữ ký số của Windows,
     <b>không phải lỗi của VPNFlow</b>. Nếu Quý khách bị <b>Smart App Control</b> chặn hoặc không cài
     được, vui lòng trả lời email này kèm thông báo mà Windows hiện ra để chúng tôi hỗ trợ và ghi nhận.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.7 for Windows — connection fix</h3>
  <p>Dear customer,</p>
  <p>We have released <b>VPNFlow 1.4.7</b> for Windows, fixing customers in China being
     <b>unable to connect</b> to the VPNFlow server.</p>
  <ul>
    <li><b>Fixed:</b> customers in China no longer hit the error <i>"Cannot connect to the VPNFlow
        server when calling device claim"</i>.</li>
    <li><b>How:</b> the app now <b>retries the API up to 3 rounds</b> on network failure, waiting
        500 ms between rounds. <b>Only transport errors are retried</b> (connection loss/timeout);
        HTTP 4xx/5xx are returned immediately, so the <b>POST side effect is not repeated</b>
        (no duplicate device/token).</li>
    <li><b>Scope note:</b> the failure happened <b>before the tunnel was established</b>, so the
        <b>DNS fix in 1.4.6 is unrelated</b> — 1.4.6 remains correct and 1.4.7 does not change DNS.</li>
  </ul>
  <p>Measured on a Chinese network: of 5 consecutive calls, 1 timed out at ~21 s (~20% failure
     rate); with 3 retry rounds that drops to ~0.8%. App test suite: <b>219/219 pass</b>.</p>
  <p><b>How to update:</b> download the installer at <a href="{BUY}">t1.meetflowai.site/buy</a>
     (or <a href="{DL}">direct download</a>), run it and click <b>Next</b>. No need to uninstall;
     your login data is preserved. Updating is recommended — this is a connection fix.</p>
  <p><b>Note:</b> the 1.4.7 installer is <b>not code-signed yet</b> (we are completing the
     certificate), so Windows may show a warning when you run it. That warning is based on Windows'
     code-signing check and is <b>not a VPNFlow error</b>. If <b>Smart App Control</b> blocks it or you
     cannot install, please reply to this email with the message Windows shows so we can help and
     record it.</p>
  <p>Reply to this email any time —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.7 Windows 版——修复连接错误</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Windows 版 <b>VPNFlow 1.4.7</b>，修复中国用户<b>无法连接</b> VPNFlow 服务器的问题。</p>
  <ul>
    <li><b>已修复：</b>中国用户不再出现<i>“调用 device claim 时无法连接到 VPNFlow 服务器”</i>的错误。</li>
    <li><b>修复方式：</b>应用在<b>网络故障时最多重试 API 3 轮</b>，每轮之间等待 500 毫秒。
        <b>仅重试传输（transport）错误</b>（断网/超时）；HTTP 4xx/5xx 立即返回，
        因此<b>不会重复 POST 的副作用</b>（不会重复创建设备/token）。</li>
    <li><b>范围说明：</b>该错误发生在<b>隧道建立之前</b>，因此<b>与 1.4.6 的 DNS 修复无关</b>——
        1.4.6 仍然正确，1.4.7 未改动 DNS 配置。</li>
  </ul>
  <p>在中国网络实测：连续 5 次调用中 1 次超时约 21 秒（失败率约 20%）；使用 3 轮重试后降至约
     0.8%。应用测试：<b>219/219 通过</b>。</p>
  <p><b>更新方法：</b>在 <a href="{BUY}">t1.meetflowai.site/buy</a> 下载安装包
     （或<a href="{DL}">直接下载</a>），运行后点击 <b>Next</b>。无需卸载旧版本，登录数据保留。
     建议尽快更新，这是一次连接修复。</p>
  <p><b>注意：</b>1.4.7 安装包<b>尚未进行代码签名</b>（我们正在完成证书），因此 Windows 运行时
     可能显示警告。该警告来自 Windows 的签名检查，<b>并非 VPNFlow 的错误</b>。如果被
     <b>Smart App Control</b> 阻止或无法安装，请回复本邮件并附上 Windows 的提示信息，
     以便我们协助并记录。</p>
  <p>如有问题请直接回复本邮件 —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>。</p>"""

HTML = ('<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;line-height:1.6;'
        'color:#12202f;max-width:640px">' + VI + EN + ZH + '</div>')


def send(to, subject, html):
    payload = json.dumps({"from": FROM, "to": [to], "subject": subject, "html": html}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, headers={
        "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
        "Accept": "application/json", "User-Agent": "VPNFlow-Mailer/1.0 (+https://meetflowai.site)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            body = json.loads(res.read().decode())
        return bool(body.get("id")), None, body.get("id")
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode()[:140]}", None
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:140], None


def status(mail_id):
    # WIN (nghiệm thu bus-299) chỉ ra: thiếu User-Agent ⇒ Cloudflare trả 403 error 1010 GIẢ.
    req = urllib.request.Request(
        f"https://api.resend.com/emails/{mail_id}",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json",
                 "User-Agent": "VPNFlow-Mailer/1.0 (+https://meetflowai.site)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode()).get("last_event")
    except Exception as e:  # noqa: BLE001
        return f"loi {str(e)[:60]}"


def mask(addr):
    name, _, domain = addr.partition("@")
    return f"{name[:2]}***@{domain}"


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return default


# --- hỏi lại trạng thái các lần gửi trước (Resend last_event) ---
if VERIFY:
    saved = load(IDS_FILE, {})
    for addr, mid in saved.items():
        print(f"   {mask(addr)}  {mid}  ->  {status(mid)}")
    raise SystemExit(0)

auth = load("/root/flowvpn-cp/data/auth.json", {}) or {}
devices = load("/root/flowvpn-cp/data/devices.json", []) or []
subs = auth.get("subscriptions") or []
if isinstance(subs, dict):
    subs = list(subs.values())
emails = {str(u.get("id")): str(u.get("email", "")).lower() for u in auth.get("users", []) if isinstance(u, dict)}
exp = {str(s.get("userId")): (s.get("expiresAt") or s.get("currentPeriodEnd")) for s in subs if isinstance(s, dict)}
skip = {"test@example.com", "review@meetflowai.site", "support@meetflowai.site",
        "no-reply@meetflowai.site", "minhnb2@me.com", "minhnb2@fpt.com", "minhnb2@hotmail.com"}
PLATFORMS = {"windows", "win32"}

targets = []
seen = set()
print("khach Windows (platform=windows/win32):")
for d in devices:
    uid = str(d.get("userId") or "")
    plat = str(d.get("platform"))
    if plat not in PLATFORMS:
        continue
    e = emails.get(uid, "")
    reason = None
    if not uid or uid not in emails:
        reason = "thiet bi khong gan user"
    elif not e:
        reason = "user khong co email"
    elif e in skip:
        reason = "trong danh sach bo qua (chu du an/test)"
    elif not exp.get(uid):
        reason = "khong co subscription"
    if reason:
        print(f"   - BO QUA {plat:8s} {mask(e) if e else '(khong co email)':22s} ly do: {reason}")
        continue
    if e in seen:
        continue
    seen.add(e)
    targets.append(e)
if "--email" in args:
    targets = [args[args.index("--email") + 1].lower()]
targets.sort()

print("nguoi nhan Windows:", [mask(t) for t in targets] or "(khong co)")
if LIST:
    raise SystemExit(0)
if alert:
    ok, err, _ = send(alert, "[TEST] " + SUBJECT, HTML)
    print(f"   test toi {alert}: {'OK' if ok else 'LOI ' + str(err)}")
    if not ok:
        raise SystemExit("   dung lai: gui thu that bai")
    if TEST:
        raise SystemExit("che do --test: chi gui thu, khong gui cho user")

sent = failed = 0
ids = {}
for t in targets:
    ok, err, mid = send(t, SUBJECT, HTML)
    if ok:
        sent += 1
        ids[t] = mid
        print(f"   OK  {mask(t)}  id={mid}")
    else:
        failed += 1
        print(f"   LOI {mask(t)}: {err}")
    time.sleep(0.7)

json.dump(ids, open(IDS_FILE, "w", encoding="utf-8"), indent=1)
print(f"ket qua: {sent}/{len(targets)} thanh cong, {failed} loi")
print(f"ma Resend da luu: {IDS_FILE}")

# chờ ngắn rồi hỏi trạng thái giao (delivered/bounced) để có bằng chứng
if sent:
    time.sleep(8)
    from collections import Counter
    tally = Counter()
    for addr, mid in ids.items():
        st = status(mid) or "unknown"
        tally[st] += 1
        print(f"   {mask(addr)}  {mid}  ->  {st}")
    print("trang thai:", dict(tally))
