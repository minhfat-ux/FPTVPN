import XCTest

/// Tests cho quyết định watchdog sống-còn suốt phiên (`LivenessWatchdog`).
///
/// Thuần logic, không I/O — như `RelayHealthWatchdogTests.cs` của Windows. Bám đúng hai luật
/// chống báo oan: (1) người dùng ngồi yên thì KHÔNG kết luận; (2) chỉ kết luận khi chiều về im
/// VÀ máy vẫn gửi gói vào tunnel (bất đối xứng).
final class LivenessWatchdogTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    private func makeWatchdog() -> LivenessWatchdog {
        LivenessWatchdog(now: t0, interval: 15, silenceLimit: 60, strikesToRebuild: 3)
    }

    /// Không đọc được bộ đếm nào ⇒ chưa đủ bằng chứng.
    func testIdleWhenCountersUnavailable() {
        var dog = makeWatchdog()
        let verdict = dog.tick(now: t0.addingTimeInterval(300), fromGo: nil, toGo: nil, rampInFlight: false)
        XCTAssertEqual(verdict, .idle)
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Có byte chiều về mới ⇒ sống, và mọi strike cũ bị xoá.
    func testAliveOnReturnGrowthResetsStrikes() {
        var dog = makeWatchdog()
        // Gieo 2 strike trước (chiều về im, máy vẫn gửi).
        _ = dog.tick(now: t0.addingTimeInterval(70), fromGo: 0, toGo: 500, rampInFlight: false)
        _ = dog.tick(now: t0.addingTimeInterval(85), fromGo: 0, toGo: 900, rampInFlight: false)
        XCTAssertEqual(dog.strikes, 2)

        let verdict = dog.tick(now: t0.addingTimeInterval(100), fromGo: 40, toGo: 1_200, rampInFlight: false)
        XCTAssertEqual(verdict, .alive)
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Người dùng ngồi yên: chiều về im NHƯNG máy cũng không gửi gì ⇒ không được cắt VPN.
    func testIdleWhenUserSilent() {
        var dog = makeWatchdog()
        for tick in 1...10 {
            let now = t0.addingTimeInterval(Double(tick) * 15)
            let verdict = dog.tick(now: now, fromGo: 0, toGo: 0, rampInFlight: false)
            XCTAssertEqual(verdict, .idle, "nhịp \(tick) khi máy hoàn toàn yên")
        }
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Im + bất đối xứng đủ 3 nhịp ⇒ strike 1, 2 rồi rebuild.
    func testStrikesThenRebuildOnAsymmetry() {
        var dog = makeWatchdog()
        // Máy gửi gói vào tunnel trong lúc chiều về đứng yên.
        let first = dog.tick(now: t0.addingTimeInterval(61), fromGo: 0, toGo: 300, rampInFlight: false)
        XCTAssertEqual(first, .strike(1))
        let second = dog.tick(now: t0.addingTimeInterval(76), fromGo: 0, toGo: 600, rampInFlight: false)
        XCTAssertEqual(second, .strike(2))
        let third = dog.tick(now: t0.addingTimeInterval(91), fromGo: 0, toGo: 900, rampInFlight: false)
        XCTAssertEqual(third, .rebuild)
    }

    /// Chưa đủ `silenceLimit` thì dù bất đối xứng vẫn chưa kết luận.
    func testNotEnoughEvidenceBeforeSilenceLimit() {
        var dog = makeWatchdog()
        // toGo tăng nhưng mới 59s kể từ lần cuối thấy byte chiều về.
        let verdict = dog.tick(now: t0.addingTimeInterval(59), fromGo: 0, toGo: 400, rampInFlight: false)
        XCTAssertEqual(verdict, .idle)
        XCTAssertEqual(dog.strikes, 0)
    }

    /// Đang ramp băng thông: coi như đường còn tốt, không đụng, và dịch mốc sống.
    func testRampInFlightIsTreatedAsAlive() {
        var dog = makeWatchdog()
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
        _ = dog.tick(now: t0.addingTimeInterval(70), fromGo: 0, toGo: 100, rampInFlight: false)
        _ = dog.tick(now: t0.addingTimeInterval(85), fromGo: 0, toGo: 200, rampInFlight: false)
        XCTAssertEqual(dog.strikes, 2)

        dog.resetAfterRebuild(now: t0.addingTimeInterval(86), fromGo: 0, toGo: 0)
        XCTAssertEqual(dog.strikes, 0)
        let verdict = dog.tick(now: t0.addingTimeInterval(100), fromGo: 0, toGo: 50, rampInFlight: false)
        XCTAssertEqual(verdict, .idle)
    }

    /// Nhịp/ngưỡng mặc định phải khớp bản Windows 1.4.1 (15s / 60s / 3 strike).
    func testDefaultsMatchWindowsParity() {
        let dog = LivenessWatchdog(now: t0)
        XCTAssertEqual(dog.interval, 15)
        XCTAssertEqual(dog.silenceLimit, 60)
        XCTAssertEqual(dog.strikesToRebuild, 3)
    }
}
