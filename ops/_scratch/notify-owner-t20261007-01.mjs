// Báo chủ dự án (Telegram + bus) về việc T-20261007-01 — bus #829:
// "check lại các version android cho TV, box, đã update latest code chưa?"
// Dùng: node ops/_scratch/notify-owner-t20261007-01.mjs
import fs from "node:fs";
import { sendPing } from "../lib/telegram.mjs";

const MESSAGE = `T-20261007-01 — Rà version Android cho TV/box (việc anh giao qua /vibecode, bus #829)

1) BẢN TV (Xiaomi/Android TV): ĐÚNG code mới nhất (v36) NHƯNG là bản DEBUG
   • Link đang phát: meetflowai.site/dl/VPNFlow-tv-latest.apk (chip "Android TV (APK)" trên trang chủ)
   • Trong file: package com.privatevpn.app.tv.dev, versionName 1.4.3-tv-dev, versionCode 36, ký bằng khoá "CN=Android Debug"
   • Nghĩa là bản thử, KHÔNG phải bản phát hành; không tự cập nhật được. Phát từ 28/09.

2) BẢN BOX / FIRE TV / ANDROID 7 (và cả bản Android thường): CHẬM 4 BẢN
   • Đang phát: v32 / 1.4.4 (23/09) — ở cả /v1/downloads/android và /v1/downloads/android-legacy
   • Code mới nhất: v36 (28/09) — thiếu 4 bản vá: v33 ghi vết crash TV · v34 xuất báo cáo chẩn đoán · v35 không thoát app khi Connect · v36 dựng TUN trước rồi protect (hết "quay tít connecting")

3) MEETFLOW AI ANDROID: 1.0.7/8 = đúng bản mới nhất trên main → KHÔNG lệch.
   (Bản có thông báo bắt buộc đăng ký email — mốc 10/10 — chưa có trong main, là việc riêng.)

4) LỖI SỐ VERSION đang chặn cập nhật tự động: endpoint công bố latest_version=1.4.4 nhưng dòng code mới nhất lại tên 1.4.3 (đã bị lùi ở commit v33). App so version kiểu số nên 1.4.3 bị coi là CŨ hơn 1.4.4 ⇒ phát thẳng v36 sẽ không ai nhận được cập nhật.

GIẢI PHÁP ĐỀ XUẤT (xin anh duyệt — em CHƯA thi công):
a) Chốt version mới: versionCode 37 / versionName 1.5.0
b) Build RELEASE có ký (keystore đã có sẵn trên máy WIN) 3 biến thể từ commit v36: modern (phone), legacy (box/Fire TV), tv (com.privatevpn.app.tv)
c) Phát: /v1/downloads/android + android-legacy + /dl/VPNFlow-tv-latest.apk (bản release); PATCH app_config latest_version=1.5.0 — đề xuất KHÔNG ép cập nhật (giữ minimum 1.2.6)
d) TV đang cài bản debug .tv.dev → cài thêm bản release .tv (chạy song song) rồi gỡ bản dev
e) Cập nhật máy thật: 3 TV (.110 Android 14, .112 Android 9, .111 đang đóng ADB 5555) + box. LƯU Ý: máy WIN hiện KHÔNG cùng LAN với dải TV (adb connect 10.193.44.x timeout cả 3) nên phải làm khi máy về đúng mạng, hoặc anh tự cài từ link.
f) Cần anh MỞ BĂNG ANDROID (FREEZE_ANDROID_2026-09-23 §5) cho đúng phạm vi "phát bản latest v37".

Bằng chứng đầy đủ (lệnh + sha256 từng artifact): docs/evidence/T-20261007-01/README.md`;

const out = { message: MESSAGE, sent: null, bus: null };

try {
  const raw = fs.readFileSync(".env.bus", "utf8");
  const url = raw.match(/^AGENT_BUS_URL=(.*)$/m)?.[1]?.trim().replace(/\/$/, "");
  const token = raw.match(/^AGENT_BUS_TOKEN=(.*)$/m)?.[1]?.trim();
  if (url && token) {
    const res = await fetch(`${url}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: "owner",
        from: "win",
        kind: "done",
        title: "T-20261007-01 · Android TV/box: TV là bản DEBUG (v36), box/phone chậm 4 bản (v32/1.4.4), MeetFlow AI 1.0.7/8 OK — kèm giải pháp chờ duyệt",
        body: MESSAGE,
        ref: "T-20261007-01",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => null);
    out.bus = `HTTP ${res.status} · bus #${json?.message?.id ?? "?"}`;
  }
} catch (error) {
  out.bus = `lỗi: ${error.message}`;
}

try {
  const sent = await sendPing(MESSAGE, { prefix: "[WIN → chủ dự án]" });
  out.sent = sent.ok ? `Telegram message_id ${sent.messageId}` : `Telegram lỗi: ${JSON.stringify(sent.raw).slice(0, 200)}`;
} catch (error) {
  out.sent = `Telegram lỗi: ${error.message}`;
}

console.log(JSON.stringify({ sent: out.sent, bus: out.bus }, null, 1));
