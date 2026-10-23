# Agent Handoff

- **Agent:** harness Mac (worker) → giao **harness Windows** (publisher Android)
- **Task ID:** HANDOFF-WINDOWS-AUTO-GATEWAY-2026-10-23
- **Date:** 2026-10-23
- **Status:** blocked (chờ Windows sửa — app Android đang dùng IP cứng cho gateway LAN)

## Summary

TV `MiTV-AFZP0` (Android 14, không TUN) ép traffic qua **proxy hệ thống**. Có 2 nguồn: **đường TV**
`127.0.0.1:1081` (LocalProxy của app) và **gateway LAN** (máy trong nhà chạy `tools/lan-proxy` cổng
`18081`). `ProxyDirector` đã chọn tuyến theo **đo thật** (`probeQuality`: CONNECT + TLS + tải 128 KB,
điểm = kbps, nhớ 5 phút, hysteresis 15%) — phần này tốt. **Nhưng tập ứng viên là IP cứng**
(`Config.PROXY_GATEWAY_DEFAULT` + prefs), không tự dò host mới.

Ngày 23/10/2026 Mac đổi IP DHCP `.5 → .3`; app vẫn ghi proxy `192.168.100.5:18081` (cổng mở nhưng
proxy chết, ~4 KB/s) ⇒ FPT Play không load video; phải sửa tay prefs. Đề nghị Windows sửa
`ProxyDirector` để **tự dò gateway LAN** (quét subnet tìm host mở `:18081`, chấm bằng `probeQuality`
sẵn có) thay vì dựa vào IP cứng.

## Files Changed

| Path | Change Summary |
|---|---|
| `docs/handoff/HANDOFF_WINDOWS_AUTO_GATEWAY_2026-10-23.md` | **mới** — handoff này (chỉ tài liệu; chưa sửa code) |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Giao Windows sửa `android/` (không tự sửa từ Mac) | `AGENTS.md` §0: Windows phát hành Windows + Android | handoff này |
| Giữ `probeQuality` làm thước đo, chỉ thêm bước dò địa chỉ | Phép đo throughput đã đúng; lỗi nằm ở tập ứng viên tĩnh | §Appendix A |
| Tạm thời: DHCP reservation / dùng tunnel TV | Không phụ thuộc code, chặn sự cố ngay | §Appendix B |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20261023-01 | runtime_checked | proxy TV `.5:18081` ~**4 KB/s** (timeout 15 s) — cổng mở, proxy chết |
| EVID-20261023-02 | runtime_checked | proxy Mac mới `.3:18081` ~**244 KB/s**, egress `165.101.114.162` |
| EVID-20261023-03 | runtime_checked | trực tiếp (không proxy) ~688 KB/s |
| EVID-20261023-04 | runtime_checked | prefs app: `proxy_gateway=.3,.5,.11`, `proxy_mode=auto` — nhưng `http_proxy` vẫn `.5` |
| EVID-20261023-05 | code_checked | `Config.PROXY_GATEWAY_DEFAULT="192.168.100.11:18081,192.168.100.5:18081"`, `ProxyDirector.gateways()` chỉ đọc prefs/default |

## Validation Performed

```text
# trên TV .104 (adb)
settings get global http_proxy                      -> 192.168.100.5:18081
run-as com.privatevpn.app.tv.dev cat shared_prefs/vpnflow_hysteria.xml
  -> proxy_gateway = 192.168.100.3:18081,192.168.100.5:18081,192.168.100.11:18081
  -> proxy_mode    = auto

# đo từ Mac
curl -x http://192.168.100.5:18081 ...   -> code=200, speed≈4 KB/s, timeout 15 s
curl -x http://192.168.100.3:18081 ...   -> code=200, speed≈244 KB/s
curl (không proxy) ...                   -> speed≈688 KB/s
```
Result: gateway cũ `.5` vẫn "mở cổng" nhưng chết về băng thông ⇒ app (chỉ chấm theo TCP) chọn nhầm;
video không load. Proxy đã được trỏ tay về `.3` để TV dùng tạm.

## Validation Not Performed

| Check | Reason |
|---|---|
| Tự dò gateway sau khi đổi IP (test end-to-end) | Chưa có code; phải Windows sửa rồi phát hành bản mới |
| Đo trên bản app mới | Chưa có bản build |

## Risks

- Nếu Windows không sửa: mỗi lần gateway đổi IP (DHCP) lại phải sửa tay prefs như hôm nay.
- Quét subnet nếu làm ẩu có thể gây scan storm / tốn pin — cần throttle như Appendix A.
- Trên TV 1 GB RAM, thêm quét định kỳ cần giới hạn tần suất.

## Open Questions

- Windows muốn dò bằng cách quét subnet mỗi lần cần, hay app dò **mDNS/NSD** hoặc đọc danh sách từ
  control-plane (`app_config.db`) rồi tự chọn? (Quét subnet là độc lập nhất.)
- Có cần đưa gateway đã dò vào prefs để người dùng thấy trong Settings không?

## Next Recommended Step

Windows sửa `android/app/src/main/java/com/privatevpn/app/vpn/ProxyDirector.kt` theo Appendix A,
build bản Android mới, rồi test acceptance ở Appendix A.4 và cập nhật handoff lại cho Mac verify.

---

## Appendix A — Yêu cầu kỹ thuật (cho Windows)

### A.1 Hiện trạng code

- `android/app/src/main/java/com/privatevpn/app/vpn/ProxyDirector.kt`
  - `gateways()`: đọc prefs `Config.KEY_PROXY_GATEWAY` (chuỗi `host:port,host:port`) hoặc
    `Config.PROXY_GATEWAY_DEFAULT`.
  - `decide()`: lọc `alive()`, chấm `probeQuality()`, chọn kbps cao nhất, hysteresis 15%.
  - `forceRescore()`: đo lại tất cả (nút Refresh).
- `android/app/src/main/java/com/privatevpn/app/Config.kt`
  - `PROXY_GATEWAY_DEFAULT = "192.168.100.11:18081,192.168.100.5:18081"` (IP cứng).
- Nhịp gọi: `VpnKeepAlive.kt` (60 s), `VPNFlowApp.kt`, `SettingsScreen.kt`.

### A.2 Việc cần làm

1. **Discovery:** quét subnet `/24` của interface đang dùng, tìm host mở TCP `18081` (song song,
   timeout ~300 ms/host). Host mở ⇒ thêm vào tập ứng viên và chấm bằng `probeQuality` (tái sử dụng,
   không viết lại phép đo).
2. **Gộp** với gateway cấu hình tay; nếu người dùng đã đặt gateway cụ thể thì ưu tiên prefs.
3. **Chỉ dò khi cần:** không còn gateway sống / điểm hết hạn / đổi SSID-IP / bấm Refresh.
   Throttle tối đa **1 lần quét/60 s**, cache ~10 phút.
4. Giữ 3 chế độ `auto` / `tv` / `gateway`; `tv` **không** dò.
5. Log rõ: `tuyến: dò thấy gateway ...`, `tuyến: chọn ... (kbps)`.
6. Không đổi tunnel/relay; không thêm IP cứng mới.

Gợi ý: `gateways()` trả `discovered + prefs`; `decide()` gọi `discoverGateways()` khi `aliveNow`
rỗng hoặc toàn bộ `scoreStale`; `forceRescore()` dò lại rồi đo tất cả.

### A.3 Non-goals

- Không đổi relay/tunnel/control-plane; không đổi iOS/macOS; không root TV.

### A.4 Acceptance criteria

- [ ] Tắt host `.5`, dựng gateway ở IP mới ⇒ app **tự** chuyển proxy ≤ 90 s, không sửa tay.
- [ ] Gateway chết hẳn ⇒ `auto` về `127.0.0.1:1081` nếu sống, không thì `:0`.
- [ ] Không scan storm (log ≤ 1 lượt quét/60 s); không quét khi `mode=tv`.
- [ ] `mode=gateway` không bao giờ đặt `127.0.0.1:1081`.
- [ ] Chọn tuyến vẫn theo `probeQuality` (không quay lại "tuyến đầu tiên").
- [ ] Log `tuyến:` đủ chẩn đoán qua `adb logcat`.

### A.5 Cách nghiệm thu

```bash
adb shell settings get global http_proxy
adb logcat -s VPNFLOW_DIAG | grep "tuyến:"
# dựng proxy ở IP khác trong LAN, chờ ≤90s, kiểm proxy tự đổi
```

---

## Appendix B — Tạm thời (không thay thế sửa code)

- Đặt **DHCP reservation** trên router `192.168.100.1` cho MAC Wi-Fi của Mac
  (`9c:58:84:06:ba:d4`) ⇒ Mac luôn nhận 1 IP cố định.
- Hoặc dùng tunnel TV (`127.0.0.1:1081`) làm đường chính để không phụ thuộc gateway LAN.

## Liên quan

- `docs/handoff/HANDOFF_WINDOWS_FPT_PLAY_TV_PROXY_2026-10-22.md` §4D — đề xuất đo throughput thay
  vì chỉ probe TCP; handoff này bổ sung phần **tự dò địa chỉ**.
- `docs/handoff/LAUNCHER_TVFLOW_HOME_v1.7_2026-10-23.md` — launcher/HomeGuard trên TV (không liên quan proxy).
