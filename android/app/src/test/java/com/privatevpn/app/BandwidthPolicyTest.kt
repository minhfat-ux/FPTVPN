package com.privatevpn.app

import com.privatevpn.app.vpn.BandwidthPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        best: Int = 0,
    ) = BandwidthPolicy.decide(
        rememberedMeasuredKbps = measured,
        rememberedDeclaredKbps = declared,
        staticUpKbps = up,
        staticDownKbps = down,
        previousMeasuredKbps = previous,
        ceilingDownKbps = ceiling,
        bestKbps = best,
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
        // Chieu LEN roi xuong 6,1 Mbps theo dung ti le 30/100 cua nac tinh — KHONG bi keo len
        // nac tinh 30 Mbps: so khai la f(so do), nac tinh chi la duong lui khi chua do duoc.
        assertEquals(6_120, d.upKbps)
        assertTrue(d.upKbps < staticUpUnmetered)
        // SAN nho (500 kbps) khong dinh vao con so nay nen ly do la "dung so da nho".
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
    }

    @Test
    fun `mang tut that thi so khai di theo so do moi`() {
        // Mang tut THAT (do hai lan lien tiep deu thap) => phai theo so do, khong giu so cu:
        // giam xoc chi chan mot mau don le, khong chan xu huong.
        // 85% cua 3 Mbps = 2,55 Mbps. KHONG duoc nang len nac tinh mobile 8/12 Mbps: khai
        // 12 Mbps cho duong 3 Mbps la tu flood (dung loi 19/09 22:52 tren Wi-Fi khach san).
        val d = decide(measured = 3_000, declared = 100_000, previous = 3_500)
        assertEquals(2_550, d.downKbps)
        assertEquals(765, d.upKbps) // 2,55 Mbps * 30/100
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
        assertTrue("so do 3 Mbps thi khong duoc khai nac tinh 30/100", d.downKbps < staticDownUnmetered)
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
        // SAN chi de tranh khai 0: no PHAI nho hon moi nac tinh, neu khong thi chinh no lai keo
        // so khai LEN (loi 19/09 22:52: do 1 Mbps -> khai 8/12 Mbps).
        assertEquals(1_000, BandwidthPolicy.FLOOR_DOWN_KBPS)
        assertEquals(500, BandwidthPolicy.FLOOR_UP_KBPS)
        assertTrue(
            "san khong duoc la nac tinh mobile",
            BandwidthPolicy.FLOOR_DOWN_KBPS < staticDownMobile,
        )
        assertTrue(
            "san khong duoc la nac tinh unmetered",
            BandwidthPolicy.FLOOR_DOWN_KBPS < staticDownUnmetered,
        )
    }

    @Test
    fun `do mot Mbps thi khong bao gio khai nac tinh mobile 8 tren 12`() {
        // Ca THAT 19/09 22:52 tren Galaxy Z Fold5 (Wi-Fi khach san bi he thong coi la metered):
        //   bw: measured=1555 declared up=8000 down=12000 reason=clamp
        //   bw: probe 425210B/3199ms -> 1063kbps qua tunnel
        // Do 1,06 Mbps ma khai 8/12 Mbps => Brutal pace gap ~10 lan suc mang => tu flood.
        val d = decide(
            measured = 1_063, declared = 12_000, previous = 1_555,
            up = staticUpMobile, down = staticDownMobile,
        )
        // 85% cua (giam xoc: max(1063, 60% * 1555 = 933)) = 85% cua 1063 = 903 -> SAN nho
        // 1000 kbps keo len dung 1 nac nho, KHONG phai nac tinh 12 Mbps.
        assertEquals(BandwidthPolicy.FLOOR_DOWN_KBPS, d.downKbps)
        assertEquals(602, d.upKbps) // 1000 * 8000/12000, ti le mobile giu nguyen
        assertEquals(BandwidthPolicy.REASON_CLAMP, d.reason) // noi that: so bi san doi
        assertTrue("do 1 Mbps thi so khai phai la vai tram-vai nghin kbps", d.downKbps < 2_000)
        assertTrue("up cung khong duoc la nac tinh 8 Mbps", d.upKbps < 1_000)
    }

    @Test
    fun `co so do thi so khai la 85 phan tram so do chu khong phai nac tinh`() {
        // Cung ca 22:52 nhung voi cap (do duoc 1555, khai cu 12000): so do vuot xa so khai cu
        // (12%) => theo so do moi. Ket qua phai la ~85% so do, khong phai nac tinh nao.
        val d = decide(
            measured = 1_555, declared = 12_000, previous = 639,
            up = staticUpMobile, down = staticDownMobile,
        )
        assertEquals(1_555 * BandwidthPolicy.DECLARE_RATIO_PCT / 100, d.downKbps)
        assertEquals(880, d.upKbps) // 1321 * 8000/12000
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
        assertTrue(d.downKbps < staticDownMobile)
        assertTrue(d.upKbps < staticUpMobile)
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
        // 4G do duoc 6 Mbps trong khi khai 12 Mbps: 85% * 6 = 5,1 Mbps. Chieu LEN suy theo
        // dung ti le 8/12 cua nac tinh dang dung (5,1 * 8000/12000 = 3,4 Mbps) — ti le giu
        // nguyen, nhung con so thi theo SO DO, khong bi keo len nac tinh 8/12.
        val d = decide(
            measured = 6_000, declared = staticDownMobile, previous = 6_000,
            up = staticUpMobile, down = staticDownMobile,
        )
        assertEquals(5_100, d.downKbps)
        assertEquals(3_400, d.upKbps)
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
        assertEquals("ti le up/down phai dung 8/12", d.downKbps * 8, d.upKbps * 12)
        assertTrue(d.downKbps < staticDownMobile)
    }

    // ---- vòng ramp trong lúc chạy (brief bổ sung) ------------------------------

    @Test
    fun `dinh ben vung la trung binh truot`() {
        val samples = intArrayOf(10_000, 12_000, 8_000, 10_000, 0, 0, 0, 0, 0, 0, 0, 0)
        assertEquals(10_000, BandwidthPolicy.sustainedKbps(samples, 4))
        // 12 mẫu: (10+12+8+10) Mbps chia 12 giây = 3,33 Mbps (8 giây rảnh = 0).
        assertEquals(3_333, BandwidthPolicy.sustainedKbps(samples, 12))
        assertEquals(0, BandwidthPolicy.sustainedKbps(samples, 0))
    }

    @Test
    fun `chi tang khi dinh ben vung vuot tran khai it nhat 15 phan tram`() {
        assertTrue(BandwidthPolicy.shouldRampUp(sustainedKbps = 12_000, declaredKbps = 10_000))
        assertFalse(BandwidthPolicy.shouldRampUp(sustainedKbps = 11_000, declaredKbps = 10_000))
        assertFalse(BandwidthPolicy.shouldRampUp(sustainedKbps = 10_000, declaredKbps = 0))
    }

    @Test
    fun `buoc tang 25 phan tram va bi kep boi tran vat ly`() {
        assertEquals(12_500, BandwidthPolicy.rampUp(10_000, ceilingKbps = 50_000, floorKbps = 12_000))
        assertEquals(12_000, BandwidthPolicy.rampUp(10_000, ceilingKbps = 12_000, floorKbps = 12_000))
        assertEquals(25_000, BandwidthPolicy.rampUp(20_000, ceilingKbps = 25_000, floorKbps = 12_000))
    }

    @Test
    fun `buoc giam 30 phan tram nhung khong xuong duoi san mobile an toan`() {
        assertEquals(70_000, BandwidthPolicy.rampDown(100_000, ceilingKbps = 400_000, floorKbps = 12_000))
        assertEquals(12_000, BandwidthPolicy.rampDown(15_000, ceilingKbps = 400_000, floorKbps = 12_000))
    }

    @Test
    fun `giam tran khi mat goi hoac RTT vot`() {
        assertTrue(BandwidthPolicy.shouldRampDown(lossPct = 5, rttMs = 0, rttBaselineMs = 0))
        assertFalse(BandwidthPolicy.shouldRampDown(lossPct = 0, rttMs = 0, rttBaselineMs = 0))
        // RTT 900ms so voi nen 200ms: vot >= 3 lan => giam.
        assertTrue(BandwidthPolicy.shouldRampDown(lossPct = 0, rttMs = 900, rttBaselineMs = 200))
        // 500ms so voi nen 200ms: tang nhung chua vot => khong giam.
        assertFalse(BandwidthPolicy.shouldRampDown(lossPct = 0, rttMs = 500, rttBaselineMs = 200))
    }

    @Test
    fun `tuot sau so voi tran khai cung la tin hieu giam`() {
        assertTrue(BandwidthPolicy.shouldRampDownUnderrun(sustainedKbps = 4_000, declaredKbps = 10_000))
        assertFalse(BandwidthPolicy.shouldRampDownUnderrun(sustainedKbps = 6_000, declaredKbps = 10_000))
    }

    @Test
    fun `dinh ben vung cua mau HOAT DONG bo qua cac giay nghi`() {
        // Dang tai kieu adaptive (Netflix): 4 giay tai 8 Mbps xen ke 8 giay nghi.
        val samples = intArrayOf(8_000, 5, 8_000, 8, 8_000, 12, 8_000, 20, 0, 0, 0, 0)
        // Trung binh thuong bi cac giay nghi keo xuong con ~2,67 Mbps...
        assertEquals(2_670, BandwidthPolicy.sustainedKbps(samples, 12))
        // ...con trung binh cua cac mau HOAT DONG dung bang toc do that khi dang tai.
        val (active, busy) = BandwidthPolicy.activeSustainedKbps(samples, 12)
        assertEquals(8_000, active)
        assertEquals(4, busy)
    }

    @Test
    fun `khong co mau hoat dong thi tra ve 0 va 0 mau`() {
        val (active, busy) = BandwidthPolicy.activeSustainedKbps(intArrayOf(5, 20, 100, 0), 4)
        assertEquals(0, active)
        assertEquals(0, busy)
        assertEquals(0, BandwidthPolicy.activeSustainedKbps(intArrayOf(9_000), 0).first)
    }

    @Test
    fun `khong ha so khai khi nhu cau thap du mau trung binh tut sau`() {
        // Ca Netflix do tren may that 23/09/2026: declared 4.018 kbps, cac giay xen ke
        // 2.000 kbps va 5-20 kbps => trung binh ~500-800 kbps. Chi 3/12 mau hoat dong
        // => KHONG du bang chung de ket luan duong yeu, phai giu nguyen so khai.
        assertFalse(
            BandwidthPolicy.shouldRampDownUnderrun(
                sustainedKbps = 600, declaredKbps = 4_018, busySamples = 3,
            ),
        )
        // Duong YEU THAT: nguoi dung keo lien tuc ma chi duoc ~600 kbps (12/12 mau hoat dong).
        assertTrue(
            BandwidthPolicy.shouldRampDownUnderrun(
                sustainedKbps = 600, declaredKbps = 4_018, busySamples = 12,
            ),
        )
        // Khong truyen gi ca (0 mau hoat dong) cung khong ket luan duoc gi.
        assertFalse(
            BandwidthPolicy.shouldRampDownUnderrun(
                sustainedKbps = 5, declaredKbps = 4_018, busySamples = 0,
            ),
        )
    }

    @Test
    fun `mau hoat dong nua voi thi van chua du nguong ket luan`() {
        // 7 mau hoat dong < UNDERRUN_MIN_BUSY_SAMPLES (8): chua coi la "day het suc".
        assertFalse(
            BandwidthPolicy.shouldRampDownUnderrun(
                sustainedKbps = 1_000, declaredKbps = 10_000,
                busySamples = BandwidthPolicy.UNDERRUN_MIN_BUSY_SAMPLES - 1,
            ),
        )
        assertTrue(
            BandwidthPolicy.shouldRampDownUnderrun(
                sustainedKbps = 1_000, declaredKbps = 10_000,
                busySamples = BandwidthPolicy.UNDERRUN_MIN_BUSY_SAMPLES,
            ),
        )
    }

    @Test
    fun `goi cu khong truyen so mau hoat dong thi giu nguyen hanh vi cu`() {
        assertTrue(BandwidthPolicy.shouldRampDownUnderrun(sustainedKbps = 4_000, declaredKbps = 10_000))
        assertFalse(BandwidthPolicy.shouldRampDownUnderrun(sustainedKbps = 0, declaredKbps = 10_000))
        assertFalse(BandwidthPolicy.shouldRampDownUnderrun(sustainedKbps = 4_000, declaredKbps = 0))
    }

    @Test
    fun `bat tay TCP nhanh bat kha thi thi coi nhu khong mo duoc`() {
        // Do tren Unicom 5G 23/09/2026: connect toi node Viet Nam tra ve 2-4 ms trong khi RTT
        // that phai 40-100 ms => nha mang/GFW tu tra loi bat tay, khong co byte nao di qua.
        assertFalse("2 ms la bat tay gia", BandwidthPolicy.plausibleDirectMs(2))
        assertFalse("4 ms la bat tay gia", BandwidthPolicy.plausibleDirectMs(4))
        assertFalse(
            "duoi nguong vat ly deu khong tin",
            BandwidthPolicy.plausibleDirectMs(BandwidthPolicy.PATH_MIN_PLAUSIBLE_MS - 1),
        )
        // Do that tren Wi-Fi cung may: 108/114/141 ms => dang tin.
        assertTrue(BandwidthPolicy.plausibleDirectMs(114))
        assertTrue(BandwidthPolicy.plausibleDirectMs(BandwidthPolicy.PATH_MIN_PLAUSIBLE_MS))
        // ≤ 0 la do hong, khong phai "nhanh".
        assertFalse(BandwidthPolicy.plausibleDirectMs(0))
        assertFalse(BandwidthPolicy.plausibleDirectMs(-1))
    }

    @Test
    fun `co dinh da dat thi khoi dong luon o muc do, khong can ramp lai`() {
        // Chua co so do probe nao, chi co dinh 25 Mbps da chung minh tren mang nay.
        // ceiling = 389,7 Mbps = WiFi 866 Mbps * 0,45 (RSSI tot) — tran suc mang vat ly.
        val d = decide(measured = 0, best = 25_000, ceiling = 389_700)
        assertEquals(25_000, d.downKbps)
        // 25 Mbps * 30/100 = 7,5 Mbps theo ti le nac tinh — khong bi keo len nac tinh 30 Mbps.
        assertEquals(7_500, d.upKbps)
        assertEquals(BandwidthPolicy.REASON_MEMORY, d.reason)
        // Tran luc nay la suc mang vat ly (o day 389,7 Mbps) chu KHONG bi kep ve nac tinh
        // 100 Mbps — neu kep thi dinh da ramp se bi cat ngay khi khoi dong lai.
        assertEquals(389_700, d.ceilingDownKbps)
    }

    @Test
    fun `dinh cua mang khac van bi kep boi tran vat ly hien tai`() {
        // Doi sang AP yeu (tran 20 Mbps) nhung dinh cu 25 Mbps => phai kep lai, khong khai 25.
        val d = decide(measured = 0, best = 25_000, ceiling = 20_000)
        assertEquals(20_000, d.downKbps)
        assertEquals(BandwidthPolicy.REASON_CLAMP, d.reason)
    }
}
