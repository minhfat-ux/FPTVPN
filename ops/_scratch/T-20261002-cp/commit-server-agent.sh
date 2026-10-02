#!/usr/bin/env bash
# T-20261002 — commit nguồn control-plane (2 file vừa sửa) trong repo server-agent trên node-2.
set -euo pipefail
cd /root/flowvpn-agent
git add control-plane/src/payments.js control-plane/src/index.js
echo "--- staged (bo qua CR) ---"
git diff --cached --stat --ignore-cr-at-eol
echo "--- diff that ---"
git diff --cached --ignore-cr-at-eol
echo "--- commit ---"
git commit -m "control-plane(buy): /ai/buy hien nhan 'Email' (bo 'VPNFlow account') + nut tai Windows MeetFlow AI (overlay .zip) — T-20261002 (bus #652/#653)" >/dev/null
git log --oneline -3
echo "--- con lai chua commit ---"
git status --short -- control-plane/src
