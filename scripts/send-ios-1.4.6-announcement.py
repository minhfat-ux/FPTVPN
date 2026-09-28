#!/usr/bin/env python3
"""Gửi email thông báo iOS 1.4.6 (build 54) cho khách ĐANG DÙNG iOS — GỬI RIÊNG kênh iOS.

Chủ dự án chốt 26/09/2026: **iOS và macOS gửi RIÊNG** (email macOS là bản riêng, không gộp).

Nội dung chỉ nêu thứ ĐÃ có trong build 54 và đo được:
  * sửa lỗi chập chờn "bấm Connect là fail" trên dữ liệu di động/5G (chờ mở relay 6 -> 10 s,
    thêm cửa vào thứ hai t1.meetflowai.site, ngân sách phiên 20 -> 35 s);
  * đổi đường khi chiều về chết (dựng lại transport; 2 lần liên tiếp 0 gói về thì xoay relay);
  * van bộ nhớ: gần trần của hệ điều hành thì hạ tunnel SẠCH để iOS trả mạng, thay vì bị giết
    giữa lúc đang dùng — **gốc rò bộ nhớ CHƯA tìm ra**, không được hứa là đã hết.

Bản này KHÔNG bắt buộc cập nhật (`minimum_version` giữ 1.3.3 vì profile ad-hoc chỉ có 10 UDID).

Chạy trên node-2:
  send-ios-1.4.6-announcement.py --recipients      # chỉ LIỆT KÊ người nhận
  send-ios-1.4.6-announcement.py --test            # chỉ gửi tới ALERT_EMAIL
  send-ios-1.4.6-announcement.py                   # gửi cho khách có thiết bị iOS + gói còn hạn
  send-ios-1.4.6-announcement.py --email a@b.com   # gửi 1 địa chỉ
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
SUBJECT = ("VPNFlow iOS 1.4.6 (bản mới) — sửa lỗi 'bấm Connect là fail' trên 5G/4G / "
           "connect fix on mobile data / 移动数据连接修复")

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6 cho iPhone/iPad — đã có bản mới</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Bản <b>1.4.6</b> cho iPhone/iPad đã phát hành. Bản này tập trung vào lỗi <b>kết nối chập chờn
     trên dữ liệu di động (4G/5G)</b>: có lúc bấm Connect là báo lỗi ngay, bấm lại vài lần mới lên.</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>Đã sửa:</b> app chờ mở đường lâu hơn (10 giây thay vì 6), có <b>thêm một cửa vào dự phòng</b>
     và dành nhiều thời gian hơn cho cả phiên kết nối — nên lần bấm Connect đầu tiên đã lên được,
     kể cả khi mạng yếu.<br>
     <b>Đã tốt hơn:</b> nếu app báo Connected mà không chở được dữ liệu, app <b>tự dựng lại đường</b>
     và nếu vẫn không được thì <b>tự đổi sang đường khác</b>, Quý khách không phải tắt/bật lại VPN.<br>
     <b>Bộ nhớ:</b> app nay tự theo dõi bộ nhớ của mình; khi gần tới hạn của iOS, app <b>ngắt tunnel
     một cách sạch sẽ</b> để iOS trả mạng lại (trước đây iOS giết tiến trình giữa lúc đang dùng nên
     Quý khách thấy mất mạng đột ngột). <i>Chúng tôi vẫn đang truy nguyên nhân gốc của việc tăng bộ nhớ
     khi dùng lưu lượng lớn — bản này là bước giảm đau có kiểm soát, chưa phải đã hết.</i></p>
  <p>Việc cập nhật là <b>tự nguyện</b> (không bắt buộc): app bản cũ vẫn dùng được bình thường.</p>
  <p><b>Cách cập nhật</b> (mở bằng <b>Safari trên chính máy đó</b>):
     <a href="{IOS}">{IOS}</a> → nếu máy chưa đăng ký thì bấm <b>Đăng ký thiết bị</b> trước →
     <b>Cài đặt → Cài hồ sơ đã tải → Cài</b> → bấm <b>Cài đặt VPNFlow</b>.
     <b>Bản của shop không cần bật Developer Mode.</b> Sau khi cài, vào app kiểm tra
     <b>Cài đặt</b> thấy <b>1.4.6</b> là đúng.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6 for iPhone/iPad — new build available</h3>
  <p>Dear customer,</p>
  <p>Build <b>1.4.6</b> for iPhone/iPad is out. It focuses on <b>intermittent failures when connecting
     on mobile data (4G/5G)</b> — sometimes tapping Connect failed instantly and it took a few tries.</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>Fixed:</b> the app now waits longer for the relay to open (10s instead of 6s), has a
     <b>second fallback entry point</b>, and gives the whole session more time — so the first tap on
     Connect works, even on a weak network.<br>
     <b>Improved:</b> if the app is "Connected" but carries no traffic, it <b>rebuilds the path</b>
     and, if that still fails, <b>switches to another route by itself</b> — no need to toggle the VPN.<br>
     <b>Memory:</b> the app now watches its own memory and, close to the iOS limit, <b>drops the tunnel
     cleanly</b> so iOS hands your network back (previously iOS killed the process mid-session and you
     simply lost connectivity). <i>We are still hunting the root cause of the memory growth under heavy
     traffic — this release is a controlled mitigation, not a full fix.</i></p>
  <p>This update is <b>optional</b>: older builds keep working.</p>
  <p><b>How to update</b> (open in <b>Safari on that device</b>): <a href="{IOS}">{IOS}</a> →
     if the device is not registered yet, tap <b>Register device</b>, then
     <b>Settings → Profile Downloaded → Install</b>, then tap <b>Install VPNFlow</b>.
     <b>Our build does not require Developer Mode.</b> After installing, open the app and check
     <b>Settings</b> shows <b>1.4.6</b>.</p>
  <p>Reply to this email any time — <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6（iPhone/iPad）——新版本已发布</h3>
  <p>尊敬的客户：</p>
  <p>iPhone/iPad 版 <b>1.4.6</b> 已发布，重点修复<b>移动数据（4G/5G）上连接不稳定</b>的问题：
     有时点 Connect 立即失败，需要多点几次才能连上。</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>已修复：</b>应用等待中继打开的时间更长（10 秒，原为 6 秒），新增<b>第二个备用入口</b>，
     整个会话的时间预算也更充足——即使在弱网下，第一次点 Connect 也能连上。<br>
     <b>已改进：</b>若显示“已连接”但没有数据传输，应用会<b>自动重建线路</b>；若仍不行则
     <b>自行切换到其他线路</b>，无需手动开关 VPN。<br>
     <b>内存：</b>应用现在会监控自身内存占用，接近 iOS 上限时会<b>干净地断开隧道</b>，
     让 iOS 把网络还给用户（过去是系统在使用中直接杀掉进程，用户会突然断网）。
     <i>我们仍在排查大流量下内存增长的根因——本次是可控的缓解，并非彻底修复。</i></p>
  <p>本次更新为<b>自愿更新</b>，旧版本仍可正常使用。</p>
  <p><b>更新方法</b>（在该设备的 <b>Safari</b> 中打开）：<a href="{IOS}">{IOS}</a> →
     若设备尚未注册，请先点 <b>注册设备</b>，然后 <b>设置 → 已下载描述文件 → 安装</b>，
     再点 <b>安装 VPNFlow</b>。<b>本店版本不需要开发者模式。</b>安装后打开应用，进入 <b>设置</b>
     看到 <b>1.4.6</b> 即为正确版本。</p>
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
