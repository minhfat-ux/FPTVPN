#!/usr/bin/env python3
"""Gửi email thông báo iOS 1.4.1 (build 18) cho khách ĐANG DÙNG iOS.

Chạy trên node-2:
  send-ios-1.4.1-announcement.py --test              # chỉ gửi tới ALERT_EMAIL
  send-ios-1.4.1-announcement.py                     # gửi cho khách có thiết bị iOS + gói còn hạn
  send-ios-1.4.1-announcement.py --email a@b.com     # gửi 1 địa chỉ
  send-ios-1.4.1-announcement.py --recipients        # chỉ LIỆT KÊ người nhận

Nội dung chỉ nêu tính năng ĐÃ có trong build 18 (xem release/ios/RELEASE_NOTES_1.4.1.md):
watchdog tự phục hồi + tự dựng lại, sửa mất mạng do IPv6 khi connect, đường TQ đi thẳng,
Settings hiện version. KHÔNG nêu nút "đăng xuất thiết bị khác" và bản vá watchdog sau đó.
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = "--test" in args
LIST = "--recipients" in args

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

IOS = "https://t1.meetflowai.site/install/ios"
FROM = "VPNFlow <support@meetflowai.site>"
SUBJECT = "VPNFlow 1.4.1 cho iPhone/iPad — tự phục hồi khi tunnel đứng (bản mới đã sẵn sàng)"

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.1 cho iPhone/iPad — đã có bản mới</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Bản <b>1.4.1</b> cho iPhone/iPad đã phát hành. Thay đổi chính:</p>
  <ul>
    <li><b>Tự phục hồi khi tunnel "đứng"</b>: trước đây app báo Connected nhưng không chở được gói thì
        bị ngắt và Quý khách mất mạng; nay app tự phát hiện và dựng lại kết nối.</li>
    <li><b>Tự dựng lại khi đường truyền chết giữa phiên</b> (đổi Wi-Fi ⇄ 4G): giữ đường đang dùng rồi
        thử lại, không đóng tunnel.</li>
    <li><b>Sửa lỗi mất mạng ngay khi bấm Connect</b> (một cấu hình IPv6 sai làm iPhone mất mạng).</li>
    <li><b>Ở Trung Quốc</b>: traffic trong nước đi thẳng, chỉ traffic ra ngoài mới qua tunnel.</li>
    <li><b>Cài đặt</b> nay hiện số phiên bản để Quý khách kiểm tra đang ở bản nào.</li>
  </ul>
  <p><b>Cách cập nhật</b> (mở bằng <b>Safari trên chính máy đó</b>):
     <a href="{IOS}">{IOS}</a> → nếu máy chưa đăng ký thì bấm <b>Đăng ký thiết bị</b> rồi
     <b>Cài đặt → Cài hồ sơ đã tải → Cài</b> → bấm <b>Cài đặt VPNFlow</b>.
     <b>Bản của shop không cần bật Developer Mode</b>; sau khi cài, vào app kiểm tra
     <b>Cài đặt</b> thấy <b>1.4.1</b> là đúng.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.1 for iPhone/iPad — new build available</h3>
  <p>Dear customer,</p>
  <ul>
    <li><b>Self-healing tunnel</b>: if the tunnel was "Connected" but stopped carrying traffic, the app
        used to drop it and you lost internet — now it detects this and rebuilds the connection.</li>
    <li><b>Auto-rebuild when the transport dies mid-session</b> (e.g. switching Wi-Fi ⇄ 4G) instead of
        tearing the tunnel down.</li>
    <li><b>Fixed "no internet right after Connect"</b> (a wrong IPv6 setting).</li>
    <li><b>In China</b>: local traffic goes direct, only foreign traffic uses the tunnel.</li>
    <li><b>Settings</b> now shows the app version so you can confirm what you run.</li>
  </ul>
  <p><b>How to update</b> (open in <b>Safari on that device</b>): <a href="{IOS}">{IOS}</a> →
     if the device is not registered yet, tap <b>Register device</b>, then
     <b>Settings → Profile Downloaded → Install</b>, then tap <b>Install VPNFlow</b>.
     <b>Our build does not require Developer Mode.</b></p>
  <p>Reply to this email any time — <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.1（iPhone/iPad）——新版本已发布</h3>
  <p>尊敬的客户：</p>
  <ul>
    <li><b>隧道自愈</b>：以前显示“已连接”但不再传输数据时，应用会断开并导致您断网；现在会自动检测并重建连接。</li>
    <li><b>会话中断后自动重建</b>（例如 Wi-Fi 与 4G 之间切换），不再直接拆除隧道。</li>
    <li><b>修复“连接后立刻没有网络”</b>（IPv6 配置错误）。</li>
    <li><b>在中国</b>：国内流量直连，只有境外流量走隧道。</li>
    <li><b>设置</b>页现在显示版本号，便于确认当前版本。</li>
  </ul>
  <p><b>更新方法</b>（在该设备的 <b>Safari</b> 中打开）：<a href="{IOS}">{IOS}</a> →
     若设备尚未注册，请点 <b>注册设备</b>，然后 <b>设置 → 已下载描述文件 → 安装</b>，
     再点 <b>安装 VPNFlow</b>。<b>本店版本不需要开发者模式。</b></p>
  <p>如有问题请直接回复本邮件 — <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>。</p>"""

HTML = ('<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;line-height:1.6;'
        'color:#12202f;max-width:640px">' + VI + EN + ZH + '</div>')


def send(to, subject, html):
    payload = json.dumps({"from": FROM, "to": [to], "subject": subject, "html": html}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, headers={
        "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
        "Accept": "application/json", "User-Agent": "VPNFlow-Mailer/1.0 (+https://meetflowai.site)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return bool(json.loads(res.read().decode()).get("id")), None
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode()[:140]}"
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:140]


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return default


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
for d in devices:
    uid = str(d.get("userId") or "")
    if str(d.get("platform")) != "ios" or uid not in emails:
        continue
    e = emails[uid]
    if not e or e in skip or e in targets:
        continue
    if not exp.get(uid):
        continue
    targets.append(e)
if "--email" in args:
    targets = [args[args.index("--email") + 1].lower()]
targets.sort()

print("nguoi nhan iOS:", targets or "(khong co)")
if LIST:
    raise SystemExit(0)
if alert:
    ok, err = send(alert, "[TEST] " + SUBJECT, HTML)
    print(f"   test toi {alert}: {'OK' if ok else 'LOI ' + str(err)}")
    if TEST:
        raise SystemExit("che do --test: chi gui thu")
sent = failed = 0
for t in targets:
    ok, err = send(t, SUBJECT, HTML)
    if ok:
        sent += 1
        print(f"   OK  {t}")
    else:
        failed += 1
        print(f"   LOI {t}: {err}")
    time.sleep(0.7)
print(f"ket qua: {sent}/{len(targets)} thanh cong, {failed} loi")
