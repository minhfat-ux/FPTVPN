# BUGREPORT — Tunnel MTU/DNS làm hỏng app bên thứ ba (Firebase Auth)

**Người báo:** đội MeetFlow AI (Android)
**Ngày:** 2026-09-20
**Mức độ:** High — chặn hoàn toàn chức năng của app khác khi VPN bật
**Đối tượng cần check:** dev phụ trách `VPNFlow` / tunnel Hysteria (Android client)

---

## 1. TL;DR

Khi bật VPN (`com.privatevpn.app`, session `VPNFlow Hysteria`), **phân giải DNS qua tunnel chập chờn** và **TLS handshake bị reset**. Hệ quả: app **MeetFlow AI** (`com.meetflow.translator`) không lấy được Firebase ID token → gọi backend bị trả `429 unauthenticated` → tính năng dịch realtime chết hoàn toàn.

Nghi vấn chính: **MTU tunnel = 1500 quá lớn so với overhead của Hysteria (QUIC/UDP)**, cộng thêm **DNS trong tunnel chỉ có 1 resolver, không retry / không TCP / không DoH fallback**.

App MeetFlow **không có lỗi** — cùng máy đó, tắt VPN là chạy bình thường.

---

## 2. Môi trường tái hiện

| Thành phần | Giá trị |
|---|---|
| Thiết bị | Samsung SM-F9460 (Galaxy Z Fold5), Android SDK 36 |
| Mạng nền | WiFi `ICONLABHOTEL` (`wlan0`, IP 10.0.3.135) + Mobile `rmnet_data7` (MTU 1400) |
| App VPN | `com.privatevpn.app` (uid 10375) |
| Session | `VpnTransportInfo{type=1, sessionId=VPNFlow Hysteria, bypassable=false}` |
| Interface | `tun0`, `100.100.100.101/30` |
| DNS tunnel cấp | `1.1.1.1` |
| **MTU tunnel** | **1500** |
| Route | `0.0.0.0/0 -> tun0` (full tunnel) |
| Uid áp dụng | `<{0-99999}>` (mọi app, không loại trừ) |

Lấy lại cấu hình:

```bash
adb shell dumpsys connectivity | grep -iE 'VpnTransportInfo|InterfaceName: tun0|DnsAddresses|MTU'
adb shell ip route show table all | grep -i tun
```

---

## 3. Triệu chứng

### 3.1 Từ phía app (log trên máy)

```
E AuthRepo: Caused by: com.google.firebase.FirebaseNetworkException:
    A network error (such as timeout, interrupted connection or unreachable host) has occurred.
    at com.meetflow.translator.data.auth.AuthRepository.ensureUserBlocking(AuthRepository.kt:100)

E LiveTranslate: Suppressed: java.net.SocketException: Connection reset
    at com.android.org.conscrypt.ConscryptEngineSocket.doHandshake(ConscryptEngineSocket.java:242)
E LiveTranslate: fail(): TEMP_KEY_FAILED
```

→ `signInAnonymously()` (Firebase Auth) fail → không có ID token → backend trả `429`.

### 3.2 Từ phía mạng (ping = test DNS + ICMP qua tunnel)

```bash
adb shell ping -c 1 -W 3 <host>
```

| Host | Kết quả qua VPN | Ghi chú |
|---|---|---|
| `google.com` | unknown host | |
| `www.google.com` | 142.251.154.119 | cùng domain, lúc được lúc không |
| `identitytoolkit.googleapis.com` | 172.217.114.4 | Firebase Auth |
| `securetoken.googleapis.com` | unknown host | **refresh token** |
| `firebaseinstallations.googleapis.com` | unknown host | FCM / App Check |
| `api.meetflowai.site` | 172.67.175.138 | backend MeetFlow |
| `stt-rt.soniox.com` | unknown host | WebSocket dịch realtime |
| `facebook.com` | unknown host | |

**Đặc điểm:** cùng một resolver, cùng thời điểm, host này resolve được host kia không → **không phải chặn theo domain, mà là mất gói / MTU**.

### 3.3 Đối chứng (chứng minh không phải lỗi Firebase/backend)

Chạy từ Mac **không qua VPN**:

```bash
# Firebase Auth hoạt động
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<API_KEY>" \
     -H 'Content-Type: application/json' -d '{"returnSecureToken":true}'
# -> 200, trả về idToken hợp lệ

# Backend sống
curl -o /dev/null -w '%{http_code}' https://api.meetflowai.site/meetflow/health
# -> 200
```

→ Firebase Auth + backend **bình thường**. Vấn đề chỉ xuất hiện khi đi qua tunnel.

---

## 4. Phân tích nguyên nhân

### 4.1 MTU 1500 + đóng gói Hysteria → gói vượt path-MTU

Hysteria chạy trên QUIC/UDP, mỗi gói bị bọc thêm header (UDP/IP + QUIC + auth/frame của Hysteria), thực tế tốn thêm khoảng **60–100 byte**. Với `MTU = 1500` trên `tun0` trong khi đường nền chỉ 1400–1500:

```
payload 1500  +  overhead Hysteria (~60-100)  =  1560-1600  >  path MTU
        -> phân mảnh / bị drop
        -> DNS response lớn (nhiều bản ghi) mất   -> "unknown host" ngẫu nhiên
        -> TLS ClientHello/ServerHello (gói lớn) mất -> Connection reset
```

`Connection reset` **ngay trong `doHandshake`** là dấu hiệu kinh điển của MTU sai trong tunnel, không phải DNS hỏng thuần tuý.

### 4.2 DNS trong tunnel không có khả năng chịu lỗi

- Chỉ cấp **1 resolver** (`1.1.1.1`), đi qua chính đường UDP đang rớt gói.
- **Không có retry**, **không fallback TCP:53**, **không DoH**.
- `bypassable=false` + `Uids <{0-99999}>` → mọi app đều bị buộc đi qua, không có đường thoát.

### 4.3 Hệ quả dây chuyền

```
MTU/tunnel rớt gói
   |
   v
DNS Firebase fail (securetoken / firebaseinstallations)
   |
   v
Firebase Auth: FirebaseNetworkException -> không có ID token
   |
   v
Request tới backend không có Authorization header
   |
   v
Backend coi là "unauthenticated" -> HTTP 429
   |
   v
App báo lỗi "Something went wrong, please try again"
```

> Lưu ý: `429` là **triệu chứng**, không phải nguyên nhân. Backend chỉ phản ánh việc thiếu token.

---

## 5. Phạm vi ảnh hưởng

Mọi app cần Google/Firebase hoặc các host trong bảng §3.2 sẽ hỏng khi bật VPN, tiêu biểu:

- Firebase Auth / FCM / Play Integrity (mọi app dùng Google Services)
- MeetFlow AI: auth, lấy temp key Soniox, WebSocket dịch realtime
- Bất kỳ app nào dùng `*.googleapis.com`

Đây là lỗi **ảnh hưởng khách hàng của chính VPNFlow**, không chỉ nội bộ.

---

## 6. Đề xuất sửa (theo thứ tự ưu tiên)

### P0 — Hạ MTU tunnel
- Đặt MTU `tun0` trong khoảng **1280–1360**, khuyến nghị **1280**.
- Tốt hơn: MTU discovery / clamp theo MTU của mạng nền (`rmnet_data7` đang là 1400).
- **Đây là fix quan trọng nhất** — giải quyết cả DNS lẫn TLS reset.

### P0 — DNS chịu lỗi trong tunnel
- Cấp **>= 2 resolver** (ví dụ `1.1.1.1` + `8.8.8.8`), có retry sang resolver thứ 2.
- **Fallback TCP:53** khi UDP:53 timeout.
- Cân nhắc **DoH/DoT** để tránh UDP bị rớt.

### P1 — Bypass list / split-tunnel
Cho phép các host thiết yếu đi thẳng (không qua tunnel):

```
*.googleapis.com
identitytoolkit.googleapis.com
securetoken.googleapis.com
firebaseinstallations.googleapis.com
api.meetflowai.site
stt-rt.soniox.com
```

Hỗ trợ cả 2 chế độ: **theo host/domain** và **theo app (package name)**.

### P2 — `bypassable = true`
Để app có thể tự opt-out từng kết nối khi cần (hiện đang `false`).

---

## 7. Cách kiểm chứng sau khi sửa

```bash
# 1) MTU tunnel đã hạ chưa
adb shell dumpsys connectivity | grep -iE 'InterfaceName: tun0|MTU'

# 2) DNS phải resolve ĐỦ 8 host, chạy 3 lần liên tiếp không được sai host nào
for h in google.com identitytoolkit.googleapis.com securetoken.googleapis.com \
         firebaseinstallations.googleapis.com api.meetflowai.site \
         stt-rt.soniox.com www.google.com facebook.com; do
  printf '%-38s %s\n' "$h" "$(adb shell ping -c 1 -W 3 $h 2>&1 | grep -oE 'unknown host|[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
done
```

**Tiêu chí PASS:**
1. Cả 8 host resolve thành IP ở **3 lần chạy liên tiếp**.
2. App MeetFlow AI bật VPN → bấm mic → lấy được temp key → phiên dịch chạy.
3. Log không còn `FirebaseNetworkException` và `SocketException: Connection reset`.

---

## 8. Bước tái hiện tối thiểu

1. Bật VPN (full tunnel) trên thiết bị Android.
2. `adb shell ping -c 1 google.com` → quan sát `unknown host` ngẫu nhiên.
3. Mở MeetFlow AI → bấm mic → quan sát lỗi.
4. `adb logcat -s AuthRepo:E LiveTranslate:E` → thấy `FirebaseNetworkException` + `Connection reset`.
5. Tắt VPN → lặp lại bước 3 → chạy bình thường.

---

## 9. Phụ lục — dữ liệu thô

```
VpnTransportInfo{type=1, sessionId=VPNFlow Hysteria, bypassable=false}
InterfaceName: tun0   LinkAddresses: [100.100.100.101/30]
DnsAddresses: [/1.1.1.1]   MTU: 1500
Routes: [0.0.0.0/0 -> 0.0.0.0 tun0, 100.100.100.100/30 -> 0.0.0.0 tun0]
Uids: <{0-99999}>   OwnerUid: 10375
UnderlyingNetworks: [974]   # WiFi ICONLABHOTEL

# Mạng nền
rmnet_data7 (MOBILE NR): MTU 1400
wlan0 (WIFI): MTU mặc định, gateway 10.0.3.254
```

```
# Log app MeetFlow AI khi lỗi
E AuthRepo: FirebaseNetworkException: A network error ... has occurred.
    at AuthRepository.ensureUserBlocking(AuthRepository.kt:100)
E LiveTranslate: Suppressed: java.net.SocketException: Connection reset
    at ConscryptEngineSocket.doHandshake(ConscryptEngineSocket.java:242)
E LiveTranslate: fail(): TEMP_KEY_FAILED

# Backend phản hồi (do thiếu token)
HTTP 429 {"error":{"code":"rate_limited","message":"Too many unauthenticated requests. Please sign in."}}
```

---

## 10. Liên hệ

Cần phối hợp kiểm chứng end-to-end (VPN bật + MeetFlow AI chạy phiên dịch) thì liên hệ đội MeetFlow AI (repo `FChinaTranslator/android`).
