#!/usr/bin/env python3
"""Gửi email thông báo Windows 1.4.5 cho khách ĐANG DÙNG Windows.

Nội dung chỉ nêu thứ ĐÃ có trong bản release (xem `docs/RELEASE_NOTES_1.4.5.md`):
(a) sửa bypass Trung Quốc trên đường relay — trước 3/36 tên miền app TQ khớp, nay 36/36
    (rule ip_cidr 7.509 dải + DNS nội địa 223.5.5.5 cho 43 tên miền dịch vụ TQ);
(b) Settings -> About hiện số hiệu phiên bản + so với mốc `latest_version` của server.

⚠️ Bản 1.4.5 CHƯA KÝ SỐ ⇒ email TUYỆT ĐỐI KHÔNG hứa "hết cảnh báo Windows". Phần "Lưu ý" nói thẳng
là bộ cài chưa ký và xin khách báo lại nếu bị Windows chặn (để đo lường).

Chạy trên node-2 (qua ssh):
  python3 send-windows-1.4.5-announcement.py --recipients    # chỉ LIỆT KÊ người nhận
  python3 send-windows-1.4.5-announcement.py --test          # chỉ gửi tới ALERT_EMAIL
  python3 send-windows-1.4.5-announcement.py                 # gửi cho khách Windows
  python3 send-windows-1.4.5-announcement.py --email a@b.com # gửi 1 địa chỉ
  python3 send-windows-1.4.5-announcement.py --verify        # hỏi lại trạng thái các mã đã lưu
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = "--test" in args
LIST = "--recipients" in args
VERIFY = "--verify" in args
IDS_FILE = "/root/flowvpn-cp/data/.announce-windows-1.4.5-ids.json"

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
DL = "https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.5.exe?v=d6db58cb"
FROM = "VPNFlow <support@meetflowai.site>"
SUBJECT = ("VPNFlow 1.4.5 cho Windows — sửa bypass ứng dụng Trung Quốc / "
           "VPNFlow 1.4.5 for Windows / VPNFlow 1.4.5 Windows 版更新")

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.5 cho Windows — bản mới đã sẵn sàng</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow 1.4.5</b> cho Windows. Bản này sửa việc một số ứng dụng
     Trung Quốc vẫn đi qua đường VPN, khiến dịch vụ TQ thấy IP nước ngoài và cắt kết nối:</p>
  <ul>
    <li><b>Sửa bypass ứng dụng Trung Quốc trên đường relay (đường mặc định).</b> Trước đây chỉ
        <b>3 trong 36</b> tên miền ứng dụng TQ phổ biến được đi thẳng; nay <b>36/36</b>. Cách làm:
        đưa <b>7.509 dải IP Trung Quốc</b> đi thẳng và dùng <b>DNS nội địa (223.5.5.5)</b> cho
        <b>43 tên miền dịch vụ TQ</b> (alipay, taobao, baidu, jd, meituan, bilibili, douyin, …) —
        nhờ đó các ứng dụng này đi đúng đường trong nước và không còn bị cắt.</li>
    <li><b>Số hiệu phiên bản hiện ngay trong Settings → About.</b> Mục <i>About</i> hiển thị
        <i>Phiên bản 1.4.5</i> kèm số build, và so với bản mới nhất trên server
        (<i>“Bản mới nhất trên server: 1.4.5 (khớp)”</i>) để Quý khách đối chiếu bản đang cài.</li>
  </ul>
  <p><b>Cách cập nhật:</b> tải bộ cài tại <a href="{BUY}">t1.meetflowai.site/buy</a> (hoặc
     <a href="{DL}">tải trực tiếp</a>), chạy tệp vừa tải và bấm <b>Next</b>. Không cần gỡ bản cũ;
     dữ liệu đăng nhập được giữ nguyên.</p>
  <p><b>Lưu ý:</b> bộ cài 1.4.5 hiện <b>chưa được ký số</b> (chúng tôi đang hoàn tất chứng chỉ),
     nên Windows có thể hiện cảnh báo khi chạy bộ cài. Đây là cảnh báo dựa trên chữ ký số của Windows,
     <b>không phải lỗi của VPNFlow</b>. Nếu Quý khách không cài được, vui lòng trả lời email này kèm
     thông báo mà Windows hiện ra để chúng tôi hỗ trợ và ghi nhận.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.5 for Windows — new build available</h3>
  <p>Dear customer,</p>
  <p>We have released <b>VPNFlow 1.4.5</b> for Windows. This build fixes the case where some Chinese
     apps still went through the VPN, so Chinese services saw a foreign IP and dropped the connection:</p>
  <ul>
    <li><b>China bypass fixed on the relay transport (the default path).</b> Previously only
        <b>3 of 36</b> popular Chinese app domains went direct; now <b>36/36</b>. We route
        <b>7,509 Chinese IP ranges</b> direct and use a <b>domestic DNS resolver (223.5.5.5)</b> for
        <b>43 Chinese service domains</b> (alipay, taobao, baidu, jd, meituan, bilibili, douyin, …),
        so those apps take the in-country route and are no longer cut off.</li>
    <li><b>The version number is now shown in Settings → About.</b> The <i>About</i> section shows
        <i>Version 1.4.5</i> with the build id and compares it with the latest version on the server
        (<i>“Latest on server: 1.4.5 (match)”</i>) so you can verify the installed build.</li>
  </ul>
  <p><b>How to update:</b> download the installer at <a href="{BUY}">t1.meetflowai.site/buy</a>
     (or <a href="{DL}">direct download</a>), run it and click <b>Next</b>. No need to uninstall;
     your login data is preserved.</p>
  <p><b>Note:</b> the 1.4.5 installer is <b>not code-signed yet</b> (we are completing the
     certificate), so Windows may show a warning when you run it. That warning is based on Windows'
     code-signing check and is <b>not a VPNFlow error</b>. If you cannot install, please reply to this
     email with the message Windows shows so we can help and record it.</p>
  <p>Reply to this email any time —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.5 Windows 版——新版本已发布</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Windows 版 <b>VPNFlow 1.4.5</b>。本次修复了部分中国应用仍走 VPN 的问题：
     此前中国服务看到境外 IP，因而中断连接。</p>
  <ul>
    <li><b>修复中继通道（默认线路）的中国应用分流。</b>此前 36 个常用中国应用域名中只有
        <b>3 个</b>直连，现在为 <b>36/36</b>。做法：将 <b>7,509 个中国 IP 段</b>直连，
        并为 <b>43 个中国服务域名</b>（alipay、taobao、baidu、jd、meituan、bilibili、douyin 等）
        使用<b>国内 DNS（223.5.5.5）</b>，使这些应用走国内线路，不再被中断。</li>
    <li><b>Settings → About 现显示版本号。</b><i>About</i> 区域显示 <i>版本 1.4.5</i> 及构建编号，
        并与服务器最新版本比较（<i>“服务器最新：1.4.5（一致）”</i>），便于核对已安装版本。</li>
  </ul>
  <p><b>更新方法：</b>在 <a href="{BUY}">t1.meetflowai.site/buy</a> 下载安装包
     （或<a href="{DL}">直接下载</a>），运行后点击 <b>Next</b>。无需卸载旧版本，登录数据保留。</p>
  <p><b>注意：</b>1.4.5 安装包<b>尚未进行代码签名</b>（我们正在完成证书），因此 Windows 运行时
     可能显示警告。该警告来自 Windows 的签名检查，<b>并非 VPNFlow 的错误</b>。如果无法安装，
     请回复本邮件并附上 Windows 的提示信息，以便我们协助并记录。</p>
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
