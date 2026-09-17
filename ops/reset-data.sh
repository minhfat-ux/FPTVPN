#!/usr/bin/env bash
# Wipe fBuddy's data on node-2 back to a fresh install (keeps the secret + unit).
# Use after running a smoke test on a brand-new instance so the real owner's
# email becomes the admin instead of the test account.
set -euo pipefail

echo "== before =="
systemctl is-active fbuddy || true
du -sh /var/lib/fbuddy 2>/dev/null || true

echo "== stopping =="
systemctl stop fbuddy

echo "== wiping data =="
rm -rf /var/lib/fbuddy/*
install -d -m 755 /var/lib/fbuddy

echo "== starting =="
systemctl start fbuddy
sleep 3

echo "== state =="
systemctl is-active fbuddy
curl -s --max-time 5 http://127.0.0.1:7790/api/health; echo
curl -s --max-time 5 http://127.0.0.1:7790/api/meta; echo
