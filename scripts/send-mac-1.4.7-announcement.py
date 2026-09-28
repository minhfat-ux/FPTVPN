#!/usr/bin/env python3
"""Gửi email macOS 1.4.7 (SỬA bản 1.4.6/21 không mở được) — GỬI RIÊNG kênh macOS.

Bối cảnh (handoff 26/09/2026): bản macOS 1.4.6/21 đã ký + notarize + staple + `spctl accepted`
nhưng KHÔNG MỞ ĐƯỢC trên máy khách — profile Developer ID của Apple chỉ cấp bộ quyền
`*-systemextension`, không cấp `packet-tunnel-provider` cho appex plugin ⇒ AMFI chặn. Bản 1.4.7
chuyển tunnel sang **System Extension** (đúng loại quyền Apple cấp) nên mở/kết nối được.

⚠️ Khách PHẢI biết: lần đầu bấm Connect, macOS sẽ hỏi cài **"system extension"** ⇒ bấm **Allow**
(System Settings → General → Login Items & Extensions → Network Extensions → bật VPNFlow).

Dùng trên node-2:
  python3 send-mac-1.4.7-announcement.py --recipients      # chỉ liệt kê người nhận macOS
  python3 send-mac-1.4.7-announcement.py --test            # chỉ gửi tới ALERT_EMAIL
  python3 send-mac-1.4.7-announcement.py                   # gửi cho khách có thiết bị macOS
  python3 send-mac-1.4.7-announcement.py --all             # gửi cho TOÀN BỘ khách (nhóm đã nhận
                                                           # email "bản macOS đang lỗi" 26/09)
"""
import json, os, sys, time, urllib.error, urllib.request

args = sys.argv[1:]
TEST = '--test' in args
LIST = '--recipients' in args

conf = '/etc/systemd/system/flowvpn-cp.service.d'
env = {}
for name in os.listdir(conf):
    if name.endswith('.conf'):
        for line in open(os.path.join(conf, name), encoding='utf-8', errors='replace'):
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
SUBJECT = 'VPNFlow macOS 1.4.7 — đã sửa: app mở được / fixed: the app opens again / 修复：应用可以正常打开'


def block(lang):
    if lang == 'vi':
        return f"""
  <h2 style="color:#0d7a4a;margin:0 0 12px">VPNFlow 1.4.7 cho macOS — đã sửa lỗi không mở được</h2>
  <p>Kính gửi Quý khách,</p>
  <p>Bản macOS <b>1.4.6</b> trước đây <b>không mở được</b> trên máy: nguyên nhân là <b>loại extension</b>
     mà Apple cho phép với chứng chỉ phát hành trực tiếp (Developer ID) — không liên quan tới máy của
     Quý khách. Chúng tôi xin lỗi vì bất tiện này.</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>Bản 1.4.7 đã sửa:</b> tunnel nay đóng gói theo <b>System Extension</b> — đúng loại mà Apple cấp
     phép — nên app <b>mở được và kết nối được</b> bình thường.<br>
     <b>Một bước nhỏ ở lần đầu:</b> khi bấm <b>Connect</b> lần đầu, macOS sẽ hỏi cài
     <b>“system extension”</b> ⇒ Quý khách bấm <b>Allow</b> (nếu không thấy hộp thoại: mở
     <b>System Settings → General → Login Items &amp; Extensions → Network Extensions</b> và bật
     <b>VPNFlow</b>). Các lần sau không hỏi lại.</p>
  <p>Ngoài ra bản này còn: vào mạng nhanh hơn khi mạng có IPv6 lỗi (lùi về IPv4 chỉ ~0,2–0,3 giây),
     <b>tự đổi đường</b> khi một relay chết hẳn, <b>tự nối lại</b> khi phiên bị ngắt, bộ nhớ ổn định hơn,
     app trong nước (Tencent Meeting…) đi thẳng, và cảnh báo khi có VPN/proxy khác đang bật.</p>
  <p><b>Cách cập nhật:</b> tải bản mới tại <a href="{DL}">{PAGE}</a> → mở file <b>.dmg</b> → kéo
     <b>VPNFlow</b> vào <b>Applications</b> (ghi đè bản cũ) → mở app → bấm <b>Connect</b> → bấm
     <b>Allow</b> khi macOS hỏi system extension. Sau khi cài, vào app kiểm tra <b>Settings</b> thấy
     <b>1.4.7</b> là đúng.</p>
  <p>Có gì vướng, Quý khách trả lời email này là chúng tôi hỗ trợ ngay —
     <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""
    if lang == 'en':
        return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.7 for macOS — the “won't open” bug is fixed</h3>
  <p>Dear customer,</p>
  <p>The previous macOS build <b>1.4.6</b> <b>could not be opened</b>: the cause was the <b>type of
     extension</b> Apple allows with a direct-distribution (Developer ID) certificate — nothing to do
     with your Mac. We are sorry for the trouble.</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>Build 1.4.7 fixes it:</b> the tunnel now ships as a <b>System Extension</b> — the type Apple's
     certificate permits — so the app <b>opens and connects</b> normally.<br>
     <b>One small step on first use:</b> the first time you click <b>Connect</b>, macOS asks to install
     a <b>“system extension”</b> ⇒ click <b>Allow</b> (if no dialog appears, open
     <b>System Settings → General → Login Items &amp; Extensions → Network Extensions</b> and enable
     <b>VPNFlow</b>). It will not ask again.</p>
  <p>Also in this build: faster joining on networks with broken IPv6 (IPv4 fallback in ~0.2–0.3s),
     <b>automatic route change</b> when a relay dies, <b>automatic reconnect</b> if a session drops,
     steadier memory, China-local apps (Tencent Meeting…) going direct, and a warning when another
     VPN/proxy is active.</p>
  <p><b>How to update:</b> download from <a href="{DL}">{PAGE}</a> → open the <b>.dmg</b> → drag
     <b>VPNFlow</b> into <b>Applications</b> (replace the old one) → open the app → click
     <b>Connect</b> → click <b>Allow</b> for the system extension. Afterwards <b>Settings</b> should
     show <b>1.4.7</b>.</p>
  <p>Reply to this email any time — <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>"""
    return f"""
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:20px 0">
  <h3 style="color:#0d7a4a;margin:0 0 10px">VPNFlow 1.4.7（macOS）——“无法打开”的问题已修复</h3>
  <p>尊敬的客户：</p>
  <p>此前的 macOS <b>1.4.6</b> <b>无法打开</b>：原因是 Apple 对<b>直接分发（Developer ID）证书</b>所允许的
     <b>扩展类型</b>不同，与您的电脑无关。给您带来不便，我们深表歉意。</p>
  <p style="background:#eefaf3;border-left:4px solid #0d7a4a;padding:10px 12px;margin:12px 0">
     <b>1.4.7 已修复：</b>隧道改为以 <b>System Extension（系统扩展）</b>方式打包——这是 Apple 证书允许的类型，
     因此应用可以<b>正常打开并连接</b>。<br>
     <b>首次使用需一步：</b>第一次点击 <b>Connect</b> 时，macOS 会询问安装 <b>“系统扩展”</b> ⇒ 请点
     <b>Allow</b>（若未弹出窗口：打开 <b>系统设置 → 通用 → 登录项与扩展 → 网络扩展</b>，启用
     <b>VPNFlow</b>）。之后不会再询问。</p>
  <p>本版还包含：在 IPv6 异常的网络上更快连上（约 0,2–0,3 秒回退 IPv4）、中继彻底不可用时
     <b>自动切换线路</b>、会话中断后<b>自动重连</b>、内存更稳定、国内应用（腾讯会议等）直连，
     以及检测到其他 VPN/代理时给出提示。</p>
  <p><b>更新方法：</b>从 <a href="{DL}">{PAGE}</a> 下载 → 打开 <b>.dmg</b> → 将 <b>VPNFlow</b> 拖入
     <b>应用程序</b>（覆盖旧版）→ 打开应用 → 点 <b>Connect</b> → 在系统提示时点 <b>Allow</b>。
     安装后在 <b>Settings</b> 看到 <b>1.4.7</b> 即为正确版本。</p>
  <p>如有问题请直接回复本邮件 — <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>。</p>"""


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
if '--all' in sys.argv:   # nhóm đã nhận email "bản macOS đang lỗi" ngày 26/09
    all_mails = {str(v.get('email', '')).lower() for _, v in pairs if '@' in str(v.get('email', ''))}
    all_mails = {e for e in all_mails if not e.endswith(('example.com', 'test.com', 'localhost'))}
    print(f'che do --all: {len(all_mails)} email trong he thong')
    targets = sorted(all_mails)
print(f'nguoi nhan macOS: {len(targets)}')
if LIST:
    raise SystemExit(0)

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
