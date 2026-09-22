import XCTest

/// Tests cho `GoodputMeter` — cửa sổ trượt 12 s / mẫu 1 s trên bộ đếm byte thật (yêu cầu §4.2).
///
/// Thuần logic, không I/O. Mốc quan trọng: 8 Mbps = 8_000 kbps là ngưỡng STABLE của yêu cầu.
final class GoodputMeterTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 2_000_000)

    func testEmptyMeterHasNoMeasurement() {
        let meter = GoodputMeter()
        XCTAssertEqual(meter.goodputKbps, 0)
        XCTAssertFalse(meter.hasMeasurement)
        XCTAssertFalse(meter.isBusy)
    }

    func testSingleSampleHasNoRateYet() {
        var meter = GoodputMeter()
        XCTAssertEqual(meter.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0), 0)
        XCTAssertFalse(meter.hasMeasurement)
    }

    /// 10 MB tải xuống trong 10 s ⇒ đúng 8 000 kbps (8 Mbps).
    func testKnownRateOverTenSeconds() {
        var meter = GoodputMeter()
        meter.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
        let kbps = meter.addSample(now: t0.addingTimeInterval(10), fromGoBytes: 10_000_000, toGoBytes: 0)
        XCTAssertEqual(kbps, 8_000)
        XCTAssertEqual(meter.goodputKbps, 8_000)
        XCTAssertTrue(meter.hasMeasurement)
    }

    /// Cửa sổ trượt: mẫu cũ hơn 12 s bị bỏ, số đo bám 12 s gần nhất.
    func testWindowSlidesAndDropsOldSamples() {
        var meter = GoodputMeter(window: 12, sampleInterval: 1)
        // 30 s × 1 Mbps tải xuống (125 000 B/s).
        for second in 0...30 {
            meter.addSample(
                now: t0.addingTimeInterval(Double(second)),
                fromGoBytes: second * 125_000,
                toGoBytes: 0
            )
        }
        XCTAssertEqual(meter.goodputKbps, 1_000)
        // Cửa sổ 12 s + mốc biên ⇒ không giữ quá ~14 mẫu.
        XCTAssertLessThanOrEqual(meter.samples.count, 14)
    }

    /// Bộ đếm tụt (transport mới) ⇒ đo lại từ đầu, KHÔNG cho số âm/khổng lồ.
    func testCounterRegressionResetsWindow() {
        var meter = GoodputMeter()
        meter.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
        meter.addSample(now: t0.addingTimeInterval(5), fromGoBytes: 5_000_000, toGoBytes: 0)
        // Transport mới: bộ đếm về 0.
        let kbps = meter.addSample(now: t0.addingTimeInterval(6), fromGoBytes: 0, toGoBytes: 0)
        XCTAssertEqual(kbps, 0)
        XCTAssertEqual(meter.samples.count, 1)
    }

    /// Tải lên cũng đo được, tách khỏi tải xuống.
    func testUploadRateSeparate() {
        var meter = GoodputMeter()
        meter.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
        meter.addSample(now: t0.addingTimeInterval(10), fromGoBytes: 0, toGoBytes: 2_500_000)
        XCTAssertEqual(meter.goodputKbps, 0)
        XCTAssertEqual(meter.uploadKbps, 2_000)
    }

    /// Phiên bận/rảnh: tải ≥ ngưỡng ⇒ bận; im một lúc ⇒ rảnh (điều kiện mở kênh dò A6).
    func testBusyAndIdleWindows() {
        var meter = GoodputMeter(busyBytesPerSecond: 2_000)
        meter.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
        // 20 000 B trong 1 s ⇒ bận.
        meter.addSample(now: t0.addingTimeInterval(1), fromGoBytes: 20_000, toGoBytes: 0)
        XCTAssertTrue(meter.isBusy)
        XCTAssertFalse(meter.isIdle(for: 5, now: t0.addingTimeInterval(3)))
        // Im thêm: mẫu mới không tăng byte ⇒ hết bận, đủ 5 s rảnh.
        meter.addSample(now: t0.addingTimeInterval(8), fromGoBytes: 20_000, toGoBytes: 0)
        XCTAssertFalse(meter.isBusy)
        XCTAssertTrue(meter.isIdle(for: 5, now: t0.addingTimeInterval(8)))
    }

    /// Chưa từng có tải ⇒ coi là rảnh (phiên mới đã rảnh sẵn).
    func testNeverBusyIsIdle() {
        let meter = GoodputMeter()
        XCTAssertTrue(meter.isIdle(for: 5, now: t0))
    }

    /// `reset()` xoá sạch số đo của phiên cũ.
    func testResetClears() {
        var meter = GoodputMeter()
        meter.addSample(now: t0, fromGoBytes: 0, toGoBytes: 0)
        meter.addSample(now: t0.addingTimeInterval(10), fromGoBytes: 10_000_000, toGoBytes: 0)
        meter.reset()
        XCTAssertEqual(meter.goodputKbps, 0)
        XCTAssertFalse(meter.hasMeasurement)
        XCTAssertTrue(meter.samples.isEmpty)
    }
}
