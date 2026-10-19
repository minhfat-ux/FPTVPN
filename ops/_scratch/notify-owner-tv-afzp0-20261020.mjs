// Báo chủ dự án (Telegram + bus) về T-20261019-01 — TV MiTV-AFZP0 lỗi connect.
// Dùng: node ops/_scratch/notify-owner-tv-afzp0-20261020.mjs
import fs from "node:fs";
import { sendPing } from "../lib/telegram.mjs";

const MESSAGE = `T-20261019-01 — Kiểm tra con TV đang lỗi (MiTV-AFZP0 · Android 14 · 192.168.100.105)

KẾT LUẬN: KHÔNG phải lỗi mạng, KHÔNG phải lỗi tài khoản. NGUYÊN NHÂN GỐC: kernel của chính con TV này KHÔNG có TUN.

1) Bằng chứng đo trực tiếp trên máy:
   • "zcat /proc/config.gz | grep CONFIG_TUN" → "# CONFIG_TUN is not set"; /dev/tun KHÔNG tồn tại.
     ⇒ VpnService không tạo được interface VPN ⇒ app ném "Cannot create interface" ⇒ quay "reconnecting" mãi.
   • Đường tới server VẪN TỐT: tcp-relay:8443 protect=true, TCP tới 103.173.155.50:8443 thành công — chết ở bước dựng tunnel, không phải mạng.
   • Sau đó app TẮT vì Android 14 chặn đóng fd 2 lần (fdsan): "fdsan: attempted to close file descriptor … owned by unique_fd" → SIGABRT trong HysteriaVpnService.tcpRelayAttempt. Đã chết 4 lần: 00:09, 00:10, 00:12, 00:16.

2) Vì sao lần này mới lỗi: TV đang chạy bản DEBUG CŨ v36 (com.privatevpn.app.tv.dev, 1.4.3-tv-dev, cài 00:03 hôm nay) — bản này không có xử lý "máy không có TUN". Gói release v38 trước đó đã bị gỡ khỏi TV.

3) Em ĐÃ làm: cài lại bản phát hành chính thức v38 / 1.4.6-tv (sha256 191f8f95…, đúng artifact trên kênh /dl/VPNFlow-tv-latest.apk). App chạy, hiện màn đăng nhập. NHƯNG v38 KHÔNG sửa được lỗi này (em quét mã trong APK: chưa có chế độ SOCKS5).

4) Fix thật đang được dựng (chưa build xong): chế độ SOCKS5 + proxy hệ thống cho máy không có TUN (proxyAttempt + Mobile.serveSocks + quyền WRITE_SECURE_SETTINGS).

⚠ Giới hạn phải nói rõ: không có TUN thì KHÔNG THỂ full-tunnel. Chế độ SOCKS5 chỉ đi qua với app tôn trọng proxy hệ thống (trình duyệt, FPT Play, SmartTube); Netflix/app tự mở socket sẽ KHÔNG qua VPN. Muốn full-tunnel phải dùng TV/box có kernel bật TUN (như 2 TV cũ .110/.112 đã chạy tốt).

Việc tiếp: build bản có SOCKS5 → cài .105 → pm grant WRITE_SECURE_SETTINGS → đăng nhập → Connect → em kiểm log. Anh muốn em build luôn bản đó không?

Bằng chứng đầy đủ: docs/evidence/T-20261020-01/README.md`;

const out = { sent: null, bus: null };

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
        kind: "status",
        title: "TV MiTV-AFZP0 (.105) connect→reconnecting→tắt app: kernel KHÔNG có TUN; fix SOCKS5 đang dựng",
        body: MESSAGE,
        ref: "T-20261019-01",
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

console.log(JSON.stringify(out, null, 1));
