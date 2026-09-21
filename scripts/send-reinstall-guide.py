#!/usr/bin/env python3
"""Gửi email cho khách CHƯA TẢI ĐƯỢC / CHƯA CHẠY ĐƯỢC: hướng dẫn cụ thể tải bản mới 1.4.0
(bản Ad Hoc của shop KHÔNG cần Developer Mode).

Chạy trên node-2 (đọc dữ liệu thật ở /root/flowvpn-cp/data):
  send-reinstall-guide.py --stuck            # chỉ LIỆT KÊ khách bị tắc (không gửi)
  send-reinstall-guide.py --all-stuck        # gửi cho toàn bộ danh sách đó
  send-reinstall-guide.py --email a@b.com    # gửi 1 email cụ thể
  thêm --test                                # chỉ gửi thử tới ALERT_EMAIL

Cách xác định "bị tắc" (bằng chứng từ dữ liệu, không đoán):
  - Có gói còn hạn nhưng KHÔNG có device nào  -> app chưa từng đăng ký/chạy được.
  - Có device nhưng lastSeenAt = None         -> app chạy nhưng chưa từng kết nối được.
Khách đã từng kết nối (lastSeenAt có giá trị) KHÔNG nằm trong danh sách.
"""
import json, os, sys, time, urllib.request, urllib.error

args = sys.argv[1:]
TEST = '--test' in args
args = [a for a in args if a != '--test']
mode = args[0] if args else '--stuck'

conf = '/etc/systemd/system/flowvpn-cp.service.d'
env = {}
for name in os.listdir(conf):
    if not name.endswith('.conf'):
        continue
    for line in open(os.path.join(conf, name), encoding='utf-8', errors='replace'):
        line = line.strip()
        if line.startswith('Environment='):
            b = line[len('Environment='):].strip().strip('"')
            if '=' in b:
                k, v = b.split('=', 1)
                env[k.strip()] = v.strip().strip('"')
api_key = env.get('RESEND_API_KEY', '')
alert = env.get('ALERT_EMAIL', '')
if not api_key:
    raise SystemExit('KHONG co RESEND_API_KEY')

# Link đã kiểm chứng (HTTP 200 + đúng kích thước/phiên bản ở thời điểm gửi)
IOS = 'https://t1.meetflowai.site/install/ios'
AND = 'https://t1.meetflowai.site/v1/downloads/android'
MAC = 'https://t1.meetflowai.site/v1/downloads/mac'
WIN = 'https://t1.meetflowai.site/dl/VPNFlow-Setup-latest.exe'
SUBJECT = 'VPNFlow 1.4.0 — bản mới không cần Developer Mode / new build, no Developer Mode / 新版本无需开发者模式'


def vi(email):
    return f"""
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow — cài lại bản mới 1.4.0 (không cần Developer Mode)</h2>
  <p>Kính gửi Quý khách ({email}),</p>
  <p>Hệ thống ghi nhận tài khoản của Quý khách <b>chưa kết nối được ổn định</b> (một số máy chỉ lên được một lần rồi không lên lại). Dưới đây là hướng dẫn cụ
  thể theo từng loại máy. <b>Bản mới 1.4.0 của shop là bản Ad Hoc — KHÔNG cần bật Developer Mode.</b></p>
  <p><b>Trước khi cài: xoá app VPNFlow cũ trên máy</b> (nhấn giữ icon → Xoá app) rồi làm theo mục đúng với máy của Quý khách.</p>

  <h3 style="margin:16px 0 6px">1) iPhone / iPad</h3>
  <ol style="margin:0 0 8px 20px">
    <li><b>Mở Safari trên chính chiếc iPhone/iPad đó</b> (không dùng Chrome/WeChat) và vào:
        <a href="{IOS}">{IOS}</a></li>
    <li>Bấm <b>Đăng ký thiết bị</b> → máy báo “Hồ sơ đã tải về”.</li>
    <li>Vào <b>Cài đặt → Cài hồ sơ đã tải</b> (góc trên) → <b>Cài</b> → nhập mật khẩu máy. Bước này gửi mã
        thiết bị về shop để đưa máy Quý khách vào bản cài.</li>
    <li>Đợi trang báo bản đã sẵn sàng (thường trong vài giờ, muộn nhất 24 giờ) → bấm <b>Cài đặt VPNFlow</b>.</li>
    <li>Sau khi cài: <b>Cài đặt → Cài đặt chung → VPN &amp; Quản lý thiết bị</b> → bấm tên
        <b>VPNFlow AdHoc App</b> → <b>Tin cậy (Trust)</b>.</li>
    <li>Mở app → đăng nhập bằng email đã mua → bấm <b>Allow</b> khi máy hỏi cấu hình VPN → <b>Connect</b>.</li>
  </ol>
  <p><b>Nếu máy đòi Developer Mode</b> thì Quý khách đang mở bản nội bộ cũ — xoá app và cài lại theo đúng
  6 bước trên (bản của shop không cần mục này).</p>

  <h3 style="margin:16px 0 6px">2) Android</h3>
  <ol style="margin:0 0 8px 20px">
    <li>Tải APK 1.4.0: <a href="{AND}">{AND}</a> (khoảng 97 MB).</li>
    <li>Nếu máy hỏi, bật <b>Cho phép cài từ nguồn không xác định</b> cho trình duyệt đang tải.</li>
    <li>Mở file vừa tải → <b>Cài đặt</b> → mở app → đăng nhập email đã mua → <b>Connect</b>.</li>
    <li>Nếu đang có bản cũ: <b>gỡ bản cũ trước</b> rồi cài lại. Bản mới đã sửa lỗi “kết nối hoài không lên”.</li>
  </ol>

  <h3 style="margin:16px 0 6px">3) Windows</h3>
  <ol style="margin:0 0 8px 20px">
    <li>Tải bản mới: <a href="{WIN}">{WIN}</a> (khoảng 53 MB).</li>
    <li>Cài đặt → mở VPNFlow → đăng nhập email đã mua → <b>Connect</b>.</li>
  </ol>

  <h3 style="margin:16px 0 6px">4) macOS</h3>
  <ol style="margin:0 0 8px 20px">
    <li>Tải <a href="{MAC}">{MAC}</a> (khoảng 22 MB, đã ký và notarize nên macOS không chặn).</li>
    <li>Mở file .dmg → kéo <b>VPNFlow</b> vào <b>Applications</b>. Nếu macOS vẫn báo lạ, mở Terminal và chạy:
        <code>xattr -dr com.apple.quarantine /Applications/VPNFlow.app</code> rồi mở lại app.</li>
    <li>Đăng nhập email đã mua → bấm <b>Allow</b> khi macOS hỏi cấu hình VPN → <b>Connect</b>.</li>
  </ol>

  <h3 style="margin:16px 0 6px">Lưu ý cho khách ở Trung Quốc</h3>
  <p>Hãy dùng đúng các link <b>t1.meetflowai.site</b> ở trên (tên miền <i>meetflowai.site</i> có thể bị chặn).
  Nên tải bằng <b>trình duyệt Chrome/Safari</b> thay vì mở trong WeChat, và nếu tải bị đứt giữa đường thì
  bấm tải lại — máy chủ hỗ trợ tải tiếp, không phải tải lại từ đầu.</p>

  <p><b>Nếu vẫn chưa được:</b> Quý khách trả lời email này kèm <b>ảnh chụp màn hình thông báo lỗi</b>,
  <b>loại máy + phiên bản hệ điều hành</b> (ví dụ iPhone 14, iOS 18.6 / Xiaomi Android 12) — chúng tôi sẽ
  xử lý trực tiếp cho Quý khách. Hỗ trợ: <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""


def en(email):
    return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow — reinstall build 1.4.0 (no Developer Mode needed)</h3>
  <p>Dear customer ({email}),</p>
  <p>Our system shows your account <b>has not been able to connect reliably</b> (some devices connected once and then stopped working). Please follow the section for
  your device. <b>Our 1.4.0 build is an Ad Hoc build — it does NOT require Developer Mode.</b>
  Before installing, delete the old VPNFlow app, then follow the steps below.</p>
  <p><b>iPhone/iPad (open in Safari on that device, not Chrome/WeChat):</b>
  <a href="{IOS}">{IOS}</a> → tap <b>Register device</b> → <b>Settings → Profile Downloaded → Install</b> →
  once the page says the build is ready, tap <b>Install VPNFlow</b> → then
  <b>Settings → General → VPN &amp; Device Management</b> → tap <b>VPNFlow AdHoc App</b> → <b>Trust</b> →
  open the app, sign in, tap <b>Allow</b>, then <b>Connect</b>.</p>
  <p><b>Android:</b> download the APK at <a href="{AND}">{AND}</a> (~97 MB), allow installation from
  unknown sources, uninstall the old version first if present, open the app and sign in.</p>
  <p><b>Windows:</b> <a href="{WIN}">{WIN}</a> (~53 MB) → install → sign in → Connect.<br>
  <b>macOS:</b> <a href="{MAC}">{MAC}</a> (~22 MB, signed and notarized) → drag VPNFlow to Applications,
  then sign in → Allow → Connect.</p>
  <p><b>Customers in China:</b> use the <b>t1.meetflowai.site</b> links above (the plain
  <i>meetflowai.site</i> host may be blocked), download in Chrome/Safari rather than inside WeChat, and if a
  download breaks just resume/restart it — our server supports resuming.</p>
  <p><b>Still stuck?</b> Reply to this email with a <b>screenshot of the error</b> and your
  <b>device model + OS version</b> and we will fix it with you directly.
  Support: <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""


def zh(email):
    return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 12px">VPNFlow — 重新安装 1.4.0 版本（无需开发者模式）</h3>
  <p>尊敬的客户（{email}）：</p>
  <p>系统显示您的账号<b>一直无法稳定连接</b>（有些设备只成功过一次，之后就无法再连接）。请按下面与您设备对应的步骤操作。
  <b>本店的 1.4.0 版本为 Ad Hoc 版本，不需要开启开发者模式。</b>安装前请先删除旧的 VPNFlow 应用。</p>
  <p><b>iPhone/iPad（请在该设备的 Safari 中打开，不要用 Chrome/微信）：</b>
  <a href="{IOS}">{IOS}</a> → 点 <b>注册设备</b> → <b>设置 → 已下载描述文件 → 安装</b> →
  页面提示版本就绪后点 <b>安装 VPNFlow</b> → 再进入 <b>设置 → 通用 → VPN 与设备管理</b> →
  点 <b>VPNFlow AdHoc App</b> → <b>信任</b> → 打开应用登录 → 点 <b>Allow</b> → 点 <b>Connect</b>。</p>
  <p><b>Android：</b>下载 APK <a href="{AND}">{AND}</a>（约 97 MB），允许未知来源安装；
  如已装旧版请先卸载。新版本已修复“一直连接不上”的问题。</p>
  <p><b>Windows：</b><a href="{WIN}">{WIN}</a>（约 53 MB）。<br>
  <b>macOS：</b><a href="{MAC}">{MAC}</a>（约 22 MB，已签名并公证）。</p>
  <p><b>中国大陆客户：</b>请使用上面的 <b>t1.meetflowai.site</b> 链接（<i>meetflowai.site</i> 可能被墙），
  建议用 Chrome/Safari 下载而不是在微信内打开；如下载中断请重新点击下载，服务器支持断点续传。</p>
  <p><b>仍未成功？</b>请回复本邮件并附上<b>报错截图</b>和<b>设备型号 + 系统版本</b>，我们会直接为您处理。
  支持邮箱：<a href="mailto:support@meetflowai.site">support@meetflowai.site</a>。</p>"""


def build_html(email):
    return ('<div style="font-family:-apple-system,\'Segoe UI\',Roboto,Arial,sans-serif;line-height:1.6;'
            'color:#12202f;max-width:640px">' + vi(email) + en(email) + zh(email) + '</div>')


def send(to, email_for_body):
    payload = json.dumps({'from': 'VPNFlow <support@meetflowai.site>', 'to': [to],
                          'subject': SUBJECT, 'html': build_html(email_for_body)}).encode()
    req = urllib.request.Request('https://api.resend.com/emails', data=payload,
                                 headers={'Authorization': f'Bearer {api_key}',
                                          'Content-Type': 'application/json',
                                          'Accept': 'application/json',
                                          'User-Agent': 'VPNFlow-Mailer/1.0 (+https://meetflowai.site)'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return bool(json.loads(r.read().decode()).get('id')), None
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}: {e.read().decode()[:140]}'
    except Exception as e:
        return False, str(e)[:140]


# ---------- xác định khách bị tắc từ dữ liệu thật ----------
data = '/root/flowvpn-cp/data'
auth = json.load(open(f'{data}/auth.json', encoding='utf-8'))
dev = json.load(open(f'{data}/devices.json', encoding='utf-8'))
rows = dev if isinstance(dev, list) else list(dev.values())
uid_email = {str(u.get('id')): str(u.get('email', '')).lower() for u in auth['users'] if isinstance(u, dict)}
subs = auth.get('subscriptions') or {}
if isinstance(subs, dict):
    subs = list(subs.values())
paid = {str(s.get('userId')) for s in subs if isinstance(s, dict) and (s.get('expiresAt') or s.get('currentPeriodEnd'))}
skip = {'test@example.com', 'review@meetflowai.site', 'support@meetflowai.site',
        'no-reply@meetflowai.site', 'minhnb2@me.com', 'minhnb2@fpt.com'}

by_user = {}
for d in rows:
    if d.get('userId'):
        by_user.setdefault(str(d['userId']), []).append(d)

stuck = []          # (email, lý do, nền tảng gợi ý)
for uid, ds in by_user.items():
    e = uid_email.get(uid, '')
    if not e or e in skip:
        continue
    seen = [d for d in ds if d.get('lastSeenAt')]
    if not seen:
        plat = str(ds[0].get('platform') or '')
        stuck.append((e, 'đã đăng ký thiết bị nhưng CHƯA từng kết nối', plat))
for uid, e in uid_email.items():
    if not e or e in skip or uid in by_user or uid not in paid:
        continue
    stuck.append((e, 'có gói còn hạn nhưng CHƯA có thiết bị nào', ''))
stuck.sort(key=lambda r: r[0])

if mode == '--stuck':
    print(f'khach bi tac: {len(stuck)}')
    for e, why, plat in stuck:
        print(f'  {e:30} | {plat or "-":8} | {why}')
    raise SystemExit(0)

if mode == '--all-stuck':
    targets = stuck
elif mode == '--email':
    targets = [(x.strip().lower(), 'chỉ định', '') for x in args[1].split(',') if x.strip()]
else:
    raise SystemExit(__doc__)

print('nguoi nhan:', [t[0] for t in targets] or '(khong co)')
if not targets:
    raise SystemExit(0)
if alert:
    ok, err = send(alert, alert)
    print(f'   test toi {alert}: {"OK" if ok else "LOI " + str(err)}')
    if TEST:
        raise SystemExit('che do --test: chi gui thu')

sent = failed = 0
for e, why, plat in targets:
    ok, err = send(e, e)
    if ok:
        sent += 1
        print(f'   OK  {e} ({why})')
    else:
        failed += 1
        print(f'   LOI {e}: {err}')
    time.sleep(0.7)
print(f'ket qua: {sent}/{len(targets)} thanh cong, {failed} loi')
