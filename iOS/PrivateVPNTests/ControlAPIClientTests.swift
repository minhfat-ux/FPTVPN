import XCTest
@testable import PrivateVPN

/// Tests `ControlAPIClient` (coordinator API) request/response handling using a
/// mocked `URLProtocol` — no network involved.
final class ControlAPIClientTests: XCTestCase {
    private func makeRegisterResponse() -> CoordinatorRegisterResponse {
        CoordinatorRegisterResponse(
            peer_id: "uuid-peer-1",
            overlay_ip: "10.77.0.5",
            network: "10.77.0.0/24",
            peer_credential: "PVPN-PEER-test-cred",
            peers: [
                CoordinatorPeer(
                    peer_id: "uuid-peer-2",
                    name: "exitnode",
                    overlay_ip: "10.77.0.1",
                    wireguard_public_key: "exit-node-pubkey",
                    endpoint: "103.173.155.50:443",
                    allowed_ips: ["10.77.0.1/32"]
                )
            ]
        )
    }

    override func setUp() {
        super.setUp()
        // Bộ chọn host là trạng thái toàn cục (sticky): reset để mỗi test bắt đầu từ host chính.
        ControlAPIHosts.selector.reset()
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        ControlAPIHosts.selector.reset()
        super.tearDown()
    }

    private func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let bufferSize = 4096
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }

    func testRegisterSuccessDecodesResponse() async throws {
        let client = makeMockedClient()
        let expected = makeRegisterResponse()
        let body = try JSONEncoder().encode(expected)

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil
            )!
            return (response, body)
        }

        let result = try await client.register(
            name: "ios-device",
            platform: "ios",
            wireguardPublicKey: "device-pubkey",
            endpoint: "0.0.0.0:51820"
        )

        XCTAssertEqual(result, expected)
        XCTAssertEqual(result.peer_id, "uuid-peer-1")
        XCTAssertEqual(result.overlay_ip, "10.77.0.5")
        XCTAssertEqual(result.peers.count, 1)
        XCTAssertEqual(result.peers.first?.endpoint, "103.173.155.50:443")
    }

    func testRegisterSendsCoordinatorPayload() async throws {
        let client = makeMockedClient()
        var capturedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            capturedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil
            )!
            return (response, try JSONEncoder().encode(self.makeRegisterResponse()))
        }

        _ = try await client.register(
            name: "ios-device",
            platform: "ios",
            wireguardPublicKey: "device-pubkey",
            endpoint: "0.0.0.0:51820"
        )

        let request = try XCTUnwrap(capturedRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/v1/peers/register")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"),
                     "registration keeps legacy no-header behavior unless an access token is supplied")

        let body = try XCTUnwrap(bodyData(from: request))
        let payload = try XCTUnwrap(try JSONDecoder().decode([String: String].self, from: body))
        XCTAssertEqual(payload["name"], "ios-device")
        XCTAssertEqual(payload["platform"], "ios")
        XCTAssertEqual(payload["wireguard_public_key"], "device-pubkey")
        XCTAssertEqual(payload["endpoint"], "0.0.0.0:51820")
        XCTAssertEqual(payload["join_token"], "PVPN-JOIN-test")
    }

    func testRegisterCanAttachBearerSession() async throws {
        let client = makeMockedClient()
        var capturedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            capturedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil
            )!
            return (response, try JSONEncoder().encode(self.makeRegisterResponse()))
        }

        _ = try await client.register(
            name: "ios-device",
            platform: "ios",
            wireguardPublicKey: "device-pubkey",
            endpoint: "0.0.0.0:51820",
            accessToken: "PVPN-AUTH-test"
        )

        let request = try XCTUnwrap(capturedRequest)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer PVPN-AUTH-test")
    }

    func testFetchEnrollmentTokenUsesAuthenticatedEndpoint() async throws {
        let client = makeMockedClient()
        var capturedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            capturedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"token":"PVPN-ENROLL-test"}"#.utf8))
        }

        let token = try await client.fetchEnrollmentToken(accessToken: "PVPN-AUTH-test")

        let request = try XCTUnwrap(capturedRequest)
        XCTAssertEqual(token, "PVPN-ENROLL-test")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/v1/enrollment-tokens")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer PVPN-AUTH-test")
    }

    func testFetchEnrollmentTokenRejectsMissingSessionBeforeNetwork() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { _ in
            XCTFail("Missing session should fail before making a request")
            let response = HTTPURLResponse(
                url: URL(string: "https://api.meetflowai.site")!, statusCode: 500, httpVersion: nil, headerFields: nil
            )!
            return (response, Data())
        }

        do {
            _ = try await client.fetchEnrollmentToken(accessToken: "")
            XCTFail("Expected missingSession")
        } catch let error as ControlAPIClient.ClientError {
            guard case .missingSession = error else {
                return XCTFail("Expected missingSession, got \(error)")
            }
        }
    }

    /// `GET /v1/auth/session` re-reads the session for the token we already hold, so a
    /// Premium plan granted on the web buy page becomes visible without signing out and
    /// back in.
    func testFetchSessionUsesAuthenticatedEndpointAndDecodesSubscription() async throws {
        let client = makeMockedClient()
        var capturedRequest: URLRequest?
        let body = Data(#"{"access_token":"PVPN-AUTH-test","token_type":"Bearer","expires_at":"2026-10-01T00:00:00Z","user":{"id":"uuid-user-1","email":"buyer@example.com","subscription_status":{"is_active":true,"product_id":"Monthly_Premium","expires_at":"2026-10-01T00:00:00Z"}}}"#.utf8)
        MockURLProtocol.requestHandler = { request in
            capturedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, body)
        }

        let session = try await client.fetchSession(accessToken: "PVPN-AUTH-test")

        let request = try XCTUnwrap(capturedRequest)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.path, "/v1/auth/session")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer PVPN-AUTH-test")
        XCTAssertEqual(session.access_token, "PVPN-AUTH-test")
        XCTAssertEqual(session.user.email, "buyer@example.com")
        XCTAssertEqual(session.user.subscription_status?.is_active, true)
        XCTAssertEqual(session.user.subscription_status?.product_id, "Monthly_Premium")
    }

    func testFetchSessionRejectsMissingSessionBeforeNetwork() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { _ in
            XCTFail("Missing session should fail before making a request")
            let response = HTTPURLResponse(
                url: URL(string: "https://api.meetflowai.site")!, statusCode: 500, httpVersion: nil, headerFields: nil
            )!
            return (response, Data())
        }

        do {
            _ = try await client.fetchSession(accessToken: "")
            XCTFail("Expected missingSession")
        } catch let error as ControlAPIClient.ClientError {
            guard case .missingSession = error else {
                return XCTFail("Expected missingSession, got \(error)")
            }
        }
    }

    /// Deploy order: a control plane deployed before this route exists answers 404. That must
    /// surface as an error (so the caller keeps the entitlement it already has), never as a
    /// "not subscribed" answer.
    func testFetchSessionOnCoordinatorWithoutRouteSurfacesError() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"error":"Not found"}"#.utf8))
        }

        do {
            _ = try await client.fetchSession(accessToken: "PVPN-AUTH-test")
            XCTFail("Expected a ClientError for HTTP 404")
        } catch let error as ControlAPIClient.ClientError {
            guard case .server = error else {
                return XCTFail("Expected .server error, got \(error)")
            }
        }
    }

    func testRegisterUnauthorizedMapsToServerError() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"error":"TOKEN_FAILURE","message":"Join token has expired"}"#.utf8))
        }

        do {
            _ = try await client.register(name: "ios", platform: "ios",
                                          wireguardPublicKey: "k", endpoint: "0.0.0.0:51820")
            XCTFail("Expected a ClientError for HTTP 401")
        } catch let error as ControlAPIClient.ClientError {
            guard case .server(let message) = error else {
                return XCTFail("Expected .server error, got \(error)")
            }
            XCTAssertEqual(message, "Join token has expired")
        }
    }

    func testRegisterServerErrorWithoutBodyFallsBackToHTTPStatus() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil
            )!
            return (response, Data())
        }

        do {
            _ = try await client.register(name: "ios", platform: "ios",
                                          wireguardPublicKey: "k", endpoint: "0.0.0.0:51820")
            XCTFail("Expected a ClientError for HTTP 503")
        } catch let error as ControlAPIClient.ClientError {
            guard case .server(let message) = error else {
                return XCTFail("Expected .server error, got \(error)")
            }
            XCTAssertEqual(message, "HTTP 503")
        }
    }

    func testRegisterTransportErrorMapsToTransport() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { _ in
            throw URLError(.notConnectedToInternet)
        }

        do {
            _ = try await client.register(name: "ios", platform: "ios",
                                          wireguardPublicKey: "k", endpoint: "0.0.0.0:51820")
            XCTFail("Expected a ClientError for a transport failure")
        } catch let error as ControlAPIClient.ClientError {
            guard case .transport(let endpoint, _) = error else {
                return XCTFail("Expected .transport error, got \(error)")
            }
            XCTAssertEqual(endpoint, "registration")
        }
    }

    func testRegisterUnexpectedPayloadThrowsDecodingError() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil
            )!
            return (response, Data("{\"not\": \"the expected shape\"}".utf8))
        }

        do {
            _ = try await client.register(name: "ios", platform: "ios",
                                          wireguardPublicKey: "k", endpoint: "0.0.0.0:51820")
            XCTFail("Expected a decoding error for a malformed 201 payload")
        } catch is DecodingError {
            // Expected.
        } catch {
            XCTFail("Expected DecodingError, got \(error)")
        }
    }

    // MARK: - Fallback host (blocked-IP path)

    func testTransportFailureOnPrimaryIsRetriedOnFallbackHost() async throws {
        let client = makeMockedClient()
        let fallbackHost = try XCTUnwrap(ControlAPIHosts.fallbackBaseURLs.first?.host)
        var triedHosts: [String] = []
        MockURLProtocol.requestHandler = { request in
            let host = request.url?.host ?? ""
            triedHosts.append(host)
            guard host == fallbackHost else { throw URLError(.cannotConnectToHost) }
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"token":"PVPN-ENROLL-fallback"}"#.utf8))
        }

        let token = try await client.fetchEnrollmentToken(accessToken: "PVPN-AUTH-test")

        XCTAssertEqual(token, "PVPN-ENROLL-fallback")
        XCTAssertEqual(triedHosts, ["api.meetflowai.site", fallbackHost],
                       "the same request must be retried once against the fallback host")
    }

    func testHTTPErrorOnPrimaryIsNotRetriedOnFallbackHost() async throws {
        let client = makeMockedClient()
        var triedHosts: [String] = []
        MockURLProtocol.requestHandler = { request in
            triedHosts.append(request.url?.host ?? "")
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil
            )!
            return (response, Data())
        }

        do {
            _ = try await client.fetchEnrollmentToken(accessToken: "PVPN-AUTH-test")
            XCTFail("Expected a ClientError for HTTP 503")
        } catch let error as ControlAPIClient.ClientError {
            guard case .server(let message) = error else {
                return XCTFail("Expected .server error, got \(error)")
            }
            XCTAssertEqual(message, "HTTP 503")
        }
        XCTAssertEqual(triedHosts, ["api.meetflowai.site"],
                       "an HTTP answer is not a blocked route: it must not be retried")
    }

    func testFallbackRetryPreservesMethodPathQueryHeadersAndBody() async throws {
        let client = makeMockedClient()
        let fallback = try XCTUnwrap(ControlAPIHosts.fallbackBaseURLs.first)
        var retriedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            guard request.url?.host == fallback.host else { throw URLError(.cannotConnectToHost) }
            retriedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"ok":true}"#.utf8))
        }

        var request = URLRequest(url: URL(string: "https://api.meetflowai.site/v1/nodes?limit=5")!)
        request.httpMethod = "POST"
        request.setValue("Bearer PVPN-AUTH-test", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(#"{"node_id":"node-1"}"#.utf8)

        _ = try await client.sendEmpty(request, endpoint: "fallback test")

        let retried = try XCTUnwrap(retriedRequest)
        XCTAssertEqual(retried.url?.scheme, fallback.scheme)
        XCTAssertEqual(retried.url?.host, fallback.host)
        XCTAssertEqual(retried.url?.port, fallback.port)
        XCTAssertEqual(retried.url?.path, "/v1/nodes")
        XCTAssertEqual(retried.url?.query, "limit=5")
        XCTAssertEqual(retried.httpMethod, "POST")
        XCTAssertEqual(retried.value(forHTTPHeaderField: "Authorization"), "Bearer PVPN-AUTH-test")
        XCTAssertEqual(retried.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(bodyData(from: retried), Data(#"{"node_id":"node-1"}"#.utf8))
    }

    /// Host dự phòng đầu tiên phải là `t1.meetflowai.site` (SNI khác nên GFW chưa chặn),
    /// trước Funnel — nếu đảo thứ tự, client sẽ chậm hơn ở mạng Trung Quốc.
    func testFallbackHostListPrefersT1Hostname() throws {
        XCTAssertEqual(ControlAPIHosts.fallbackBaseURLs.first?.host, "t1.meetflowai.site")
        XCTAssertEqual(ControlAPIHosts.allBaseURLs.first?.host, "api.meetflowai.site")
    }

    /// 401 là câu trả lời thật của host đang tới được, KHÔNG phải lỗi mạng ⇒ không được
    /// thử lại host dự phòng (thử lại POST còn lặp side effect).
    func testHTTP401OnPrimaryIsNotRetriedOnFallbackHost() async throws {
        let client = makeMockedClient()
        var triedHosts: [String] = []
        MockURLProtocol.requestHandler = { request in
            triedHosts.append(request.url?.host ?? "")
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"error":"unauthorized"}"#.utf8))
        }

        do {
            _ = try await client.fetchEnrollmentToken(accessToken: "PVPN-AUTH-test")
            XCTFail("Expected a ClientError for HTTP 401")
        } catch let error as ControlAPIClient.ClientError {
            guard case .server = error else {
                return XCTFail("Expected .server error, got \(error)")
            }
        }
        XCTAssertEqual(triedHosts, ["api.meetflowai.site"],
                       "401 là câu trả lời, không phải mạng hỏng: không đổi host")
    }

    /// 403 (kể cả device_limit) cũng là câu trả lời thật ⇒ giữ nguyên host chính.
    func testHTTP403OnPrimaryIsNotRetriedOnFallbackHost() async throws {
        let client = makeMockedClient()
        var triedHosts: [String] = []
        MockURLProtocol.requestHandler = { request in
            triedHosts.append(request.url?.host ?? "")
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"error":"device_limit_reached","message":"too many"}"#.utf8))
        }

        _ = try? await client.register(
            name: "ios", platform: "ios", wireguardPublicKey: "k", endpoint: "0.0.0.0:51820"
        )
        XCTAssertEqual(triedHosts, ["api.meetflowai.site"],
                       "403 là câu trả lời, không phải mạng hỏng: không đổi host")
    }

    /// Sau khi host dự phòng chạy được, các lời gọi sau phải đi THẲNG host đó (sticky),
    /// không thử lại host chính — nếu không, mỗi request lại phải chờ hết timeout.
    func testStickyHostIsReusedAfterFallbackSucceeds() async throws {
        let client = makeMockedClient()
        let fallbackHost = try XCTUnwrap(ControlAPIHosts.fallbackBaseURLs.first?.host)
        var triedHosts: [String] = []
        MockURLProtocol.requestHandler = { request in
            let host = request.url?.host ?? ""
            triedHosts.append(host)
            guard host == fallbackHost else { throw URLError(.cannotConnectToHost) }
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"token":"PVPN-ENROLL-sticky"}"#.utf8))
        }

        _ = try await client.fetchEnrollmentToken(accessToken: "PVPN-AUTH-test")
        XCTAssertEqual(triedHosts, ["api.meetflowai.site", fallbackHost],
                       "lần đầu: thử host chính rồi mới sang dự phòng")
        XCTAssertEqual(ControlAPIHosts.currentBaseURL.host, fallbackHost)

        triedHosts.removeAll()
        _ = try await client.fetchEnrollmentToken(accessToken: "PVPN-AUTH-test")
        XCTAssertEqual(triedHosts, [fallbackHost],
                       "host đã thành công phải được dùng tiếp, không thử lại host chính")
    }

    /// Đổi mạng ⇒ quên host sticky, lần gọi kế tiếp thử lại host chính (mạng mới có thể
    /// không chặn host cũ, và ngược lại).
    func testNetworkChangeResetsStickyHost() throws {
        let fallback = try XCTUnwrap(ControlAPIHosts.fallbackBaseURLs.first)
        ControlAPIHosts.selector.noteSuccess(fallback)
        XCTAssertEqual(ControlAPIHosts.currentBaseURL.host, fallback.host)

        ControlAPIHosts.selector.reset()
        XCTAssertEqual(ControlAPIHosts.currentBaseURL.host, "api.meetflowai.site",
                       "sau khi mạng đổi phải thử lại host chính")
    }

    /// Link web (Mua/Điều khoản) đi theo host đang sống: mặc định là apex, nhưng khi đang
    /// chạy trên host dự phòng (mạng bị chặn) thì trỏ thẳng host đó để vẫn mở được.
    func testWebLinksFollowStickyHost() throws {
        XCTAssertEqual(ControlAPIHosts.webBaseURL.host, "meetflowai.site",
                       "host chính là API-only nên link web mặc định dùng apex")

        let fallback = try XCTUnwrap(ControlAPIHosts.fallbackBaseURLs.first)
        ControlAPIHosts.selector.noteSuccess(fallback)

        let buy = ControlAPIHosts.webURL("buy", queryItems: [
            URLQueryItem(name: "lang", value: "vi"),
            URLQueryItem(name: "inapp", value: "1"),
        ])
        XCTAssertEqual(buy.host, fallback.host)
        XCTAssertEqual(buy.path, "/buy")
        XCTAssertEqual(buy.query, "lang=vi&inapp=1")
        XCTAssertEqual(ControlAPIHosts.webURL("support").host, fallback.host)
    }

    // MARK: - Health report (NodeHealthReporter's send path)

    /// The exact request `NodeHealthReporter` builds. Its file is compiled into the
    /// packet-tunnel target only, so the shared retry it calls is exercised here with a
    /// byte-identical request.
    private func healthReportRequest(reachable: Bool) -> URLRequest {
        var request = URLRequest(
            url: URL(string: "https://api.meetflowai.site/v1/nodes/node-1/report")!
        )
        request.httpMethod = "POST"
        request.timeoutInterval = 8
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["ok": reachable]
        if !reachable { body["reason"] = "relay unreachable from this network" }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return request
    }

    private func makeMockedSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    func testHealthReportIsRetriedOnFallbackHostAfterTransportFailure() async throws {
        let fallbackHost = try XCTUnwrap(ControlAPIHosts.fallbackBaseURLs.first?.host)
        var triedHosts: [String] = []
        var retriedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            let host = request.url?.host ?? ""
            triedHosts.append(host)
            guard host == fallbackHost else { throw URLError(.cannotConnectToHost) }
            retriedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"ok":true}"#.utf8))
        }

        let (_, response) = try await ControlAPIHosts.sendWithFallback(
            healthReportRequest(reachable: false),
            session: makeMockedSession()
        )

        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        XCTAssertEqual(triedHosts, ["api.meetflowai.site", fallbackHost],
                       "a blocked node IP must not stop the health report: retry the fallback host")

        let retried = try XCTUnwrap(retriedRequest)
        XCTAssertEqual(retried.httpMethod, "POST")
        XCTAssertEqual(retried.url?.path, "/v1/nodes/node-1/report")
        let payload = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: try XCTUnwrap(bodyData(from: retried))) as? [String: Any]
        )
        XCTAssertEqual(payload["ok"] as? Bool, false)
        XCTAssertEqual(payload["reason"] as? String, "relay unreachable from this network")
    }

    func testHealthReportIsNotRetriedOnFallbackHostAfterHTTPError() async throws {
        var triedHosts: [String] = []
        MockURLProtocol.requestHandler = { request in
            triedHosts.append(request.url?.host ?? "")
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil
            )!
            return (response, Data())
        }

        let (_, response) = try await ControlAPIHosts.sendWithFallback(
            healthReportRequest(reachable: false),
            session: makeMockedSession()
        )

        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 503)
        XCTAssertEqual(triedHosts, ["api.meetflowai.site"],
                       "an HTTP answer is not a blocked route: the report must not be retried")
    }

    // MARK: - Relay WS theo từng node

    /// Cache cũ (trước khi coordinator gửi `ws_relay_url`) PHẢI vẫn decode được.
    /// Nếu không, người dùng đang có app sẽ mất danh sách server ngay sau khi cập
    /// nhật — đây là lý do field để optional thay vì bắt buộc.
    func testExitNodeCacheWithoutRelayFieldStillDecodes() throws {
        let legacy = #"""
        {"nodes":[{"id":"node-1","name":"Hanoi 1","country":"VN","city":"Hanoi",
        "endpoint":"103.173.155.50:443","public_key":"pk1"}]}
        """#
        let decoded = try JSONDecoder().decode(NodesResponse.self, from: Data(legacy.utf8))
        XCTAssertEqual(decoded.nodes.count, 1)
        XCTAssertNil(decoded.nodes[0].ws_relay_url, "thiếu field => nil, không được ném lỗi")
    }

    /// Coordinator khẳng định node nào có relay, node nào không, thì client phải đọc
    /// đúng — vì đi qua relay của node khác làm WireGuard im lặng hoàn toàn.
    func testExitNodeDecodesPerNodeRelayURL() throws {
        let json = #"""
        {"nodes":[
          {"id":"node-1","name":"Hanoi 1","country":"VN","city":"Hanoi",
           "endpoint":"103.173.155.50:443","public_key":"pk1",
           "ws_relay_url":"wss://relay.example:10000"},
          {"id":"vietnam-2","name":"Hanoi 2","country":"VN","city":"Hanoi",
           "endpoint":"165.101.114.162:443","public_key":"pk2","ws_relay_url":null,"hy_relay_url":null,"wg_relay_url":"wss://fcnvpn.tail303be3.ts.net/vn2"}
        ]}
        """#
        let decoded = try JSONDecoder().decode(NodesResponse.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.nodes[0].ws_relay_url, "wss://relay.example:10000")
        XCTAssertNil(decoded.nodes[1].ws_relay_url)
        // `relayURL` là thứ đưa vào tunnel: ưu tiên field mới, lùi về field cũ để coordinator
        // chưa cập nhật vẫn chạy được.
        XCTAssertEqual(decoded.nodes[0].relayURL, "wss://relay.example:10000", "coordinator cũ chỉ có ws_relay_url")
        XCTAssertEqual(decoded.nodes[1].relayURL, "wss://fcnvpn.tail303be3.ts.net/vn2", "field mới wg_relay_url phải thắng")
    }

    /// Danh sách dự phòng nằm trong app phải khai relay của TỪNG node.
    ///
    /// Bất biến: mỗi node có relay riêng, vì relay chỉ hạ cánh ở một node. Để nil thì đường
    /// offline rơi vào nhánh "đoán" và có thể đoán sang node khác — đúng cái bẫy gây lỗi
    /// "connected nhưng không có mạng" trên iPad 13/09. Từ 14/09 node-2 cũng đã có relay
    /// riêng trên hạ tầng dùng chung (Funnel path /vn2 -> UDP 443 của node-2), nên cả hai
    /// node đều phải khai — khác trước đây khi chỉ node-1 có.
    func testBuiltInFallbackDeclaresRelayPerNode() {
        let first = ExitNode.builtInFallback.first { $0.id == "node-1" }
        let second = ExitNode.builtInFallback.first { $0.id == "vietnam-2" }
        XCTAssertEqual(first?.relayURL, WSRelayDefaults.url.absoluteString)
        XCTAssertEqual(
            second?.relayURL,
            WSRelayDefaults.nodeTwoURL.absoluteString,
            "node-2 phải khai relay CỦA CHÍNH NÓ, không được để nil rồi đoán",
        )
        XCTAssertNotEqual(first?.relayURL, second?.relayURL, "relay phải khác nhau theo từng node")
    }
}
