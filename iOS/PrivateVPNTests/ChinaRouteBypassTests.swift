import XCTest

/// Tests cho `ChinaRouteBypass` — A7: dải IP Trung Quốc đi thẳng, không qua tunnel.
///
/// Thuần logic parse/chuẩn hoá. Bản sao khẳng định trong
/// `scripts/ios-pure-logic-tests/main.swift` (harness swiftc chạy được không cần Xcode).
final class ChinaRouteBypassTests: XCTestCase {

    func testParseSkipsCommentsDuplicatesAndInvalid() {
        let sample = """
        # comment
        1.0.1.0/24
        1.0.1.5/24        # chuẩn hoá về .0
        1.0.2.0/23

        0.0.0.0/0
        not-a-cidr
        1.0.8.0/33
        1.0.8.0/21
        """
        XCTAssertEqual(
            ChinaRouteBypass.parse(sample),
            ["1.0.1.0/24", "1.0.2.0/23", "1.0.8.0/21"]
        )
    }

    func testPrefixZeroIsRejected() {
        // `0.0.0.0/0` sẽ đẩy TOÀN BỘ traffic ra ngoài tunnel ⇒ phải bị loại.
        XCTAssertNil(ChinaRouteBypass.normalizedCIDR("0.0.0.0/0"))
        XCTAssertTrue(ChinaRouteBypass.parse("0.0.0.0/0").isEmpty)
    }

    func testPrefixMasks() {
        XCTAssertEqual(ChinaRouteBypass.prefixMask(8), "255.0.0.0")
        XCTAssertEqual(ChinaRouteBypass.prefixMask(24), "255.255.255.0")
        XCTAssertEqual(ChinaRouteBypass.prefixMask(32), "255.255.255.255")
        XCTAssertNil(ChinaRouteBypass.prefixMask(33))
    }

    func testNormalizedCIDRMasksHostBits() {
        XCTAssertEqual(ChinaRouteBypass.normalizedCIDR("192.168.1.7/24"), "192.168.1.0/24")
        XCTAssertNil(ChinaRouteBypass.normalizedCIDR("300.1.1.1/24"))
        XCTAssertNil(ChinaRouteBypass.normalizedCIDR("1.2.3.4"))
    }

    func testParseRespectsLimit() {
        let text = (1...10).map { "10.0.\($0).0/24" }.joined(separator: "\n")
        XCTAssertEqual(ChinaRouteBypass.parse(text, limit: 3).count, 3)
    }

    func testCacheRoundTrip() {
        let defaults = UserDefaults(suiteName: "ChinaRouteBypassTests")!
        defaults.removePersistentDomain(forName: "ChinaRouteBypassTests")
        ChinaRouteBypass.store(["1.0.1.0/24", "1.0.2.0/23"], defaults: defaults)
        XCTAssertEqual(ChinaRouteBypass.cached(defaults: defaults), ["1.0.1.0/24", "1.0.2.0/23"])
    }

    /// A7: mất mạng/lần đầu chạy ⇒ vẫn phải có danh sách từ bản bundle sẵn trong app.
    func testCachedFallsBackToBundledList() {
        let defaults = UserDefaults(suiteName: "ChinaRouteBypassTests.bundle")!
        defaults.removePersistentDomain(forName: "ChinaRouteBypassTests.bundle")
        let bundle = Bundle(for: ChinaRouteBypassTests.self)
        let bundled = ChinaRouteBypass.bundled(bundle: bundle)
        XCTAssertGreaterThan(bundled.count, 4_000, "bản bundle phải có danh sách IP TQ")
        XCTAssertEqual(
            ChinaRouteBypass.cached(defaults: defaults, bundle: bundle).count,
            bundled.count,
            "chưa có bản nhớ ⇒ dùng bản bundle"
        )
    }

    // MARK: - IPv6 (cn6.txt: TQ đi thẳng, còn lại chặn)

    func testParseIPv6SkipsCommentsDuplicatesAndUnsafePrefix() {
        let sample = """
        # comment
        2001:250::/30
        2001:250::/30
        ::/0
        not-an-ipv6
        2001:db8::1/129
        2400:cb00::/32
        """
        XCTAssertEqual(ChinaRouteBypass.parseIPv6(sample), ["2001:250::/30", "2400:cb00::/32"])
        XCTAssertTrue(ChinaRouteBypass.parseIPv6("::/0").isEmpty, "::/0 làm excluded ⇒ rò toàn bộ IPv6")
    }

    func testIPv6CIDRValidation() {
        XCTAssertEqual(ChinaRouteBypass.normalizedIPv6CIDR("2400:cb00::/32"), "2400:cb00::/32")
        XCTAssertEqual(ChinaRouteBypass.normalizedIPv6CIDR("::1/128"), "::1/128")
        XCTAssertNil(ChinaRouteBypass.normalizedIPv6CIDR("2400:cb00::/129"))
        XCTAssertNil(ChinaRouteBypass.normalizedIPv6CIDR("1.2.3.4/24"))
        XCTAssertNil(ChinaRouteBypass.normalizedIPv6CIDR("2001:250::"))
    }

    func testCachedIPv6FallsBackToBundledList() {
        let defaults = UserDefaults(suiteName: "ChinaRouteBypassTests.bundle6")!
        defaults.removePersistentDomain(forName: "ChinaRouteBypassTests.bundle6")
        let bundle = Bundle(for: ChinaRouteBypassTests.self)
        let bundled = ChinaRouteBypass.bundledIPv6(bundle: bundle)
        XCTAssertGreaterThan(bundled.count, 1_500, "bản bundle phải có danh sách IPv6 TQ")
        XCTAssertEqual(
            ChinaRouteBypass.cachedIPv6(defaults: defaults, bundle: bundle).count,
            bundled.count,
            "chưa có bản nhớ IPv6 ⇒ dùng bản bundle"
        )
    }
}
