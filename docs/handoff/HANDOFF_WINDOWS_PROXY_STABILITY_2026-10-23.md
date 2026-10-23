# Agent Handoff

- **Agent:** harness Mac (worker) → giao **harness Windows** (publisher Android)
- **Task ID:** HANDOFF-WINDOWS-PROXY-STABILITY-2026-10-23
- **Date:** 2026-10-23
- **Status:** blocked (chờ Windows sửa app — proxy bị app tự đổi/fail-open làm FPT Play + TV360 rớt)

## Summary

TV `192.168.100.104` (`MiTV-AFZP0`) dùng proxy hệ thống để có exit node VN cho **FPT Play + TV360**.
`ProxyDirector` (app `1.4.5-tv-dev`, versionCode 96) liên tục **ghi lại `http_proxy`** giữa các
gateway (`.5` dao động, `.6` Mac/Flow2) và **fail-open về `:0`** khi probe fail. Mỗi lần đổi, phiên
đang xem của FPT Play/TV360 bị cắt; còn `:0` = **không có IP VN** ⇒ FPT Play chặn content.

Bằng chứng: prefs app ghi `proxy_mode=gateway`, `proxy_gateway=192.168.100.6:18081`, nhưng
`settings get global http_proxy` lại ra `192.168.100.5:18081` (gateway lạ, flaky) — app tự dò và chọn.

Đã tạm xử lý trên TV: `am force-stop com.privatevpn.app.tv.dev` + `settings put global http_proxy
192.168.100.6:18081` → proxy **giữ nguyên 45 s**, FPT/TV360 không bị đổi tuyến. Nhưng đây chỉ là
tạm (app tắt, tunnel tắt, phụ thuộc IP Mac).

## Files Changed

| Path | Change Summary |
|---|---|
| `docs/handoff/HANDOFF_WINDOWS_PROXY_STABILITY_2026-10-23.md` | **mới** — handoff này (chỉ tài liệu) |

## Decisions Made

| Decision | Reason | Persisted In |
|---|---|---|
| Giao Windows sửa `ProxyDirector` | App là nguồn duy nhất ghi `http_proxy`; Mac/TV không sửa được logic app | handoff này |
| Không fail-open `:0` khi cần exit VN | `:0` = đi thẳng, không có IP VN ⇒ FPT Play chặn content (yêu cầu chủ dự án) | Appendix A.2 |
| Tạm: tắt app + set proxy .6 | Chặn rớt ngay, chờ bản sửa | Appendix B |

## Evidence

| Evidence ID | Verification Level | Result |
|---|---|---|
| EVID-20261023-31 | runtime_checked | app running: `http_proxy` đổi `.6 ↔ .5` (prefs ghi gateway `.6`) |
| EVID-20261023-32 | runtime_checked | `.5:18081` dao động 25–344 KB/s; `.6:18081` 11–178 KB/s; direct 565 KB/s–3.3 MB/s |
| EVID-20261023-33 | code_checked | `ProxyDirector.decide()` trả `":0"` khi `aliveNow.isEmpty()` (fail-open) |
| EVID-20261023-34 | runtime_checked | tắt app + set proxy `.6`: giữ nguyên qua 45 s (3 lần đo) |
| EVID-20261023-35 | runtime_checked | FPT Play (`net.fptplay.ottbox`) + TV360 (`com.viettel.tv360.tv`) cài sẵn, dùng proxy hệ thống |

## Validation Performed

```text
adb shell settings get global http_proxy        -> 192.168.100.6:18081 (sau khi tắt app) ổn định
curl -x http://192.168.100.6:18081 ...          -> 110–127 KB/s (dao động)
curl -x http://192.168.100.5:18081 ...          -> 25–344 KB/s (dao động mạnh)
curl (không proxy) ...                          -> 565 KB/s–3.3 MB/s
```

## Validation Not Performed

| Check | Reason |
|---|---|
| FPT Play/TV360 xem 15 phút không rớt | Cần bản app sửa rồi mới test được |
| Fail-open `:0` tái hiện có kiểm soát | Chưa có bản build mới để test |

## Risks

- App tự đổi tuyến mỗi khi probe thấy gateway khác "nhỉnh" hơn ⇒ rớt liên tục.
- `:0` khi không có gateway sống ⇒ mất exit VN ⇒ FPT Play chặn (không chỉ chậm).
- TV 1 GB RAM: giảm tần suất probe cho nhẹ.

## Open Questions

- Windows muốn giữ chế độ "pin một gateway" trong UI (LAN gateway only + địa chỉ cố định) hay chỉ
  sửa logic sticky/hysteresis?
- Có cần bỏ hẳn discovery để tránh gateway lạ (`.5`) không?

## Next Recommended Step

Windows sync source bản 96, sửa `ProxyDirector` theo Appendix A, build + cài lên TV `.104`
(`192.168.100.104:5555`), test acceptance ở Appendix A.4, rồi trả handoff cho Mac verify.

---

## Appendix A — Hướng sửa (app-side)

### A.1 Sticky route (không đổi khi tuyến hiện tại còn sống)

- Chỉ đổi `http_proxy` khi tuyến hiện tại **chết thật** (N lần probe liên tiếp fail) hoặc tuyến mới
  nhanh hơn **rõ rệt** (vd ≥ 50%). Hiện hysteresis 15% quá thấp ⇒ đổi liên tục khi điểm dao động.
- Khi tuyến hiện tại còn sống và điểm ổn định, **không ghi lại** `http_proxy` (tránh cắt phiên).

### A.2 Không fail-open `:0` khi cần exit VN

- `decide()` hiện trả `":0"` khi không có candidate sống. Với FPT/TV360, `:0` = **mất IP VN** ⇒ bị
  chặn content (không chỉ chậm).
- Sửa: giữ **tuyến cuối còn sống** (last-known-good) và tiếp tục retry; chỉ về `:0` nếu người dùng
  chọn chế độ cho phép (thêm setting), hoặc không bao giờ.

### A.3 Chấm điểm & discovery ổn định

- Chỉ thêm gateway dò được sau **N lần probe liên tiếp** đạt (vd 2 lần), và loại gateway có điểm
  dao động mạnh/flaky.
- Ưu tiên gateway cấu hình tay; cho phép **pin 1 gateway** (UI "LAN gateway only" + địa chỉ) mà
  discovery **không ghi đè**.
- Probe bằng request thật qua chính proxy (CONNECT + TLS + tải thử), đã có `probeQuality` — giữ.

### A.4 Acceptance criteria

- [ ] Xem FPT Play + TV360 liên tục 15 phút: `settings get global http_proxy` **không đổi**, không rớt.
- [ ] Tắt gateway tốt nhất ⇒ app chuyển fallback trong ≤ 30 s, **không** về `:0` khi chế độ yêu cầu VN.
- [ ] Gateway flaky (`.5`) không bị chọn nếu điểm kém hơn.
- [ ] Chạy trên `MiTV-AFZP0` (Android 14) và `MiTV-ASTP0` (Android 9).

### A.5 Cách nghiệm thu

```bash
adb shell settings get global http_proxy          # theo dõi trong lúc xem, phải đứng yên
adb logcat -s VPNFLOW_DIAG | grep "tuyến:"
# dựng/kill gateway để test fallback, kiểm không ra :0
```

---

## Appendix B — Tạm thời (đã làm trên TV `.104`)

- `am force-stop com.privatevpn.app.tv.dev` (dừng app tự đổi proxy)
- `settings put global http_proxy 192.168.100.6:18081` (Mac gateway → Flow2, IP VN)
- Giữ Xiaomi TV Manager disabled + battery whitelist (đã làm).
- Hạn chế: app tắt ⇒ tunnel TV tắt; phụ thuộc IP Mac (DHCP tòa nhà đổi `.3→.6`); nếu IP Mac đổi,
  bật app lại để tự dò rồi khoá lại.

## Liên quan

- `docs/handoff/HANDOFF_WINDOWS_TUNNEL_KEEPALIVE_2026-10-23.md` — tunnel tự hồi sau khi bị kill.
- `docs/handoff/HANDOFF_WINDOWS_AUTO_GATEWAY_2026-10-23.md` — tự dò gateway (repo cũ hơn app v96).
- `docs/handoff/TV_PROXY_LOCKED_2026-10-23.md` — cấu hình proxy đang chốt trên TV.
