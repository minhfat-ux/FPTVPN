# VPNFlow Windows 1.4.6 — release notes (hotfix DNS)

> Phát hành 23/09/2026 · Nền tảng: **windows** · Build: harness Windows
> Commit build: **`9f9b8bd5774400a6786d73969f94410f21eefbc5`** · Tag: **`windows-v1.4.6` → `9f9b8bd`**
> Quy trình: `docs/PUBLISHER_PROCESS.md` · Sổ phát hành: `release/releases.jsonl`
> Nguồn nội dung: `docs/handoff/HANDOFF_WINDOWS_1.4.6_DNS_HOTFIX_2026-09-23.md`

> ⚠️ **BẢN NÀY CHƯA KÝ SỐ (`NotSigned`).** Đây là **ngoại lệ luật 11** do chủ dự án chốt 23/09/2026
> (giống các bản 1.4.0–1.4.5; Mac đã xác nhận **không có** chứng chỉ Authenticode — bus #305/#307).
> Hệ quả bắt buộc: email cho khách **KHÔNG được hứa "hết cảnh báo Windows"**; nếu khách báo bị chặn thì
> **ghi nhận để đo lường**.

## Vì sao có bản này (ưu tiên CAO)

Khách trên bản **1.4.5** (đặc biệt ở Trung Quốc) báo: **bật VPN thì mất mạng**; **google, youtube và
các link cần VPN không vào được**, trong khi **ứng dụng/web Trung Quốc vẫn chạy bình thường**. Triệu
chứng "site TQ chạy, link ngoài chết" là dấu hiệu **tunnel đã lên nhưng phân giải tên miền hỏng**.

## Có gì mới

1. **Sửa lỗi khách Trung Quốc "bật VPN mất mạng" — hotfix DNS.**
   - **Gốc lỗi:** bản 1.4.5 thêm bypass Trung Quốc nhưng đặt **sai thứ tự rule**, và DNS server
     `remote` **thiếu `detour`**. Hệ quả: truy vấn DNS của khách bị **đẩy đi thẳng** (không bị hijack),
     còn DNS upstream `1.1.1.1` cũng đi thẳng ⇒ bị **GFW nhiễm độc** (`www.google.com` /
     `www.youtube.com` trả về IP của Facebook, `AAAA` trả `2001::1`). Tunnel vẫn lên nhưng tên miền
     phân giải sai ⇒ máy như mất mạng.
   - **Cách sửa:**
     - Thứ tự rule đúng: **`sniff → hijack-dns → ip_is_private → ip_cidr → domain_suffix`**
       (`sniff` phải đứng trước `hijack-dns` vì matcher `protocol` chỉ khớp sau khi sniff).
     - DNS upstream **`1.1.1.1` nay đi QUA tunnel** (`detour: hyrelay`) nên hết bị GFW nhiễm độc.
   - **Đo trên máy thật, mạng Trung Quốc (sau khi Connect lại):**

     | Phép đo | Trước (1.4.5) | Sau (1.4.6) |
     |---|---|---|
     | DNS của khách bị đẩy `outbound/direct` | 356 lần | **0 lần** |
     | sing-box tự trả lời DNS (`dns: exchanged`) | 0 | **266 lần** |
     | DNS upstream `1.1.1.1` | đi thẳng (nhiễm độc) | **qua `outbound/socks[hyrelay]`** |
     | `nslookup www.youtube.com` | `104.244.42.197` (IP Twitter) | **`142.251.154.4`** (thật) |
     | `nslookup www.google.com` | `69.171.235.22` (IP Facebook) | **`142.251.151.119`** (thật) |
     | google / youtube / github | không vào được | **200 / 200 / 200** |
     | baidu / taobao / alipay / weixin / dianping / meituan / jd / bilibili | — | **200 hết** (đi thẳng) |

   - **Kiểm tự động:** `dotnet test` **218/218 pass**; test đã khoá **cả 3 điều kiện thứ tự** + `detour`
     để không tái phát.

## Artifact & kênh phát hành

| Kênh | Artifact | Bytes | sha256 |
|---|---|---|---|
| `/dl/VPNFlow-Setup-1.4.6.exe` | `/var/www/flowvpn/dl/VPNFlow-Setup-1.4.6.exe` (bản sao `/var/www/dl/`) | 52.792.253 | `1a50453473d8d945fcf223e96be08dd9b8d1678c69dce42de003a6bb1ea10796` |

- `/buy` trỏ `https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.6.exe?v=1a504534`.
- Mốc server: `latest_version = 1.4.6`.
- Cài đè lên bản cũ (không cần gỡ); dữ liệu đăng nhập giữ nguyên.
- **Lưu ý cache Cloudflare:** URL **bare** `https://meetflowai.site/dl/VPNFlow-Setup-1.4.6.exe` từng trả
  `404 cf-cache-status=HIT` do cache từ lần pre-gate trước khi upload. Link có `?v=` trả **200**, và host
  `t1.meetflowai.site` trả **200 cả bare** ⇒ khách **không** bị ảnh hưởng vì `/buy` luôn dùng `?v=`.
  Đừng kết luận "thiếu file" nếu chỉ kiểm URL bare trên `meetflowai.site`.

## Bằng chứng đã kiểm (Mac publisher, độc lập lại bus-326)

| Mục | Lệnh / cách kiểm | Kết quả |
|---|---|---|
| sha256 trên node-2 (cả 2 docroot) | `sha256sum /var/www/flowvpn/dl/… /var/www/dl/…` | `1a504534…0796` · **khớp** bus-326, cùng size 52.792.253 |
| Link tải qua CDN | `curl -I "https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.6.exe?v=1a504534"` | **HTTP 200**, `content-length: 52792253` |
| Trang mua | `curl -s https://t1.meetflowai.site/buy` | **HTTP 200**, có `dl/VPNFlow-Setup-1.4.6.exe?v=1a504534` |
| Sổ phát hành | `git show origin/main:release/releases.jsonl` | có dòng `origin=publish` + dòng `origin=tag` cho windows 1.4.6 |
| Tag | `git ls-remote --tags origin windows-v1.4.6` | tag (annotated) → commit `9f9b8bd5774400a6786d73969f94410f21eefbc5` |

## Nghiệm thu

- **Email thông báo khách:** `scripts/send-windows-1.4.6-announcement.py` (3 ngôn ngữ vi/en/zh, host
  `t1.meetflowai.site`, hỗ trợ `support@meetflowai.site`). Số người nhận + Resend id ghi trong sổ
  **`bus-326`** và log `evidence/2026-09-23-windows-1.4.6-announcement.log`.
- **Nguồn sự thật** về bản phát hành: `release/releases.jsonl` (dòng publish) và
  `docs/handoff/HANDOFF_WINDOWS_1.4.6_DNS_HOTFIX_2026-09-23.md` (§5: đo trên máy thật mạng TQ).
- **Chưa làm (ghi trung thực):** chưa ký số; chưa thay đổi gì thêm ngoài hotfix DNS.
