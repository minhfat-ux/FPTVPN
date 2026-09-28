#!/usr/bin/env python3
"""Email ĐÍNH CHÍNH kênh macOS (26/09/2026): bản 1.4.6 (và bản 1.4.0 trước đó) KHÔNG MỞ ĐƯỢC.

Vì sao: profile Developer ID của Apple thiếu quyền `packet-tunnel-provider` ⇒ AMFI chặn tiến trình
⇒ hộp thoại `The application "VPNFlow" can't be opened.` Đang sửa ở phía Apple (bật Packet Tunnel
cho Network Extensions) rồi phát bản mới. KHÔNG khuyên khách tải lại bản hiện có (không giải quyết được).

Dùng: python3 send-mac-correction-2026-09-26.py [--test]
Người nhận: user có thiết bị platform=macos (devices.json → auth.json). Chạy trên node-2.
"""
import json, os, sys, time, urllib.request, urllib.error

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

SUBJECT = 'VPNFlow macOS: bản cập nhật đang lỗi — chúng tôi đang sửa / faulty macOS update / macOS 更新故障'
SUPPORT = 'support@meetflowai.site'


def block(lang):
    if lang == 'vi':
        return f"""
  <h2 style="color:#b3261e;margin:0 0 12px">Xin lỗi — bản cập nhật macOS đang lỗi, chúng tôi đang sửa</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Bản VPNFlow cho macOS mà chúng tôi vừa thông báo có <b>lỗi ở gói ký của Apple</b>: khi mở ứng dụng,
  macOS báo <i>“The application "VPNFlow" can't be opened.”</i> Bản macOS trước đó cũng mắc cùng lỗi này.</p>
  <p><b>Quý khách vui lòng KHÔNG cài lại bản hiện có</b> — tải lại cũng không mở được, chỉ mất thời gian.
  Chúng tôi đã xác định đúng nguyên nhân (thiếu một quyền hệ thống trong chứng chỉ do Apple cấp) và
  <b>đang xử lý với Apple</b>. Ngay khi có bản macOS mở được, chúng tôi sẽ gửi email kèm link tải mới.</p>
  <p>Trong lúc chờ, Quý khách vẫn dùng VPNFlow bình thường trên <b>iPhone / iPad / Android / Windows</b>. <i>Nếu Quý khách không dùng macOS, xin bỏ qua email này.</i></p>
  <p>Chúng tôi thành thật xin lỗi vì sự bất tiện này. Mọi thắc mắc: <a href="mailto:{SUPPORT}">{SUPPORT}</a></p>"""
    if lang == 'en':
        return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#b3261e;margin:0 0 12px">Apologies — the macOS update is faulty, we are fixing it</h3>
  <p>Dear customer,</p>
  <p>The macOS build we just announced has a <b>defect in Apple's signing package</b>: opening the app shows
  <i>“The application "VPNFlow" can't be opened.”</i> The previous macOS build has the same defect.</p>
  <p><b>Please do NOT reinstall the current build</b> — re-downloading will not help. We have identified the
  exact cause (a missing system entitlement in the certificate profile issued by Apple) and are
  <b>working with Apple</b>. As soon as a working macOS build is ready we will email you the new download link.</p>
  <p>Meanwhile VPNFlow keeps working normally on <b>iPhone / iPad / Android / Windows</b>. <i>If you do not use macOS, please ignore this email.</i></p>
  <p>We sincerely apologise for the inconvenience. Questions: <a href="mailto:{SUPPORT}">{SUPPORT}</a></p>"""
    return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#b3261e;margin:0 0 12px">抱歉 — macOS 更新存在故障，我们正在修复</h3>
  <p>尊敬的客户：</p>
  <p>我们刚刚通知的 macOS 版本存在 <b>Apple 签名包缺陷</b>：打开应用时系统提示
  <i>“The application "VPNFlow" can't be opened.”</i>，此前的 macOS 版本也存在同样问题。</p>
  <p><b>请勿重新安装当前版本</b>，重新下载也无法打开。我们已确认根因（Apple 签发的证书描述文件缺少一项系统权限），
  正在 <b>与 Apple 处理</b>。修复版 macOS 准备好后，我们会立即邮件发送新的下载链接。</p>
  <p>在此期间，VPNFlow 在 <b>iPhone / iPad / Android / Windows</b> 上仍可正常使用。<i>如果您不使用 macOS，请忽略此邮件。</i></p>
  <p>给您带来不便，我们深表歉意。如有问题请联系：<a href="mailto:{SUPPORT}">{SUPPORT}</a></p>"""


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


dev = json.load(open('/root/flowvpn-cp/data/devices.json', encoding='utf-8'))
rows = list(dev.values()) if isinstance(dev, dict) else dev
mac_uids = {str(r.get('userId')) for r in rows
            if str(r.get('platform', '')).lower().startswith('mac') and r.get('userId')}
auth = json.load(open('/root/flowvpn-cp/data/auth.json', encoding='utf-8'))
users = auth.get('users') or {}
pairs = list(users.items()) if isinstance(users, dict) else [(str(v.get('id', i)), v) for i, v in enumerate(users)]
targets = sorted({str(v.get('email', '')).lower() for k, v in pairs
                  if (str(k) in mac_uids or str(v.get('id', '')) in mac_uids)
                  and '@' in str(v.get('email', ''))})
targets = [e for e in targets if not e.endswith(('example.com', 'test.com', 'localhost'))]
if '--all' in sys.argv:   # gửi cho TOÀN BỘ khách — đúng nhóm đã nhận email thông báo macOS sai
    all_mails = {str(v.get('email', '')).lower() for _, v in pairs if '@' in str(v.get('email', ''))}
    all_mails = {e for e in all_mails if not e.endswith(('example.com', 'test.com', 'localhost'))}
    print(f'che do --all: {len(all_mails)} email trong he thong')
    targets = sorted(all_mails)
print(f'nguoi nhan: {len(targets)}')

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
    if ok:
        sent += 1
    else:
        failed += 1; first = first or err
    time.sleep(0.7)
print(f'ket qua: {sent}/{len(targets)} thanh cong, {failed} loi')
if first:
    print('loi dau tien:', first)
