#!/usr/bin/env python3
"""Gửi ABUSE REPORT tới nhà cung cấp của các IP brute-force SSH vào node-1/node-2 (26/09/2026).

Chạy TRÊN node-2 (đọc RESEND_API_KEY + ALERT_EMAIL từ drop-in của control-plane).

Dùng:
  python3 send-abuse-report-2026-09-26.py --test     # chỉ gửi tới ALERT_EMAIL để duyệt nội dung
  python3 send-abuse-report-2026-09-26.py            # gửi thật cho 4 đầu mối abuse

Nguồn bằng chứng: docs/incidents/abuse-report-2026-09-26.md (repo).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

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

SUBJECT = ('Abuse report: SSH brute-force from your network to our servers '
           '(26 Sep 2026) — ticket please')

# Đầu mối abuse ↔ dải IP đo được từ /var/log/auth.log + journalctl -u ssh trên node-2.
TARGETS = [
    ('abuse@gcn.bg', ['109.160.32.0/24 (AS197170 TechTies Inc. / RDAP: GBTCloud) — 3.610 + 6×1.805 lần thất bại']),
    ('abuse@bearshield.top', ['176.53.159.0/24 (AS154383 ZORNTECH WEB SOLUTIONS) — 3.087 và 2.927 lần thất bại']),
    ('dmzhostabuse@gmail.com', ['92.118.39.50 (AS47890 UNMANAGED LTD / DMZHOST) — 15 lần thất bại']),
    ('olatunji8221@gmail.com', ['62.60.130.253 (AS215930 CIPHER OPERATIONS) — 15 lần thất bại']),
]

OTHER = [
    '77.239.124.0/24 (AS198364 BANATSYNC SRL) — 2.388 lần',
    '103.10.227.0/24 (AS17665 ONEOTT INTERTAINMENT) — 388 lần',
    '45.148.10.0/24 (AS48090 TECHOFF SRV LIMITED) — 25+ lần',
    '193.47.62.0/24 (AS216014 BestDC Limited) — 25 lần',
    '76.90.193.3, 49.254.38.138 — 105 và 60 lần',
]

BODY = """Dear Abuse Team,

We operate VPNFlow (meetflowai.site). On 26 September 2026 our servers
165.101.114.162 and 103.173.155.50 were the target of a sustained distributed
SSH brute-force campaign. The volume exhausted sshd's pre-authentication
capacity, so legitimate operators could not obtain an SSH banner at all
("connection timed out during banner exchange") for hours. That is a
denial-of-service effect on our operational access, caused by the attacking
hosts' traffic.

Source addresses observed in YOUR network:
{your}

Evidence: extracted from /var/log/auth.log and `journalctl -u ssh` on
165.101.114.162 (26 Sep 2026, +07). Sample log lines can be provided on request.

Other networks observed in the same campaign (reported separately):
{other}

No source address was a Tor exit node (checked against torbulkexitlist,
1,372 exits). The pattern is many rapid password attempts for root and common
usernames, spread over whole /24 blocks to defeat per-IP rate limits.

Measures we already applied on our side: packet-filter bans of the abusive
sources, SSH restricted to key authentication only, hardened MaxStartups,
automatic 24h ban (>20 failed attempts in 60 minutes, permanent after three
repeat offences) and a service watchdog.

We kindly ask you to:
  1. investigate the host(s) in your network involved in this campaign;
  2. if it is a compromised customer server, notify and/or isolate it;
  3. reply with your ticket ID to support@meetflowai.site.

Thank you for your time.

Regards,
VPNFlow Operations
meetflowai.site · support@meetflowai.site
"""


def send(to, body):
    payload = json.dumps({
        'from': 'VPNFlow Abuse <support@meetflowai.site>',
        'to': [to],
        'reply_to': 'support@meetflowai.site',
        'subject': SUBJECT,
        'text': body,
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.resend.com/emails', data=payload,
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json',
                 'Accept': 'application/json',
                 'User-Agent': 'VPNFlow-Mailer/1.0 (+https://meetflowai.site)'})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return True, r.status
    except urllib.error.HTTPError as e:
        return False, f'{e.code} {e.read()[:200]!r}'
    except Exception as e:  # noqa: BLE001
        return False, str(e)


if TEST:
    body = BODY.format(your='- (TEST) ' + TARGETS[0][1][0], other='\n'.join('- ' + o for o in OTHER))
    ok, info = send(alert, body)
    print(f'[TEST] tới {alert}: {"OK" if ok else "LỖI"} {info}')
    raise SystemExit(0 if ok else 1)

sent = 0
for to, ips in TARGETS:
    body = BODY.format(your='\n'.join('  - ' + i for i in ips),
                       other='\n'.join('  - ' + o for o in OTHER))
    ok, info = send(to, body)
    print(f'{"OK " if ok else "LỖI"} {to} -> {info}')
    sent += 1 if ok else 0
    time.sleep(1.5)
print(f'KẾT QUẢ: {sent}/{len(TARGETS)} gửi thành công')
