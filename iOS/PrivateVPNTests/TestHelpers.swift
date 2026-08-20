import Foundation
import XCTest
@testable import PrivateVPN

// MARK: - In-memory Keychain backend

/// In-memory `KeychainBackend` for unit tests. The Keychain itself is not
/// guaranteed to be usable inside the simulator test bundle, and tests must
/// never touch real secrets, so `KeychainStore.backend` is swapped to this in
/// `setUp` and restored to `SecurityKeychainBackend` in `tearDown`.
final class InMemoryKeychainBackend: KeychainBackend {
    var store: [String: Data]

    init(store: [String: Data] = [:]) {
        self.store = store
    }

    func save(_ data: Data, for account: String) throws {
        store[account] = data
    }

    func loadData(for account: String) throws -> Data? {
        store[account]
    }
}

// MARK: - URLProtocol mock

/// `URLProtocol` stub that answers every request from a configurable handler,
/// letting `ControlAPIClient` be tested without a network.
final class MockURLProtocol: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            fatalError("MockURLProtocol.requestHandler is nil — set it before making requests")
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

/// Builds a `ControlAPIClient` whose `URLSession` is routed through
/// `MockURLProtocol`, so tests can stub responses per request.
func makeMockedClient(
    baseURL: URL = URL(string: "https://control.example.com")!,
    authToken: String? = "test-token"
) -> ControlAPIClient {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockURLProtocol.self]
    let session = URLSession(configuration: configuration)
    return ControlAPIClient(baseURL: baseURL, authToken: authToken, session: session)
}
