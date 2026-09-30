#!/usr/bin/env bash
# Doi chung doc lap tu chinh VPS node-2 (khong qua tunnel): tach "IP bi chan" vs "UA bi chan".
# Chay: type ops\_scratch\node2-ai-check.sh | ssh root@165.101.114.162 bash -s
set -u
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

echo "host=$(hostname)"
echo -n "egress="; curl -s -4 https://api.ipify.org; echo
echo -n "cloudflare_loc="; curl -s https://claude.ai/cdn-cgi/trace | grep -E '^loc=' | tr -d '\n'; echo

probe() { # ten url [them curl args...]
  local name="$1"; shift
  local url="$1"; shift
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$@" "$url")
  printf '%-34s %s\n' "$name" "$code"
}

echo ""
echo "=== claude.ai: UA curl (bot) vs UA trinh duyet ==="
probe "claude.ai/login  UA=curl"      "https://claude.ai/login"
probe "claude.ai/login  UA=browser"   "https://claude.ai/login"    -A "$UA"
probe "claude.ai/       UA=browser"   "https://claude.ai/"         -A "$UA"
probe "claude.ai/       UA=browser +headers" "https://claude.ai/"  -A "$UA" -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'accept-language: vi-VN,vi;q=0.9,en;q=0.8'

echo ""
echo "=== gemini.google.com ==="
probe "gemini            UA=curl"      "https://gemini.google.com/"
probe "gemini            UA=browser"   "https://gemini.google.com/" -A "$UA"
probe "aistudio         UA=browser"    "https://aistudio.google.com/" -A "$UA"

echo ""
echo "=== API (khong phu thuoc UA) ==="
probe "api.anthropic.com (key sai)" "https://api.anthropic.com/v1/messages" \
  -X POST -H 'content-type: application/json' -H 'x-api-key: sk-ant-invalid-probe' \
  -H 'anthropic-version: 2023-06-01' \
  -d '{"model":"claude-sonnet-4-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
probe "generativelanguage (key sai)" "https://generativelanguage.googleapis.com/v1beta/models?key=invalid-probe"

echo ""
echo "=== than API tra ve gi (khong phai chi ma HTTP) ==="
curl -s --max-time 25 -X POST https://api.anthropic.com/v1/messages \
  -H 'content-type: application/json' -H 'x-api-key: sk-ant-invalid-probe' \
  -H 'anthropic-version: 2023-06-01' \
  -d '{"model":"claude-sonnet-4-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}' | head -c 300
echo ""
