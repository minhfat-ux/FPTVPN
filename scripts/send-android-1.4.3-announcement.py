#!/usr/bin/env python3
"""Gửi email thông báo Android 1.4.3 (versionCode 29) cho khách ĐANG DÙNG Android.

Nội dung chỉ nêu thứ ĐÃ có trong bản release (xem `docs/RELEASE_NOTES_android_1.4.3.md`):
(a) sửa nguồn byte Diagnostics — trước báo ~5 kbps sai ~200 lần, nay đúng theo TrafficStats/UID;
(b) MTU tun 1300; (c) 2 resolver DNS. Link tải dùng host `t1.meetflowai.site`, 3 ngôn ngữ.

Chạy trên node-2 (qua ssh):
  python3 send-android-1.4.3-announcement.py --recipients    # chỉ LIỆT KÊ người nhận
  python3 send-android-1.4.3-announcement.py --test          # chỉ gửi tới ALERT_EMAIL
  python3 send-android-1.4.3-announcement.py                 # gửi cho khách Android
  python3 send-android-1.4.3-announcement.py --email a@b.com # gửi 1 địa chỉ
  python3 send-android-1.4.3-announcement.py --verify        # hỏi lại trạng thái các mã đã lưu
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = "--test" in args
LIST = "--recipients" in args
VERIFY = "--verify" in args
IDS_FILE = "/root/flowvpn-cp/data/.announce-android-1.4.3-ids.json"

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

AND = "https://t1.meetflowai.site/v1/downloads/android"
AND_LEGACY = "https://t1.meetflowai.site/v1/downloads/android-legacy"
BUY = "https://t1.meetflowai.site/buy"
FROM = "VPNFlow <support@meetflowai.site>"
SUBJECT = "VPNFlow 1.4.3 cho Android — sửa đúng đồng hồ tốc độ / VPNFlow 1.4.3 for Android / VPNFlow 1.4.3 Android 更新"

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.3 cho Android — bản mới đã sẵn sàng</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow 1.4.3</b> cho Android (versionCode 29). Bản này sửa một lỗi
     hiển thị khó chịu và tăng độ ổn định đường truyền:</p>
  <ul>
    <li><b>Đồng hồ tốc độ trong Diagnostics nay đo đúng.</b> Trước đây khi đường truyền chạy trực tiếp,
        ứng dụng đọc nhầm nguồn số liệu nên báo khoảng <b>5 kbps</b> dù thực tế đường truyền đang chở
        vài Mbps — sai tới <b>~200 lần</b>. Nay số liệu lấy theo chính lưu lượng của ứng dụng
        (<i>TrafficStats theo UID</i>), đúng cho mọi loại đường truyền (trực tiếp lẫn qua cầu nối), nên
        số hiển thị khớp với tốc độ thật.</li>
    <li><b>MTU đường tunnel hạ về 1300.</b> Ít bị phân mảnh/mất gói hơn trên mạng có MTU nhỏ
        (4G/5G, Wi-Fi có VPN lồng nhau) ⇒ kết nối ổn định hơn.</li>
    <li><b>Hai máy chủ DNS (1.1.1.1 và 8.8.8.8)</b> cho đường tunnel: nếu một máy chủ chậm hoặc không
        phản hồi, máy còn lại vẫn phân giải được ⇒ vào mạng nhanh và ít lỗi hơn.</li>
  </ul>
  <p><b>Cách cập nhật:</b> tải APK tại <a href="{AND}">t1.meetflowai.site/v1/downloads/android</a>
     (hoặc vào <a href="{BUY}">trang mua</a>). Cài đè lên bản cũ, <b>không cần gỡ</b>, dữ liệu đăng nhập
     được giữ nguyên. Máy Android 7 trở về trước dùng bản
     <a href="{AND_LEGACY}">android-legacy</a>.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.3 for Android — new build available</h3>
  <p>Dear customer,</p>
  <p>We have released <b>VPNFlow 1.4.3</b> for Android (versionCode 29), fixing a misleading readout
     and improving connection stability:</p>
  <ul>
    <li><b>The Diagnostics speed meter is now correct.</b> Previously, on a direct transport the app read
        the wrong byte source and showed about <b>5 kbps</b> while the tunnel actually carried several
        Mbps — off by roughly <b>200x</b>. It now reads the app's own traffic (<i>TrafficStats by UID</i>),
        valid for every transport (direct and relayed), so the figure matches the real speed.</li>
    <li><b>Tunnel MTU lowered to 1300.</b> Less fragmentation and fewer lost packets on low-MTU networks
        (4G/5G, nested Wi-Fi VPNs) — a more stable connection.</li>
    <li><b>Two DNS servers (1.1.1.1 and 8.8.8.8)</b> for the tunnel: if one is slow or unresponsive,
        the other still resolves, for faster and more reliable access.</li>
  </ul>
  <p><b>How to update:</b> download the APK at
     <a href="{AND}">t1.meetflowai.site/v1/downloads/android</a> (or open the
     <a href="{BUY}">buy page</a>). Install over the old version — <b>no uninstall needed</b>, your
     login data is preserved. Devices on Android 7 or older use the
     <a href="{AND_LEGACY}">android-legacy</a> build.</p>
  <p>Reply to this email any time —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.3（Android）——新版本已发布</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Android 版 <b>VPNFlow 1.4.3</b>（versionCode 29），修复了一个误导性的显示问题，
     并提升连接稳定性：</p>
  <ul>
    <li><b>Diagnostics 速度表现在显示正确。</b>此前在直连通道下，应用读取了错误的字节来源，
        明明隧道正在传输数 Mbps，却显示约 <b>5 kbps</b>——偏差约 <b>200 倍</b>。现在改为读取
        应用自身流量（<i>按 UID 的 TrafficStats</i>），对直连与中继通道都有效，显示速度与实际一致。</li>
    <li><b>隧道 MTU 下调为 1300。</b>在 MTU 较小的网络（4G/5G、嵌套 Wi-Fi VPN）上减少分片与丢包，
        连接更稳定。</li>
    <li><b>隧道使用两个 DNS（1.1.1.1 与 8.8.8.8）。</b>其中一个变慢或无响应时，另一个仍可解析，
        上网更快、更少出错。</li>
  </ul>
  <p><b>更新方法：</b>在 <a href="{AND}">t1.meetflowai.site/v1/downloads/android</a> 下载 APK
     （或打开<a href="{BUY}">购买页面</a>）。直接覆盖安装，<b>无需卸载</b>，登录数据保留。
     Android 7 及更早的设备请使用 <a href="{AND_LEGACY}">android-legacy</a> 版本。</p>
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
    req = urllib.request.Request(f"https://api.resend.com/emails/{mail_id}",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"})
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

targets = []
seen = set()
for d in devices:
    uid = str(d.get("userId") or "")
    if str(d.get("platform")) != "android" or uid not in emails:
        continue
    e = emails[uid]
    if not e or e in skip or e in seen:
        continue
    if not exp.get(uid):
        continue
    seen.add(e)
    targets.append(e)
if "--email" in args:
    targets = [args[args.index("--email") + 1].lower()]
targets.sort()

print("nguoi nhan Android:", [mask(t) for t in targets] or "(khong co)")
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
