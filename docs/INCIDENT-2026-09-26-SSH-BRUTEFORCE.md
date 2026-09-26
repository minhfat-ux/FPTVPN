# SỰ VIỆC 2026-09-26 — Brute-force SSH vào node-2: nguồn từ đâu, đã xác định rõ

> Yêu cầu của chủ dự án (Telegram `/vibecode`, bus **#459**, sổ `T-20260926-01`):
> *"kiểm tra báo cáo từ VPS Guard về IP đăng nhập sai nhiều lần từ đâu, cần có xác định rõ ràng
> rồi mới đưa ra quyết định chặn. Anh cần em báo cáo đầy đủ."*
>
> Người làm: harness **WIN** · Máy đo: **node-2 `fcnvps2` (165.101.114.162)** · Thời điểm đo:
> **2026-09-26 ~14:40–14:55 (+07) = 07:40–07:55 UTC** · Mọi số dưới đây là **đo thật**, không suy đoán.

## 1. Kết luận nhanh (đọc 30 giây)

1. **KHÔNG có xâm nhập.** Trong toàn bộ log sshd còn giữ được (~44 giờ) và trong `btmp` (từ
   17/09/2026, **124.200** dòng đăng nhập sai): **0 lần** `Accepted password`.
2. **Toàn bộ 4 IP từng đăng nhập thành công đều là của mình**, tất cả bằng **publickey**, khớp
   đúng 6 khoá trong `authorized_keys` — không có khoá lạ.
3. **Giao của hai tập IP là RỖNG**: 139 IP đăng nhập sai ∩ 4 IP đăng nhập đúng = **∅**. Không IP
   tấn công nào từng vào được.
4. Đây là **oanh tạp nền của Internet** (botnet/credential-stuffing) đập vào cổng 22 đang mở, không
   phải tấn công nhắm riêng fBuddy. Nhưng **rủi ro là thật và chưa được vá**: node đang bật
   `PermitRootLogin yes` + `PasswordAuthentication yes`, **không có fail2ban**, **ufw inactive**.
   Một mật khẩu yếu của `root` là mất cả node (node-2 chạy cả 4 sản phẩm FlowTech).
5. Quy mô (24h): **6.430** lần `Failed password`, **80 IP nguồn**, nhắm chủ yếu `root` (**3.591** lần).
   ⏱ Đây là **ảnh chụp lúc 14:41 (+07)**; tấn công **đang diễn ra liên tục** nên số sẽ lớn hơn mỗi lần
   đo (14:55 (+07) đã là **6.710** lần / **81** IP). Bản thô từng lần đo: `docs/evidence/T-20260926-01/`.
6. **Tôi KHÔNG tự chặn, KHÔNG sửa sshd, KHÔNG bật ufw** — đúng nguyên tắc guard và đúng yêu cầu
   "xác định rõ ràng rồi mới quyết định chặn". 4 lựa chọn + lệnh chính xác ở §7, chờ anh chốt.

## 2. Cách đo (lệnh đã chạy, chạy lại được từ máy WIN)

```bash
# 1) quy mô 24 giờ
ssh root@165.101.114.162 'journalctl -u ssh --since "-24h" --no-pager -o cat | grep -c "Failed password"'
# → 6430

# 2) top IP + số lần (đã gộp 1 lượt, kèm first/last)
ssh root@165.101.114.162 'journalctl -u ssh --since "-24h" --no-pager -o short-iso \
  | grep "Failed password" \
  | sed -E "s/^([0-9-]+T[0-9:]+)[^ ]* .*from ([0-9.]+).*/\2 \1/" \
  | sort -k1,1 -k2,2 \
  | awk "{c[\$1]++; if(!(\$1 in f)) f[\$1]=\$2; l[\$1]=\$2} END{for(i in c) printf \"%s fails=%d first=%s last=%s\n\", i, c[i], f[i], l[i]}" \
  | sort -t= -k2 -rn | head -32'

# 3) CÂU QUAN TRỌNG NHẤT — có ai vào được không?
ssh root@165.101.114.162 'journalctl -u ssh --no-pager -o cat | grep -c "Accepted password"'   # → 0
ssh root@165.101.114.162 'journalctl -u ssh --no-pager -o cat | grep "Accepted" \
  | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort | uniq -c | sort -rn'
# → chỉ 4 IP, xem §5

# 4) giao hai tập (rỗng = chưa ai vào được)
ssh root@165.101.114.162 'journalctl -u ssh --no-pager -o cat | grep "Failed password" \
  | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort -u > /tmp/att.txt; \
  journalctl -u ssh --no-pager -o cat | grep "Accepted" \
  | grep -oE "from [0-9.]+" | cut -d" " -f2 | sort -u > /tmp/ok.txt; \
  echo "attacker=$(wc -l < /tmp/att.txt) accepted=$(wc -l < /tmp/ok.txt)"; comm -12 /tmp/att.txt /tmp/ok.txt'
# → attacker=139 accepted=4 ; giao = (rỗng)
```

Số liệu phụ (cùng nguồn): 60 phút gần nhất **482** lần sai · 20 phút gần nhất **10** IP ·
`btmp` (`lastb`) từ 17/09 là **124.200** dòng · log sshd còn giữ từ `2026-09-24T18:10+07`.

## 3. Quy mô & nhịp độ

| Chỉ số | Giá trị |
|---|---|
| `Failed password` 24 giờ | **6.430** (≈ 268/giờ ≈ **4,5 lần/phút**) |
| `Failed password` 60 phút gần nhất | 482 |
| IP nguồn khác nhau / 24 giờ | **80** |
| IP nguồn khác nhau / toàn log (~44h) | **139** |
| Nhắm `root` / 24 giờ | **3.591** (55,8%) |
| Nhắm user không tồn tại (`invalid user`) / 24 giờ | **2.825** |
| Đăng nhập bằng **mật khẩu** thành công | **0** |
| Dòng `btmp` (đăng nhập sai, từ 17/09) | **124.200** |
| Cửa sổ log còn giữ | 2026-09-24 18:10 (+07) → nay |

User bị dò nhiều nhất (24h): `root` 3579 · user-không-tồn-tại 2839 · `admin` 135 · `ubuntu` 113 ·
`user` 91 · `deploy` 56 · `test` 49 · `user1` 35 · `postgres` 30 · `ftpuser` 27 · `debian` 22 ·
`claude` 22 · `minecraft` 20 · `git` 20 · `dev` 19 · `oracle` 18 · `guest` 18.
→ Danh sách user này là **từ điển chung của botnet** (không có gì riêng của fBuddy ngoài `root`,
`ubuntu`, `deploy`, `claude`, `git`) ⇒ xác nhận thêm đây là quét tự động diện rộng.

Mỗi IP dùng **cổng nguồn khác nhau cho từng lần thử** (109.160.32.32: 1.063 cổng/1.098 lần;
77.239.124.174: 495/500; 49.254.38.138: 488/491) ⇒ không phải một script keep-alive, mà là
**pool phân tán** (botnet hoặc dịch vụ thử mật khẩu thuê).

## 4. Nguồn IP — "từ đâu" (ASN/quốc gia tra bằng `ipinfo.io`, đối chiếu chéo với `in2cable.com`)

Top 20 IP, 24 giờ:

| # | IP | Số lần | Lần đầu (+07) | Lần cuối (+07) | Quốc gia | ASN / tổ chức |
|---|---|---|---|---|---|---|
| 1 | `109.160.32.32` | 1.098 | 26/09 05:05:50 | 26/09 06:38:48 | 🇳🇱 NL | AS197170 **TechTies Inc.** (Veenendaal) |
| 2 | `109.160.32.107` | 1.098 | 26/09 02:12:16 | 26/09 03:42:07 | 🇳🇱 NL | AS197170 **TechTies Inc.** (cùng /24 với #1) |
| 3 | `77.239.124.174` | 500 | 26/09 09:03:01 | 26/09 09:51:24 | 🇳🇱 NL | AS198364 BANATSYNC SRL |
| 4 | `49.254.38.138` | 491 | 25/09 22:00:17 | **26/09 14:46:49 (đang chạy)** | 🇰🇷 KR | AS4766 Korea Telecom (Seoul) |
| 5 | `176.53.159.198` | 450 | 25/09 14:55:03 | **26/09 14:32:10 (đang chạy)** | 🇵🇱 PL | AS154383 ZORNTECH WEB SOLUTIONS |
| 6 | `176.53.159.197` | 425 | 25/09 15:43:11 | 26/09 13:52:23 | 🇵🇱 PL | AS154383 ZORNTECH (cùng /24 với #5) |
| 7 | `103.10.227.74` | 271 | 26/09 14:29:39 | **26/09 14:47:00 (mạnh nhất lúc này: 312/20 phút)** | 🇮🇳 IN | AS17665 ONEOTT INTERTAINMENT (`dhcp-10-227-74.in2cable.com`, Mumbai) |
| 8 | `45.148.10.141` | 165 | 25/09 17:12:29 | **26/09 14:43:18 (đang chạy)** | 🇳🇱 NL | AS48090 TECHOFF SRV LIMITED |
| 9 | `193.47.62.69` | 135 | 25/09 17:27:41 | 26/09 14:23:46 | 🇳🇱 NL | AS216014 BestDC Limited |
| 10 | `45.148.10.152` | 130 | 25/09 17:52:36 | 26/09 14:33:36 | 🇳🇱 NL | AS48090 TECHOFF SRV LIMITED |
| 11 | `62.60.130.242` | 125 | 25/09 17:17:28 | 26/09 14:14:05 | 🇱🇹 LT | AS215930 CIPHER OPERATIONS (Vilnius) |
| 12 | `45.148.10.151` | 115 | 25/09 17:07:08 | 26/09 13:47:59 | 🇳🇱 NL | AS48090 TECHOFF SRV LIMITED |
| 13 | `62.60.130.201` | 105 | 25/09 19:49:41 | 26/09 13:09:11 | 🇱🇹 LT | AS215930 CIPHER OPERATIONS |
| 14 | `45.148.10.157` | 75 | 25/09 17:57:38 | 26/09 14:19:01 | 🇳🇱 NL | AS48090 TECHOFF SRV LIMITED |
| 15 | `2.57.121.112` | 75 | 25/09 16:11:48 | 26/09 13:50:27 | 🇷🇴 RO | AS47890 UNMANAGED LTD (Timișoara) |
| 16 | `62.60.130.253` | 60 | 25/09 19:00:43 | 26/09 13:57:30 | 🇱🇹 LT | AS215930 CIPHER OPERATIONS |
| 17 | `193.46.255.86` | 54 | 25/09 15:43:05 | 26/09 14:23:34 | 🇷🇴 RO | AS47890 UNMANAGED LTD |
| 18 | `2.57.122.53` | 40 | 26/09 00:17:12 | 26/09 07:42:21 | 🇷🇴 RO | AS47890 UNMANAGED LTD |
| 19 | `2.57.122.168` | 39 | 26/09 07:23:51 | 26/09 08:48:17 | 🇷🇴 RO | AS47890 UNMANAGED LTD |
| 20 | `195.178.110.217` | 36 | 25/09 19:05:24 | 25/09 22:46:36 | 🇳🇱 NL | AS48090 TECHOFF SRV LIMITED |

Nhóm theo **nhà cung cấp** (đây mới là "từ đâu" thật — IP xoay nhưng hạ tầng thì không):

| ASN | Quốc gia | IP trong top | Tổng lần / 24h |
|---|---|---|---|
| **AS197170 TechTies Inc.** | NL | .32, .107 | **2.196** |
| **AS154383 ZORNTECH WEB SOLUTIONS** | PL | .198, .197 | **875** |
| **AS48090 TECHOFF SRV LIMITED** | NL | .141, .151, .152, .157, 195.178.110.217, .232 | **548** |
| AS198364 BANATSYNC SRL | NL | .174 | 500 |
| AS4766 Korea Telecom | KR | .138 | 491 |
| **AS215930 CIPHER OPERATIONS** | LT | 62.60.130.242/.201/.253 | **290** |
| **AS47890 UNMANAGED LTD** | RO | 2.57.121.112, 2.57.122.53/.168, 193.46.255.86, 80.94.92.234, 92.118.39.50 | **259** |
| AS17665 ONEOTT INTERTAINMENT | IN | 103.10.227.74 | 271 |

Các IP lẻ còn lại (mỗi IP 20–30 lần, rải khắp nơi — đúng kiểu botnet toàn cầu):
AS44589 `ntservers.pro` (NL), AS7922 Comcast (US), AS8075 Microsoft Azure (US),
AS45178 Roshan (AF), AS9299 PLDT (PH), AS56971 Cloud (LV), AS9329 Sri Lanka Telecom (LK),
AS58453 China Mobile Intl (HK), AS17884 Uninet (ID), AS215925 VPSVAULT (CA).

**Phát sinh ngay trong lúc viết báo cáo** (14:55 +07, sau bảng trên): `76.90.193.3` — **93 lần/24h**
và **93 lần trong 20 phút gần nhất** — 🇺🇸 US **AS20001 Charter Communications** (Hidden Hills).
Đây là **IP nhà (residential)**, khác hẳn các IP VPS ở trên ⇒ gần như chắc chắn là **thiết bị trong
nhà bị lây bot** rồi bị điều khiển đi dò mật khẩu. Nó cũng là IP thứ 2 mà guard bắt được HIGH (§6-#4).

**Đọc bảng này ra quyết định:** 3 ASN (TechTies NL, ZORNTECH PL, TECHOFF NL) + 2 ASN
(CIPHER LT, UNMANAGED RO) chiếm **~4.170/6.430 ≈ 65%**. Chặn theo **ASN/dải** hiệu quả hơn chặn
theo từng IP rất nhiều — nhưng chỉ nên làm **sau** khi đã chuyển sang khoá (§7-A), vì lúc đó việc
chặn chỉ còn là giảm log chứ không còn là hàng rào bảo vệ.

## 5. Kiểm toán "đã có ai vào được chưa?" — trả lời dứt khoát: CHƯA

**4 IP từng `Accepted` (toàn log; số đo 14:55 +07) — tất cả đều là của mình, tất cả bằng publickey:**

| IP | Số lần | Là ai | Khoá dùng (SHA256) |
|---|---|---|---|
| `103.173.155.50` | 35.491 | **node-1** (VPN gateway của mình) — vòng health-check | `yFPoJFLg…` = `root@fcnvpn` |
| `165.101.114.162` | 282 | **chính node-2** (gọi vào IP public của nó) | `ayM4RWER…` = `fpt-vpn-node` |
| `63.140.14.154` | 115 | **máy Windows (harness WIN)** — chính phiên đang viết báo cáo này | `EHS/okspa…` = `dsh-windows-fptvpn` |
| `223.118.50.125` | 79 | **người vận hành** (HK, China Mobile Intl; 26/09 02:18→12:50) | `ayM4RWER…` = `fpt-vpn-node` |

- **`Accepted password` = 0** — chưa từng có lần nào đăng nhập bằng mật khẩu thành công.
- **Giao 139 IP tấn công ∩ 4 IP trên = ∅** — không IP nào vừa dò vừa vào được.
- `btmp`/`lastb`: toàn bộ là đăng nhập sai; `last` (phiên thành công) chỉ có phiên cũ 08/09/2026.
- `/root/.ssh/authorized_keys`: **6 khoá, đúng 6 khoá của mình**, không có khoá lạ:
  `fpt-vpn-node`, `root@fcnvpn`, 1 khoá không comment, `fpt-tunnel`, `windows-harness@flowtech`,
  `dsh-windows-fptvpn`.
- Guard cũng không thấy dấu hiệu persistence/malware mới (§6).

⇒ **Kết luận an ninh: chưa bị chiếm.** Đây là "báo động đỏ nhưng nhà chưa bị vào".

## 6. Lỗ hổng thật + điểm mù của guard (phần cần sửa)

| # | Phát hiện | Bằng chứng | Mức |
|---|---|---|---|
| 1 | `PermitRootLogin yes` + `PasswordAuthentication yes`, cổng 22 mở thẳng Internet | `sshd -T` → `permitrootlogin yes`, `passwordauthentication yes`, `maxauthtries 6`, `port 22` | 🔴 CAO |
| 2 | **Không có fail2ban** | `command -v fail2ban-client` → không có | 🔴 CAO |
| 3 | **ufw đang inactive** (không có tường lửa host) | `ufw status verbose` → `Status: inactive` | 🟠 TB |
| 4 | **Guard bỏ lọt 2 đợt lớn nhất**: chỉ báo các IP đang hoạt động trong cửa sổ ngắn của nó (`103.10.227.74`, `76.90.193.3` — 39–55 lần), KHÔNG hề báo `109.160.32.32`/`.107` dù mỗi IP **1.098 lần/24h** | `guard.mjs --json` lúc 14:41 (+07): 1 HIGH (ssh-brute 103.10.227.74) + 74 LOW; lúc 14:55: 2 HIGH + 1 MEDIUM + 166 LOW | 🟠 TB (điểm mù báo cáo) |
| 5 | 73 cảnh báo LOW "Cổng UDP đang MỞ" = cổng tạm của hysteria/sing-box; 1 LOW "tiến trình chạy từ thư mục tạm" = `/tmp/up-server.py` (helper nhận APK, đã ghi trong `VPS-DEFENSE.md` §8) | `guard.mjs --json` | 🟢 thấp (đã biết) |

Về #4: guard chạy đúng thiết kế (chỉ báo, không tự chặn) và **không sai khi im lặng** — nhưng luật
SSH brute-force của nó đang xét một **cửa sổ quá ngắn**, nên 2 đợt 1.098 lần đã trôi qua trước khi
guard kịp thấy (guard chỉ cài lúc 07:31Z hôm nay). Cần nới cửa sổ / báo top-N theo 24h.

## 7. Khuyến nghị — 4 lựa chọn, chờ anh Minh chốt (tôi chưa chạy cái nào)

### A. KHOÁ — bỏ hẳn đăng nhập bằng mật khẩu ⭐ khuyến nghị số 1, rủi ro gần bằng 0
Vì `Accepted password = 0` và cả 6 khoá đều đang dùng được, chuyển sang chỉ-dùng-khoá sẽ **xoá sạch
lớp tấn công này** (6.430 lần/ngày → 0) mà không mất đường vào nào.

```bash
# trên node-2
cat >/etc/ssh/sshd_config.d/99-fbuddy-hardening.conf <<'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t                 # PHẢI in gì cũng được miễn không báo lỗi
systemctl reload ssh
# GIỮ phiên ssh hiện tại mở cho tới khi xác nhận xong bằng phiên MỚI:
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no root@165.101.114.162 true
#   → phải bị từ chối "Permission denied (publickey)" nghĩa là đã khoá đúng
```
An toàn: **không đụng** `authorized_keys`, không đổi cổng — nên node-1 (`103.173.155.50`) và
harness WIN (`63.140.14.154`, `dsh-windows-fptvpn`) vẫn vào bình thường.

### B. fail2ban (chỉ cần nếu buộc phải giữ đăng nhập bằng mật khẩu)
```bash
apt-get install -y fail2ban
cat >/etc/fail2ban/jail.d/fbuddy.local <<'EOF'
[sshd]
enabled  = true
maxretry = 5
findtime = 10m
bantime  = 1h
# BẮT BUỘC: không thì tự khoá mình
ignoreip = 127.0.0.1/8 103.173.155.50 63.140.14.154 223.118.50.125 165.101.114.162
EOF
systemctl enable --now fail2ban && fail2ban-client status sshd
```

### C. Chặn tay các IP đang đập mạnh nhất (chỉ để cắt cơn, không phải giải pháp)
```bash
# ufw đang inactive. Nếu bật ufw PHẢI mở đủ cổng dịch vụ TRƯỚC (22,80,443,2019,7790 + UDP VPN),
# nếu không sẽ tự chặn khách. Bản tối thiểu đang đập mạnh nhất lúc này:
for ip in 103.10.227.74 49.254.38.138 176.53.159.198 176.53.159.197 45.148.10.141 45.148.10.152 \
          45.148.10.151 45.148.10.157 193.47.62.69 62.60.130.242 62.60.130.201 92.118.39.50; do
  ufw deny from "$ip" to any
done
```
⚠️ 80 IP mới/24h ⇒ chặn từng IP là **mò kim đáy bể**; chỉ nên chặn `103.10.227.74` ngay bây giờ,
hoặc chặn theo dải ASN ở §4 (nhớ allowlist IP của mình trước).

### D. Vá điểm mù của guard (việc của tôi, làm được ngay khi anh cho phép)
- Nới cửa sổ luật SSH brute-force + báo **top-N theo 24h**, để đợt 1.098 lần/IP không trôi qua im lặng.
- Đã tách khỏi sự việc này; sẽ mở task riêng nếu anh muốn.

## 8. Việc tôi CHƯA làm (và vì sao)

- **Không** sửa `sshd_config`, **không** bật `ufw`, **không** chặn IP nào — theo nguyên tắc trong
  `docs/VPS-DEFENSE.md` ("guard chỉ báo, hành động ngăn chặn là lệnh tay của người vận hành") và
  theo đúng yêu cầu của anh: *xác định rõ ràng rồi mới quyết định chặn*.
- **Không** chạy `--baseline` để chốt lại baseline: baseline hiện tại vẫn đúng, chỉ có cổng UDP tạm
  của hysteria là nhiễu LOW.

## 9. Nghiệm thu

```bash
node ops/verify-ssh-bruteforce.mjs
```
Script SSH vào node-2 và tự kiểm 4 điều: (1) `Accepted password = 0`; (2) giao IP tấn công ∩ IP
thành công = rỗng; (3) in lại quy mô 24h + top 5 + cấu hình sshd hiện tại; (4) in các mục "còn nợ"
(tắt mật khẩu / fail2ban / ufw) để biết đã quyết chưa. Exit `0` = các kết luận an ninh trong báo
cáo này vẫn đúng.

## 10. Phụ lục

- Bằng chứng thô (nguyên văn output các lệnh): `docs/evidence/T-20260926-01/README.md`
- Sổ giao việc: `ops/tasks/T-20260926-01/` (created từ bus **#459**, `acked`+`done` do WIN)
- Cơ sở: `docs/VPS-DEFENSE.md` (§8 là báo cáo guard gốc), `docs/TASK-PROTOCOL.md`, `docs/AGENT-BUS.md`
- Lưu ý lệch sổ: tin bus #459 mang `ref="TG-VIBECODE"` — đó là **ref sai do bên chép tin gán lại**
  (TG-VIBECODE là việc owner→mac đã `done`). Việc thật đã được chép đúng vào `T-20260926-01`
  (owner→win) và `woken` của phiên này vì thế bị ghi nhầm vào thư mục TG-VIBECODE
  (`2026-09-26T07-39-04-796Z-win-woken.json`). Đây là lỗi khớp ref của watcher, nên sửa riêng.
