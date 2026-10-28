# Xray VLESS + Reality trên VPS (dựng 28/10/2026)

Mục tiêu: thay chặng Cloudflare wsrelay (0,3–0,6 Mbps, hay đứt) bằng một outbound
mới nhanh hơn (~2,8 Mbps đo từ router) và FPT khó phân biệt.

## Server (VPS node-2, relay-server)
- Xray **v24.9.30** (KHÔNG dùng v26: sing-box 1.14 client bị "reality verification failed"/
  EOF với server v26; đã để bản cũ ở `/usr/local/bin/xray.v26.bak`).
- Binary: `/usr/local/bin/xray`, service `xray.service`, config `/usr/local/etc/xray/config.json`.
- Inbound VLESS-REALITY TCP **4443** (443 đã là Caddy; 8443 là wsrelay).
- `dest` phải là một TLS1.3 site ổn định — **www.cloudflare.com** chạy tốt;
  www.microsoft.com gây `REALITY: processed invalid connection`.
- `serverNames: ["www.cloudflare.com"]`, `shortIds` 8 hex, privateKey sinh bằng
  `xray x25519` (v24 in "Private key:/Public key:"; v26 in "PrivateKey:/Password (PublicKey):").
- UFW: `ufw allow 4443/tcp`.

## Router (sing-box 1.14)
- Thêm outbound `reality` (vless, flow `xtls-rprx-vision`, utls chrome, reality public_key/short_id)
  và `auto` (urltest giữa `reality` và `node` relay, url generate_204, interval 3m, tolerance 100).
- Các rule domain (FPT Play, Facebook, ChatGPT, Gemini, YouTube/Netflix…) trỏ `auto`;
  TV360 vẫn `node3` (relay 1083); catch-all 443 = `direct` để tunnel chết không kéo cả nhà mất mạng.
- Reality chết → urltest tự về relay; relay chết → watchdog restart/failover như cũ.

## Bằng chứng (28/10 23:5x)
- Reality qua router: google 200, fptplay 200, facebook 200, chatgpt 200; speed 270–350 KB/s.
- Test trực tiếp trên VPS (xray client local): google/fpt 200.

## Việc còn lại
- Nếu FPT bắt đầu chặn 4443: đổi cổng (vd 2053/2087) + mở UFW, hoặc thêm Reality inbound thứ 2.
- Muốn nhanh hơn 2,8 Mbps: cần VPS HK/SG IP sạch (FPT bóp TCP/UDP tới IP VN datacenter).
- Credential (UUID/privateKey/publicKey/shortId) chỉ nằm trên VPS (`/root/reality-keys.txt`)
  và config router — KHÔNG commit vào repo.
