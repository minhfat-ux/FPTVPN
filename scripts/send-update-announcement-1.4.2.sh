#!/usr/bin/env bash
# Gui email thong bao phat hanh VPNFlow 1.4.2 cho Windows (sua metadata version + hien version trong UI).
#   scripts/send-update-announcement-1.4.2.sh          # CHAY THU (chi in ke hoach, khong gui)
#   scripts/send-update-announcement-1.4.2.sh --test   # GUI THU toi ALERT_EMAIL
#   scripts/send-update-announcement-1.4.2.sh --send   # GUI THAT: test ALERT_EMAIL roi gui khach
# KHONG in token/API key/danh sach email. Formal, de hieu, 3 ngon ngu (vi/en/zh).
#
# Truoc khi gui, script tu kiem moc latest_version tren server PHAI = 1.4.2 (luat §5 PUBLISHER_PROCESS).
# Mac nay SSH thang node-2 bang key rieng (khong dung node-1 lam jump):
#   ssh -i ~/.ssh/fpt_vpn_node root@165.101.114.162
set -euo pipefail
NODE2="${NODE2:-root@165.101.114.162}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/fpt_vpn_node}"
VERSION="1.4.2"
MODE="${1:-dry}"

ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=20 "$NODE2" bash -s -- "$MODE" "$VERSION" <<'REMOTE'
set -e
MODE="$1"
VERSION="$2"
python3 - "$MODE" "$VERSION" <<'PY'
import json, os, re, sys, time, urllib.request, urllib.error

mode = sys.argv[1] if len(sys.argv) > 1 else 'dry'
version = sys.argv[2] if len(sys.argv) > 2 else '1.4.2'

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

# ---- Cong chan §5: moc latest_version PHAI da set dung ban sap thong bao ----
token = ''
for name in os.listdir(conf_dir):
    if not name.endswith('.conf'):
        continue
    for line in open(os.path.join(conf_dir, name), encoding='utf-8', errors='replace'):
        line = line.strip()
        if line.startswith('Environment='):
            body = line[len('Environment='):].strip().strip('"')
            if body.startswith('AUTH_TOKEN='):
                token = body.split('=', 1)[1].strip().strip('"')
if not token:
    raise SystemExit('   KHONG co AUTH_TOKEN trong env CP => khong kiem duoc moc')
req = urllib.request.Request(
    'https://api.meetflowai.site/v1/admin/windows-version',
    headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json',
             # Cloudflare tra 403 khi thieu User-Agent (bai hoc 1.4.2, xem PUBLISHER_PROCESS §7).
             'User-Agent': 'VPNFlow-Publisher/1.0 (+https://meetflowai.site)'})
with urllib.request.urlopen(req, timeout=20) as r:
    ver = json.loads(r.read().decode())
got = str(ver.get('latest_version', ''))
if got != version:
    raise SystemExit(f'   DUNG: moc latest_version dang la {got!r}, khong phai {version!r} => chua set moc, khong gui')

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

SUBJECT = 'VPNFlow 1.4.2 cho Windows — hiện đúng số phiên bản + tự phục hồi đường truyền / VPNFlow 1.4.2 for Windows'

HTML = """\
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.65;color:#12202f;max-width:660px">
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow 1.4.2 cho Windows — bản cập nhật</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành <b>VPNFlow 1.4.2</b> cho Windows. Bản này gồm:</p>
  <ol>
    <li><b>Hiện đúng số phiên bản trong ứng dụng.</b> Trước đây bản cài ra khai số hiệu 1.0.0 nên
        không thể biết máy đang chạy bản nào. Nay vào <b>Cài đặt → Giới thiệu (Settings → About)</b>
        sẽ thấy đúng số phiên bản kèm số build, và đối chiếu với bản mới nhất trên máy chủ.</li>
    <li><b>Tự phát hiện đường truyền “đứng”.</b> Nếu đường truyền còn chạy nhưng không còn dữ liệu qua được,
        ứng dụng tự kiểm tra định kỳ và phát hiện, thay vì vẫn hiển thị “đã kết nối”.</li>
    <li><b>Tự dựng lại đường truyền.</b> Khi phát hiện sự cố, ứng dụng tự kết nối lại (tối đa 3 lần với
        thời gian chờ tăng dần) — Quý khách <b>không cần bấm Kết nối lại</b>.</li>
    <li><b>Không để máy mất mạng.</b> Nếu không tự dựng lại được, ứng dụng gỡ đường truyền và trả kết nối
        về đường trực tiếp của máy, đồng thời báo rõ lý do — thay vì giữ trạng thái “đã kết nối” mà không có mạng.</li>
  </ol>
  <p><b>Cách cập nhật:</b> tải bộ cài tại <a href="https://t1.meetflowai.site/buy">t1.meetflowai.site/buy</a>,
     chạy tệp vừa tải và bấm <b>Next</b>. Không cần gỡ bản cũ; dữ liệu đăng nhập được giữ nguyên.</p>
  <p>Nếu cần hỗ trợ, Quý khách vui lòng trả lời email này.</p>
  <p>Trân trọng cảm ơn Quý khách đã đồng hành cùng VPNFlow.</p>

  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.2 for Windows (English)</h3>
  <p>Dear Customer,</p>
  <p>We have released <b>VPNFlow 1.4.2</b> for Windows. This build includes:</p>
  <ol>
    <li><b>Correct version number in the app.</b> The previous build reported version 1.0.0, so it was
        impossible to tell which build was installed. <b>Settings → About</b> now shows the exact version
        and build, checked against the latest version on the server.</li>
    <li><b>Detects a “stalled” tunnel.</b> If the tunnel is still running but no data can pass, the app now
        checks periodically and detects that condition instead of showing “Connected”.</li>
    <li><b>Rebuilds the tunnel automatically.</b> On a fault the app reconnects by itself (up to 3 attempts
        with increasing delay) — <b>no need to press Connect again</b>.</li>
    <li><b>Never leaves your machine offline.</b> If it cannot rebuild, it removes the tunnel and returns
        your connection to the direct route, telling you why.</li>
  </ol>
  <p><b>How to update:</b> download the installer at <a href="https://t1.meetflowai.site/buy">t1.meetflowai.site/buy</a>,
     run it and click <b>Next</b>. No need to uninstall; your login data is preserved.</p>
  <p>For support, simply reply to this email. Thank you for using VPNFlow.</p>

  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.2 Windows 版（中文）</h3>
  <p>尊敬的客户：</p>
  <p>我们发布了 Windows 版 <b>VPNFlow 1.4.2</b>，本次包含：</p>
  <ol>
    <li><b>应用内正确显示版本号。</b>此前安装后显示的版本为 1.0.0，无法知道实际运行的版本。现在
        <b>设置 → 关于（Settings → About）</b>会显示正确的版本号与构建号，并与服务器上的最新版本对照。</li>
    <li><b>自动识别“通道卡死”。</b>若通道仍在运行但数据无法通过，应用会定期检查并识别，而不是继续显示“已连接”。</li>
    <li><b>自动重建通道。</b>发生故障时应用会自行重连（最多尝试 3 次，间隔递增）——<b>无需再次点击“连接”</b>。</li>
    <li><b>不会让电脑断网。</b>若无法重建，应用会移除通道并把连接恢复为直连，同时说明原因。</li>
  </ol>
  <p><b>更新方法：</b>在 <a href="https://t1.meetflowai.site/buy">t1.meetflowai.site/buy</a> 下载安装包，
     双击后点击 <b>Next</b> 即可。无需卸载旧版本，登录数据保留。</p>
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

print(f'   moc server  : windows latest_version={got} (DAT, dung {version})')
print(f'   from        : {frm}')
print(f'   nguoi nhan  : {len(emails)} (khach trong auth.json)')
print(f'   tieu de     : {SUBJECT}')
print(f'   do dai HTML : {len(HTML)} ky tu')
print(f'   che do      : {mode}')
if mode == 'dry':
    print('   -> them --test (gui thu ALERT_EMAIL) hoac --send (gui that)')
    raise SystemExit(0)

if alert:
    ok, err = send(alert, '[TEST] ' + SUBJECT, HTML)
    print(f'   test ALERT  : {"OK" if ok else "LOI " + str(err)}')
    if not ok:
        raise SystemExit('   dung lai vi test that bai')
if mode == '--test':
    print('   -> chi gui thu ALERT_EMAIL, khong gui khach')
    raise SystemExit(0)

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
print(f'   ket qua     : gui thanh cong {sent}/{len(emails)}, loi {failed}')
if first_err:
    print(f'   loi dau tien: {first_err}')
PY
REMOTE
