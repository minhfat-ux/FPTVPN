import json, os, re, sys, time, urllib.request, urllib.error
VERSION, TEST = sys.argv[1], sys.argv[2]

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
    raise SystemExit('   KHONG co RESEND_API_KEY trong env CP')
frm = 'VPNFlow <support@meetflowai.site>'

IOS = 'https://t1.meetflowai.site/install/ios'
AND = 'https://t1.meetflowai.site/v1/downloads/android'
BUY = 'https://t1.meetflowai.site/buy'
SUBJECT = f'VPNFlow {VERSION} — iOS & Android / 更新通知 / New release'

def block(lang):
    if lang == 'vi':
        return f"""
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow {VERSION} — bản cập nhật cho iOS &amp; Android</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow {VERSION}</b> cho cả iPhone/iPad và Android.</p>
  <ul>
    <li><b>iOS:</b> sửa lỗi “đã kết nối nhưng không có mạng” không tự phục hồi (nay tự kiểm tra sống/chết mỗi 10 giây), sửa lỗi phải <i>thoát hẳn ứng dụng</i> mới kết nối lại được, và tối ưu luồng dữ liệu qua relay.</li>
    <li><b>Android:</b> sửa việc khai báo băng thông sai khiến tốc độ bị giới hạn (~12 Mbps) trên Wi-Fi — nay khai đúng theo loại mạng, tốc độ tăng rõ rệt.</li>
  </ul>
  <p><b>Cách cập nhật:</b> iOS mở <a href="{IOS}">trang cài đặt</a> bằng Safari trên chính máy đó; Android tải APK tại <a href="{AND}">đây</a> (hoặc vào <a href="{BUY}">trang mua</a>). Cài đè, không cần gỡ bản cũ.</p>
  <p>Cảm ơn Quý khách đã đồng hành cùng VPNFlow. Hỗ trợ: support@meetflowai.site</p>"""
    if lang == 'en':
        return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow {VERSION} — update for iOS &amp; Android</h3>
  <p>Dear customer,</p>
  <p>We have released <b>VPNFlow {VERSION}</b> for iPhone/iPad and Android.</p>
  <ul>
    <li><b>iOS:</b> fixed “connected but no internet” that would not recover on its own (liveness check every 10 seconds), fixed having to force-quit the app before reconnecting, and improved data flow through the relay.</li>
    <li><b>Android:</b> fixed a wrong bandwidth declaration that capped speed (~12 Mbps) on Wi-Fi — bandwidth is now declared per network type, with a clear speed improvement.</li>
  </ul>
  <p><b>How to update:</b> on iOS open the <a href="{IOS}">install page</a> in Safari on the same device; on Android download the APK <a href="{AND}">here</a> (or visit the <a href="{BUY}">buy page</a>). Install over the old version — no uninstall needed.</p>
  <p>Thank you for using VPNFlow. Support: support@meetflowai.site</p>"""
    return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow {VERSION} — iOS 与 Android 更新</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 <b>VPNFlow {VERSION}</b>，适用于 iPhone/iPad 与 Android。</p>
  <ul>
    <li><b>iOS：</b>修复“已连接但没有网络”且无法自动恢复的问题（现在每 10 秒自检连接状态）；修复必须强制退出应用后才能重新连接的问题；优化中继数据传输。</li>
    <li><b>Android：</b>修复带宽声明错误导致 Wi-Fi 下速度被限制（约 12 Mbps）的问题——现在按网络类型正确声明，速度明显提升。</li>
  </ul>
  <p><b>更新方法：</b>iOS 请在同一台设备的 Safari 打开<a href="{IOS}">安装页面</a>；Android 在<a href="{AND}">此下载 APK</a>（或访问<a href="{BUY}">购买页面</a>）。直接覆盖安装，无需卸载旧版本。</p>
  <p>感谢您使用 VPNFlow。支持邮箱：support@meetflowai.site</p>"""

HTML = ('<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;line-height:1.6;'
        'color:#12202f;max-width:640px">' + block('vi') + block('en') + block('zh') + '</div>')

def send(to, subject, html):
    payload = json.dumps({'from': frm, 'to': [to], 'subject': subject, 'html': html}).encode()
    req = urllib.request.Request('https://api.resend.com/emails', data=payload,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json',
                 'Accept': 'application/json', 'User-Agent': 'VPNFlow-Mailer/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return bool(json.loads(r.read().decode()).get('id')), None
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}: {e.read().decode()[:160]}'
    except Exception as e:
        return False, str(e)[:160]

if alert:
    ok, err = send(alert, '[TEST] ' + SUBJECT, HTML)
    print(f'   test toi {alert}: {"OK" if ok else "LOI " + str(err)}')
    if not ok:
        raise SystemExit('   dung lai: gui thu that bai')
    if TEST:
        raise SystemExit('   che do --test: chi gui thu, khong gui cho user')

raw = open('/root/flowvpn-cp/data/auth.json', encoding='utf-8', errors='replace').read()
emails = sorted({m.group(1).lower() for m in re.finditer(r'"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"', raw)})
sent = failed = 0; first_err = None
for a in emails:
    ok, err = send(a, SUBJECT, HTML)
    if ok: sent += 1
    else:
        failed += 1; first_err = first_err or err
    time.sleep(0.7)
print(f'   ket qua: {sent}/{len(emails)} thanh cong, {failed} loi')
if first_err: print(f'   loi dau tien: {first_err}')
