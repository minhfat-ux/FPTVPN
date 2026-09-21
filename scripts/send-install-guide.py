#!/usr/bin/env python3
"""Gửi lại HƯỚNG DẪN CÀI + LINK cho khách (3 ngôn ngữ Việt/Anh/Trung).

Dùng: send-install-guide.py <userId>        # 1 khách cụ thể
      send-install-guide.py --recent [N]    # N khách có thiết bị VPN mới nhất (mặc định 3)
      send-install-guide.py --email a@b.com # gửi thẳng 1 email
      thêm --test để chỉ gửi thử tới ALERT_EMAIL
"""
import json, os, re, sys, time, urllib.request, urllib.error

args = sys.argv[1:]
TEST = '--test' in args
args = [a for a in args if a != '--test']
mode = args[0] if args else '--recent'

conf = '/etc/systemd/system/flowvpn-cp.service.d'
env = {}
for name in os.listdir(conf):
    if not name.endswith('.conf'): continue
    for line in open(os.path.join(conf, name), encoding='utf-8', errors='replace'):
        line = line.strip()
        if line.startswith('Environment='):
            b = line[len('Environment='):].strip().strip('"')
            if '=' in b:
                k, v = b.split('=', 1); env[k.strip()] = v.strip().strip('"')
api_key = env.get('RESEND_API_KEY', ''); alert = env.get('ALERT_EMAIL', '')
if not api_key: raise SystemExit('KHONG co RESEND_API_KEY')

IOS = 'https://t1.meetflowai.site/install/ios'
AND = 'https://t1.meetflowai.site/v1/downloads/android'
SUBJECT = 'VPNFlow — hướng dẫn cài đặt / install guide / 安装指南'

def block(lang):
    if lang == 'vi':
        return f"""
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow — hướng dẫn cài đặt</h2>
  <p>Kính gửi Quý khách,</p>
  <p><b>Trên iPhone/iPad (mở bằng Safari trên chính máy đó):</b></p>
  <ol>
    <li>Mở <a href="{IOS}">{IOS}</a></li>
    <li>Bấm <b>Đăng ký thiết bị</b> → iOS báo “Hồ sơ đã tải về”.</li>
    <li>Vào <b>Cài đặt → Cài hồ sơ đã tải</b> → <b>Cài</b> → nhập mật khẩu máy (bước này gửi mã thiết bị về shop).</li>
    <li>Quay lại trang cài, bấm <b>Cài đặt VPNFlow</b> khi bản đã sẵn sàng, rồi mở app → đăng nhập bằng email đã mua → bấm <b>Allow</b> khi macOS/iOS hỏi cấu hình VPN → <b>Connect</b>.</li>
  </ol>
  <p><b>Trên Android:</b> tải APK tại <a href="{AND}">đây</a>, cho phép cài từ nguồn không xác định, mở app và đăng nhập.</p>
  <p><b>Quan trọng — Trust hồ sơ:</b> sau khi cài, vào <b>Settings → General → VPN &amp; Device Management</b> → bấm vào tên nhà phát triển → <b>Trust</b> → mở lại app. <b>Bản của shop KHÔNG cần bật Developer Mode.</b></p>
  <p><b>Nếu máy đòi Developer Mode:</b> nghĩa là đang cài bản nội bộ (không phải bản shop) → tải lại ở trang trên. Nếu mục <i>Developer Mode</i> bị ẩn: máy chưa từng nối máy tính có Xcode (mục này chỉ xuất hiện sau đó), hoặc máy do công ty quản lý (MDM) thì không thể bật — khi đó hãy dùng bản Ad Hoc của shop (không cần Developer Mode). Máy iOS 15 trở xuống không có mục này.</p>
  <p>Nếu bước nào chưa rõ, Quý khách trả lời email này hoặc gửi tới support@meetflowai.site — chúng tôi hỗ trợ ngay.</p>"""
    if lang == 'en':
        return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow — install guide</h3>
  <p>Dear customer,</p>
  <p><b>On iPhone/iPad (open in Safari on that device):</b></p>
  <ol>
    <li>Open <a href="{IOS}">{IOS}</a></li>
    <li>Tap <b>Register device</b> → iOS says “Profile downloaded”.</li>
    <li>Go to <b>Settings → Profile Downloaded → Install</b> and enter your passcode (this sends your device ID to us).</li>
    <li>Return to the install page and tap <b>Install VPNFlow</b> once the build is ready, then open the app → sign in with your purchase email → tap <b>Allow</b> for the VPN configuration → <b>Connect</b>.</li>
  </ol>
  <p><b>On Android:</b> download the APK <a href="{AND}">here</a>, allow installation from unknown sources, open the app and sign in.</p>
  <p>If anything is unclear, just reply to this email or write to support@meetflowai.site.</p>
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">Important — trust the profile (EN)</h3>
  <p>After installing, go to <b>Settings → General → VPN &amp; Device Management</b>, tap the developer name, then <b>Trust</b>, and open the app again. <b>The shop's build does NOT require Developer Mode.</b></p>
  <p>If iOS asks for Developer Mode, you are installing an internal build — please reinstall from the page above. If the <i>Developer Mode</i> entry is missing: it only appears after the device has been connected to a computer with Xcode, and it cannot be enabled on MDM-managed devices — in that case use the shop's Ad Hoc build (no Developer Mode needed). iOS 15 and older have no such entry at all.</p>"""
    return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow — 安装指南</h3>
  <p>尊敬的客户：</p>
  <p><b>iPhone/iPad（请在该设备的 Safari 中打开）：</b></p>
  <ol>
    <li>打开 <a href="{IOS}">{IOS}</a></li>
    <li>点 <b>注册设备</b> → 系统提示“描述文件已下载”。</li>
    <li>进入 <b>设置 → 已下载描述文件 → 安装</b>，输入设备密码（此步会把设备标识发送给商家）。</li>
    <li>回到安装页面，待版本就绪后点 <b>安装 VPNFlow</b>，打开应用 → 用购买邮箱登录 → 系统询问配置 VPN 时点 <b>Allow</b> → 点 <b>Connect</b>。</li>
  </ol>
  <p><b>Android：</b>在<a href="{AND}">此下载 APK</a>，允许未知来源安装，打开应用并登录。</p>
  <p>如有疑问请直接回复本邮件或联系 support@meetflowai.site。</p>
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">重要 — 请信任描述文件（中文）</h3>
  <p>安装后请进入 <b>设置 → 通用 → VPN 与设备管理</b>，点击开发者名称并选择 <b>信任</b>，然后重新打开应用。<b>本店的版本不需要开启开发者模式。</b></p>
  <p>如果系统要求“开发者模式”，说明安装的是内部版本，请从上面的页面重新安装。若设置中<b>找不到</b>“开发者模式”：该选项只有在设备连接过装有 Xcode 的电脑后才会出现；若设备由公司 MDM 管理则无法开启——此时请使用本店的 Ad Hoc 版本（无需开发者模式）。iOS 15 及更早版本没有此项。</p>"""

HTML = ('<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;line-height:1.6;'
        'color:#12202f;max-width:640px">' + block('vi') + block('en') + block('zh') + '</div>')

def send(to):
    payload = json.dumps({'from': 'VPNFlow <support@meetflowai.site>', 'to': [to], 'subject': SUBJECT, 'html': HTML}).encode()
    req = urllib.request.Request('https://api.resend.com/emails', data=payload,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'VPNFlow-Mailer/1.0 (+https://meetflowai.site)'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return bool(json.loads(r.read().decode()).get('id')), None
    except urllib.error.HTTPError as e: return False, f'HTTP {e.code}: {e.read().decode()[:140]}'
    except Exception as e: return False, str(e)[:140]

auth = json.load(open('/root/flowvpn-cp/data/auth.json', encoding='utf-8'))
users = auth.get('users') or {}
pairs = list(users.items()) if isinstance(users, dict) else [(str(v.get('id', i)), v) for i, v in enumerate(users)]
email_by_uid = {str(k): str(v.get('email', '')).lower() for k, v in pairs}
all_emails = sorted({e for e in email_by_uid.values() if '@' in e and not e.endswith(('example.com','test.com'))})

targets = []
if mode.startswith('--email'):
    targets = [args[1].lower()]
elif mode == '--recent':
    n = int(args[1]) if len(args) > 1 else 3
    dev = json.load(open('/root/flowvpn-cp/data/devices.json', encoding='utf-8'))
    rows = [r for r in (dev.values() if isinstance(dev, dict) else dev) if isinstance(r, dict)]
    rows.sort(key=lambda r: str(r.get('createdAt','')), reverse=True)
    for r in rows:
        e = email_by_uid.get(str(r.get('userId')))
        if e and e not in targets: targets.append(e)
        if len(targets) >= n: break
elif mode == '--all':
    targets = all_emails
else:
    e = email_by_uid.get(mode)
    if e: targets = [e]
print('nguoi nhan:', targets or '(khong tim thay)')
if not targets: raise SystemExit(0)
if alert:
    ok, err = send(alert); print(f'   test toi {alert}: {"OK" if ok else "LOI " + str(err)}')
    if TEST: raise SystemExit('che do --test: chi gui thu')
sent = failed = 0
for t in targets:
    ok, err = send(t)
    if ok: sent += 1
    else: failed += 1; print('   loi:', t, err)
    time.sleep(0.7)
print(f'ket qua: {sent}/{len(targets)} thanh cong, {failed} loi')
