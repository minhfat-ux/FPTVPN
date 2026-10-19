#!/usr/bin/env python3
"""Email khách iOS về TÍNH NĂNG MỚI ở bản 1.4.7 (build 80): Settings → Tăng tốc → Hút băng thông (N tunnel).

Chủ dự án chốt 20/10/2026: "gửi mail cho khách với inform chức năng mới".
Nội dung CHỈ nêu thứ có thật trong build 80 (docs/handoff/HANDOFF_PUBLISHER_IOS_1.4.7_80_2026-10-20.md §3):
  * Hút băng thông (N tunnel 2/4/6/8) — mở N kết nối WS song song tới CÙNG exit node, Go chia luồng;
    MẶC ĐỊNH TẮT. KHÔNG hứa con số tốc độ (mạng TQ dao động mạnh trong ngày đo).
  * Sửa treo "Disconnecting…" (CoreStop đệ quy vô hạn), huỷ resourceTimer, trần preMeasure 3 s.

Lưu ý quan trọng về version: bản này vẫn mang số 1.4.7 (bản 66 hôm trước cũng 1.4.7) nên app KHÔNG
tự báo "có bản mới" cho ai đã cài 1.4.7 trước đó ⇒ thư phải có hướng dẫn cài lại.

Chạy trên node-2:
  python3 send-ios-1.4.7-boost-announcement.py --recipients   # chỉ liệt kê
  python3 send-ios-1.4.7-boost-announcement.py --test        # gửi thử tới ALERT_EMAIL
  python3 send-ios-1.4.7-boost-announcement.py               # gửi thật cho khách iOS
  python3 send-ios-1.4.7-boost-announcement.py --email a@b.com
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
SUBJECT = ("VPNFlow iOS 1.4.7 — tính năng mới: Hút băng thông (N tunnel) trong Settings → Tăng tốc / "
           "new: bandwidth boost (N-tunnel) in Settings → Boost / 新功能：设置→加速→多通道提速")

VI = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow iOS 1.4.7 — có thêm mục <b>Tăng tốc</b> trong Settings</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Bản iOS <b>1.4.7</b> vừa được cập nhật có một tính năng mới dành cho đường mạng chậm hoặc chập chờn:</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
    <b>Hút băng thông (N tunnel)</b> — trong <b>Settings → Tăng tốc</b>. Khi bật, app mở <b>N kết nối song song</b>
    tới <b>cùng một exit node</b> (không đổi node) và chia luồng của kết nối qua các tunnel đó.
    Quý khách chọn <b>N = 2 / 4 / 6 / 8</b>.<br>
    <b>Mặc định TẮT</b> — chỉ bật khi Quý khách thấy đường mạng hiện tại chậm. Đây là tuỳ chọn
    <i>thử nghiệm có kiểm soát</i>: trên một số mạng N lớn giúp nhanh hơn rõ, trên mạng khác có thể
    <b>không khác biệt hoặc chậm hơn</b> — nếu vậy Quý khách <b>tắt lại</b> là xong. Chúng tôi <b>không
    hứa một con số tốc độ nào</b>: tốc độ phụ thuộc nhà mạng và tuyến đường tại thời điểm dùng.</p>
  <p><b>Đã sửa thêm:</b> lỗi <b>treo ở màn hình “Disconnecting…”</b> (bấm ngắt mà app đứng mãi) và việc
     app phản hồi chậm sau khi bấm Connect — nay nút bấm phản hồi nhanh hơn (giới hạn bước đo trước 3 giây).</p>
  <p style="background:#fff7e6;border-left:4px solid #d99a00;padding:10px 12px;margin:12px 0">
     <b>Quan trọng:</b> bản này vẫn mang số phiên bản <b>1.4.7</b>, nên nếu máy Quý khách đã cài một bản
     1.4.7 trước đó thì app <b>không</b> tự hiện thông báo cập nhật. Muốn có mục <b>Tăng tốc</b>, Quý khách
     vui lòng <b>mở lại trang cài đặt và cài lại</b> (khoảng 1 phút):
     <a href="{IOS}">{IOS}</a></p>
  <p><b>Cách cài</b> (mở bằng <b>Safari trên chính máy đó</b>): mở
     <a href="{IOS}">{IOS}</a> → bấm <b>Cài đặt VPNFlow</b> → <b>Cài đặt → Cài hồ sơ đã tải → Cài</b> →
     mở app, bấm <b>Connect</b> (lần đầu iOS hỏi cài “VPN configuration” thì bấm <b>Allow</b>).</p>
  <p>Nếu cần hỗ trợ, Quý khách chỉ cần trả lời chính thư này.</p>
  <p>Trân trọng,<br>Đội ngũ VPNFlow</p>
"""

EN = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow iOS 1.4.7 — new <b>Boost</b> section in Settings</h2>
  <p>Dear Customer,</p>
  <p>iOS <b>1.4.7</b> adds a feature for slow or unstable networks:</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
    <b>Bandwidth boost (N-tunnel)</b> — <b>Settings → Boost</b>. It opens <b>N parallel connections</b> to
    <b>the same exit node</b> and spreads the flows across them. Choose <b>N = 2 / 4 / 6 / 8</b>.<br>
    <b>Off by default</b> — turn it on only when your current network feels slow. On some networks a higher
    N is clearly faster; on others it may make no difference or be slower — then simply turn it back
    <b>off</b>. We make <b>no promise of a specific speed</b>: speed depends on your carrier and route.</p>
  <p><b>Also fixed:</b> the app no longer hangs at <b>“Disconnecting…”</b>, and Connect now responds
     faster (pre-measure capped at 3 s).</p>
  <p style="background:#fff7e6;border-left:4px solid #d99a00;padding:10px 12px;margin:12px 0">
     <b>Important:</b> this build still reports version <b>1.4.7</b>, so if your device already has an
     earlier 1.4.7 the app will <b>not</b> prompt an update. To get <b>Boost</b>, please reinstall from
     <a href="{IOS}">{IOS}</a></p>
  <p><b>How to install</b> (open in <b>Safari on the device</b>): open
     <a href="{IOS}">{IOS}</a> → tap <b>Install VPNFlow</b> → <b>Settings → Install downloaded profile → Install</b>
     → open the app and tap <b>Connect</b> (allow the “VPN configuration” prompt on first run).</p>
  <p>Need help? Just reply to this email.</p>
  <p>Best regards,<br>The VPNFlow team</p>
"""

ZH = f"""
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow iOS 1.4.7 —— 设置中新增<b>加速</b></h2>
  <p>尊敬的客户：</p>
  <p>iOS <b>1.4.7</b> 新增一项针对网络较慢或抖动的功能：</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
    <b>多通道提速（N tunnel）</b> —— 在 <b>设置 → 加速</b>。开启后会向<b>同一个出口节点</b>建立
    <b>N 条并行连接</b>，并把数据流分摊到这些通道。可选 <b>N = 2 / 4 / 6 / 8</b>。<br>
    <b>默认关闭</b> —— 只在当前网络较慢时开启。部分网络下 N 越大明显更快，另一部分网络可能没有差别
    甚至更慢；如无改善，<b>关闭即可</b>。我们<b>不承诺具体速度</b>，速度取决于运营商与当时线路。</p>
  <p><b>同时修复：</b>不再卡在 <b>“Disconnecting…”</b>；点击 Connect 后响应更快（测量步骤上限 3 秒）。</p>
  <p style="background:#fff7e6;border-left:4px solid #d99a00;padding:10px 12px;margin:12px 0">
     <b>重要：</b>本版本号仍为 <b>1.4.7</b>，若设备已安装过旧版 1.4.7，应用<b>不会</b>提示更新。
     要获得<b>加速</b>功能，请重新安装：<a href="{IOS}">{IOS}</a></p>
  <p><b>安装方法</b>（请在该设备的 <b>Safari</b> 中打开）：访问 <a href="{IOS}">{IOS}</a> →
     点击 <b>Install VPNFlow</b> → <b>设置 → 安装已下载的描述文件 → 安装</b> → 打开应用并点击
     <b>Connect</b>（首次会询问“VPN 配置”，选择允许）。</p>
  <p>如需帮助，直接回复本邮件即可。</p>
  <p>此致<br>VPNFlow 团队</p>
"""

HTML = f"""
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:640px;margin:0 auto">
{VI}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:26px 0">
{EN}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:26px 0">
{ZH}
</div>
"""


def send(to, subject, html):
    payload = json.dumps({"from": FROM, "to": [to], "subject": subject, "html": html}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, headers={
        "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
        "Accept": "application/json", "User-Agent": "VPNFlow-Mailer/1.0 (+https://meetflowai.site)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return bool(json.loads(res.read().decode()).get("id")), None
    except urllib.error.HTTPError as e:  # noqa: BLE001
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
