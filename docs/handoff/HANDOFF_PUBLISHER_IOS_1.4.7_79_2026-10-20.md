# BÀN GIAO PUBLISHER — phát hành **iOS 1.4.7 / build 79**

- **Từ:** harness Mac (bên build) · **Đến:** phiên publisher (harness Mac)
- **Ngày:** 20/10/2026 · **Manifest:** `docs/RELEASE_ARTIFACTS_2026-10-20.md`
- **Quy trình:** `docs/PUBLISHER_PROCESS.md` §1

## 0. Hai điều kiện đã thoả
1. **ĐÃ COMMIT:** `167ba9d` (9 file) — “commit trước, deploy sau” (AGENTS §6b).
2. **Đã xác nhận đúng bản:** 1.4.7/79, đọc **từ trong IPA**, `ios-verify-ipa` ĐẠT 8/8.

## 1. Artifact
```
build/ios-adhoc-export/ipa/FlowVPN.ipa
  size   : 8.235.330 B
  sha256 : e750a9cd3f3aa2e60d9485607fa5eefd37a88c39e6c54f71e7307dfe6b1cc4b4
  version: 1.4.7 / build 79
```
Tự verify lại trước khi upload:
```bash
shasum -a 256 build/ios-adhoc-export/ipa/FlowVPN.ipa     # phải khớp e750a9cd…
bash scripts/ios-verify-ipa.sh build/ios-adhoc-export/ipa/FlowVPN.ipa --version 1.4.7 --build 79
python3 scripts/check-publish-version.py --platform ios \
  --file build/ios-adhoc-export/ipa/FlowVPN.ipa --version 1.4.7 --build 79   # exit 0
```

## 2. Đích + mốc
Upload `/root/flowvpn-ipa/VPNFlow-latest.ipa` · route `GET /v1/downloads/ios` ·
`PATCH /v1/admin/app-version` → `latest_version=1.4.7`, `ipa_build=79` · **KHÔNG** đặt `minimum_version`.

## 3. Bản này có gì
- **Mới:** Settings → “Tăng tốc” → **Hút băng thông (N tunnel)** (2/4/6/8), **mặc định TẮT**.
  Mở N kết nối WS song song tới **cùng exit node**; Go chia **luồng** cho từng tunnel.
- **Sửa:** `CoreStop` đệ quy vô hạn (nguyên nhân “Disconnecting…” treo ở build 68/69);
  huỷ `resourceTimer` khi dừng; callback báo dừng chạy queue riêng (trần 5 s);
  không nuốt cú bấm Connect khi đang `.disconnecting`; trần `preMeasure` 3 s (UI phản hồi nhanh);
  số khai = (một luồng) × N thay vì một luồng.

## 4. ⚠️ KHÔNG được quảng cáo / không được hứa
1. Tính năng hút băng thông **bật sẵn** — nó **TẮT**; chỉ nhắc “có thể bật trong Settings”.
2. **Chưa nghiệm thu §7d chính thức** trên 79.
3. Không hứa con số tốc độ nào (mạng TQ dao động mạnh trong ngày đo).
4. **Đừng rebuild** — framework `Multitunnel` không có trong git; chỉ phát đúng IPA ở §1.

## 5. Báo cáo lại
sha256 đã upload · content-length thực tế trên node-2 · HTTP của `/v1/downloads/ios` ·
giá trị `latest_version`/`ipa_build` sau PATCH (kèm response thật) · `/install/ios` + `/buy` trỏ bản mới.
