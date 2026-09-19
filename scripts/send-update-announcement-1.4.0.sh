#!/usr/bin/env bash
# Gui email thong bao phat hanh VPNFlow 1.4.0 cho Windows cho TAT CA user tren he thong.
#   scripts/send-update-announcement-1.4.0.sh            # CHAY THU (khong gui)
#   scripts/send-update-announcement-1.4.0.sh --send     # gui that
# KHONG in token / API key. Van phong formal, de hieu, 3 ngon ngu (vi/en/zh).
set -euo pipefail
JUMP="root@103.173.155.50"
NODE2="root@165.101.114.162"
MODE="${1:-dry}"

ssh -o BatchMode=yes -J "$JUMP" "$NODE2" bash -s -- "$MODE" <<'REMOTE'
set -e
MODE="$1"
python3 - "$MODE" <<'PY'
import json, os, re, sys, time, urllib.request, urllib.error

mode = sys.argv[1] if len(sys.argv) > 1 else 'dry'

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

mailer = open('/root/flowvpn-cp/src/mailer.js', encoding='utf-8', errors='replace').read()
m = re.search(r'(MAIL_FROM|RESEND_FROM)\s*\?\?\s*"([^"]+)"', mailer) or re.search(r'from:\s*"([^"]+@[^"]+)"', mailer)
frm = None
if m:
    frm = m.group(2) if m.lastindex == 2 else m.group(1)
if not frm:
    frm = 'VPNFlow <no-reply@meetflowai.site>'

emails = set()
raw = open('/root/flowvpn-cp/data/auth.json', encoding='utf-8', errors='replace').read()
for mm in re.finditer(r'"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"', raw):
    emails.add(mm.group(1).lower())
emails = sorted(emails)

SUBJECT = 'VPNFlow 1.4.0 cho Windows — đường truyền mới cho mạng bị chặn, nhanh hơn và ổn định hơn / VPNFlow 1.4.0 for Windows'
DOWNLOAD = 'https://meetflowai.site/buy'

HTML = """\
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.65;color:#12202f;max-width:660px">
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow 1.4.0 cho Windows — cập nhật quan trọng</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành bản <b>VPNFlow 1.4.0</b> cho Windows. Bản này tập trung vào ba việc:
     kết nối được ở những mạng khó, nhanh hơn, và ổn định hơn.</p>
  <ol>
    <li><b>Đường truyền mới cho mạng chặn máy chủ.</b> Ứng dụng nay có thêm đường truyền đi qua
        WebSocket/Cloudflare (hysteria2), dùng được ở những mạng chặn thẳng địa chỉ máy chủ — thường gặp
        ở mạng Trung Quốc hoặc Wi-Fi khách sạn. Ứng dụng tự chọn đường phù hợp; Quý khách
        <b>không cần cấu hình gì thêm</b>. Nếu đường mới không lên được, ứng dụng tự quay về đường cũ.</li>
    <li><b>Nhanh hơn.</b> Chúng tôi đã bỏ giới hạn băng thông khai báo trước đây — đây là nguyên nhân
        khiến tốc độ bị hạ xuống thấp hơn đường truyền thật. Đo trên cùng một máy và cùng một máy chủ:
        <b>từ 45,5 Mbps lên 68,6 Mbps</b>.</li>
    <li><b>WeChat, Tencent và tên miền .cn đi thẳng</b> (không qua VPN). Nhờ vậy WeChat và các dịch vụ
        trong nước hoạt động ổn định hơn khi VPN đang bật.</li>
    <li><b>Ổn định và minh bạch hơn.</b> Nếu Windows đang chặn công cụ tunnel (Smart App Control) hoặc
        phát hiện phần mềm mạng khác đang tranh chấp, ứng dụng sẽ báo rõ ngay trên màn hình chính và tự
        chuyển sang đường dự phòng, thay vì hiển thị “đang kết nối” rồi không lên.</li>
  </ol>
  <p><b>Cách cập nhật:</b> tải bộ cài mới tại <a href="https://meetflowai.site/buy">meetflowai.site/buy</a>,
     chạy tệp vừa tải và bấm <b>Next</b>. Quý khách <b>không cần gỡ</b> bản cũ — bộ cài sẽ nâng cấp tại chỗ
     và giữ nguyên dữ liệu đăng nhập.</p>
  <p>Nếu cần hỗ trợ, Quý khách vui lòng trả lời email này.</p>
  <p>Trân trọng cảm ơn Quý khách đã đồng hành cùng VPNFlow.</p>

  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.0 for Windows — important update (English)</h3>
  <p>Dear Customer,</p>
  <p>We have released <b>VPNFlow 1.4.0</b> for Windows. This release focuses on three things:
     connecting on difficult networks, higher speed, and better stability.</p>
  <ol>
    <li><b>A new transport for networks that block our servers.</b> The app can now tunnel through
        WebSocket/Cloudflare (hysteria2), which works on networks that block server IP addresses
        directly — common on networks in China or hotel Wi-Fi. The app selects the best transport
        automatically; <b>no configuration needed</b>. If the new path is unavailable, the app falls
        back to the previous one.</li>
    <li><b>Higher speed.</b> We removed the previously declared bandwidth limit, which was capping
        speed below your actual line rate. Measured on the same machine and server:
        <b>45.5 Mbps → 68.6 Mbps</b>.</li>
    <li><b>WeChat, Tencent and .cn domains now go direct</b> (outside the VPN), so WeChat and domestic
        services stay stable while the VPN is connected.</li>
    <li><b>More stable and more transparent.</b> If Windows blocks the tunnel helper (Smart App Control)
        or another networking app conflicts with us, the app tells you clearly on the main screen and
        switches to the fallback path instead of showing “connecting” indefinitely.</li>
  </ol>
  <p><b>How to update:</b> download the new installer at
     <a href="https://meetflowai.site/buy">meetflowai.site/buy</a>, run it and click <b>Next</b>.
     There is <b>no need to uninstall</b> the previous version — it upgrades in place and keeps your
     login data.</p>
  <p>For support, simply reply to this email. Thank you for using VPNFlow.</p>

  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.0 Windows 版重要更新（中文）</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Windows 版 <b>VPNFlow 1.4.0</b>，本次更新集中在三点：在受限网络中也能连接、速度更快、更稳定。</p>
  <ol>
    <li><b>新增适用于“封锁服务器 IP”网络的传输通道。</b>应用现可通过 WebSocket/Cloudflare（hysteria2）
        传输，适用于直接封锁服务器地址的网络（中国网络、酒店 Wi-Fi 等常见）。应用会自动选择可用通道，
        <b>无需任何设置</b>；新通道不可用时会自动回退到原有通道。</li>
    <li><b>速度更快。</b>我们移除了此前的带宽申报限制——它会把速度压到低于真实线路带宽。
        在同一台电脑、同一台服务器上实测：<b>由 45.5 Mbps 提升到 68.6 Mbps</b>。</li>
    <li><b>微信、腾讯及 .cn 域名直连</b>（不经过 VPN），因此开启 VPN 时微信与国内服务更稳定。</li>
    <li><b>更稳定、更透明。</b>如果 Windows 拦截了隧道组件（Smart App Control），或检测到其他网络软件冲突，
        应用会在首页明确提示并自动切换到备用通道，而不是一直显示“正在连接”。</li>
  </ol>
  <p><b>更新方法：</b>在 <a href="https://meetflowai.site/buy">meetflowai.site/buy</a> 下载新版安装包，
     双击后点击 <b>Next</b> 即可。<b>无需卸载</b>旧版本，安装程序会原地升级并保留登录数据。</p>
  <p>如需帮助，请直接回复本邮件。感谢您使用 VPNFlow。</p>
</div>"""

def send(to, subject, html):
    payload = json.dumps({'from': frm, 'to': [to], 'subject': subject, 'html': html}).encode()
    req = urllib.request.Request(
        'https://api.resend.com/emails', data=payload,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json',
                 'Accept': 'application/json',
                 'User-Agent': 'VPNFlow-Mailer/1.0 (+https://meetflowai.site)'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read().decode())
        return bool(body.get('id')), None
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}: {e.read().decode()[:160]}'
    except Exception as e:
        return False, str(e)[:160]

print(f'   from         : {frm}')
print(f'   nguoi nhan   : {len(emails)}')
print(f'   tieu de      : {SUBJECT}')
print(f'   do dai HTML  : {len(HTML)} ky tu')
print(f'   che do       : {"GUI THAT" if mode == "--send" else "CHAY THU (khong gui)"}')
if mode != '--send':
    print('   -> them --send de gui that')
    raise SystemExit(0)

if alert:
    ok, err = send(alert, '[TEST] ' + SUBJECT, HTML)
    print(f'   test gui     : {"OK" if ok else "LOI " + str(err)}')
    if not ok:
        raise SystemExit('   dung lai vi test that bai')

sent = failed = 0
first_err = None
for addr in emails:
    ok, err = send(addr, SUBJECT, HTML)
    if ok:
        sent += 1
    else:
        failed += 1
        first_err = first_err or err
    time.sleep(0.7)
print(f'   ket qua      : gui thanh cong {sent}/{len(emails)}, loi {failed}')
if first_err:
    print(f'   loi dau tien : {first_err}')
PY
REMOTE
