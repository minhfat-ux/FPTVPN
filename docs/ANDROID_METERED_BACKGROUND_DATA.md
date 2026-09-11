# Android: VPNFlow không thông mạng trên mobile data (metered) — điều tra & hướng fix

_Trạng thái: **CHƯA FIX** — đã ghi nhận bằng chứng + giả thuyết + kế hoạch test. Làm sau._

## 1. Triệu chứng
- Trên **wifi khách sạn (unmetered)**: app chạy tốt — node1/node2 đều UP qua TCP relay 8443, ổn định nhiều phút.
- Trên **mobile data Trung Quốc (metered)**: app connect thất bại. Log: TCP relay 8443/9445 `connect fail ... after 2500ms`, UDP 8443/28443/54443 `timeout: no recent network activity` → hết lượt thử → service tự đóng.
- Cùng lúc đó, **shell trên chính máy đó vẫn kết nối được** node1:8443 / 9445 / 443 (probe 10/10 OK).

## 2. Bằng chứng then chốt (đã đo)
1. `nc` chạy **trong uid app** (`adb shell run-as com.privatevpn.app … nc -z -w 3 103.173.155.50 8443`) → **FAIL**
   `nc` từ **shell (uid 2000)** cùng đích → **OK**
   ⇒ Chặn ở **phía máy**, theo **UID của app**. Carrier không thể thấy UID.
2. `dumpsys netpolicy | grep -A2 10366`:
   ```
   UID=10366 state={procState=TOP,…}
     blocked_state={blocked=APP_BACKGROUND,
                    allowed=FOREGROUND|TOP|NOT_IN_BACKGROUND|METERED_FOREGROUND,effective=NONE}
   ```
   ⇒ Policy: **chặn data khi app ở BACKGROUND**; foreground vẫn được. Trên mạng **metered** (mobile data) điều này rất dễ trúng trong lúc retry dài (2 phút/lượt) khi app không còn ở foreground (tắt màn hình / chuyển app) — và cũng khớp triệu chứng "đóng app là VPN mất".
3. `dumpsys appops` cho uid 10366: `ACTIVATE_VPN (allow)` — không phải lỗi permission VPN. App `not suspended / not restricted` theo `dumpsys package`.
4. Không có **VPN "ma"**: khi service đã dừng thì `tun0` biến mất, không còn `NetworkAgentInfo` VPN, không còn `ip rule` riêng cho uid 10366.

## 3. Giả thuyết (xếp theo khả năng)
1. **Chặn "background data" theo app trên mạng metered** (Samsung CN ROM / Data Saver / standby bucket) → đúng với bằng chứng #2.
2. App nằm trong **standby bucket hạn chế** → background network bị cắt (kiểm bằng `am get-standby-bucket com.privatevpn.app`).
3. (Ít khả năng) ROM TQ có "quản lý dữ liệu theo app" riêng (Smart Manager) bật cho VPNFlow.

> Loại trừ: node1/node2 chết, transport hỏng, code connect sai — vì cùng lúc shell connect được và wifi chạy tốt.

## 4. Test có kiểm soát (chạy khi có USB)
```bash
# 0. cắm cáp; chỉ dùng mobile data
adb shell svc wifi disable; adb shell svc data enable
# 1. policy & bucket hiện tại
adb shell "dumpsys netpolicy | grep -A2 10366"
adb shell am get-standby-bucket com.privatevpn.app
adb shell cmd netpolicy list restrict-background-uids
# 2. so sánh uid app vs shell NGAY CÙNG LÚC
adb shell "run-as com.privatevpn.app toybox nc -z -w 3 103.173.155.50 8443; echo app=\$?"
adb shell "toybox nc -z -w 3 103.173.155.50 8443; echo shell=\$?"
# 3. thử whitelist background data cho uid app (test nhanh, có thể revert)
adb shell cmd netpolicy add restrict-background-whitelist 10366
# 4. lặp lại bước 2 khi app ở FOREGROUND (màn hình bật, app visible) và khi BACKGROUND (tắt màn hình)
```
Kết luận cần đạt: app-uid chỉ fail khi BACKGROUND + metered ⇒ xác nhận giả thuyết #1.

## 5. Hướng fix (chọn sau khi test)
**A. Phía user (nhanh, không đủ cho mọi khách)**
- Cài đặt → Ứng dụng → FlowVPN → Dữ liệu di động → bật **"Cho phép dữ liệu nền"**; tắt Data Saver; Pin → "Không hạn chế".

**B. Phía app (giải pháp thật) — giữ process ở mức foreground khi connect**
- Đưa `HysteriaVpnService` lên **foreground service** khi đang kết nối/đã kết nối ⇒ không bị coi là background ⇒ không bị cắt data.
- Ràng buộc cần xử lý: Android 15/16 **đã bỏ FGS type `vpn`** khỏi `android:foregroundServiceType` (đã kiểm bằng aapt2 dump android-36: attr chỉ có 14 flag, không có `vpn`) ⇒ phải dùng type khác (`specialUse` kèm mô tả, hoặc `dataSync`) — **lưu ý Play review** với `specialUse`/`dataSync` (cần khai lý do, và `dataSync` bị giới hạn 6h/ngày).
- Đây là fix ưu tiên vì giải quyết luôn cả "đóng app là VPN mất" (hiện chỉ có `stopWithTask=false` + START_STICKY).

**C. Phía app (hỗ trợ) — phát hiện & hướng dẫn**
- Dùng `ConnectivityManager.isActiveNetworkMetered` + kiểm tra `NetworkCapabilities` khi connect: nếu metered và connect fail → hiện thông báo chỉ user bật "dữ liệu nền"/"không hạn chế" cho app.
- Có thể gọi `bindProcessToNetwork()` cho mạng cellular để ổn định socket (chưa chắc vượt được policy per-uid, cần test).

## 6. Việc cần làm khi quay lại (checklist)
- [ ] Cắm USB, chạy mục 4, chốt giả thuyết
- [ ] Nếu đúng: triển khai hướng **B** (foreground service) trên branch `main`/`web`, test trên data TQ thật
- [ ] Đo lại: connect thành công trong bao lâu, tự reconnect khi rớt, và **giữ VPN khi tắt màn hình / swipe app**
- [ ] Đồng bộ fix sang branch `store` (Play) nếu cần — chú ý khai báo FGS type đúng luật Play
