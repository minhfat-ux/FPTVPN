package com.privatevpn.app

import com.privatevpn.app.vpn.MultiTunnelPolicy
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Khóa hai luật dễ sai nhất của chế độ N tunnel (hút băng thông) — port từ iOS `167ba9d`:
 *
 *  1. **Kẹp N**: `1` = TẮT. Ngoài khoảng `1..8` (0, âm, hoặc lớn hơn trần) phải bị kẹp lại,
 *     nếu không: N=0 ⇒ `Serve()` không có tunnel nào; N quá lớn ⇒ mở hàng loạt cầu WS vô ích.
 *  2. **Số khai = (một luồng) × N** — đo thật 19/10/2026 trên mạng dùng chung (giới hạn theo
 *     TỪNG kết nối): 1 luồng 4–12 Mbps, 8 luồng 72–81 Mbps. Khai theo một luồng thì Brutal CC
 *     bị khoá ở mức một luồng ⇒ bật N cũng không nhanh hơn.
 */
class MultiTunnelPolicyTest {

    @Test
    fun clampKeepsOneAsTheOffSwitch() {
        // 1 và 0 đều phải ra 1: 0 là "chưa đặt" (SharedPreferences trả mặc định 0) chứ
        // không phải "mở 0 tunnel".
        assertEquals(1, MultiTunnelPolicy.clampCount(0))
        assertEquals(1, MultiTunnelPolicy.clampCount(1))
        assertEquals(1, MultiTunnelPolicy.clampCount(-7))
    }

    @Test
    fun clampAcceptsEverySettingsChoice() {
        for (choice in Config.MULTI_TUNNEL_CHOICES) {
            assertEquals(choice, MultiTunnelPolicy.clampCount(choice))
        }
    }

    @Test
    fun clampStopsAboveTheMeasuredCeiling() {
        // Trần 8 = đúng mốc đã đo (8 luồng 72–81 Mbps); vượt nữa chưa có bằng chứng.
        assertEquals(Config.MULTI_TUNNEL_MAX, MultiTunnelPolicy.clampCount(Config.MULTI_TUNNEL_MAX))
        assertEquals(Config.MULTI_TUNNEL_MAX, MultiTunnelPolicy.clampCount(9))
        assertEquals(Config.MULTI_TUNNEL_MAX, MultiTunnelPolicy.clampCount(1_000))
    }

    @Test
    fun declarationIsTotalCapacityNotPerLane() {
        // Một luồng 5 Mbps: N=1 giữ nguyên, N=4 khai 20 Mbps, N=8 khai 40 Mbps.
        assertEquals(5_000, MultiTunnelPolicy.declaredKbps(5_000, 1))
        assertEquals(20_000, MultiTunnelPolicy.declaredKbps(5_000, 4))
        assertEquals(40_000, MultiTunnelPolicy.declaredKbps(5_000, 8))
    }

    @Test
    fun declarationNeverGoesNegativeOrInventsBandwidth() {
        // 0 = "không khai" (Brutal tắt): nhân vẫn ra 0, và không được biến số âm thành số dương.
        assertEquals(0, MultiTunnelPolicy.declaredKbps(0, 4))
        assertEquals(-1, MultiTunnelPolicy.declaredKbps(-1, 4))
    }

    @Test
    fun declarationClampsLanesFirst() {
        // lanes=0/âm ⇒ coi như 1 tunnel, không nhân 0 thành 0 (mất hẳn số khai).
        assertEquals(5_000, MultiTunnelPolicy.declaredKbps(5_000, 0))
        assertEquals(5_000, MultiTunnelPolicy.declaredKbps(5_000, -3))
        // lanes vượt trần ⇒ nhân theo trần.
        assertEquals(40_000, MultiTunnelPolicy.declaredKbps(5_000, 99))
    }

    @Test
    fun extraTunnelsIsOneLessThanTotal() {
        assertEquals(0, MultiTunnelPolicy.extraTunnels(1))
        assertEquals(1, MultiTunnelPolicy.extraTunnels(2))
        assertEquals(3, MultiTunnelPolicy.extraTunnels(4))
        assertEquals(7, MultiTunnelPolicy.extraTunnels(8))
        // 0 nghĩa là TẮT ⇒ không mở tunnel phụ nào.
        assertEquals(0, MultiTunnelPolicy.extraTunnels(0))
    }
}
