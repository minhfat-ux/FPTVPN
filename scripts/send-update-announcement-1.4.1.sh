#!/usr/bin/env bash
# Gui email thong bao phat hanh VPNFlow 1.4.1 cho Windows (ban va do on dinh duong relay).
#   scripts/send-update-announcement-1.4.1.sh          # CHAY THU
#   scripts/send-update-announcement-1.4.1.sh --send   # GUI THAT
# KHONG in token/API key. Formal, de hieu, 3 ngon ngu (vi/en/zh).
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

SUBJECT = 'VPNFlow 1.4.1 cho Windows — tự phục hồi khi đường truyền gặp sự cố / VPNFlow 1.4.1 for Windows'

HTML = """\
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.65;color:#12202f;max-width:660px">
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow 1.4.1 cho Windows — cập nhật độ ổn định</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Tiếp sau bản 1.4.0, chúng tôi vừa phát hành <b>VPNFlow 1.4.1</b> cho Windows. Bản này chỉ tập trung
     vào một việc: <b>khi đường truyền gặp sự cố, ứng dụng tự xử lý thay vì để Quý khách phải làm gì</b>.</p>
  <ol>
    <li><b>Tự phát hiện đường truyền “đứng”.</b> Trước đây ứng dụng chỉ biết khi tiến trình truyền bị tắt hẳn;
        nếu đường truyền còn chạy nhưng không còn dữ liệu qua được, ứng dụng vẫn hiển thị “đã kết nối”.
        Nay ứng dụng kiểm tra định kỳ và phát hiện đúng tình trạng này.</li>
    <li><b>Tự dựng lại đường truyền.</b> Khi phát hiện sự cố, ứng dụng tự kết nối lại (thử tối đa 3 lần với
        thời gian chờ tăng dần) — Quý khách <b>không cần bấm Kết nối lại</b>.</li>
    <li><b>Không để máy mất mạng.</b> Nếu không tự dựng lại được, ứng dụng gỡ đường truyền và trả kết nối về
        đường trực tiếp của máy, đồng thời báo rõ lý do — thay vì giữ trạng thái “đã kết nối” mà không có mạng.</li>
    <li><b>Kiểm tra kỹ để không “báo oan”.</b> Ứng dụng chỉ kết luận đường truyền hỏng khi <b>đồng thời</b>
        không còn dữ liệu và phép thử qua chính đường truyền thất bại nhiều lần — nên việc Quý khách để yên
        máy (không dùng Internet) <b>không</b> bị hiểu nhầm là mất kết nối.</li>
  </ol>
  <p><b>Cách cập nhật:</b> tải bộ cài tại <a href="https://meetflowai.site/buy">meetflowai.site/buy</a>,
     chạy tệp vừa tải và bấm <b>Next</b>. Không cần gỡ bản cũ; dữ liệu đăng nhập được giữ nguyên.</p>
  <p>Nếu cần hỗ trợ, Quý khách vui lòng trả lời email này.</p>
  <p>Trân trọng cảm ơn Quý khách đã đồng hành cùng VPNFlow.</p>

  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.1 for Windows — stability update (English)</h3>
  <p>Dear Customer,</p>
  <p>Following version 1.4.0, we have released <b>VPNFlow 1.4.1</b> for Windows. This release focuses on one
     thing: <b>if the tunnel has a problem, the app fixes it for you.</b></p>
  <ol>
    <li><b>Detects a “stalled” tunnel.</b> Previously the app only noticed when the tunnel process exited.
        If the process was still running but no data could pass, the app still showed “Connected”. It now
        checks periodically and detects that condition.</li>
    <li><b>Rebuilds the tunnel automatically.</b> On a fault the app reconnects by itself (up to 3 attempts
        with increasing delay) — <b>no need to press Connect again</b>.</li>
    <li><b>Never leaves your machine offline.</b> If it cannot rebuild, it removes the tunnel and returns
        your connection to the direct route, telling you why — instead of staying “Connected” with no internet.</li>
    <li><b>Careful about false alarms.</b> The app only concludes the tunnel is broken when there is
        <b>both</b> no data and repeated active probes through the tunnel fail — so leaving your computer
        idle is <b>not</b> mistaken for a connection loss.</li>
  </ol>
  <p><b>How to update:</b> download the installer at <a href="https://meetflowai.site/buy">meetflowai.site/buy</a>,
     run it and click <b>Next</b>. No need to uninstall; your login data is preserved.</p>
  <p>For support, simply reply to this email. Thank you for using VPNFlow.</p>

  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.1 Windows 版稳定性更新（中文）</h3>
  <p>尊敬的客户：</p>
  <p>继 1.4.0 之后，我们发布了 Windows 版 <b>VPNFlow 1.4.1</b>。本次只做一件事：
     <b>通道出现问题时，由应用自动处理，无需您操作。</b></p>
  <ol>
    <li><b>自动识别“通道卡死”。</b>此前应用只有在传输进程退出时才会发现异常；若进程仍在运行但数据无法通过，
        界面仍显示“已连接”。现在应用会定期检查并识别这种情况。</li>
    <li><b>自动重建通道。</b>发生故障时应用会自行重连（最多尝试 3 次，间隔递增）——<b>无需再次点击“连接”</b>。</li>
    <li><b>不会让电脑断网。</b>若无法重建，应用会移除通道并把连接恢复为直连，同时说明原因，而不是停留在
        “已连接”却无法上网。</li>
    <li><b>避免误判。</b>只有<b>同时</b>满足“没有数据”且“通过通道的主动探测多次失败”才会判定故障，
        因此电脑闲置时<b>不会</b>被误认为断线。</li>
  </ol>
  <p><b>更新方法：</b>在 <a href="https://meetflowai.site/buy">meetflowai.site/buy</a> 下载安装包，
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

print(f'   from        : {frm}')
print(f'   nguoi nhan  : {len(emails)}')
print(f'   tieu de     : {SUBJECT}')
print(f'   do dai HTML : {len(HTML)} ky tu')
print(f'   che do      : {"GUI THAT" if mode == "--send" else "CHAY THU (khong gui)"}')
if mode != '--send':
    print('   -> them --send de gui that')
    raise SystemExit(0)

if alert:
    ok, err = send(alert, '[TEST] ' + SUBJECT, HTML)
    print(f'   test gui    : {"OK" if ok else "LOI " + str(err)}')
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
print(f'   ket qua     : gui thanh cong {sent}/{len(emails)}, loi {failed}')
if first_err:
    print(f'   loi dau tien: {first_err}')
PY
REMOTE
