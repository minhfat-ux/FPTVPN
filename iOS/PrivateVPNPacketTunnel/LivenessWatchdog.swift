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
/// máy **vẫn gửi** gói vào tunnel (`toGo` tăng) mà **không có gói nào trả về** (`fromGo` đứng
/// yên) trong `silenceLimit` giây ⇒ đường hỏng (đúng dấu hiệu TCP blackhole).
///
/// Chống báo oan (bài học Windows): người dùng ngồi yên thì `toGo` cũng đứng yên ⇒ KHÔNG kết
/// luận, KHÔNG cắt VPN. Chỉ khi đồng thời "chiều về im" VÀ "máy vẫn gửi" mới tính là hỏng.
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

    let interval: TimeInterval
    let silenceLimit: TimeInterval
    let strikesToRebuild: Int

    /// Byte chiều VỀ lần đọc trước (`fromGo`).
    private(set) var lastFromGo = 0
    /// Mốc `toGo` tại lần cuối tunnel còn sống — dùng để biết máy CÓ gửi gì trong lúc im không.
    private(set) var baselineToGo = 0
    /// Lần cuối thấy byte chiều về tăng.
    private(set) var lastReturnAt: Date
    /// Số nhịp liên tiếp "im VÀ bất đối xứng" hiện tại.
    private(set) var strikes = 0

    init(
        now: Date,
        interval: TimeInterval = 15,
        silenceLimit: TimeInterval = 60,
        strikesToRebuild: Int = 3
    ) {
        self.interval = max(1, interval)
        self.silenceLimit = max(1, silenceLimit)
        self.strikesToRebuild = max(1, strikesToRebuild)
        self.lastReturnAt = now
    }

    /// Một nhịp. `fromGo`/`toGo` là bộ đếm luỹ kế đã đi qua tunnel; `nil` = không đọc được nguồn
    /// nào (không đủ bằng chứng ⇒ `.idle`). `rampInFlight` = đang dựng lại transport để ramp
    /// băng thông ⇒ coi như đường còn tốt, không được đụng vào.
    mutating func tick(now: Date, fromGo: Int?, toGo: Int?, rampInFlight: Bool) -> Verdict {
        guard let fromGo, let toGo else { return .idle }
        if rampInFlight {
            noteReturn(at: now, fromGo: fromGo, toGo: toGo)
            return .idle
        }
        // (1) Chiều về có byte mới ⇒ tunnel sống thật.
        if fromGo > lastFromGo {
            noteReturn(at: now, fromGo: fromGo, toGo: toGo)
            return .alive
        }
        // (2) Chiều về đứng yên: chưa đủ dài thì chỉ là im bình thường.
        guard now.timeIntervalSince(lastReturnAt) >= silenceLimit else { return .idle }
        // (3) Máy có GỬI gì vào tunnel trong lúc im không? Không ⇒ người dùng ngồi yên,
        // chưa đủ bằng chứng để kết luận (giữ nguyên baseline, không tăng strike).
        guard toGo > baselineToGo else { return .idle }
        // (4) Im VÀ bất đối xứng ⇒ đường hỏng.
        strikes += 1
        return strikes >= strikesToRebuild ? .rebuild : .strike(strikes)
    }

    /// Reset trạng thái sau khi dựng lại transport thành công (transport mới, bộ đếm mới).
    mutating func resetAfterRebuild(now: Date, fromGo: Int, toGo: Int) {
        noteReturn(at: now, fromGo: fromGo, toGo: toGo)
    }

    private mutating func noteReturn(at now: Date, fromGo: Int, toGo: Int) {
        lastFromGo = fromGo
        baselineToGo = toGo
        lastReturnAt = now
        strikes = 0
    }
}
