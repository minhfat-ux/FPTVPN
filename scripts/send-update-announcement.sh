#!/usr/bin/env bash
# (1) set windows latest_version = <version>  (2) gui email thong bao update cho user (Resend).
# Dung: scripts/send-update-announcement.sh [version]     (mac dinh 1.0.7)
# KHONG in token / API key / dia chi email ra man hinh.
set -euo pipefail
VERSION="${1:-1.0.7}"
JUMP="root@103.173.155.50"
NODE2="root@165.101.114.162"

ssh -o BatchMode=yes -J "$JUMP" "$NODE2" bash -s -- "$VERSION" <<'REMOTE'
set -e
VERSION="$1"

echo "== 1) set latest_version = $VERSION =="
# Token PHAI lay tu drop-in *.conf (admin-token.conf override file chinh) hoac tu env cua
# process dang chay. Doc nham /etc/systemd/system/flowvpn-cp.service se ra token CU =>
# PATCH tra 401 va `curl -s` van exit 0 => release "thanh cong" nhung app KHONG duoc bao
# co ban moi (da xay ra voi 1.0.7: buy page 1.0.7 nhung latest_version ket o 1.0.5).
TOKEN="$(grep -h -oP '(?<=AUTH_TOKEN=).*' /etc/systemd/system/flowvpn-cp.service.d/*.conf 2>/dev/null | head -1 | tr -d '"'"'"' ')"
if [ -z "$TOKEN" ]; then
  PID="$(systemctl show -p MainPID --value flowvpn-cp 2>/dev/null || true)"
  [ -n "$PID" ] && [ -r "/proc/$PID/environ" ] && \
    TOKEN="$(tr '\0' '\n' < "/proc/$PID/environ" | grep '^AUTH_TOKEN=' | cut -d= -f2-)"
fi
[ -n "$TOKEN" ] || { echo "   LOI: khong tim thay AUTH_TOKEN"; exit 1; }

RESP="$(curl -s -X PATCH "https://api.meetflowai.site/v1/admin/windows-version" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"latest_version\":\"$VERSION\"}")"
echo "   $RESP"
case "$RESP" in
  *"\"latest_version\":\"$VERSION\""*) echo "   OK: latest_version = $VERSION" ;;
  *) echo "   LOI: PATCH khong dat latest_version = $VERSION (kiem tra token)"; exit 1 ;;
esac

echo "== 2) gui email thong bao =="
python3 - <<'PY'
import json, os, re, time, urllib.request, urllib.error

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
print(f'   from         : {frm}')
print(f'   test mail to : {"(co ALERT_EMAIL)" if alert else "(khong co ALERT_EMAIL)"}')

# danh sach nguoi nhan
emails = set()
auth_path = '/root/flowvpn-cp/data/auth.json'
raw = open(auth_path, encoding='utf-8', errors='replace').read()
for mm in re.finditer(r'"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"', raw):
    emails.add(mm.group(1).lower())
emails = sorted(emails)
print(f'   nguoi nhan  : {len(emails)}')

DOWNLOAD = 'https://meetflowai.site/buy'
SUBJECT = 'VPNFlow 1.0.3 — cập nhật quan trọng: cài đè an toàn, cảnh báo xung đột mạng / VPNFlow 1.0.3 重要更新'

HTML = """\
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#12202f;max-width:640px">
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow 1.0.3 — cập nhật quan trọng</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Chúng tôi vừa phát hành bản <b>VPNFlow 1.0.3</b> cho Windows với hai thay đổi giúp việc cài đặt và sử dụng ổn định hơn:</p>
  <ol>
    <li><b>Cài lại là nâng cấp, không tạo ứng dụng thứ hai.</b> Bộ cài mới tự dọn bản cũ và cập nhật tại chỗ; dữ liệu đăng nhập của Quý khách được giữ nguyên.</li>
    <li><b>Cảnh báo khi có phần mềm mạng khác đang tranh chấp.</b> Nếu máy đang bật <i>Clash Verge / v2rayN / sing-box</i> ở chế độ TUN hoặc bật proxy hệ thống, ứng dụng sẽ hiện cảnh báo ngay trên màn hình chính và hướng dẫn cách xử lý — đây là nguyên nhân phổ biến khiến không đăng nhập được hoặc không nhận được mã xác nhận.</li>
  </ol>
  <p><b>Cách cập nhật:</b> tải bộ cài tại <a href="https://meetflowai.site/buy">meetflowai.site/buy</a>, chạy tệp vừa tải và bấm Next. Không cần gỡ bản cũ.</p>
  <p><b>Nếu Quý khách đang dùng Clash Verge:</b> hãy tắt chế độ TUN (hoặc thêm các quy tắc DIRECT cho tên miền của chúng tôi) trước khi kết nối VPNFlow. Hướng dẫn chi tiết hiển thị ngay trong ứng dụng khi phát hiện xung đột.</p>
  <p>Trân trọng cảm ơn Quý khách đã đồng hành cùng VPNFlow.</p>

  <hr style="border:none;border-top:1px solid #e3e8ee;margin:22px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.0.3 重要更新（中文）</h3>
  <p>尊敬的客户：</p>
  <p>我们已发布 Windows 版 <b>VPNFlow 1.0.3</b>，包含两项重要改进：</p>
  <ol>
    <li><b>重新安装即为升级，不会产生第二个应用。</b>新版安装程序会自动清理旧版本并原地升级，登录数据保持不变。</li>
    <li><b>网络冲突提醒。</b>如果电脑正在运行 <i>Clash Verge / v2rayN / sing-box</i> 的 TUN 模式或系统代理，应用会在首页直接提示并给出处理方法——这是导致无法登录或收不到验证码的常见原因。</li>
  </ol>
  <p><b>更新方法：</b>在 <a href="https://meetflowai.site/buy">meetflowai.site/buy</a> 下载安装包，双击并点击 Next 即可，无需先卸载旧版本。</p>
  <p>感谢您使用 VPNFlow。</p>
</div>"""

def send(to, subject, html):
    payload = json.dumps({'from': frm, 'to': [to], 'subject': subject, 'html': html}).encode()
    req = urllib.request.Request(
        'https://api.resend.com/emails', data=payload,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'VPNFlow-Mailer/1.0 (+https://meetflowai.site)'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.loads(r.read().decode())
        return bool(body.get('id')), None
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}: {e.read().decode()[:160]}'
    except Exception as e:
        return False, str(e)[:160]

if alert:
    ok, err = send(alert, '[TEST] ' + SUBJECT, HTML)
    print(f'   test gui      : {"OK" if ok else "LOI " + str(err)}')
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
print(f'   ket qua       : gui thanh cong {sent}/{len(emails)}, loi {failed}')
if first_err:
    print(f'   loi dau tien  : {first_err}')
PY
REMOTE
