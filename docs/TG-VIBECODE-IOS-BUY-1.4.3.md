# TG-VIBECODE — iOS trên trang buy & App Store Connect chưa phải bản đã test pass

> Ai đo: harness **WIN** (Windows) · lúc **2026-09-23T12:04Z** (19:04 giờ VN) · task `T-20260923-02` (buy),
> `T-20260923-03` (App Store Connect), `T-20260923-04` (báo cáo) · nguồn: bus #337, #338, #339 (owner → win).
> **Nguyên tắc: mọi số dưới đây đọc trực tiếp từ hệ thống đang chạy, không chép lời khai.**

## 0. Kết luận ngắn

| Câu hỏi của chủ dự án | Trả lời đo được |
|---|---|
| Trang buy đang phát bản iOS nào? | **1.4.2 (build 19)** — đúng như anh thấy |
| Bản đã test pass (1.4.3 / build 20) có trên buy chưa? | **CHƯA. Không có ở bất kỳ đâu WIN với tới được** |
| App Store Connect đang có bản nào? | **1.4.1 (build 18)** — còn cũ hơn cả buy, **không có 1.4.2 lẫn 1.4.3** |
| Mac publisher đã update chưa? | **CHƯA** (không có IPA mới, không có mốc version mới, không có lần upload ASC nào hôm nay) |
| WIN có tự update được không? | **Không tự làm được**: build + ký IPA iOS bắt buộc macOS/Xcode — IPA 1.4.3/20 chỉ nằm trên máy Mac. WIN đã mở sẵn đường bàn giao 1 lệnh `scp` (mục 5) |

## 1. Đo trang buy (số thật, chạy 12:04Z)

```bash
curl -s 'https://t1.meetflowai.site/v1/app-version?platform=ios'
```
→ `{"platform":"ios","minimum_version":"1.3.3","latest_version":"1.4.2", ...}`

```bash
curl -s https://t1.meetflowai.site/install/ios/manifest.plist | grep -A1 bundle-version
```
→ `<key>bundle-version</key><string>19</string>`

Trang cài `/install/ios` in thẳng cho khách: **“Version 1.4.2”**.

File đang phát thật (đọc version **bên trong** IPA, không tin tên file):

```bash
# trên node-2
python3 -c "import zipfile,plistlib;z=zipfile.ZipFile('/root/flowvpn-ipa/VPNFlow-latest.ipa');n=[x for x in z.namelist() if x.endswith('.app/Info.plist')][0];d=plistlib.loads(z.read(n));print(d['CFBundleShortVersionString'],d['CFBundleVersion'])"
```
→ `1.4.2 19` · 8.152.677 B · `sha256 eba2e856498becb4ad04e3295e65a670f4261f7eb1c82b3d01f7aeaff69ea31b`
· `Last-Modified: Wed, 23 Sep 2026 08:50:26 GMT`

Mốc trong `app_config` (nguồn đối chiếu của cổng chặn): `latest_ios_version=1.4.2`, `ios_ipa_build=19`.

**Ba lớp khớp nhau (buy = mốc = file đang phát) ⇒ không phải lỗi cache, đúng là bản cũ.**

## 2. Đo App Store Connect (đọc bằng API, không cần mở trình duyệt)

Chạy trên node-2 (khoá ASC nằm ở `/root/flowvpn-cp/data/apple-asc.json`, script `ops/_scratch/asc-status.mjs`):

```
[app] VPNFlow · com.privatevpn.app · id 6804150049
[builds] iOS — mới nhất: build 18 · state=VALID · uploaded=2026-09-22 19:52:52 (giờ PDT)
         (các build khác: 14, 13, 1… — KHÔNG có 19, 20, 1.4.2, 1.4.3)
[preReleaseVersions] cao nhất: 1.4.1 (IOS)
[appStoreVersions] 1.0 · READY_FOR_REVIEW (IOS)
```

⇒ Kênh TestFlight/App Store **đang ở 1.4.1 build 18**, tức còn sau cả trang buy. Bản 1.4.3 chưa từng được nộp.

## 3. Bản “1.4.3 build 20” có ở đâu? (đã lục, không phải đoán)

| Nơi | Kết quả |
|---|---|
| `origin/main`, mọi nhánh `origin/*`, mọi tag | **Không có** `ios-v1.4.3`; `git grep 1.4.3` trên `project.yml` mọi nhánh = rỗng |
| node-2 `find / -iname '*.ipa'` | chỉ 4 file, **tất cả đều ≤ 1.4.2/19** |
| node-1 (`103.173.155.50`) `find / -iname '*.ipa'` | **không có file .ipa nào** |
| Diawi (`ios_diawi_url` trong app_config) | `https://i.diawi.com/7WTMjp` — link cũ (thời 1.3.3), không phải bản 1.4.3 |
| Sổ phát hành `release/releases.jsonl` | dòng iOS mới nhất = **1.4.1 (build 18)** |

## 4. Phát hiện quan trọng: trong repo, “build 20” đang mang số **1.4.2**, không phải 1.4.3

Nhánh iOS mới nhất đã push là `origin/mac/ios-mtu-1300` (23/09 **15:41 +0800**, fix MTU 1500→1300).
`project.yml` trên nhánh đó:

```yaml
  PrivateVPN:
      CURRENT_PROJECT_VERSION: "20"
      MARKETING_VERSION: "1.4.2"      # ← build 20 NHƯNG version hiển thị vẫn 1.4.2
  PrivateVPNPacketTunnel:
      CFBundleShortVersionString: "1.4.2"
      CFBundleVersion: "19"           # ← lệch với target (20)
```

⇒ Nếu bản anh test chiều nay **đúng là build 20 của nhánh này**, thì app hiện số **1.4.2 (20)** — và khi phát
lên buy nó vẫn sẽ hiện **1.4.2**, không phải 1.4.3. Muốn buy hiện **1.4.3** thì phải **tăng MARKETING_VERSION
lên 1.4.3 rồi build + ký lại** (đây là quyết định số phiên bản, cần anh/Mac chốt).
Đây là điểm cần Mac xác nhận trước khi làm, để khỏi “phát xong vẫn sai số”.

## 5. Vướng ở đâu, ai gỡ, gỡ bằng lệnh nào

**Vướng duy nhất:** thiếu **file IPA** (bản đã test pass). WIN chạy Windows — không có Xcode/macOS nên
**không thể build/ký IPA iOS**. Mọi phần còn lại (đẩy file lên, đặt mốc version, verify, báo cáo) WIN làm được ngay.

**WIN đã mở sẵn đường bàn giao 1 lệnh** (tạo lúc 12:03Z, có README):

```
/root/flowvpn-ipa/incoming/README.txt        (trên node-2)
```

**Mac chỉ cần 1 trong 2 cách:**

```bash
# Cách A — Mac đẩy IPA lên, WIN lo phần publish (khuyến nghị, đúng ý chủ dự án "win update package")
scp <FlowVPN.ipa 1.4.3 build 20> root@165.101.114.162:/root/flowvpn-ipa/incoming/VPNFlow-1.4.3-b20.ipa
# (thêm bản app-store-connect nếu muốn WIN lo luôn phần App Store Connect)

# Cách B — Mac tự publish như cũ (chạy trên máy Mac)
scripts/publish-ios.sh <ipa> 1.4.3 20 --device-test <bằng chứng §2c>
node scripts/asc-beta.mjs submit 20 --group "External Test" --wait
```

**Khi IPA đã ở `incoming/`, WIN tự chạy (không cần Mac):**
1. đọc version **bên trong** IPA (chặn nếu không phải 1.4.3/20) — `scripts/check-publish-version.py --platform ios`;
2. backup bản đang phát → thay `/root/flowvpn-ipa/VPNFlow-latest.ipa` (upload kiểu file tạm rồi `mv`, tránh file cụt);
3. `PATCH /v1/admin/app-version {latest_version:"1.4.3", ipa_build:"20"}` và **đọc JSON trả về** (không tin exit code);
4. verify: `manifest.plist` bundle-version=20 · `/install/ios` hiện “Version 1.4.3” · tải thật `https://t1.meetflowai.site/v1/downloads/ios` so `sha256` · `/buy` 200.

## 6. Cách nghiệm thu (chủ dự án tự kiểm, không cần tin lời)

```bash
curl -s 'https://t1.meetflowai.site/v1/app-version?platform=ios'          # phải thấy "latest_version":"1.4.3"
curl -s https://t1.meetflowai.site/install/ios/manifest.plist | grep -A1 bundle-version   # phải thấy 20
# mở https://t1.meetflowai.site/install/ios bằng Safari -> phải hiện "Version 1.4.3"
# App Store Connect: node ops/_scratch/asc-status.mjs (chạy trên node-2) -> build mới nhất phải là 1.4.3
```

## 7. Việc WIN đã làm trong lượt này

- `T-20260923-02` / `T-20260923-03` / `T-20260923-04`: tạo + ack trong sổ git (có commit làm bằng chứng).
- Đo 3 lớp của kênh buy + đọc API App Store Connect + lục repo/node-1/node-2/Diawi (mục 1–3).
- Mở đường bàn giao `/root/flowvpn-ipa/incoming/` trên node-2 + viết README hướng dẫn.
- Giao lại Mac việc build/ký IPA (bus, kèm câu hỏi chốt số phiên bản 1.4.2 hay 1.4.3).
- Báo cáo chủ dự án qua connector + Telegram.
