import XCTest

/// Tests cho quyết định watchdog sống-còn suốt phiên (`LivenessWatchdog`).
///
/// Thuần logic, không I/O — như `RelayHealthWatchdogTests.cs` của Windows. Bám đúng hai luật
/// chống báo oan: (1) người dùng ngồi yên thì KHÔNG kết luận; (2) chỉ kết luận khi chiều về im
/// VÀ máy vẫn gửi gói vào tunnel (bất đối xứng). Ngưỡng mặc định bám tiêu chí A5: im ≥15 s,
/// 1 nhịp là đủ kết luận ⇒ kết luận ngay ở nhịp 15 s kế tiếp.
final class LivenessWatchdogTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    /// Watchdog bản nhiều strike (dùng để test chính cơ chế đếm strike).
    private func makeWatchdog(strikes: Int = 3) -> LivenessWatchdog {
        LivenessWatchdog(now: t0, interval: 15, silenceLimit: 15, strikesToRebuild: strikes)
    }

    /// Watchdog đúng cấu hình đang chạy trong provider (A5).
    private func makeA5Watchdog() -> LivenessWatchdog {
        LivenessWatchdog(now: t0)
    }

    /// Không đọc được bộ đếm nào ⇒ chưa đủ bằng chứng.
    func testIdleWhenCountersUnavailable() {
        var dog = makeA5Watchdog()
        let verdict = dog.tick(now: t0.addingTimeInterval(300), fromGo: nil, toGo: nil, rampInFlight: false)
        XCTAssertEqual(verdict, .idle)
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Có byte chiều về mới ⇒ sống, và mọi strike cũ bị xoá.
    func testAliveOnReturnGrowthResetsStrikes() {
        var dog = makeWatchdog()
        // Gieo 2 strike trước (chiều về im, máy vẫn gửi).
        _ = dog.tick(now: t0.addingTimeInterval(16), fromGo: 0, toGo: 500, rampInFlight: false)
        _ = dog.tick(now: t0.addingTimeInterval(31), fromGo: 0, toGo: 900, rampInFlight: false)
        XCTAssertEqual(dog.strikes, 2)

        let verdict = dog.tick(now: t0.addingTimeInterval(46), fromGo: 40, toGo: 1_200, rampInFlight: false)
        XCTAssertEqual(verdict, .alive)
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Người dùng ngồi yên: chiều về im NHƯNG máy cũng không gửi gì ⇒ không được cắt VPN.
    func testIdleWhenUserSilent() {
        var dog = makeA5Watchdog()
        for tick in 1...10 {
            let now = t0.addingTimeInterval(Double(tick) * 15)
            let verdict = dog.tick(now: now, fromGo: 0, toGo: 0, rampInFlight: false)
            XCTAssertEqual(verdict, .idle, "nhịp \(tick) khi máy hoàn toàn yên")
        }
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Im + bất đối xứng đủ 3 nhịp ⇒ strike 1, 2 rồi rebuild (cơ chế đếm strike còn dùng được).
    func testStrikesThenRebuildOnAsymmetry() {
        var dog = makeWatchdog()
        // Máy gửi gói vào tunnel trong lúc chiều về đứng yên.
        let first = dog.tick(now: t0.addingTimeInterval(16), fromGo: 0, toGo: 300, rampInFlight: false)
        XCTAssertEqual(first, .strike(1))
        let second = dog.tick(now: t0.addingTimeInterval(31), fromGo: 0, toGo: 600, rampInFlight: false)
        XCTAssertEqual(second, .strike(2))
        let third = dog.tick(now: t0.addingTimeInterval(46), fromGo: 0, toGo: 900, rampInFlight: false)
        XCTAssertEqual(third, .rebuild)
    }

    /// A5: chỉ MỘT cửa sổ im 15 s + bất đối xứng là đủ kết luận (không chờ 180 s như Windows).
    func testA5SingleAsymmetricWindowRebuildsImmediately() {
        var dog = makeA5Watchdog()
        // 14 s: chưa đủ ngưỡng.
        XCTAssertEqual(
            dog.tick(now: t0.addingTimeInterval(14), fromGo: 0, toGo: 200, rampInFlight: false),
            .idle
        )
        // 15 s: đã đủ ngưỡng + máy vẫn gửi ⇒ rebuild ngay.
        let verdict = dog.tick(now: t0.addingTimeInterval(15), fromGo: 0, toGo: 500, rampInFlight: false)
        XCTAssertEqual(verdict, .rebuild)
        XCTAssertEqual(dog.strikes, 1)
    }

    /// A5: im 15 s nhưng máy KHÔNG gửi gì (đối xứng) ⇒ vẫn không kết luận, dù bao lâu.
    func testA5SymmetricSilenceNeverRebuilds() {
        var dog = makeA5Watchdog()
        let verdict = dog.tick(now: t0.addingTimeInterval(600), fromGo: 0, toGo: 0, rampInFlight: false)
        XCTAssertEqual(verdict, .idle)
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Chưa đủ `silenceLimit` thì dù bất đối xứng vẫn chưa kết luận.
    func testNotEnoughEvidenceBeforeSilenceLimit() {
        var dog = makeA5Watchdog()
        // toGo tăng nhưng mới 14 s kể từ lần cuối thấy byte chiều về.
        let verdict = dog.tick(now: t0.addingTimeInterval(14), fromGo: 0, toGo: 400, rampInFlight: false)
        XCTAssertEqual(verdict, .idle)
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Đang ramp băng thông: coi như đường còn tốt, không đụng, và dịch mốc sống.
    func testRampInFlightIsTreatedAsAlive() {
        var dog = makeA5Watchdog()
        let verdict = dog.tick(now: t0.addingTimeInterval(300), fromGo: 0, toGo: 5_000, rampInFlight: true)
        XCTAssertEqual(verdict, .idle)
        XCTAssertEqual(dog.strikes, 0)
        // Sau khi ramp xong, chu kỳ im lại tính từ mốc ramp (không kết luận ngay).
        let after = dog.tick(now: t0.addingTimeInterval(310), fromGo: 0, toGo: 6_000, rampInFlight: false)
        XCTAssertEqual(after, .idle)
    }

    /// Reset sau khi dựng lại transport xong: strike về 0, mốc sống đặt lại.
    func testResetAfterRebuildClearsStrikes() {
        var dog = makeWatchdog()
        _ = dog.tick(now: t0.addingTimeInterval(16), fromGo: 0, toGo: 100, rampInFlight: false)
        _ = dog.tick(now: t0.addingTimeInterval(31), fromGo: 0, toGo: 200, rampInFlight: false)
        XCTAssertEqual(dog.strikes, 2)

        dog.resetAfterRebuild(now: t0.addingTimeInterval(32), fromGo: 0, toGo: 0)
        XCTAssertEqual(dog.strikes, 0)
        let verdict = dog.tick(now: t0.addingTimeInterval(45), fromGo: 0, toGo: 50, rampInFlight: false)
        XCTAssertEqual(verdict, .idle)
    }

    /// Nhịp/ngưỡng mặc định phải khớp tiêu chí A5 (15 s / 15 s / 1 nhịp).
    func testDefaultsMatchA5() {
        let dog = LivenessWatchdog(now: t0)
        XCTAssertEqual(dog.interval, 15)
        XCTAssertEqual(dog.silenceLimit, 15)
        XCTAssertEqual(dog.strikesToRebuild, 1)
    }
}
