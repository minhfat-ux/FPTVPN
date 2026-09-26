# Abuse report — SSH brute-force vào node-2 (165.101.114.162) · 26/09/2026

**Người gửi:** VPNFlow / meetflowai.site · support@meetflowai.site
**Máy bị tấn công:** `165.101.114.162` (sshd), thời gian: liên tục 26/09/2026 (giờ +07)
**Loại:** SSH brute-force phân tán (từ chối dịch vụ ở tầng xác thực: sshd bị ngập slot tới mức không gửi được banner cho khách hợp lệ)

## Bằng chứng (trích `/var/log/auth.log` + `journalctl -u ssh`)
| IP / dải nguồn | Số lần thử | Quốc gia | ASN / tổ chức | abuse liên hệ |
|---|---|---|---|---|
| `109.160.32.20` + `109.160.32.0/24` (.34 .46 .48 .70 .80 .82) | 3.610 (+6×1.805) | NL Veenendaal | AS197170 TechTies Inc. (RDAP: GBTCloud) | abuse@gcn.bg |
| `176.53.159.197` `.198` + `176.53.159.0/24` | 3.087 / 2.927 | PL Warsaw | AS154383 ZORNTECH WEB SOLUTIONS (RDAP: bshield) | abuse@bearshield.top |
| `77.239.124.174` + `77.239.124.0/24` | 2.388 | NL Amsterdam | AS198364 BANATSYNC SRL | (RDAP org) |
| `103.10.227.74` + `103.10.227.0/24` | 388 | IN Mumbai | AS17665 ONEOTT INTERTAINMENT | (RDAP org) |
| `45.148.10.141` `.157` + `45.148.10.0/24` | 25+ | NL Amsterdam | AS48090 TECHOFF SRV LIMITED | (RDAP org) |
| `193.47.62.69` + `193.47.62.0/24` | 25 | NL Amsterdam | AS216014 BestDC Limited | (RDAP org) |
| `92.118.39.50` | 15 | RO Timişoara | AS47890 UNMANAGED LTD (DMZHOST) | dmzhostabuse@gmail.com |
| `62.60.130.253` | 15 | LT Vilnius | AS215930 CIPHER OPERATIONS | olatunji8221@gmail.com |
| `76.90.193.3`, `49.254.38.138` | 105 / 60 | — | (tra RDAP khi gửi) | — |

- Không IP nào là **Tor exit** (đối chiếu `torbulkexitlist`, 1.372 exit — không khớp) ⇒ tấn công trực tiếp từ VPS/proxy.
- Mẫu tấn công: thử mật khẩu root/user phổ biến, tần suất cao, phân tán theo dải `/24` (né rate-limit theo IP).

## Yêu cầu
1. Điều tra & xử lý máy chủ trong dải của quý công ty đang tham gia brute-force.
2. Nếu là khách thuê, thông báo chấm dứt hành vi; nếu máy bị chiếm quyền, cách ly.
3. Phản hồi mã ticket tới `support@meetflowai.site`.

## Biện pháp phía chúng tôi (đã áp)
Chặn dải/IP nguồn ở tầng INPUT, giới hạn SSH (chỉ khoá, không mật khẩu), `MaxStartups` chống ngập, autoban tự động **>20 lần thất bại/60 phút ⇒ 24h, tái phạm 3 lần ⇒ vĩnh viễn** (whitelist Cloudflare + node nội bộ).
