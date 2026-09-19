package com.privatevpn.app

import com.privatevpn.app.vpn.BandwidthPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Khoá luật chốt số khai băng thông động (xem BandwidthMemory / BandwidthPolicy).
 *
 * Vì sao test phần này mà không test trên máy: đây là phần dễ sai nhất và sai theo kiểu
 * im lặng — khai quá cao thì Brutal tự gây nghẽn (đo thật: khai 300/1000 -> 1,3 Mbps),
 * khai hạ dần mỗi lần kết nối thì mạng "chậm dần không rõ lý do". Cả hai đều chỉ hiện ra
 * sau nhiều lần kết nối, nên phải khoá bằng test chứ không bằng mắt.
 */
class BandwidthPolicyTest {

    // Nấc TĨNH cũ, dùng làm đường lùi: Wi-Fi 30/100 Mbps, di động 8/12 Mbps.
    private val staticUpUnmetered = 30_000
    private val staticDownUnmetered = 100_000
    private val staticUpMobile = 8_000
    private val staticDownMobile = 12_000

    private fun decide(
        measured: Int,
        declared: Int = 0,
        up: Int = staticUpUnmetered,
        down: Int = staticDownUnmetered,
        ceiling: Int = 0,
        previous: Int = 0,
    ) = BandwidthPolicy.decide(
        rememberedMeasuredKbps = measured,
        rememberedDeclaredKbps = declared,
        staticUpKbps = up,
        staticDownKbps = down,
        previousMeasuredKbps = previous,
        ceilingDownKbps = ceiling,
    )

    @Test
    fun `chua co so do thi dung dung nac tinh cu`() {
        val d = decide(measured = 0)
        assertEquals(staticUpUnmetered, d.upKbps)
        assertEquals(staticDownUnmetered, d.downKbps)
        assertEquals(BandwidthPolicy.REASON_PROFILE, d.reason)

        val m = decide(
            measured = 0, up = staticUpMobile, down = staticDownMobile,
        )
        assertEquals(staticUpMobile, m.upKbps)
        assertEquals(staticDownMobile, m.downKbps)
        assertEquals(BandwidthPolicy.REASON_PROFILE, m.reason)
    }

    @Test
    fun `tran vat ly kep so khai xuong`() {
        // Wi-Fi 2,4 GHz: linkSpeed 72 Mbps, RSSI -70 dBm -> tran 72*1000*0,35 = 25,2 Mbps.
        val ceiling = 25_200
        val d = decide(measured = 0, ceiling = ceiling)
        assertEquals(ceiling, d.downKbps)
        assertTrue("up phai theo ti le 30/100 cua nac tinh", d.upKbps < staticUpUnmetered)
        assertEquals(BandwidthPolicy.REASON_CLAMP, d.reason)
        assertEquals(ceiling, d.ceilingDownKbps)
    }

    @Test
    fun `tran vat ly cao hon nac tinh thi khong doi gi`() {
        // Wi-Fi 5 GHz manh: 866 Mbps * 0,45 = 389,7 Mbps > 100 Mbps => van khai nhu cu.
        val d = decide(measured = 0, ceiling = 389_700)
        assertEquals(staticUpUnmetered, d.upKbps)
        assertEquals(staticDownUnmetered, d.downKbps)
        assertEquals(BandwidthPolicy.REASON_PROFILE, d.reason)
    }

    @Test
    fun `duong yeu hon so khai thi ha theo so do`() {
        // Khai 100 Mbps ma do duoc 40 Mbps (va truoc do cung 40 Mbps) => lan sau khai 85% cua
        // 40 = 34 Mbps: so khai di theo suc mang that, khong bam vao so cu.
        val d = decide(measured = 40_000, declared = staticDownUnmetered, previous = 40_000)
        assertEquals(34_000, d.downKbps)
        assertEquals(10_200, d.upKbps) // 34 Mbps * 30/100
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }

    @Test
    fun `mot mau do xau khong keo so khai xuong day`() {
        // Ca that tren Wi-Fi khach san 19/09: mang chap chon, mot phep do 3s roi dung luc
        // mang dung => chi 573 kbps trong khi luot truoc do 40 Mbps. Neu lay 85% so do thi
        // khai 487 kbps cho ca phien sau. Giam xoc: moc la 60% so do LIEN TRUOC.
        val d = decide(measured = 573, declared = 100_000, previous = 40_000)
        assertEquals(20_400, d.downKbps) // 85% cua (60% * 40 Mbps)
        assertEquals(6_120, d.upKbps)
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }

    @Test
    fun `mang tut that thi so khai di theo so do moi`() {
        // Mang tut THAT (do hai lan lien tiep deu thap) => phai theo so do, khong giu so cu:
        // giam xoc chi chan mot mau don le, khong chan xu huong.
        val d = decide(measured = 3_000, declared = 100_000, previous = 3_500)
        assertEquals(2_550, d.downKbps) // 85% cua 3 Mbps
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }

    @Test
    fun `do vuot xa so khai thi nhay len ngay theo so do`() {
        // So khai cu bi bop xuong 1 Mbps (sau mot mau xau) ma mang that do duoc 40 Mbps:
        // do 15%/lan thi phai hang chuc lan ket noi moi len lai => phai nhay thang.
        val d = decide(measured = 40_000, declared = 1_000)
        assertEquals(34_000, d.downKbps) // 85% cua 40 Mbps
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }

    @Test
    fun `do xap xi so dang khai thi gi nguyen khong ha 15 phan tram`() {
        // Do duoc 30 Mbps trong khi khai 34 Mbps (88%, nam trong dai chet 85-90%): so khai
        // KHONG phai nut co chai ma cung khong vuot suc mang. Neu van lay 85% so do thi moi
        // lan ket noi lai ha mot nac -> so khai troi doc dan.
        val d = decide(measured = 30_000, declared = 34_000)
        assertEquals(34_000, d.downKbps)
        assertEquals(10_200, d.upKbps)
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }

    @Test
    fun `do cham tran so khai thi do len 15 phan tram`() {
        // Do duoc 30 Mbps trong khi khai 30 Mbps (100% >= 90%) => duong con du => lan sau do
        // len 15% (vong dieu chinh cham, chi o ranh gioi ket noi).
        val d = decide(measured = 30_000, declared = 30_000)
        assertEquals(34_500, d.downKbps)
        assertEquals(10_350, d.upKbps)
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }

    @Test
    fun `buoc do len khong vuot tran cua nac tinh`() {
        // Dang khai sat tran 100 Mbps, do duoc 98% => do len bi chan o tran (khong khai 115).
        val d = decide(measured = 98_000, declared = 100_000)
        assertEquals(staticDownUnmetered, d.downKbps)
        assertEquals(staticUpUnmetered, d.upKbps)
    }

    @Test
    fun `so do nho bat thuong thi bi kep san`() {
        // So khai cu da rat thap (1 Mbps) va do lai chi 300 kbps: 85% cua 300 = 255, san giam
        // xoc 60% cua 1000 = 600 => van phai kep len SAN, khong khai vai tram kbps.
        val d = decide(measured = 300, declared = 1_000)
        assertEquals(BandwidthPolicy.FLOOR_DOWN_KBPS, d.downKbps)
        assertEquals(BandwidthPolicy.FLOOR_UP_KBPS, d.upKbps)
        assertEquals(BandwidthPolicy.REASON_CLAMP, d.reason)
    }

    @Test
    fun `so do khong bao gio khai cao hon nac tinh dang chay tot`() {
        // Mạng rất nhanh (do được 400 Mbps): vẫn chỉ khai tối đa bằng nấc tĩnh 30/100.
        val d = decide(measured = 400_000, declared = staticDownUnmetered)
        assertTrue(d.downKbps <= staticDownUnmetered)
        assertTrue(d.upKbps <= staticUpUnmetered)
    }

    @Test
    fun `ket noi lai nhieu lan thi hoi tu ve sat suc mang, khong troi doc`() {
        // Mo phong DUNG duong di that: mang that 40 Mbps, Brutal pace theo so khai nen goodput
        // do duoc = min(40 Mbps, so khai). Moi luot: doc bo nho -> chot so khai -> do lai ->
        // ghi bo nho (luat cua BandwidthMemory.remember: giu so do moi nhat).
        val pathKbps = 40_000
        var memoryMeasured = 0
        var memoryDeclared = 0
        val decisions = mutableListOf<Int>()
        var achieved = 0
        repeat(8) {
            val d = decide(measured = memoryMeasured, declared = memoryDeclared)
            decisions += d.downKbps
            val declared = d.downKbps
            achieved = minOf(pathKbps, declared)
            memoryMeasured = achieved
            memoryDeclared = declared
        }
        // Luot dau chua co so do => nac tinh cu (100 Mbps). Sau do ve sat suc mang THUC
        // (40 Mbps) trong vai luot va DUNG YEN, khong tut dan qua cac luot.
        assertEquals(staticDownUnmetered, decisions.first())
        assertEquals(decisions[5], decisions[6])
        assertEquals(decisions[6], decisions[7])
        assertTrue("so khai phai quanh quay suc mang that (40 Mbps)", decisions.last() in 40_000..52_000)
        assertEquals("toc do thuc phai cham tran suc mang", pathKbps, achieved)
    }

    @Test
    fun `so do cho mang di dong giu dung ti le 8 tren 12`() {
        // 4G đo được 6 Mbps trong khi khai 12 Mbps: 85% * 6 = 5,1 Mbps, nhưng sàn giảm xóc
        // là 60% * 12 = 7,2 Mbps => lần này khai 7,2 Mbps rồi lần sau mới về sát 6 Mbps.
        val d = decide(
            measured = 6_000, declared = staticDownMobile, previous = 6_000,
            up = staticUpMobile, down = staticDownMobile,
        )
        assertEquals(5_100, d.downKbps)
        assertEquals(3_400, d.upKbps) // 5,1 Mbps * 8/12
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }
}
