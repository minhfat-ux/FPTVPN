#!/usr/bin/env python3
"""Gửi email thông báo Windows 1.4.6 (hotfix DNS) cho khách ĐANG DÙNG Windows.

Nội dung chỉ nêu thứ ĐÃ có trong bản release (xem `docs/RELEASE_NOTES_1.4.6.md`), lấy từ
`docs/handoff/HANDOFF_WINDOWS_1.4.6_DNS_HOTFIX_2026-09-23.md`:
(a) sửa thứ tự rule `sniff → hijack-dns → ip_is_private → ip_cidr → domain_suffix`;
(b) DNS upstream `1.1.1.1` nay đi QUA tunnel (detour `hyrelay`) nên hết bị GFW nhiễm độc;
(c) đo trên máy thật mạng Trung Quốc: google/youtube/github 200, app TQ 200 hết, `dotnet test` 218/218.

⚠️ Bản 1.4.6 CHƯA KÝ SỐ ⇒ email TUYỆT ĐỐI KHÔNG hứa "hết cảnh báo Windows". Phần "Lưu ý" nói thẳng
là bộ cài chưa ký và xin khách báo lại nếu bị Windows chặn (để đo lường).

Chạy trên node-2 (qua ssh):
  python3 send-windows-1.4.6-announcement.py --recipients    # chỉ LIỆT KÊ người nhận
  python3 send-windows-1.4.6-announcement.py --test          # chỉ gửi tới ALERT_EMAIL
  python3 send-windows-1.4.6-announcement.py                 # gửi cho khách Windows
  python3 send-windows-1.4.6-announcement.py --email a@b.com # gửi 1 địa chỉ
  python3 send-windows-1.4.6-announcement.py --verify        # hỏi lại trạng thái các mã đã lưu
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = "--test" in args
LIST = "--recipients" in args
VERIFY = "--verify" in args
IDS_FILE = "/root/flowvpn-cp/data/.announce-windows-1.4.6-ids.json"

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
DL = "https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.6.exe?v=1a504534"
FROM = "VPNFlow <support@meetflowai.site>"
SUBJECT = ("VPNFlow 1.4.6 cho Windows — sửa lỗi mất mạng / Google-YouTube (hotfix DNS) / "
           "VPNFlow 1.4.6 for Windows — fix no-internet / Google-YouTube / "
           "VPNFlow 1.4.6 Windows 版——修复断网 / Google-YouTube")

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6 cho Windows — bản sửa lỗi khẩn</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow 1.4.6</b> cho Windows — bản sửa lỗi <b>ưu tiên cao</b> cho sự cố
     trên bản 1.4.5: <b>bật VPN thì mất mạng</b>, Google/YouTube không vào được trong khi ứng dụng/web
     Trung Quốc vẫn chạy bình thường.</p>
  <ul>
    <li><b>Nguyên nhân:</b> bản 1.4.5 đặt <b>sai thứ tự rule</b> phân luồng và máy chủ DNS nội bộ
        <b>thiếu <code>detour</code></b>. Vì vậy truy vấn DNS của Quý khách bị đẩy đi thẳng, và DNS
        upstream <code>1.1.1.1</code> cũng đi thẳng nên bị GFW trả về <i>địa chỉ nhiễm độc</i>
        (<code>www.google.com</code> từng trả về IP của Facebook, <code>2001::1</code> là địa chỉ rác).
        Tunnel vẫn lên nhưng tên miền phân giải sai ⇒ máy như mất mạng.</li>
    <li><b>Đã sửa:</b>
      <ul>
        <li>Thứ tự rule đúng: <code>sniff → hijack-dns → ip_is_private → ip_cidr → domain_suffix</code>.</li>
        <li>DNS upstream <code>1.1.1.1</code> nay đi <b>qua tunnel</b> (detour <code>hyrelay</code>) nên
            không còn bị GFW nhiễm độc.</li>
      </ul>
    </li>
    <li><b>Đo trên máy thật, mạng Trung Quốc:</b> DNS của khách bị đẩy đi thẳng <b>356 lần → 0</b>;
        <code>nslookup www.youtube.com</code> / <code>www.google.com</code> trả về đúng IP thật;
        <b>google / youtube / github = 200</b>; các ứng dụng TQ (<b>baidu, taobao, alipay, weixin,
        dianping, meituan, jd, bilibili</b>) = <b>200 hết</b>; <code>dotnet test</code>
        <b>218/218 pass</b>.</li>
  </ul>
  <p><b>Cách cập nhật:</b> tải bộ cài tại <a href="{BUY}">t1.meetflowai.site/buy</a> (hoặc
     <a href="{DL}">tải trực tiếp</a>), chạy tệp vừa tải và bấm <b>Next</b>. Không cần gỡ bản cũ;
     dữ liệu đăng nhập được giữ nguyên. Khuyến nghị cập nhật vì đây là bản sửa lỗi nghiêm trọng.</p>
  <p><b>Lưu ý:</b> bộ cài 1.4.6 hiện <b>chưa được ký số</b> (chúng tôi đang hoàn tất chứng chỉ),
     nên Windows có thể hiện cảnh báo khi chạy bộ cài. Đây là cảnh báo dựa trên chữ ký số của Windows,
     <b>không phải lỗi của VPNFlow</b>. Nếu Quý khách không cài được, vui lòng trả lời email này kèm
     thông báo mà Windows hiện ra để chúng tôi hỗ trợ và ghi nhận.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6 for Windows — urgent fix</h3>
  <p>Dear customer,</p>
  <p>We have released <b>VPNFlow 1.4.6</b> for Windows — a <b>high-priority</b> fix for the issue on
     1.4.5 where <b>turning the VPN on killed the internet</b>: Google/YouTube would not load while
     Chinese apps/websites still worked.</p>
  <ul>
    <li><b>Root cause:</b> 1.4.5 put the routing rules in the <b>wrong order</b> and the internal DNS
        server was <b>missing <code>detour</code></b>. Your DNS queries went direct, and the upstream
        DNS <code>1.1.1.1</code> also went direct, so the GFW returned <i>poisoned addresses</i>
        (<code>www.google.com</code> used to return Facebook's IP; <code>2001::1</code> is a junk
        address). The tunnel came up but names resolved wrong ⇒ the machine behaved as if offline.</li>
    <li><b>Fixed:</b>
      <ul>
        <li>Correct rule order: <code>sniff → hijack-dns → ip_is_private → ip_cidr → domain_suffix</code>.</li>
        <li>Upstream DNS <code>1.1.1.1</code> now goes <b>through the tunnel</b> (detour
            <code>hyrelay</code>), so it is no longer GFW-poisoned.</li>
      </ul>
    </li>
    <li><b>Measured on a real device on a Chinese network:</b> customer DNS forced direct
        <b>356 → 0</b>; <code>nslookup www.youtube.com</code> / <code>www.google.com</code> return the
        correct real IPs; <b>google / youtube / github = 200</b>; Chinese apps (<b>baidu, taobao,
        alipay, weixin, dianping, meituan, jd, bilibili</b>) = <b>200 all</b>; <code>dotnet test</code>
        <b>218/218 pass</b>.</li>
  </ul>
  <p><b>How to update:</b> download the installer at <a href="{BUY}">t1.meetflowai.site/buy</a>
     (or <a href="{DL}">direct download</a>), run it and click <b>Next</b>. No need to uninstall;
     your login data is preserved. Updating is recommended — this is a serious fix.</p>
  <p><b>Note:</b> the 1.4.6 installer is <b>not code-signed yet</b> (we are completing the
     certificate), so Windows may show a warning when you run it. That warning is based on Windows'
     code-signing check and is <b>not a VPNFlow error</b>. If you cannot install, please reply to this
     email with the message Windows shows so we can help and record it.</p>
  <p>Reply to this email any time —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6 Windows 版——紧急修复</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Windows 版 <b>VPNFlow 1.4.6</b>，用于修复 1.4.5 上的<b>高优先级</b>问题：
     <b>开启 VPN 后断网</b>，Google/YouTube 无法打开，而中国应用/网站仍可正常使用。</p>
  <ul>
    <li><b>根本原因：</b>1.4.5 的<b>规则顺序错误</b>，且内部 DNS 服务器<b>缺少
        <code>detour</code></b>。因此您的 DNS 查询被直连，上游 DNS <code>1.1.1.1</code>
        也被直连，被 GFW 返回<i>污染地址</i>（<code>www.google.com</code> 曾返回 Facebook 的
        IP；<code>2001::1</code> 是垃圾地址）。隧道虽已建立，但域名解析错误，电脑就像断网。</li>
    <li><b>已修复：</b>
      <ul>
        <li>正确的规则顺序：<code>sniff → hijack-dns → ip_is_private → ip_cidr → domain_suffix</code>。</li>
        <li>上游 DNS <code>1.1.1.1</code> 现在<b>走隧道</b>（detour <code>hyrelay</code>），
            不再被 GFW 污染。</li>
      </ul>
    </li>
    <li><b>在中国网络真机实测：</b>客户 DNS 被直连 <b>356 次 → 0</b>；
        <code>nslookup www.youtube.com</code> / <code>www.google.com</code> 返回真实 IP；
        <b>google / youtube / github = 200</b>；中国应用（<b>baidu、taobao、alipay、weixin、
        dianping、meituan、jd、bilibili</b>）= <b>全部 200</b>；<code>dotnet test</code>
        <b>218/218 通过</b>。</li>
  </ul>
  <p><b>更新方法：</b>在 <a href="{BUY}">t1.meetflowai.site/buy</a> 下载安装包
     （或<a href="{DL}">直接下载</a>），运行后点击 <b>Next</b>。无需卸载旧版本，登录数据保留。
     建议尽快更新，这是一次重要的修复。</p>
  <p><b>注意：</b>1.4.6 安装包<b>尚未进行代码签名</b>（我们正在完成证书），因此 Windows 运行时
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
