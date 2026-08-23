# E2E Device Test — Evidence Log

- **Date:** 2026-08-23 (đang chờ Anh test trên iPhone)
- **Plan:** `docs/E2E_DEVICE_TEST.md`
- **Verifier:** Minh (owner) + DSH (server-side)

## Kết quả từng bước (điền khi test)

| # | Bước | Kết quả (PASS/FAIL) | Ghi chú / evidence |
|---|---|---|---|
| 1 | Cài app iPhone | — | installed com.privatevpn.app |
| 2 | Màn hình login hiện | — | |
| 3 | Login email (OTP thật) | — | |
| 4 | Verify → signed in | — | |
| 5 | Connect → Connected | — | |
| 6 | **Public IP = 103.173.155.50** | — | ipinfo.io/ip |
| 7 | DNS hoạt động | — | |
| 8 | HTTPS hoạt động | — | |
| 9 | Disconnect → IP về nhà mạng | — | |
| 10 | Reconnect → IP lại VN node | — | |
| 11 | Kill app → mở lại signed in | — | |
| 12 | Server-side: peer wg mới + handshake | — | `evidence/e2e/server-verify.md` |

## Server-side verify (chạy khi Anh connect)

```bash
# peer mới của iPhone (handshake < 5 phút)
ssh -i .tmp/flowvpn_support_page_ed25519 root@103.173.155.50 'wg show wg0 | grep -B1 -A3 "latest handshake" | head -30'
# health bandwidth
TOKEN=$(cut -d= -f2 secrets/flowvpn-cp-admin.env)
curl -s https://meetflowai.site/PrivateVPN/v1/admin/nodes/node-1/health -H "Authorization: Bearer $TOKEN"
# user/device
curl -s https://meetflowai.site/PrivateVPN/v1/admin/users -H "Authorization: Bearer $TOKEN"
```
