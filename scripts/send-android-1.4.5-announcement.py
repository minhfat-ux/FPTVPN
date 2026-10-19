#!/usr/bin/env python3
"""Gửi email thông báo Android 1.4.5 (versionCode 37) + kênh Android TV mới.

Nguồn nội dung: docs/RELEASE_NOTES_android_1.4.5.md và
docs/handoff/PUBLISH_ANDROID_1.4.5_37_2026-10-19.md (chốt của chủ dự án).

QUAN TRỌNG — khác bản 1.4.4:
- KHÔNG nói "bắt buộc cập nhật": minimum_version giữ 1.2.6, chủ dự án chốt
  "làm v38 rồi mới ép cập nhật".
- Kèm kênh Android TV mới: link + 3 bước cài trên TV, gói TV cài song song.

Chạy trên node-2 (có RESEND_API_KEY + data):
  python3 send-android-1.4.5-announcement.py --recipients    # chỉ LIỆT KÊ người nhận
  python3 send-android-1.4.5-announcement.py --test          # chỉ gửi tới ALERT_EMAIL
  python3 send-android-1.4.5-announcement.py                 # gửi cho khách Android
  python3 send-android-1.4.5-announcement.py --email a@b.com # gửi 1 địa chỉ
  python3 send-android-1.4.5-announcement.py --verify        # hỏi lại trạng thái các mã đã lưu

Lọc đúng luật §0.14: devices.json platform=android + gói còn hạn; luôn --recipients
và --test trước khi gửi thật.
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = "--test" in args
LIST = "--recipients" in args
VERIFY = "--verify" in args
IDS_FILE = "/root/flowvpn-cp/data/.announce-android-1.4.5-ids.json"

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
AND_TV = "https://t1.meetflowai.site/dl/VPNFlow-tv-latest.apk?v=265d46b4"
BUY = "https://t1.meetflowai.site/buy"
FROM = "VPNFlow <support@meetflowai.site>"
SUBJECT = ("VPNFlow 1.4.5 cho Android + kênh Android TV mới / "
           "VPNFlow 1.4.5 for Android + new Android TV app / "
           "VPNFlow 1.4.5 Android 更新 + 全新 Android TV 版")

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.5 cho Android — thêm kênh Android TV</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow 1.4.5 (build 37)</b> cho Android, và lần đầu có thêm
     <b>ứng dụng riêng cho Android TV / TV box</b>.</p>
  <ul>
    <li><b>Hút băng thông bằng N kết nối (mặc định TẮT):</b> trên mạng dùng chung (toà nhà, khách sạn,
        quán cà phê), nhà mạng thường giới hạn tốc độ <i>theo từng kết nối</i>. Bật
        <b>Settings → Tăng tốc → Hút băng thông</b> rồi chọn <b>2/4/6/8</b> để mở nhiều kết nối
        song song tới cùng một máy chủ. Đo thật ngày 19/10/2026: 1 luồng <b>4–12 Mbps</b>,
        4 luồng <b>17–29 Mbps</b>, 8 luồng <b>72–81 Mbps</b>. Mạng nhà riêng bình thường
        <b>không cần bật</b>.</li>
    <li><b>Không bắt buộc cập nhật:</b> nếu không bật công tắc trên, bản 1.4.5 chạy <b>y hệt 1.4.4</b>.
        Quý khách cập nhật khi thuận tiện.</li>
  </ul>
  <h3 style="color:#0d7a4a;margin:18px 0 8px">Kênh Android TV mới</h3>
  <p>Ứng dụng TV là <b>gói riêng</b> (<code>com.privatevpn.app.tv</code>), cài <b>song song</b> với bản
     điện thoại — <b>không ghi đè, không mất đăng nhập</b>. Dành cho TV / Android TV box có điều khiển.</p>
  <ol>
    <li>Trên TV, mở trình duyệt (hoặc app gửi file) và mở
        <a href="{AND_TV}">link tải bản TV</a>.</li>
    <li>Cho phép <b>“Cài đặt từ nguồn không xác định”</b> cho trình duyệt / quản lý file.</li>
    <li>Mở file vừa tải → <b>Cài đặt</b> → mở app <b>VPNFlow</b> trong danh sách ứng dụng TV
        (có biểu tượng Leanback).</li>
  </ol>
  <p><b>Cập nhật bản điện thoại:</b> tải APK tại
     <a href="{AND}">t1.meetflowai.site/v1/downloads/android</a> (hoặc vào
     <a href="{BUY}">trang mua</a>). Cài đè lên bản cũ, <b>không cần gỡ</b>, giữ nguyên đăng nhập.
     Máy Android 7 trở về trước / Fire OS dùng bản
     <a href="{AND_LEGACY}">android-legacy</a> (hệ thống tự chọn đúng bản khi tải).</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.5 for Android — new Android TV app</h3>
  <p>Dear customer,</p>
  <p>We have released <b>VPNFlow 1.4.5 (build 37)</b> for Android, and for the first time a
     <b>separate app for Android TV / TV boxes</b>.</p>
  <ul>
    <li><b>Bandwidth boost with N connections (off by default):</b> on shared networks (offices,
        hotels, cafés), carriers often limit speed <i>per connection</i>. Turn on
        <b>Settings → Boost → Bandwidth boost</b> and pick <b>2/4/6/8</b> to open several parallel
        connections to the same server. Measured on 19 Oct 2026: one stream <b>4–12 Mbps</b>,
        four streams <b>17–29 Mbps</b>, eight streams <b>72–81 Mbps</b>. Not needed on a normal
        home network.</li>
    <li><b>The update is optional:</b> with the switch off, 1.4.5 behaves <b>exactly like 1.4.4</b>.
        Update whenever convenient.</li>
  </ul>
  <h3 style="color:#0d7a4a;margin:18px 0 8px">New Android TV channel</h3>
  <p>The TV app is a <b>separate package</b> (<code>com.privatevpn.app.tv</code>) that installs
     <b>alongside</b> the phone app — it does <b>not overwrite it</b> and your login is kept.
     For TVs / Android TV boxes with a remote.</p>
  <ol>
    <li>On the TV, open a browser (or a file-sender app) and open the
        <a href="{AND_TV}">TV download link</a>.</li>
    <li>Allow <b>“Install from unknown sources”</b> for the browser / file manager.</li>
    <li>Open the downloaded file → <b>Install</b> → launch <b>VPNFlow</b> from the TV app list
        (Leanback icon).</li>
  </ol>
  <p><b>Updating the phone app:</b> download the APK at
     <a href="{AND}">t1.meetflowai.site/v1/downloads/android</a> (or open the
     <a href="{BUY}">buy page</a>). Install over the old version — <b>no uninstall needed</b>,
     your login data is preserved. Android 7 or older / Fire OS devices use the
     <a href="{AND_LEGACY}">android-legacy</a> build (the download route picks the right one).</p>
  <p>Reply to this email any time —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.5（Android）——新增 Android TV 版</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Android 版 <b>VPNFlow 1.4.5（build 37）</b>，并首次推出
     <b>Android TV / 电视盒子的独立应用</b>。</p>
  <ul>
    <li><b>多连接带宽提升（默认关闭）：</b>在共享网络（写字楼、酒店、咖啡厅）中，运营商常按
        <i>单个连接</i>限速。请开启 <b>设置 → 加速 → 带宽提升</b>，选择 <b>2/4/6/8</b>，
        即可与同一服务器建立多条并行连接。2026 年 10 月 19 日实测：单流 <b>4–12 Mbps</b>，
        4 流 <b>17–29 Mbps</b>，8 流 <b>72–81 Mbps</b>。普通家庭网络<b>无需开启</b>。</li>
    <li><b>本次更新不是强制的：</b>不开启上述开关时，1.4.5 的表现与 <b>1.4.4 完全一致</b>。
        您可在方便时更新。</li>
  </ul>
  <h3 style="color:#0d7a4a;margin:18px 0 8px">全新 Android TV 频道</h3>
  <p>电视版是<b>独立安装包</b>（<code>com.privatevpn.app.tv</code>），与手机版<b>并行安装</b>——
    <b>不会覆盖</b>手机版，也不会丢失登录。适用于带遥控器的电视 / Android TV 盒子。</p>
  <ol>
    <li>在电视上打开浏览器（或投送文件的 App），打开<a href="{AND_TV}">电视版下载链接</a>。</li>
    <li>允许浏览器 / 文件管理器<b>“安装未知来源应用”</b>。</li>
    <li>打开刚下载的文件 → <b>安装</b> → 在电视应用列表中启动 <b>VPNFlow</b>（Leanback 图标）。</li>
  </ol>
  <p><b>更新手机版：</b>在 <a href="{AND}">t1.meetflowai.site/v1/downloads/android</a> 下载 APK
     （或打开<a href="{BUY}">购买页面</a>）。直接覆盖安装，<b>无需卸载</b>，登录数据保留。
     Android 7 及更早 / Fire OS 设备使用 <a href="{AND_LEGACY}">android-legacy</a> 版本
     （下载路由会自动选择正确版本）。</p>
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
    if not saved:
        raise SystemExit("chua co ma Resend nao trong " + IDS_FILE)
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
