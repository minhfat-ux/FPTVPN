package com.privatevpn.app.vpn

import com.privatevpn.app.Config

/**
 * Luật thuần-logic của chế độ **N tunnel (hút băng thông)** — port từ iOS `167ba9d`,
 * theo `docs/handoff/HANDOFF_ANDROID_NTUNNEL_WINDOWS_2026-10-20.md`.
 *
 * Tách khỏi `HysteriaVpnService` (một class Android, không chạy được trong unit test) để
 * hai luật dễ sai nhất có test khóa lại:
 *  1. Kẹp N về `1..Config.MULTI_TUNNEL_MAX` — N=0/âm/phóng đại không bao giờ được chạm tới
 *     service (N=0 làm `Serve()` không có tunnel nào; N quá lớn làm mở hàng loạt WS).
 *  2. **Số khai = năng lực TỔNG = (một luồng) × N.** Đo thật 19/10/2026 trên mạng dùng chung:
 *     1 luồng 4–12 Mbps, 8 luồng 72–81 Mbps. Khai theo MỘT luồng thì Brutal CC bị khoá ở mức
 *     một luồng ⇒ mở thêm tunnel cũng vô ích.
 */
object MultiTunnelPolicy {

    /** Số tunnel hợp lệ: `1` = TẮT (hành vi bản đang phát). */
    fun clampCount(requested: Int): Int = requested.coerceIn(1, Config.MULTI_TUNNEL_MAX)

    /**
     * Số khai băng thông (kbps) cho `lanes` tunnel.
     *
     * `perLaneKbps <= 0` nghĩa là "không khai" (Brutal tắt, BBR) — giữ nguyên 0, KHÔNG nhân:
     * nhân 0 cũng ra 0 nhưng giữ nguyên thể hiện đúng ý định và tránh nhân số âm.
     */
    fun declaredKbps(perLaneKbps: Int, lanes: Int): Int {
        if (perLaneKbps <= 0) return perLaneKbps
        return perLaneKbps * clampCount(lanes)
    }

    /** Số tunnel PHỤ phải mở thêm (tunnel chính đi đường `connectSlot`/`connect` cũ). */
    fun extraTunnels(lanes: Int): Int = clampCount(lanes) - 1
}
