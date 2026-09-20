#!/usr/bin/env python3
"""Gửi email thông báo bản macOS mới (đã Apple ký + notarize) cho ĐÚNG khách dùng Mac.

Dùng: python3 send-mac-announcement.py <version> [--test]
Lọc người nhận: user có thiết bị platform=macos trong devices.json → email trong auth.json.
Chạy trên node-2 (có RESEND_API_KEY + data). Không in secret.
"""
import json, os, re, sys, time, urllib.request, urllib.error

VERSION = sys.argv[1] if len(sys.argv) > 1 else '1.3.3'
TEST = '--test' in sys.argv

conf_dir = '/etc/systemd/system/flowvpn-cp.service.d'
env = {}
for name in os.listdir(conf_dir):
    if not name.endswith('.conf'):
        continue
    for line in open(os.path.join(conf_dir, name), encoding='utf-8', errors='replace'):
        line = line.strip()
        if line.startswith('Environment='):
            body = line[len('Environment='):].strip().strip('"')
            if '=' in body:
                k, v = body.split('=', 1)
                env[k.strip()] = v.strip().strip('"')
api_key = env.get('RESEND_API_KEY', '')
alert = env.get('ALERT_EMAIL', '')
if not api_key:
    raise SystemExit('KHONG co RESEND_API_KEY')

DL = 'https://t1.meetflowai.site/v1/downloads/mac'
PAGE = 'https://t1.meetflowai.site/install/mac'
BUY = 'https://t1.meetflowai.site/buy'
SUBJECT = f'VPNFlow {VERSION} cho macOS — đã ký & notarize, mở là chạy / macOS update / macOS 更新'

def block(lang):
    if lang == 'vi':
        return f"""
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow {VERSION} cho macOS — đã được Apple ký &amp; notarize</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Bản macOS mới đã được <b>Apple ký và notarize</b>, nên Quý khách <b>không còn gặp cảnh báo</b> “Apple không thể xác minh…” như trước.</p>
  <p><b>Cách cập nhật (1 phút):</b> tải bản mới tại <a href="{DL}">đây</a>, mở tệp .dmg, <b>kéo VPNFlow vào thư mục Applications</b>, rồi mở ứng dụng. Lần đầu chạy, macOS hỏi cấu hình VPN → bấm <b>Allow</b> → đăng nhập bằng email đã mua → <b>Connect</b>.</p>
  <p>Không cần gỡ bản cũ. Nếu trước đây Quý khách từng phải “chuột phải → Open” hoặc dùng Terminal để mở app, nay không cần nữa.</p>
  <p>Cảm ơn Quý khách đã đồng hành cùng VPNFlow. Hỗ trợ: support@meetflowai.site</p>"""
    if lang == 'en':
        return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow {VERSION} for macOS — signed &amp; notarized by Apple</h3>
  <p>Dear customer,</p>
  <p>The new macOS build is now <b>signed and notarized by Apple</b>, so the “Apple cannot verify…” warning is gone.</p>
  <p><b>How to update (1 minute):</b> download it <a href="{DL}">here</a>, open the .dmg, <b>drag VPNFlow into Applications</b>, then open the app. On first launch macOS asks to allow the VPN configuration — click <b>Allow</b>, sign in with your purchase email, then click <b>Connect</b>.</p>
  <p>No need to uninstall the old version. If you previously had to right-click → Open or use a Terminal command, that is no longer needed.</p>
  <p>Thank you for using VPNFlow. Support: support@meetflowai.site</p>"""
    return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow {VERSION} macOS 版本 — 已由 Apple 签名并公证</h3>
  <p>尊敬的客户：</p>
  <p>新版 macOS 已<b>由 Apple 签名并公证</b>，不再出现“Apple 无法验证…”的提示。</p>
  <p><b>更新方法（1 分钟）：</b>在<a href="{DL}">此下载</a>，打开 .dmg，<b>将 VPNFlow 拖入 Applications</b>，然后打开应用。首次运行时 macOS 会询问是否允许配置 VPN → 点 <b>Allow</b> → 用购买邮箱登录 → 点 <b>Connect</b>。</p>
  <p>无需卸载旧版本。此前若需要“右键 → 打开”或使用终端命令，现在都不再需要。</p>
  <p>感谢您使用 VPNFlow。支持邮箱：support@meetflowai.site</p>"""

HTML = ('<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;line-height:1.6;'
        'color:#12202f;max-width:640px">' + block('vi') + block('en') + block('zh') + '</div>')

def send(to):
    payload = json.dumps({'from': 'VPNFlow <support@meetflowai.site>', 'to': [to],
                          'subject': SUBJECT, 'html': HTML}).encode()
    req = urllib.request.Request('https://api.resend.com/emails', data=payload,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json',
                 'Accept': 'application/json', 'User-Agent': 'VPNFlow-Mailer/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return bool(json.loads(r.read().decode()).get('id')), None
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}: {e.read().decode()[:140]}'
    except Exception as e:
        return False, str(e)[:140]

# --- chọn người nhận: chỉ user có thiết bị macOS ---
dev = json.load(open('/root/flowvpn-cp/data/devices.json', encoding='utf-8'))
rows = list(dev.values()) if isinstance(dev, dict) else dev
mac_uids = {str(r.get('userId')) for r in rows
            if str(r.get('platform', '')).lower().startswith('mac')
            and r.get('active') and r.get('userId')}
auth = json.load(open('/root/flowvpn-cp/data/auth.json', encoding='utf-8'))
users = auth.get('users') or {}
pairs = list(users.items()) if isinstance(users, dict) else [(str(v.get('id', i)), v) for i, v in enumerate(users)]
targets = sorted({str(v.get('email', '')).lower() for k, v in pairs
                  if (str(k) in mac_uids or str(v.get('id', '')) in mac_uids)
                  and '@' in str(v.get('email', ''))})
targets = [e for e in targets if not e.endswith(('example.com', 'test.com', 'localhost'))]
if '--all' in sys.argv:   # gửi cho TOÀN BỘ khách (không chỉ khách Mac)
    all_mails = {str(v.get('email', '')).lower() for _, v in pairs if '@' in str(v.get('email', ''))}
    all_mails = {e for e in all_mails if not e.endswith(('example.com', 'test.com', 'localhost'))}
    print(f'che do --all: {len(all_mails)} email trong he thong')
    targets = sorted(all_mails)
print(f'nguoi nhan (khach dung Mac): {len(targets)}')

if alert:
    ok, err = send(alert)
    print(f'   test toi {alert}: {"OK" if ok else "LOI " + str(err)}')
    if not ok:
        raise SystemExit('dung lai: gui thu that bai')
    if TEST:
        raise SystemExit('che do --test: chi gui thu, khong gui cho khach')

sent = failed = 0; first = None
for a in targets:
    ok, err = send(a)
    if ok: sent += 1
    else:
        failed += 1; first = first or err
    time.sleep(0.7)
print(f'ket qua: {sent}/{len(targets)} thanh cong, {failed} loi')
if first: print('loi dau tien:', first)
