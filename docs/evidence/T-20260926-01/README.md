# Bằng chứng — `T-20260926-01` · Brute-force SSH node-2 (26/09/2026)

Việc: chủ dự án giao qua Telegram `/vibecode`, chép từ bus **#459** → sổ `T-20260926-01` (owner→win).
Báo cáo đầy đủ: [`docs/INCIDENT-2026-09-26-SSH-BRUTEFORCE.md`](../../INCIDENT-2026-09-26-SSH-BRUTEFORCE.md).

- **Người đo:** harness WIN (máy `DESKTOP-852P1LT`), qua SSH key có sẵn (`dsh-windows-fptvpn`).
- **Máy bị đo:** node-2 `fcnvps2` = `165.101.114.162`.
- **Thời điểm:** 2026-09-26 **07:40–07:55 UTC** = 14:40–14:55 (+07). Log sshd còn giữ: từ 24/09 18:10 (+07).
- **Nguyên tắc:** CHỈ ĐỌC. Không sửa `sshd_config`, không bật ufw, không chặn IP, không kill gì.

## Tệp trong thư mục này

| Tệp | Nội dung |
|---|---|
| `raw-log-analysis.txt` | Nguyên văn output 1 lượt SSH tổng hợp: quy mô 24h, distinct IP, top 20 IP, top user, IP `Accepted` + số lần, số `Accepted password`, giao hai tập, `btmp`, `authorized_keys` + vân tay, `sshd -T`, fail2ban/ufw, tóm tắt findings của guard |
| `verify-output.txt` | Output `node ops/verify-ssh-bruteforce.mjs` (script nghiệm thu, đo lại trên node-2) |

## Câu lệnh đã chạy (chạy lại được từ máy WIN)

```bash
# quy mô
ssh root@165.101.114.162 'journalctl -u ssh --since "-24h" --no-pager -o cat | grep -c "Failed password"'
# top IP kèm first/last (1 lượt)
ssh root@165.101.114.162 'journalctl -u ssh --since "-24h" --no-pager -o short-iso \
  | grep "Failed password" \
  | sed -E "s/^([0-9-]+T[0-9:]+)[^ ]* .*from ([0-9.]+).*/\2 \1/" | sort -k1,1 -k2,2 \
  | awk "{c[\$1]++; if(!(\$1 in f)) f[\$1]=\$2; l[\$1]=\$2} END{for(i in c) printf \"%s fails=%d first=%s last=%s\n\", i, c[i], f[i], l[i]}" \
  | sort -t= -k2 -rn | head -32'
# CÂU QUYẾT ĐỊNH: có ai vào được chưa
ssh root@165.101.114.162 'journalctl -u ssh --no-pager -o cat | grep -c "Accepted password"'
ssh root@165.101.114.162 'journalctl -u ssh --no-pager -o cat | grep "Failed password" | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort -u > /tmp/att.txt; journalctl -u ssh --no-pager -o cat | grep "Accepted" | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort -u > /tmp/ok.txt; comm -12 /tmp/att.txt /tmp/ok.txt'
# nguồn gốc IP
ssh root@165.101.114.162 'for ip in <IP>; do curl -s "https://ipinfo.io/$ip/json" | jq -r "\"\(.country) \(.org) \(.city)\""; done'
# guard
ssh root@165.101.114.162 'node /opt/fbuddy/ops/vps-guard/guard.mjs --json | jq -r "[.findings[]|.severity]|group_by(.)|map(\"\(.[0]): \(length)\")|.[]"; jq -r ".findings[]|select(.severity==\"high\")|\"HIGH: \(.title) — \(.detail)\"" /tmp/guard.json'
```

## Ba con số quyết định (đo 26/09 14:55 +07)

| Đo gì | Kết quả | Nghĩa |
|---|---|---|
| `Accepted password` (toàn log) | **0** | Chưa từng có lần đăng nhập bằng mật khẩu thành công |
| Giao {IP sai} ∩ {IP đúng} | **(rỗng)** — 140 IP sai ∩ 4 IP đúng | Không IP tấn công nào từng vào được |
| Khoá lạ trong `authorized_keys` | **0** (6/6 khoá là của mình) | Không có cửa sau bằng khoá |

⇒ **Chưa bị chiếm.** Rủi ro còn nguyên vì `PermitRootLogin yes` + `PasswordAuthentication yes`,
không fail2ban, ufw inactive — 4 lựa chọn xử lý ở §7 của báo cáo, chờ chủ dự án chốt.
