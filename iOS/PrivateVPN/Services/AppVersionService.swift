import Foundation

/// Fetches the required/latest app version from the backend and compares it with
/// the installed build. Drives the forced-update gate (FR/NFR — owner requirement
/// 2026-08-23): users below `minimum_version` MUST update before using the app.
enum AppVersionService {
    static var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    static func fetch(from baseURL: URL?) async throws -> AppVersionInfo {
        guard let baseURL else {
            throw ControlAPIClient.ClientError.server("Coordinator URL is not configured.")
        }
        let client = ControlAPIClient(baseURL: baseURL, joinToken: "")
        return try await client.fetchAppVersion()
    }

    /// true when the installed version is strictly below the required minimum.
    static func isForcedUpdate(_ info: AppVersionInfo, current: String = currentVersion) -> Bool {
        isVersion(current, lessThan: info.minimum_version)
    }

    /// true when a newer build exists (may be optional if not forced).
    static func isUpdateAvailable(_ info: AppVersionInfo, current: String = currentVersion) -> Bool {
        isVersion(current, lessThan: info.latest_version)
    }

    /// Numeric component-wise version compare ("1.0.2" < "1.0.10").
    static func isVersion(_ a: String, lessThan b: String) -> Bool {
        let av = a.split(separator: ".").compactMap { Int($0) }
        let bv = b.split(separator: ".").compactMap { Int($0) }
        let count = max(av.count, bv.count)
        for i in 0..<count {
            let x = i < av.count ? av[i] : 0
            let y = i < bv.count ? bv[i] : 0
            if x != y { return x < y }
        }
        return false
    }
}
