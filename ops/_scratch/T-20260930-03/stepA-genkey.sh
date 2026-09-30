#!/usr/bin/env bash
# Bước A: sinh cặp khoá tạm trên node-2
umask 077
wg genkey > /tmp/wgtest.key
wg pubkey < /tmp/wgtest.key > /tmp/wgtest.pub
echo "TESTPUB=$(cat /tmp/wgtest.pub)"
