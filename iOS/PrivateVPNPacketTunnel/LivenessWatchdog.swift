import Foundation

/// Quyết định của watchdog "tunnel còn sống nhưng không chở gói" — chạy SUỐT phiên.
///
/// Đây là **thuần logic, KHÔNG I/O**, tách khỏi provider để test được (giống
/// `RelayHealthWatchdog` của Windows 1.4.1). Provider chỉ bơm vào hai bộ đếm gói đã có
/// (`toGo`/`fromGo` của cầu `packetFlow↔fd`) rồi thi hành `Verdict` trả về.
///
/// Vì sao dùng BẤT ĐỐI XỨNG thay vì probe HTTP như Windows: traffic của tiến trình extension
/// **KHÔNG** đi qua tunnel của nó (NetworkExtension giữ nó ở đường vật lý — đo thật 19/09/2026,
/// xem chú thích `startTrafficSupervisor` trong `HysteriaPacketTunnelProvider`), nên một probe
/// "qua tunnel" từ trong extension là vô nghĩa. Dấu hiệu hỏng đọc được từ gói THẬT của máy:
/// máy **vẫn gửi** gói vào tunnel (`toGoOffered = toGo + toGoDropped` tăng — xem `tick`) mà
/// **không có gói nào trả về** (`fromGo` đứng yên) trong `silenceLimit` giây ⇒ đường hỏng
/// (đúng dấu hiệu TCP blackhole).
///
/// Chống báo oan (bài học Windows): người dùng ngồi yên thì `toGo` cũng đứng yên ⇒ KHÔNG kết
/// luận, KHÔNG cắt VPN. Chỉ khi đồng thời "chiều về im" VÀ "máy vẫn gửi" mới tính là hỏng.
///
/// Ngưỡng mặc định bám tiêu chí **A5** (`docs/YEU_CAU_TOC_DO_ON_DINH.md`): cửa sổ im **15 s**
/// và **1 nhịp** là đủ kết luận (`strikesToRebuild = 1`) ⇒ kết luận ngay ở nhịp 15 s kế tiếp.
/// Bản Windows 1.4.1 dùng 60 s × 3 nhịp (180 s) — quá chậm so với mốc A5; `strikesToRebuild` giữ
/// lại để harness test được cả hai chế độ.
///
/// Hết trần tự dựng lại thì KHÔNG teardown (chốt 22/09/2026): chuyển sang pha **HOLD** — giữ
/// nguyên đường đã chọn, tunnel vẫn UP, `holdTick` ping lại mỗi nhịp cho tới khi có byte chiều về.
struct LivenessWatchdog {

    /// Kết quả một nhịp kiểm tra.
    enum Verdict: Equatable {
        /// Chưa đủ bằng chứng: mới lên (< `silenceLimit`), đang ramp, người dùng yên, hoặc
        /// không đọc được bộ đếm nào. Không làm gì.
        case idle
        /// Có byte chiều VỀ mới ⇒ tunnel còn chở dữ liệu; mọi strike được reset.
        case alive
        /// Chiều về im VÀ máy vẫn gửi: đã đếm thêm 1 strike (giá trị 1-based).
        case strike(Int)
        /// Đã đủ `strikesToRebuild` strike ⇒ tới hạn tự dựng lại transport.
        case rebuild
    }

    /// Kết quả một nhịp ở pha **HOLD** — chủ dự án chốt 22/09/2026: *"hết mọi đường thì dùng
    /// đường đã chọn và chờ ping tiếp thôi"* ⇒ KHÔNG `closeTun()`/teardown vì lý do tốc độ.
    enum HoldVerdict: Equatable {
        /// Chưa thấy mạng về — đã ping thêm 1 lần (giá trị 1-based).
        case waiting(Int)
        /// Chiều VỀ có byte mới ⇒ mạng đã về, quay lại STABLE.
        case networkBack
    }

    let interval: TimeInterval
    let silenceLimit: TimeInterval
    let strikesToRebuild: Int

    /// Byte chiều VỀ lần đọc trước (`fromGo`).
    private(set) var lastFromGo = 0
    /// Mốc "máy vẫn gửi" tại lần cuối tunnel còn sống — GIỮ `toGoOffered`, không phải `toGo`
    /// (xem `tick`): `toGo` chỉ đếm gói ghi THÀNH CÔNG nên đứng yên đúng lúc cầu nghẽn.
    private(set) var baselineToGo = 0
    /// Mốc `toGoOffered` của nhịp trước — dùng để ghi log DELTA khi ra quyết định.
    private(set) var lastToGoOffered = 0
    /// Lần cuối thấy byte chiều về tăng.
    private(set) var lastReturnAt: Date
    /// Số nhịp liên tiếp "im VÀ bất đối xứng" hiện tại.
    private(set) var strikes = 0
    /// Số lần đã ping trong pha HOLD hiện tại (0 = chưa ping lần nào).
    private(set) var holdPings = 0

    init(
        now: Date,
        interval: TimeInterval = 15,
        silenceLimit: TimeInterval = 15,
        strikesToRebuild: Int = 1
    ) {
        self.interval = max(1, interval)
        self.silenceLimit = max(1, silenceLimit)
        self.strikesToRebuild = max(1, strikesToRebuild)
        self.lastReturnAt = now
    }

    /// Một nhịp. `fromGo`/`toGo` là bộ đếm luỹ kế đã đi qua tunnel; `nil` = không đọc được nguồn
    /// nào (không đủ bằng chứng ⇒ `.idle`). `rampInFlight` = đang dựng lại transport để ramp
    /// băng thông ⇒ coi như đường còn tốt, không được đụng vào.
    ///
    /// `toGoDropped` (bộ đếm cầu `packetFlow↔fd`) là phần **BẮT BUỘC** của tín hiệu "máy vẫn
    /// gửi": `toGo` chỉ đếm gói `write()` THÀNH CÔNG vào fd của Go. Khi tầng Go ngừng đọc fd
    /// (đúng ca ramp dựng lại transport giữa lúc đang chở traffic, 24/09/2026) thì `write` trả
    /// lỗi ⇒ `toGo` ĐÓNG BĂNG trong khi `toGoDropped` leo liên tục (đo thật: `toGo` đứng ở
    /// 2387/5783, `toGoDropped` 13→4285 và 6→5109). Chỉ nhìn `toGo` thì watchdog tưởng "người
    /// dùng ngồi yên" và trả `.idle` MÃI MÃI — đúng lỗi "Connected nhưng mất mạng hoàn toàn"
    /// (0 dòng tự gỡ trong cả 2/2 phiên). Vì vậy tín hiệu vào đây là
    /// `toGoOffered = toGo + toGoDropped`.
    mutating func tick(
        now: Date,
        fromGo: Int?,
        toGo: Int?,
        toGoDropped: Int = 0,
        rampInFlight: Bool
    ) -> Verdict {
        guard let fromGo, let toGo else { return .idle }
        // Số âm chỉ xảy ra khi bộ đếm bị thay nguồn: kẹp về 0 để không làm mốc sai.
        let offered = toGo + max(0, toGoDropped)
        lastToGoOffered = offered
        if rampInFlight {
            noteReturn(at: now, fromGo: fromGo, toGoOffered: offered)
            return .idle
        }
        // (1) Chiều về có byte mới ⇒ tunnel sống thật.
        if fromGo > lastFromGo {
            noteReturn(at: now, fromGo: fromGo, toGoOffered: offered)
            return .alive
        }
        // (2) Chiều về đứng yên: chưa đủ dài thì chỉ là im bình thường.
        guard now.timeIntervalSince(lastReturnAt) >= silenceLimit else { return .idle }
        // (3) Máy có GỬI gì vào tunnel trong lúc im không? `toGoOffered` (kể cả gói cầu phải
        // bỏ) mới là "máy vẫn gửi"; không tăng ⇒ người dùng ngồi yên, chưa đủ bằng chứng để
        // kết luận (giữ nguyên baseline, không tăng strike).
        guard offered > baselineToGo else { return .idle }
        // (4) Im VÀ bất đối xứng ⇒ đường hỏng.
        strikes += 1
        return strikes >= strikesToRebuild ? .rebuild : .strike(strikes)
    }

    /// Reset trạng thái sau khi dựng lại transport thành công (transport mới, bộ đếm mới).
    mutating func resetAfterRebuild(now: Date, fromGo: Int, toGo: Int, toGoDropped: Int = 0) {
        noteReturn(at: now, fromGo: fromGo, toGoOffered: toGo + max(0, toGoDropped))
        holdPings = 0
    }

    // MARK: - Pha HOLD (chốt 22/09/2026: không teardown vì lý do tốc độ)

    /// Vào pha HOLD: giữ nguyên đường đã chọn, đặt lại mốc để lần có byte chiều VỀ đầu tiên
    /// được nhận đúng là "mạng về". Không bao giờ trả `.rebuild` sau đây.
    mutating func beginHold(now: Date, fromGo: Int, toGo: Int, toGoDropped: Int = 0) {
        noteReturn(at: now, fromGo: fromGo, toGoOffered: toGo + max(0, toGoDropped))
        holdPings = 0
    }

    /// Một nhịp HOLD. `fromGo`/`toGo` `nil` = không đọc được bộ đếm ⇒ vẫn tính là một lần ping
    /// (chờ mạng về), KHÔNG kết luận hỏng, KHÔNG teardown. `toGoDropped` giữ cho mốc
    /// `baselineToGo` luôn là `toGoOffered` (xem `tick`) sau khi thoát HOLD.
    mutating func holdTick(
        now: Date,
        fromGo: Int?,
        toGo: Int?,
        toGoDropped: Int = 0
    ) -> HoldVerdict {
        guard let fromGo, let toGo else {
            holdPings += 1
            return .waiting(holdPings)
        }
        // Chiều VỀ có byte mới ⇒ mạng đã về (kể cả cửa sổ im đã quá hạn).
        if fromGo > lastFromGo {
            noteReturn(at: now, fromGo: fromGo, toGoOffered: toGo + max(0, toGoDropped))
            return .networkBack
        }
        holdPings += 1
        return .waiting(holdPings)
    }

    /// `toGoOffered` = `toGo + toGoDropped`: mốc "máy vẫn gửi" thật (xem `tick`).
    private mutating func noteReturn(at now: Date, fromGo: Int, toGoOffered: Int) {
        lastFromGo = fromGo
        baselineToGo = toGoOffered
        lastReturnAt = now
        strikes = 0
    }
}
