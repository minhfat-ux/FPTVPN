# Giới hạn 3 thiết bị / tài khoản

## Quy tắc
Mỗi tài khoản dùng VPNFlow tối đa **3 thiết bị đang hoạt động**. Thiết bị đã "đăng xuất" (revoke)
được giải phóng ngay, nên user luôn có cách tự xử lý: **đăng xuất một thiết bị cũ để dùng thiết bị mới**.

## Server (control-plane)
- Env `MAX_DEVICES_PER_USER` (mặc định **3**) trong unit `flowvpn-cp`.
- `POST /v1/devices/claim` (cần Bearer token) — app gọi **mỗi lần connect** ở chế độ hysteria
  (chế độ này không tạo WireGuard peer nên không đi qua `/v1/peers/register`):
  - body: `{ device_key, name, platform }` — `device_key` = public key WireGuard của bản cài (ổn định theo máy)
  - thiết bị đã tồn tại → cập nhật `lastSeenAt`, trả `200 { ok, device_id, created:false }`
  - thiết bị đã bị revoke → `403 device_revoked`
  - tài khoản đã đủ 3 thiết bị hoạt động → **`403 device_limit_reached`** kèm `devices: [...]` (đúng shape của `GET /v1/devices`)
- Chế độ WireGuard (`/v1/peers/register`) cũng chặn tương tự trong `registerDeviceWithPayload`.
- ⚠️ Bài học khi viết code store: **không** dùng snapshot `store.all()` cũ để `_save()` sau khi
  `upsertByPublicKey` đã ghi — sẽ xoá mất bản ghi vừa tạo (bug đã gặp và đã sửa).

## App (Android)
- `ControlAPIClient.claimDevice(...)`; lỗi 403 → `ClientError.DeviceLimit(devices)`.
- `VPNManager`: gọi claim trước khi start service (`claimDeviceThenStart()`), khi dính giới hạn thì
  phát `deviceLimit: StateFlow<List<CoordinatorDevice>?>`, UI hiện dialog.
- UI: dialog **DeviceLimitDialog** (5 ngôn ngữ) liệt kê thiết bị, mỗi dòng có nút **Đăng xuất**;
  chọn xong → `logOutDeviceAndRetry(deviceId)` → revoke rồi connect lại. Có nút "Để sau" để đóng.
- Chuỗi i18n: `deviceLimitTitle`, `deviceLimitBody`, `deviceLimitLogout`.

## Cách test
```bash
# lấy token
TOKEN=$(curl -s -X POST http://127.0.0.1:7778/v1/auth/email/start -H 'Content-Type: application/json' -d '{"email":"review@meetflowai.site","lang":"en"}' >/dev/null; \
        curl -s -X POST http://127.0.0.1:7778/v1/auth/email/verify -H 'Content-Type: application/json' -d '{"email":"review@meetflowai.site","code":"246810"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
# claim 4 thiết bị giả -> cái thứ 4 phải bị 403 device_limit_reached
for i in 1 2 3 4; do curl -s -X POST http://127.0.0.1:7778/v1/devices/claim -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"device_key\":\"TESTKEY-$i\",\"name\":\"Test $i\"}" | head -c 120; echo; done
```
Đã test ngày 2026-09-12: 3 claim đầu `created:true`, claim thứ 4 trả 403 kèm danh sách thiết bị.
