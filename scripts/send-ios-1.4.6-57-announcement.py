#!/usr/bin/env python3
"""Gửi email thông báo iOS 1.4.6 (build 57) cho khách ĐANG DÙNG iOS — GỬI RIÊNG kênh iOS.

Vì sao có bản mới thay vì dùng `send-ios-1.4.6-announcement.py`: script đó viết cho **build 54** và
nội dung đã SAI với build 57 ở hai chỗ (xem `docs/handoff/HANDOFF_PUBLISHER_IOS_1.4.6_57_2026-09-26.md` §6):
  * nói "ngân sách phiên 20 -> 35 s" — build 57 tính ngân sách TỪ hằng số
    (`HysteriaDefaults.sessionStartBudget = relayOpenGrace 10 × maxRelayDoorsPerNode 2 + 5` = 25 s),
    nên con số cứng 35 s là sai và sẽ sai lại mỗi lần thêm/bớt cửa;
  * KHÔNG nói gì về **P2 chặn IPv6 chủ động** — vốn là nội dung chính của bản này.

Nội dung chỉ nêu thứ ĐO ĐƯỢC trong build 57:
  * P2 — tunnel không để gói IPv6 rơi vào khoảng không nữa; trả `ICMPv6 Destination Unreachable`
    (mã 4, port unreachable) để ứng dụng lùi về IPv4 NGAY (trước đây gói biến mất ⇒ app treo chờ);
  * F3 — cửa dự phòng giữ nguyên PATH chỉ đổi HOSTNAME ⇒ **cùng node**, không nhảy sang node khác;
  * F4 — ngân sách phiên tính từ số cửa nên không bao giờ cắt ngang trước khi thử hết cửa;
  * van bộ nhớ: gần trần iOS thì hạ tunnel SẠCH — **gốc rò bộ nhớ (BUG-IOS-JETSAM-001) CHƯA tìm ra**.

BẮT BUỘC có câu hướng dẫn CÀI LẠI: `AppVersionService.swift` so **chuỗi version**
(`isVersion(current, lessThan: info.latest_version)`), nên khách đang ở **1.4.6/54 KHÔNG thấy thông báo
"có bản mới"** (cùng số 1.4.6). Việc so theo **build** là F2, chưa làm và không hồi tố được.

Chạy trên node-2:
  send-ios-1.4.6-57-announcement.py --recipients      # chỉ LIỆT KÊ người nhận
  send-ios-1.4.6-57-announcement.py --test            # chỉ gửi tới ALERT_EMAIL
  send-ios-1.4.6-57-announcement.py                   # gửi cho khách có thiết bị iOS + gói còn hạn
  send-ios-1.4.6-57-announcement.py --email a@b.com   # gửi 1 địa chỉ
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
SUBJECT = ("VPNFlow iOS 1.4.6 — bản VÁ thay bản phát sáng nay (sửa IPv6 làm treo ứng dụng) / "
           "patch replacing this morning's build (IPv6 fix) / 修复 IPv6 导致应用卡住的补丁版")

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6 cho iPhone/iPad — bản VÁ thay bản phát sáng nay</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>bản vá 1.4.6</b> cho iPhone/iPad, <b>thay cho bản 1.4.6 phát sáng nay</b>.
     Đây <b>không phải</b> bản 1.4.6 đầu tiên Quý khách nhận — nếu máy đã cài 1.4.6 từ sáng, máy đang chạy
     bản cũ hơn và nên cài lại theo hướng dẫn ở cuối thư.</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>Đã sửa — IPv6:</b> trước đây khi ứng dụng (trình duyệt, Zalo, WeChat…) thử đi qua IPv6, gói tin
     <b>bị bỏ im lặng</b> nên ứng dụng cứ <b>chờ mãi</b> và có lúc đứng hình. Nay tunnel <b>trả lời dứt khoát</b>
     bằng <i>ICMPv6 Destination Unreachable</i> ⇒ ứng dụng <b>chuyển sang IPv4 ngay lập tức</b> và chạy tiếp,
     không còn khoảng chờ vô ích.<br>
     <b>Đã tốt hơn — chọn đường:</b> các cửa dự phòng nay giữ <b>đúng node</b> đang dùng (chỉ đổi tên miền,
     không đổi node) nên không còn nguy cơ "nối sang một node khác mà không báo"; và thời gian cho cả
     lượt kết nối nay được <b>tính theo số cửa</b>, nên app không bao giờ cắt ngang trước khi thử hết cửa.<br>
     <b>Bộ nhớ:</b> app tự theo dõi bộ nhớ; khi gần tới hạn của iOS thì <b>ngắt tunnel một cách sạch sẽ</b>
     để iOS trả mạng lại (trước đây iOS giết tiến trình giữa lúc đang dùng nên Quý khách thấy mất mạng
     đột ngột). <i>Chúng tôi nói thẳng: nguyên nhân gốc của việc tăng bộ nhớ khi dùng lưu lượng lớn
     <b>vẫn CHƯA tìm ra</b> — bản này là bước giảm đau có kiểm soát, <b>chưa phải đã hết</b>.</i></p>
  <p style="background:#fff7e6;border-left:4px solid #d99a00;padding:10px 12px;margin:12px 0">
     <b>Quan trọng — máy sẽ KHÔNG tự báo "có bản mới":</b> phiên bản này vẫn mang số <b>1.4.6</b> như bản
     sáng nay, mà app so <b>số phiên bản</b>, nên app <b>không</b> hiện thông báo cập nhật. Muốn nhận bản vá,
     Quý khách vui lòng <b>mở lại trang cài đặt và cài lại</b> (thao tác dưới đây, mất khoảng 1 phút):
     <a href="{IOS}">{IOS}</a></p>
  <p><b>Cách cài lại</b> (mở bằng <b>Safari trên chính máy đó</b>): mở
     <a href="{IOS}">{IOS}</a> → bấm <b>Cài đặt VPNFlow</b> → <b>Cài đặt → Cài hồ sơ đã tải → Cài</b> →
     bấm <b>Cài đặt VPNFlow</b> (cài đè lên bản cũ, không mất dữ liệu).
     <b>Bản của shop không cần bật Developer Mode.</b> Sau khi cài, vào app xem <b>Cài đặt</b> thấy
     <b>1.4.6</b> là đúng.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

EN = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6 for iPhone/iPad — a patch replacing this morning's build</h3>
  <p>Dear customer,</p>
  <p>We have just released a <b>patch build of 1.4.6</b> for iPhone/iPad that <b>replaces the 1.4.6 build
     released earlier today</b>. This is <b>not</b> the first 1.4.6 you received: if your device installed
     1.4.6 this morning, it is running the older build and should be reinstalled as described below.</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>Fixed — IPv6:</b> previously, when an app (browser, Zalo, WeChat…) tried to go over IPv6, the
     packets were <b>dropped silently</b>, so the app <b>waited forever</b> and sometimes froze. The tunnel
     now <b>answers explicitly</b> with <i>ICMPv6 Destination Unreachable</i>, so the app <b>falls back to
     IPv4 immediately</b> and keeps working — no more pointless waiting.<br>
     <b>Improved — path selection:</b> fallback doors now stay on the <b>same node</b> (only the hostname
     changes, not the node), removing any risk of silently landing on a different node; and the time
     allowed for a whole connect attempt is now <b>derived from the number of doors</b>, so the app never
     cuts the attempt short before all doors have been tried.<br>
     <b>Memory:</b> the app watches its own memory and, close to the iOS limit, <b>drops the tunnel
     cleanly</b> so iOS hands your network back (previously iOS killed the process mid-session and you
     simply lost connectivity). <i>To be straight with you: the root cause of the memory growth under
     heavy traffic is <b>still NOT found</b> — this release is a controlled mitigation, <b>not a full
     fix</b>.</i></p>
  <p style="background:#fff7e6;border-left:4px solid #d99a00;padding:10px 12px;margin:12px 0">
     <b>Important — your device will NOT tell you an update exists:</b> this build carries the same
     version number <b>1.4.6</b> as this morning's build, and the app compares <b>version strings</b>, so
     it will <b>not</b> show an update prompt. To get the patch, please <b>open the install page again and
     reinstall</b> (takes about a minute): <a href="{IOS}">{IOS}</a></p>
  <p><b>How to reinstall</b> (open in <b>Safari on that device</b>): open
     <a href="{IOS}">{IOS}</a> → tap <b>Install VPNFlow</b> → <b>Settings → Profile Downloaded → Install</b>
     → tap <b>Install VPNFlow</b> (installs over the old build, no data is lost).
     <b>Our build does not require Developer Mode.</b> After installing, open the app and check
     <b>Settings</b> shows <b>1.4.6</b>.</p>
  <p>Reply to this email any time — <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""

ZH = f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.6（iPhone/iPad）——替换今早版本的补丁版</h3>
  <p>尊敬的客户：</p>
  <p>我们刚刚发布了 iPhone/iPad 的 <b>1.4.6 补丁版</b>，<b>用于替换今早发布的 1.4.6</b>。
     这<b>不是</b>您收到的第一个 1.4.6：如果设备今早已安装 1.4.6，那么它运行的是较旧的版本，
     建议按文末说明重新安装。</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>已修复 —— IPv6：</b>过去当应用（浏览器、Zalo、微信……）尝试走 IPv6 时，数据包被<b>静默丢弃</b>，
     应用只能<b>一直等待</b>，有时会卡住。现在隧道会<b>明确回应</b>
     <i>ICMPv6 Destination Unreachable</i>，应用<b>立即回退到 IPv4</b> 继续工作，不再有无效等待。<br>
     <b>已改进 —— 选路：</b>备用入口现在保持在<b>同一个节点</b>（只换域名，不换节点），
     消除了“静默连到别的节点”的风险；同时整个连接过程的时间预算改为<b>按入口数量计算</b>，
     应用不会在试完全部入口之前就中途放弃。<br>
     <b>内存：</b>应用会监控自身内存，接近 iOS 上限时<b>干净地断开隧道</b>，让 iOS 把网络还给用户
     （过去是系统在使用中直接杀掉进程，用户会突然断网）。<i>我们实话实说：大流量下内存增长的
     根因<b>仍未找到</b>——本次是可控的缓解，<b>并非彻底修复</b>。</i></p>
  <p style="background:#fff7e6;border-left:4px solid #d99a00;padding:10px 12px;margin:12px 0">
     <b>重要 —— 设备不会提示有新版本：</b>本版本与今早的版本号同为 <b>1.4.6</b>，
     而应用是按<b>版本号字符串</b>比较的，因此<b>不会</b>弹出更新提示。要获得本补丁，
     请<b>重新打开安装页面并重新安装</b>（约 1 分钟）：<a href="{IOS}">{IOS}</a></p>
  <p><b>重新安装方法</b>（在该设备的 <b>Safari</b> 中打开）：打开
     <a href="{IOS}">{IOS}</a> → 点 <b>安装 VPNFlow</b> → <b>设置 → 已下载描述文件 → 安装</b> →
     点 <b>安装 VPNFlow</b>（覆盖安装，不会丢失数据）。
     <b>本店版本不需要开发者模式。</b>安装后打开应用，进入 <b>设置</b> 看到 <b>1.4.6</b> 即为正确版本。</p>
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
