# FPT Tubeflow — bản dựng lại (rebuild) từ SmartTube cho TV Xiaomi

> Mục đích: TV Xiaomi dùng **TVFlow Home** làm màn hình chính, xem YouTube bằng một app
> đã đổi thương hiệu **FPT Tubeflow** (giao diện theo màu MeetFlow AI), đi qua gateway LAN
> của VPNFlow. Chỉ dùng nội bộ; **không phân phối lại** app gốc của tác giả SmartTube.

## Vì sao phải rebuild

- TV này **không có GMS, không có Play Store**, mạng lại chặn Google trực tiếp ⇒ phải đi qua
  gateway VN của VPNFlow (system proxy). FPT Tubeflow dùng `http_proxy` của TV nên chạy được.
- App gốc tên "SmartTube" — chủ dự án muốn đổi tên/icon/theme nên phải vá APK.

## Lịch sử bản

| Bản | Thay đổi |
|---|---|
| 1.0 | Đổi tên **FPT Tubeflow**, accent `#33C773`, nền `#0D1B30`/`#071628`, icon play gradient + banner |
| 1.1–1.2 | `windowBackground` = ảnh nền FPT (Leanback vẫn vẽ màu shelf đè ở màn lưới) |
| 1.3 | Logo FPT ở header (`appLogo`) thay logo SmartTube |
| 1.4 | Logo nhỏ lại, chữ tách khỏi logo (không chồng) |
| 1.5 | Ảnh logo/banner/icon đặt theo **density bucket** (responsive theo độ phân giải TV) |
| 1.6–1.7 | Phụ đề **"YouTube · Premium"**, chữ tiêu đề nhỏ lại |
| 1.8–2.1 | Icon chữ F → icon kiểu YouTube |
| **2.2** | Icon kiểu YouTube: nền đỏ `#FF0000`, tam giác play trắng **có bóng đổ** (hiện đại) |

## Dựng lại

```bash
# cần: apktool jar, JDK 17, Android build-tools 35 + platform 35, python3 + Pillow
APKTOOL_JAR=/tmp/apktool3.jar \
KEYSTORE=/đường/dẫn/debug.keystore \
bash tools/fpt-tubeflow/build.sh /đường/dẫn/SmartTube-32.56.apk 9013 2.2-fpt-tubeflow
# -> tools/fpt-tubeflow/build/FPTTubeflow-2.2-fpt-tubeflow.apk
```

Lưu ý:
- APK mới **khác chữ ký** app gốc ⇒ TV đang có SmartTube phải `adb uninstall org.smarttube.stable` trước.
- `versionCode` đặt cao (9xxx) để app không tự nhắc cập nhật từ GitHub.
- Icon bản Android 13+ nằm ở `res/mipmap-nodpi-v30/app_icon.png` — sửa `app_icon` ở `nodpi` **không đủ**.

## Giới hạn đã biết

- Leanback vẽ màu `shelfBackground` đè lên `windowBackground` ở màn lưới ⇒ watermark nền lớn chỉ
  hiện ở Settings/màn hướng dẫn; logo FPT hiện ở header.
- App **không** dùng proxy nội bộ trong app; nó dùng `http_proxy` hệ thống. Vì vậy TV phải có
  VPNFlow/guard đặt proxy trỏ gateway sống (xem kit cài đặt).
- TV **không có `/dev/net/tun`** (kernel `CONFIG_TUN is not set`) ⇒ không thể VPN toàn máy;
  app nào bỏ qua system proxy sẽ đi thẳng và bị mạng chặn.

## Cài lên TV

Bộ cài đầy đủ (launcher + guard + app VPN + Tubeflow) nằm ở
[`docs/TV_XIAOMI_INSTALL_KIT.md`](../../docs/TV_XIAOMI_INSTALL_KIT.md) và
[`tools/tv-kit/install.sh`](../tv-kit/install.sh):

```bash
bash tools/tv-kit/install.sh 192.168.100.104 192.168.100.5:18081
```
