# Handoff — Windows 1.4.6: HOTFIX DNS (khách Trung Quốc mất mạng / không vào được Google-YouTube)

- **Agent:** worker (owner `windows`)
- **Ngày:** 2026-09-23
- **Trạng thái:** ✅ **ĐÃ VERIFY TRÊN MÁY THẬT (mạng TQ)** — chờ **COMMITTER** tích hợp + **PUBLISHER** phát hành
- **Người nhận:** COMMITTER (agent chính) và PUBLISHER (kênh Windows)

---

## 0. Cho COMMITTER — việc cần làm

**4 commit LOCAL chưa lên `origin/main`** (origin đang đi trước 6 commit ⇒ nhánh phân kỳ, worker
**không tự merge/rebase** theo `AGENTS.md` §1):

| Commit | Nội dung |
|---|---|
| `e5f999c` | HOTFIX DNS: `hijack-dns` lên đầu + `detour` cho DNS server |
| `f7ffbe2` | Sửa lỗi của chính bản vá: bỏ `detour:"direct"` (sing-box 1.14 FATAL) |
| `a3ea7c9` | Sửa thứ tự rule: `sniff` phải TRƯỚC `hijack-dns` |
| (commit này) | Handoff |

**File thay đổi (chỉ 2 file code):**
- `windows/PrivateVPNWindows.Core/Tunnel/SingBoxConfigBuilder.cs`
- `windows/PrivateVPNWindows.Core.Tests/SingBoxConfigBuilderTests.cs`

**Lưu ý:** `docs/ANDROID_CHINA_ROM_TASKS.md` đang untracked nhưng **KHÔNG phải** của worker — đừng gộp
vào commit này.

---

## 1. Cho PUBLISHER — việc cần làm

**Ưu tiên CAO**: khách Trung Quốc trên bản 1.4.5 **không dùng được** (mất mạng / Google-YouTube chết).

```powershell
# build từ commit a3ea7c9 (cây windows/ đã sạch)
powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -Version 1.4.6
```

- Bộ cài ra `windows/installer/out/VPNFlow-Setup-1.4.6.exe`.
- ⚠️ **Bản 1.4.6 hiện CHƯA KÝ** ⇒ luật 11 (`PUBLISHER_PROCESS` §0) yêu cầu chứng chỉ. Cần **ngoại lệ
  có ghi sổ của chủ dự án** như đã làm với 1.4.5, hoặc chờ chứng chỉ (đang chờ Mac harness gửi).
- Bằng chứng bắt buộc: pre-gate + post-gate (`scripts/check-publish-version.py --platform windows`),
  cộng `sha256`/size khớp ở cả 2 docroot; nếu có ký thì thêm `signtool verify /pa` + `Get-AuthenticodeSignature`.
- Nên thông báo khách cũ cập nhật (bản sửa lỗi nghiêm trọng).

---

## 2. Triệu chứng khách báo

> "bật VPN thì **mất mạng**; **google, youtube và các link cần VPN không vào được**; trong khi **app/web
> Trung Quốc vẫn chạy bình thường**."

Triệu chứng "site TQ chạy, link ngoài chết" là dấu hiệu **tunnel đã lên nhưng phân giải tên miền hỏng**.

---

## 3. Gốc lỗi

Bản 1.4.5 thêm rule bypass Trung Quốc (`ip_cidr` → `direct`) nhưng đặt **sai thứ tự**, và DNS server
**thiếu `detour`**. Hai lỗi cộng lại:

### 3.1. DNS của khách bị đẩy đi thẳng (không được hijack)

Rule `ip_cidr` (dải TQ → `direct`) đứng **trước** `hijack-dns`. Khách ở TQ khai resolver là IP Trung Quốc
hoặc IP nội bộ (`10.x`) ⇒ truy vấn DNS tới đó **khớp `outbound: direct`** ⇒ đi thẳng ra resolver TQ.

Bằng chứng `sing-box.log` (phiên 1.4.5):
```
inbound/tun[tun-in]: inbound packet connection to 10.193.111.16:53
outbound/direct[direct]: outbound packet connection          ← DNS KHÔNG bị hijack
```

### 3.2. DNS upstream của sing-box đi thẳng (không qua tunnel) ⇒ bị GFW nhiễm độc

DNS server `remote` (1.1.1.1) **không có `detour`** ⇒ sing-box tự dial thẳng ra ngoài, không qua tunnel.
Bằng chứng (đo được **IP nhiễm độc** trả về):
```
dns: exchanged A www.youtube.com    -> 69.171.235.22   ← IP của FACEBOOK, không phải YouTube
dns: exchanged A www.google.com     -> 69.171.235.22
dns: exchanged AAAA www.google.com  -> 2001::1         ← địa chỉ rác kinh điển của GFW
KHÔNG có dòng nào: outbound/socks[hyrelay] ... to 1.1.1.1:53
```

⇒ Phân giải tên miền hỏng/nhiễm độc ⇒ máy như **mất mạng**; site TQ vẫn chạy vì tên miền TQ đi thẳng.

---

## 4. Bản vá (và 2 lỗi của chính bản vá — ghi lại để không lặp)

| Vòng | Thay đổi | Kiểm chứng | Kết quả |
|---|---|---|---|
| 1 (`e5f999c`) | `hijack-dns` lên đầu; `remote` thêm `detour:hyrelay`; `cn` thêm `detour:direct` | `sing-box check` exit 0 | ❌ **SAI**: `check` không bắt được lỗi lúc `run` |
| 2 (`f7ffbe2`) | Bỏ `detour` ở `cn` | **chạy thật** (mixed inbound, không cần admin) | ❌ **SAI**: đặt `hijack-dns` trước `sniff` ⇒ matcher `protocol` không khớp |
| 3 (`a3ea7c9`) | Thứ tự cuối: `sniff → hijack-dns → ip_is_private → ip_cidr → domain_suffix` | chạy thật + log trên máy thật | ✅ **ĐẠT** |

**Hai bài học phải nhớ:**
1. `sing-box check` **KHÔNG** bắt được lỗi lúc khởi động (FATAL `detour to an empty direct outbound`).
   Phải **chạy thật** — cách không cần admin: thay `tun` inbound bằng `mixed` rồi `sing-box run`.
2. Matcher `protocol` của sing-box chỉ khớp **SAU khi đã `sniff`** ⇒ `sniff` phải đứng trước `hijack-dns`.

---

## 5. VERIFY trên máy thật (mạng Trung Quốc, sau khi Connect lại)

| Phép đo | Trước (1.4.5) | Sau (bản vá) |
|---|---|---|
| DNS từ resolver của khách (`10.193.111.x:53`) bị đẩy `outbound/direct` | **356 lần** | **0 lần** ✅ |
| sing-box tự trả lời DNS (`dns: exchanged`) | 0 | **266 lần** ✅ |
| DNS upstream `1.1.1.1` | đi thẳng (bị nhiễm độc) | **qua `outbound/socks[hyrelay]`** ✅ |
| `nslookup www.youtube.com` qua resolver thật | `104.244.42.197` (IP Twitter) | **`142.251.154.4`** (thật) ✅ |
| `nslookup www.google.com` qua resolver thật | `69.171.235.22` (IP Facebook) | **`142.251.151.119`** (thật) ✅ |
| google / youtube / github | không vào được | **200 / 200 / 200** ✅ |
| baidu / taobao / alipay / weixin / dianping / meituan / jd / bilibili | — | **200 hết** (0,08–1,7 s, đi thẳng) ✅ |
| Thứ tự rule trong `sing-box.json` | `hijack-dns` trước `sniff` | `sniff → hijack-dns → ip_is_private → ip_cidr(7509) → domain_suffix(57)` ✅ |
| `dns.servers` | `remote`, `cn` (không detour) | `remote(detour=hyrelay)`, `cn` (không detour) ✅ |

Kiểm tự động: `dotnet test` **218/218 pass**; test đã khoá **cả 3 điều kiện thứ tự** + `detour` để không tái phát.

---

## 6. Rủi ro / chưa làm

- **Chưa ký số** ⇒ khách bật Smart App Control có thể không cài/chạy được (đã xảy ra thật trên máy test:
  SAC chặn `PrivateVPNWindows.App.exe` hash mới lúc 17:54). Cần chứng chỉ (đã yêu cầu Mac harness, tin
  `agent-bus #298`) hoặc ngoại lệ có ghi sổ.
- **API `api.meetflowai.site` chập chờn từ mạng TQ**: đo 5 lần liên tiếp có **1 lần fail** (timeout 21 s),
  4 lần HTTP 200 (~1,4 s). App báo `ApiTransportException` khi trúng lần fail ⇒ khách phải bấm Connect lại.
  Đây là vấn đề **hạ tầng/Cloudflare**, không phải bản vá này.
- `qq.com` trả **501** khi gọi bằng curl — đó là phản hồi của chính server, không phải lỗi mạng.
- Chưa đo định lượng "byte tunnel không tăng khi chỉ dùng app TQ" (chủ dự án xác nhận bằng tay là chạy được).

---

## 7. Việc tiếp theo

1. **COMMITTER**: tích hợp 4 commit local + push (nhánh đang phân kỳ với `origin/main`).
2. **PUBLISHER**: build `1.4.6` từ `a3ea7c9`, chạy pre/post-gate, phát hành + thông báo khách (ưu tiên cao).
3. **Chủ dự án**: chốt chứng chỉ ký số (đang chờ Mac harness) — hoặc cho ngoại lệ luật 11 cho 1.4.6.
