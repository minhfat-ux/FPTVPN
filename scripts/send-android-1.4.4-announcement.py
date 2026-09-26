#!/usr/bin/env python3
"""Gửi email thông báo Android 1.4.4 (versionCode 32) cho khách ĐANG DÙNG Android.

Nội dung chỉ nêu thứ ĐÃ có trong bản release (xem `docs/RELEASE_NOTES_android_1.4.4.md`):
(a) v30 — số khai không còn tự "bóp" khi xem video adaptive (chỉ tính mẫu đang chở dữ liệu);
(b) v31 — không chọn nhầm "đường trực tiếp" trên 5G do bắt tay TCP giả của nhà mạng;
(c) v32 — đo mạng trước khi khai: tính từ byte đầu tiên + ngân sách 2.500 -> 6.000 ms, trần 1,5 -> 4 MB;
(d) server nới PONG_TIMEOUT 20 s -> 60 s (relay bớt đứt kết nối).
Link tải dùng host `t1.meetflowai.site`, 3 ngôn ngữ vi/en/zh.

Chạy trên node-2 (qua ssh):
  python3 send-android-1.4.4-announcement.py --recipients    # chỉ LIỆT KÊ người nhận
  python3 send-android-1.4.4-announcement.py --test          # chỉ gửi tới ALERT_EMAIL
  python3 send-android-1.4.4-announcement.py                 # gửi cho khách Android
  python3 send-android-1.4.4-announcement.py --email a@b.com # gửi 1 địa chỉ
  python3 send-android-1.4.4-announcement.py --verify        # hỏi lại trạng thái các mã đã lưu

Dùng cùng mẫu/kênh với bản Android 1.4.3 (bus-299): RESEND_API_KEY lấy từ drop-in systemd,
gửi thử ALERT_EMAIL trước rồi mới gửi khách, lưu Resend id để đối chiếu.
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = "--test" in args
LIST = "--recipients" in args
VERIFY = "--verify" in args
IDS_FILE = "/root/flowvpn-cp/data/.announce-android-1.4.4-ids.json"

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
SUBJECT = "VPNFlow 1.4.4 cho Android — xem video/5G ổn định hơn / VPNFlow 1.4.4 for Android / VPNFlow 1.4.4 Android 更新"

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.4 cho Android — bản mới đã sẵn sàng</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow 1.4.4</b> cho Android (versionCode 32). Bản này gồm ba bản vá
     hành vi và một thay đổi phía máy chủ, giúp số đo tốc độ và đường truyền ổn định hơn:</p>
  <ul>
    <li><b>Xem video (Netflix, FPT Play…) không còn tự hạ tốc độ khai báo.</b> Trước đây cửa sổ tính
        tốc độ trung bình tính <i>cả những giây video không tải dữ liệu</i>, nên số khai tự tụt
        (đo thật: <b>4.018 → 2.812 kbps</b>) rồi kẹt ở mức thấp. Nay chỉ tính <b>mẫu đang chở dữ liệu</b>,
        và chỉ hạ khi cửa sổ có <b>≥ 8/12 mẫu hoạt động</b> và tụt dưới 50%.</li>
    <li><b>Trên 5G, không còn chọn nhầm đường trực tiếp.</b> Nhà mạng có thể trả bắt tay TCP
        <b>giả</b> chỉ 2–4 ms khiến app tưởng "đường trực tiếp còn sống" và chọn đúng đường
        <b>không chở gói nào</b>. Nay app không tin bắt tay nhanh bất khả thi (&lt; 25 ms) và
        <b>ghi nhớ đường trực tiếp đã chết trên mạng đó</b> cho tới khi đổi mạng.</li>
    <li><b>Đo mạng trước khi khai đầy đủ hơn.</b> Phép đo nay tính <b>từ byte đầu tiên</b>, ngân sách
        <b>2.500 → 6.000 ms</b>, trần <b>1,5 → 4 MB</b> (đo một lần cho mỗi mạng). Trước đây đo bị cắt
        sớm: đo ra <b>559 kbps</b> trên mạng 5G thật <b>19 Mbps</b> ⇒ kẹt số khai ở sàn 1.000 kbps.</li>
    <li><b>Kết nối bớt bị ngắt (thay đổi ở máy chủ).</b> Relay đã nới thời gian chờ phản hồi
        <b>20 s → 60 s</b>; trước đây kết nối bị cắt mỗi 20–30 s. Sau khi sửa: <b>0 lần</b> ngắt do
        pong-timeout. Quý khách <b>không cần làm gì</b> ở phía máy chủ, chỉ cần cập nhật app.</li>
  </ul>
  <p><b>Cách cập nhật:</b> tải APK tại <a href="{AND}">t1.meetflowai.site/v1/downloads/android</a>
     (hoặc vào <a href="{BUY}">trang mua</a>). Cài đè lên bản cũ, <b>không cần gỡ</b>, dữ liệu đăng nhập
     được giữ nguyên. Máy Android 7 trở về trước dùng bản
     <a href="{AND_LEGACY}">android-legacy</a>.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.4 for Android — new build available</h3>
  <p>Dear customer,</p>
  <p>We have released <b>VPNFlow 1.4.4</b> for Android (versionCode 32). It brings three behaviour fixes
     plus a server-side change for more accurate speed figures and a steadier connection:</p>
  <ul>
    <li><b>Video streaming (Netflix, FPT Play, …) no longer drags the declared speed down.</b>
        The averaging window used to include <i>seconds when the video was not fetching data</i>, so the
        declared figure sagged (measured: <b>4,018 → 2,812 kbps</b>) and stayed low. It now only counts
        <b>samples that are carrying data</b>, and lowers the figure only when <b>≥ 8 of 12 samples</b>
        are active and it drops below 50%.</li>
    <li><b>On 5G it no longer picks a dead "direct" path.</b> Carriers can return a <b>fake</b> TCP
        handshake in just 2–4 ms, making the app believe the direct path is alive and pick one that
        <b>carries no packets</b>. The app now distrusts impossibly fast handshakes (&lt; 25 ms) and
        <b>remembers that direct is dead on that network</b> until you change networks.</li>
    <li><b>Fuller pre-declaration network measurement.</b> The measurement now counts <b>from the first
        byte</b>, with a budget of <b>2,500 → 6,000 ms</b> and a cap of <b>1.5 → 4 MB</b> (once per
        network). It used to be cut short: it read <b>559 kbps</b> on a 5G network actually doing
        <b>19 Mbps</b>, pinning the declared figure at the 1,000 kbps floor.</li>
    <li><b>Fewer dropped connections (server-side).</b> The relay's response timeout was widened
        <b>20 s → 60 s</b>; previously the connection was cut every 20–30 s. After the fix: <b>zero</b>
        pong-timeout drops. Nothing to do on your side — just update the app.</li>
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
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.4（Android）——新版本已发布</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Android 版 <b>VPNFlow 1.4.4</b>（versionCode 32），包含三项行为修复和一项服务器端
     调整，速度显示更准确，连接更稳定：</p>
  <ul>
    <li><b>观看视频（Netflix、FPT Play 等）不再拉低申报速度。</b>此前的平均窗口把<i>视频未在下载数据
        的那些秒</i>也计入，导致申报值下滑（实测：<b>4,018 → 2,812 kbps</b>）并停在低位。现在只统计
        <b>正在传输数据的样本</b>，且只有当 <b>12 个样本中 ≥ 8 个活跃</b>且低于 50% 时才下调。</li>
    <li><b>在 5G 上不再选错“直连”路径。</b>运营商可能返回仅 2–4 ms 的<b>假</b> TCP 握手，让应用误以为
        直连仍可用，从而选中一条<b>不传输任何数据</b>的路径。现在应用不再相信不可能的快速握手
        （&lt; 25 ms），并会<b>记住该网络上的直连已不可用</b>，直到更换网络。</li>
    <li><b>申报前测速更完整。</b>测量现在<b>从第一个字节开始</b>，预算由 <b>2,500 → 6,000 ms</b>，
        上限由 <b>1.5 → 4 MB</b>（每个网络只测一次）。此前测量被过早截断：在实际约 <b>19 Mbps</b> 的
        5G 网络上只测到 <b>559 kbps</b>，使申报值卡在 1,000 kbps 下限。</li>
    <li><b>连接中断更少（服务器端）。</b>中继的响应超时由 <b>20 秒 → 60 秒</b>；此前连接每 20–30 秒
        就会被切断。修复后：pong 超时导致的中断为 <b>零</b>。您无需在服务器端做任何操作，只需更新应用。</li>
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
