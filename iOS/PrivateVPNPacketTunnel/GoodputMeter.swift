import Foundation

/// Đo **goodput THẬT** (byte đi qua tunnel) bằng cửa sổ trượt — tách hẳn khỏi số khai Brutal.
///
/// Vì sao tách: yêu cầu §3.1 kết luận nâng số khai KHÔNG làm tăng tốc độ tải (server bật
/// `ignoreClientBandwidth`). Máy trạng thái START/RAMP/STABLE/PROBE/DEGRADED phải quyết định
/// theo goodput ĐO ĐƯỢC, nên phép đo là một struct riêng, thuần logic, test được.
///
/// Nguồn số (đã có trong `HysteriaPacketTunnelProvider`):
///   * `HysteriaTransport.utunPacketCounters(fd:)` (iOS, `:526-537`), hoặc
///   * bộ đếm cầu `packetFlow↔fd` (`TunnelBridge`) — macOS.
/// Cả hai đều cho byte LUỸ KẾ hai chiều: `fromGoBytes` = tunnel trả về MÁY (tải xuống),
/// `toGoBytes` = MÁY đưa vào tunnel (tải lên).
///
/// Cửa sổ mặc định 12 s, mẫu 1 s (đúng §4.2 kế hoạch). Goodput là trung bình cửa sổ, KHÔNG phải
/// số tức thời — để một gói ACK lẻ không làm nhảy trạng thái.
struct GoodputMeter {

    /// Một mẫu bộ đếm luỹ kế.
    struct Sample: Equatable, Sendable {
        let at: Date
        let fromGoBytes: Int
        let toGoBytes: Int
    }

    static let defaultWindow: TimeInterval = 12
    static let defaultSampleInterval: TimeInterval = 1
    /// Ngưỡng "có tải" (byte/giây, tổng hai chiều) — cùng mức `BandwidthControl.busyBytesPerSecond`.
    static let defaultBusyBytesPerSecond = 2_000

    let window: TimeInterval
    let sampleInterval: TimeInterval
    let busyBytesPerSecond: Int

    /// Mẫu còn trong cửa sổ, cũ → mới.
    private(set) var samples: [Sample] = []
    /// Lần cuối thấy tải ≥ ngưỡng (dùng cho "phiên rảnh ≥5 s" của kênh dò A6).
    private(set) var lastBusyAt: Date?

    init(
        window: TimeInterval = GoodputMeter.defaultWindow,
        sampleInterval: TimeInterval = GoodputMeter.defaultSampleInterval,
        busyBytesPerSecond: Int = GoodputMeter.defaultBusyBytesPerSecond
    ) {
        self.window = max(2, window)
        self.sampleInterval = max(1, sampleInterval)
        self.busyBytesPerSecond = max(1, busyBytesPerSecond)
    }

    // MARK: - Nạp mẫu

    /// Nạp một mẫu bộ đếm luỹ kế; trả goodput tải xuống (kbps) sau khi cắt cửa sổ.
    ///
    /// Bộ đếm tụt (transport mới / bộ đếm reset) ⇒ coi như phiên đo mới: xoá mẫu cũ thay vì cho
    /// ra số âm khổng lồ.
    @discardableResult
    mutating func addSample(now: Date, fromGoBytes: Int, toGoBytes: Int) -> Int {
        if let last = samples.last,
           fromGoBytes < last.fromGoBytes || toGoBytes < last.toGoBytes {
            samples.removeAll()
            lastBusyAt = nil
        }
        // Đo mức tức thời giữa hai mẫu để cập nhật "đang bận" trước khi ghi mẫu mới.
        if let last = samples.last {
            let elapsed = now.timeIntervalSince(last.at)
            if elapsed > 0 {
                let bytes = max(0, (fromGoBytes - last.fromGoBytes) + (toGoBytes - last.toGoBytes))
                if Double(bytes) / elapsed >= Double(busyBytesPerSecond) {
                    lastBusyAt = now
                }
            }
        }
        samples.append(Sample(at: now, fromGoBytes: fromGoBytes, toGoBytes: toGoBytes))
        trim(now: now)
        return goodputKbps
    }

    // MARK: - Số đo

    /// Goodput tải XUỐNG (kbps) trên cửa sổ trượt — con số dùng cho mốc 8 Mbps của yêu cầu.
    var goodputKbps: Int {
        rateKbps { ($0.fromGoBytes, $1.fromGoBytes) }
    }

    /// Goodput tải LÊN (kbps) trên cửa sổ trượt.
    var uploadKbps: Int {
        rateKbps { ($0.toGoBytes, $1.toGoBytes) }
    }

    /// Có mẫu nào để tính chưa (cần ≥2 mẫu và trải ≥ `sampleInterval`).
    var hasMeasurement: Bool {
        guard let first = samples.first, let last = samples.last else { return false }
        return samples.count >= 2 && last.at.timeIntervalSince(first.at) >= sampleInterval
    }

    /// Phiên có đang chở tải thật không (mức tức thời gần nhất ≥ ngưỡng).
    var isBusy: Bool {
        guard let lastBusyAt, let last = samples.last else { return false }
        return last.at.timeIntervalSince(lastBusyAt) < sampleInterval * 2
    }

    /// Phiên đã rảnh liên tục ít nhất `duration` tính tới `now` (điều kiện mở kênh dò A6).
    func isIdle(for duration: TimeInterval, now: Date) -> Bool {
        guard let lastBusyAt else { return true }
        return now.timeIntervalSince(lastBusyAt) >= duration
    }

    /// Xoá toàn bộ số đo (dựng lại transport / đổi đường).
    mutating func reset() {
        samples.removeAll()
        lastBusyAt = nil
    }

    // MARK: - Nội bộ

    private mutating func trim(now: Date) {
        // Giữ mẫu cũ nhất còn nằm trong cửa sổ (cần mốc đầu để tính delta).
        while samples.count > 2, let first = samples.first,
              now.timeIntervalSince(first.at) > window {
            samples.removeFirst()
        }
    }

    private func rateKbps(
        _ pick: (Sample, Sample) -> (Int, Int)
    ) -> Int {
        guard let first = samples.first, let last = samples.last else { return 0 }
        let elapsed = last.at.timeIntervalSince(first.at)
        guard elapsed >= sampleInterval else { return 0 }
        let (bytesFirst, bytesLast) = pick(first, last)
        let delta = max(0, bytesLast - bytesFirst)
        // kbps = byte × 8 / giây / 1000
        return Int((Double(delta) * 8.0) / elapsed / 1000.0)
    }
}
