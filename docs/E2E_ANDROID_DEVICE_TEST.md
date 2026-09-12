# E2E Device Test — Android (VPNFlow 1.2.4)

- **Thiết bị chuẩn:** Samsung Galaxy Z Fold5 (SM-F9460, Android 16), kết nối USB/adb
- **Ngày as-built:** 2026-09-12 · **Rule:** mọi test phải có bằng chứng độc lập (log adb + quan sát của người dùng), không tin trạng thái UI

## Chuẩn bị
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
adb install -r $HOME/.vpnflow-build/app/outputs/apk/debug/app-debug.apk   # bản debug cài đè, giữ đăng nhập
adb logcat -c && nohup adb logcat -v time > /tmp/device-log.txt &
adb shell am start -n com.privatevpn.app/.MainActivity
```
Đối chiếu nhanh sau mỗi lần connect:
```bash
grep -E "VPNFLOW_DEBUG" /tmp/device-log.txt | tail -8
adb shell "ip addr show tun0 | grep -c 100.100.100.101"          # 1 = tunnel đang lên
adb shell "dumpsys activity services com.privatevpn.app | grep -c ServiceRecord"
```

## TC-1 Connect trên WiFi (baseline)
- Bấm **Connect** → trong ≤5 s log có `UP via TCP relay 8443` hoặc `UP via UDP …`, tun0 = 1, có notification foreground.
- ✅ Đã verify: `hysteria: UP via TCP relay 8443 tun=143` sau **2.6 s**.

## TC-2 Mobile data + app ở BACKGROUND (case hồi quy chính — lỗi "chập chờn")
1. Tắt WiFi, bật **mobile data**
2. Bấm **Connect** rồi **bấm Home ngay** (app xuống background), chờ 60–90 s
3. Mở trình duyệt (qua VPN) và kéo thanh thông báo
- **Pass:** có mạng, notification `VPNFlow · VPN active` vẫn còn, log không có chuỗi `no transport reachable` lặp vô hạn
- **Fail cũ (1.2.2 trở về trước):** connect fail khi app ở background vì `netpolicy blocked=APP_BACKGROUND` trên mạng metered
- Bằng chứng bổ trợ: `adb shell "dumpsys netpolicy | grep -A2 'UID=10366'"` (blocked=APP_BACKGROUND) + `dumpsys notification | grep -c vpn_foreground`

## TC-3 Disconnect sạch
Bấm **Disconnect** → log `requestStop → Mobile.stop()`; sau vài giây: `ServiceRecord = 0`, `tun0` biến mất, notification mất, **internet thường vẫn chạy** (không được để máy mất mạng).
- Nếu onDestroy không chạy (Android trì hoãn), `requestStop()` đã gọi `Mobile.stop()` trực tiếp ⇒ thread tự đóng TUN + `stopSelf()`.

## TC-4 Đóng app (swipe khỏi Recent) → VPN phải còn
- Manifest: `android:stopWithTask="false"` + foreground service ⇒ swipe xong, `tun0` vẫn 1, notification vẫn còn.

## TC-5 Giới hạn 3 thiết bị
1. Tài khoản có **>3 thiết bị active** → bấm Connect
2. **Pass:** dialog "Đã đạt giới hạn thiết bị" liệt kê thiết bị (máy đang dùng có nhãn **"Thiết bị này"**, không có nút logout), log `device limit reached: N devices`
3. Bấm **Đăng xuất** ở một thiết bị cũ → app tự connect lại; server log `device limit: user=… has N active devices…` khi vẫn vượt, và claim tạo mới khi đã ≤3
- Kiểm tra server: `python3 -c` đọc `/root/flowvpn-cp/data/devices.json` đếm theo `userId` (xem `docs/DEVICE_LIMIT.md`)

## TC-6 Nhớ transport
```bash
adb shell "run-as com.privatevpn.app cat shared_prefs/vpnflow_hysteria.xml"
```
- Pass: có `last_good_transport` (ví dụ `tcp:8443`), và lần connect sau log `UP via …` đúng transport đó trước khi thử cổng khác.

## TC-7 Node2 (UDP bị chặn) vẫn dùng được
- Chọn **Vietnam 2** → Connect: phải lên qua **TCP relay** (UDP sẽ timeout vì GFW chặn UDP tới IP node2).
- ✅ Đã verify 2026-09-09: `UP via TCP relay 8443` tới `103.6.234.233`.

## Ghi chú vận hành
- Máy test hay **tự tắt USB debugging** ⇒ `adb devices` rỗng dù cáp vẫn cắm: bật lại trong Developer options rồi rút/cắm cáp.
- Muốn test từ **mạng Trung Quốc** thì dùng chính điện thoại (shell ≈ vantage TQ); `check-host.net` không có node TQ (chỉ HK).
