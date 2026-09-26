# VPNFlow Windows 1.4.5 — release notes

> Phát hành 23/09/2026 · Nền tảng: **windows** · Build: harness Windows
> Commit build: **`db6cf1c1555678f6460455ab97d224daf3caf14b`** · Tag: **`windows-v1.4.5` → `db6cf1c`**
> Quy trình: `docs/PUBLISHER_PROCESS.md` · Sổ phát hành: `release/releases.jsonl`

> ⚠️ **BẢN NÀY CHƯA KÝ SỐ (`NotSigned`).** Đây là **ngoại lệ luật 11** do chủ dự án chốt 23/09/2026
> (các bản 1.4.0–1.4.4 cũng `NotSigned`; Mac đã xác nhận **không có** chứng chỉ Authenticode — bus #305/#307).
> Hệ quả bắt buộc: email cho khách **KHÔNG được hứa "hết cảnh báo Windows"**; nếu khách báo bị chặn thì
> **ghi nhận để đo lường**.

## Có gì mới

1. **Sửa lỗi "bật VPN không bypass được ứng dụng Trung Quốc" trên đường relay.**
   Windows có 2 đường tunnel; đường **mặc định** là **relay hysteria2-over-WS + sing-box**. Trước đây
   bypass Trung Quốc chỉ nằm ở đường WireGuard, còn đường relay chỉ có **13 tên miền cứng**
   (Tencent + `.cn`).
   - **Đo thật:** đối chiếu **36 tên miền app TQ** phổ biến ⇒ trước chỉ **3/36 khớp**, nay **36/36**.
   - **Cách sửa:** rule `ip_cidr` đưa **7.509 dải IP Trung Quốc** (`cn.txt` 5.494 + `cn6.txt` 2.015)
     đi thẳng (`direct`), cộng **DNS nội địa `223.5.5.5`** cho **43 tên miền dịch vụ TQ**
     (alipay.com, taobao.com, baidu.com, jd.com, meituan.com, bilibili.com, douyin.com, …).
   - **Thứ tự rule** (quan trọng): `sniff → ip_is_private → ip_cidr → domain_suffix → hijack-dns`.
   - Tài liệu gốc + bằng chứng: `docs/handoff/HANDOFF_WINDOWS_KY_SO_2026-09-23.md` (§2.1, EVID-03..05, 13..17).
2. **Settings → About hiện số hiệu phiên bản và so với mốc server.**
   Mục **About** trong Settings hiển thị `Phiên bản 1.4.5 (build <commit>)` và dòng
   `Bản mới nhất trên server: 1.4.5 (khớp)` — hoặc `KHÁC bản đang cài` nếu lệch. Nhờ đó khách (và chủ dự án)
   đối chiếu được **bản đang cài** với `latest_version` trên server.

## Artifact & kênh phát hành

| Kênh | Artifact | Bytes | sha256 |
|---|---|---|---|
| `/dl/VPNFlow-Setup-1.4.5.exe` | `/var/www/flowvpn/dl/VPNFlow-Setup-1.4.5.exe` (bản sao `/var/www/dl/`) | 52.789.954 | `d6db58cb4427ee36cb6ca2db34c004df5b3f8f3aed898424fba72538631167a2` |

- `/buy` trỏ `https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.5.exe?v=d6db58cb`.
- Mốc server: `latest_version = 1.4.5`.
- Cài đè lên bản cũ (không cần gỡ); dữ liệu đăng nhập giữ nguyên.

## Bằng chứng đã kiểm (Mac publisher, độc lập lại bus-309)

| Mục | Lệnh / cách kiểm | Kết quả |
|---|---|---|
| sha256 trên node-2 (cả 2 docroot) | `sha256sum /var/www/flowvpn/dl/… /var/www/dl/…` | `d6db58cb…167a2` · **khớp** bus-309, cùng size 52.789.954 |
| Link tải qua CDN | `curl -I "https://t1.meetflowai.site/dl/VPNFlow-Setup-1.4.5.exe?v=d6db58cb"` | **HTTP 200**, `content-length: 52789954` |
| Trang mua | `curl -s https://t1.meetflowai.site/buy` | **HTTP 200**, có `dl/VPNFlow-Setup-1.4.5.exe?v=d6db58cb` |
| Sổ phát hành | `git show origin/main:release/releases.jsonl` | có dòng `origin=publish` + dòng `origin=tag` cho windows 1.4.5 |
| Tag | `git ls-remote --tags origin windows-v1.4.5` | tag (annotated) → commit `db6cf1c1555678f6460455ab97d224daf3caf14b` |

## Nghiệm thu

- **Email thông báo khách:** `scripts/send-windows-1.4.5-announcement.py` (3 ngôn ngữ vi/en/zh, host
  `t1.meetflowai.site`, hỗ trợ `support@meetflowai.site`). Số người nhận + Resend id ghi trong sổ
  **`bus-309`** và log `evidence/2026-09-23-windows-1.4.5-announcement.log`.
- **Nguồn sự thật** về bản phát hành: `release/releases.jsonl` (dòng publish) và
  `docs/handoff/HANDOFF_WINDOWS_KY_SO_2026-09-23.md` (EVID-17: đường build phát hành chạy trọn, commit `db6cf1c`).
