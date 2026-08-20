import XCTest
@testable import PrivateVPN

/// Tests `ControlAPIClient` request/response handling using a mocked
/// `URLProtocol` — no network involved.
final class ControlAPIClientTests: XCTestCase {
    private func makeResponse() -> RegisterDeviceResponse {
        RegisterDeviceResponse(
            device: ProvisionedDevice(
                id: "uuid-device-1",
                publicKey: "server-seen-public-key",
                deviceName: "iPhone 15",
                assignedIP: "10.77.0.2/32",
                active: true
            ),
            config: ProvisionedConfig(
                serverPublicKey: "server-peer-public-key",
                endpoint: "63.140.14.154:64044",
                address: "10.77.0.2/32",
                dns: ["1.1.1.1"],
                allowedIPs: ["0.0.0.0/0", "::/0"],
                persistentKeepalive: 25
            )
        )
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    /// Extracts the request body. URLSession hands URLProtocols a request whose
    /// `httpBody` has been moved to `httpBodyStream`, so both must be handled.
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
        let expected = makeResponse()
        let body = try JSONEncoder().encode(expected)

        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, body)
        }

        let result = try await client.register(
            publicKey: "server-seen-public-key"
        )

        XCTAssertEqual(result, expected)
        XCTAssertEqual(result.device.id, "uuid-device-1")
        XCTAssertEqual(result.device.assignedIP, "10.77.0.2/32")
        XCTAssertEqual(result.config.endpoint, "63.140.14.154:64044")
        XCTAssertEqual(result.config.allowedIPs, ["0.0.0.0/0", "::/0"])
        XCTAssertEqual(result.config.persistentKeepalive, 25)
    }

    func testRegisterSendsPublicKeyAndStableDeviceIdentity() async throws {
        let client = makeMockedClient()
        var capturedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            capturedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, try JSONEncoder().encode(self.makeResponse()))
        }

        _ = try await client.register(
            publicKey: "device-public-key",
            deviceId: "00000000-0000-0000-0000-0000000000ab",
            platform: "ios"
        )

        let request = try XCTUnwrap(capturedRequest)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/device")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
        XCTAssertTrue(request.value(forHTTPHeaderField: "Content-Type")?.contains("application/json") == true)

        let body = try XCTUnwrap(bodyData(from: request))
        let payload = try XCTUnwrap(try JSONDecoder().decode([String: String].self, from: body))
        XCTAssertEqual(payload["publicKey"], "device-public-key")
        XCTAssertNil(payload["deviceName"], "device name must not be transmitted (NFR-PRIV-001)")
        XCTAssertEqual(payload["deviceId"], "00000000-0000-0000-0000-0000000000ab")
        XCTAssertEqual(payload["platform"], "ios")
    }

    func testRegisterOmitsAuthHeaderWhenNoToken() async throws {
        let client = makeMockedClient(authToken: nil)
        var capturedRequest: URLRequest?
        MockURLProtocol.requestHandler = { request in
            capturedRequest = request
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, try JSONEncoder().encode(self.makeResponse()))
        }

        _ = try await client.register(publicKey: "device-public-key")

        XCTAssertNil(capturedRequest?.value(forHTTPHeaderField: "Authorization"))
    }

    func testRegisterUnauthorizedMapsToServerError() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil
            )!
            return (response, Data(#"{"error":"unauthorized"}"#.utf8))
        }

        do {
            _ = try await client.register(publicKey: "device-public-key")
            XCTFail("Expected a ClientError for HTTP 401")
        } catch let error as ControlAPIClient.ClientError {
            guard case .server(let message) = error else {
                return XCTFail("Expected .server error, got \(error)")
            }
            XCTAssertEqual(message, "unauthorized")
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
            _ = try await client.register(publicKey: "device-public-key")
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
            _ = try await client.register(publicKey: "device-public-key")
            XCTFail("Expected a ClientError for a transport failure")
        } catch let error as ControlAPIClient.ClientError {
            guard case .transport = error else {
                return XCTFail("Expected .transport error, got \(error)")
            }
        }
    }

    func testRegisterUnexpectedPayloadThrowsDecodingError() async throws {
        let client = makeMockedClient()
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil
            )!
            return (response, Data("{\"not\": \"the expected shape\"}".utf8))
        }

        do {
            _ = try await client.register(publicKey: "device-public-key")
            XCTFail("Expected a decoding error for a malformed 200 payload")
        } catch is DecodingError {
            // Expected: JSON decode failure surfaces as-is.
        } catch {
            XCTFail("Expected DecodingError, got \(error)")
        }
    }
}
