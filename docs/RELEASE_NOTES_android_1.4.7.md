# Release notes — Android **1.4.7** (versionCode **105**) — 24/10/2026

## Có gì mới

**1. Điện thoại làm gateway cho TV / máy khác trong nhà.**
Settings → **Chia sẻ điện thoại làm gateway LAN**. Khi bật, app mở một proxy HTTP trong mạng LAN
(cổng **18081**) chia sẻ đúng đường ra của VPN và tự trả lời gói dò tìm UDP **18099**
(`FLOWVPNGW?` → `FLOWVPNGW1 18081`) để app trên TV tự thấy gateway — không phải gõ IP.
Chỉ máy trong dải mạng riêng (192.168.x / 10.x / 172.16–31.x) mới dùng được; máy ngoài LAN bị từ chối.
Ở **mạng nhà (dải `192.168.100.*`)** app **tự bật** tính năng này khi bật VPN, rời mạng nhà thì tự tắt.

**2. Sửa gốc lỗi "VPN đã kết nối nhưng Google/YouTube vẫn bị chặn".**
Nguyên nhân: điện thoại còn IPv6, mà tunnel chỉ chở IPv4 ⇒ IPv6 rò thẳng ra mạng bị chặn.
Bản này đưa IPv6 **vào** tunnel để nó không rò, rồi bỏ gói đó (node hiện **không có IPv6 ra** —
`curl -6` từ node trả `000`) ⇒ app rơi về IPv4 ngay, Google/YouTube chạy lại.
Đo trên máy thật sau khi sửa: `google=302`, `youtube=200`, `curl -6 = 000` (không rò IPv6 ra ngoài).

**3. Tự chọn đường ra tốt nhất.** App chấm điểm từng đường ra (tunnel của máy, gateway LAN trong nhà,
gateway dự phòng) bằng **2 lần đo trên 2 kết nối mới** (`CONNECT` + TLS, 128 KB), điểm = **min** của
hai lần (chống số ảo do bùng nổ đầu phiên), rồi chọn đường điểm cao nhất; chỉ đổi đường khác khi
tốt hơn **≥15%** (tránh nhảy qua lại). Điểm được đo lại mỗi 5 phút và khi mở app.

**4. Keepalive tự hồi tunnel.** Chuông hệ thống 60 giây kiểm tra proxy/tunnel một lần, đưa lại đúng
cấu hình; nếu bị chặn (thiết bị vào chế độ tiết kiệm) thì thử lại sau 20 giây. Đã đo khôi phục sau
khi hệ điều hành giết app: yêu cầu qua lại sau ~4 giây, tunnel sẵn sàng sau ~70 giây.

## Không thay đổi

- Kênh phát, đăng nhập, thanh toán, danh sách node, gói Premium: **không đổi**.
- `minSdk`: modern **26**, legacy (Fire OS/Android 7) **24**.
- Mặc định **không** đổi hành vi mạng: "Đường ra" vẫn là **Tự động**; muốn khoá đường thì vào
  Settings → Đường ra → *Chỉ tunnel* / *Chỉ gateway*.

## Ai bị ảnh hưởng

- Tất cả người dùng Android hiện đại + legacy: cài đè (cùng chứng chỉ ký) — **không mất đăng nhập**.
- Người dùng TV qua điện thoại: bật công tắc gateway ở trên, TV tự dò thấy.
- Ai **không** bật gateway: không thấy khác biệt ngoài 3 mục sửa lỗi/tự chọn đường.

## Cách cập nhật

- App tự báo có bản mới (mốc server = **1.4.7**) hoặc tải tại `/v1/downloads/android`
  (`android-legacy` cho Android 7 / Fire OS).
- Cài đè (`adb install -r` hoặc mở APK) — không cần gỡ bản cũ.

## Ghi chú kỹ thuật

- Vì sao số là **1.4.7** chứ không phải 1.4.6: bản `1.4.6 / build 38` đã phát ngày 19/10 với sha256
  khác; luật **artifact bất biến** (`docs/VERSIONING.md` §3 luật 3) buộc dùng số mới. Chi tiết:
  `docs/RELEASE_ARTIFACTS_2026-10-24.md` §0.
- `versionCode 105` (bản trước: 1.4.6/38 ⇒ 1.4.5/103 trên kênh điện thoại), `versionName 1.4.7`.
- Kênh Android TV (`com.privatevpn.app.tv`) **không** nằm trong lần phát này — xem manifest §5.
