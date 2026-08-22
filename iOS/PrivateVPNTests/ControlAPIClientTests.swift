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

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
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
                     "coordinator auth is via join_token in body, not a header")

        let body = try XCTUnwrap(bodyData(from: request))
        let payload = try XCTUnwrap(try JSONDecoder().decode([String: String].self, from: body))
        XCTAssertEqual(payload["name"], "ios-device")
        XCTAssertEqual(payload["platform"], "ios")
        XCTAssertEqual(payload["wireguard_public_key"], "device-pubkey")
        XCTAssertEqual(payload["endpoint"], "0.0.0.0:51820")
        XCTAssertEqual(payload["join_token"], "PVPN-JOIN-test")
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
}
