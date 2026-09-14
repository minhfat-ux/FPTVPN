using System.Text.Json.Serialization;

namespace VpnFlow.Core.Api;

// Bám sát file nguồn: iOS/PrivateVPN/Services/ControlAPIClient.swift.
// Số dòng trong comment là số dòng của file Swift đó tại thời điểm port (15/09/2026).

/// <summary>
/// Một peer mà coordinator biết (mesh). App dùng thông tin này để nối tới exit node.
/// Tương ứng `CoordinatorPeer` — ControlAPIClient.swift:5-14.
/// </summary>
public sealed class CoordinatorPeer
{
    [JsonPropertyName("peer_id")] public string PeerId { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("overlay_ip")] public string OverlayIp { get; set; } = "";
    [JsonPropertyName("wireguard_public_key")] public string WireguardPublicKey { get; set; } = "";
    [JsonPropertyName("endpoint")] public string Endpoint { get; set; } = "";
    [JsonPropertyName("allowed_ips")] public List<string> AllowedIps { get; set; } = new();
}

/// <summary>
/// Phản hồi của `POST /v1/peers/register`.
/// Tương ứng `CoordinatorRegisterResponse` — ControlAPIClient.swift:17-23.
/// </summary>
public sealed class CoordinatorRegisterResponse
{
    [JsonPropertyName("peer_id")] public string PeerId { get; set; } = "";
    [JsonPropertyName("overlay_ip")] public string OverlayIp { get; set; } = "";
    [JsonPropertyName("network")] public string Network { get; set; } = "";
    [JsonPropertyName("peer_credential")] public string PeerCredential { get; set; } = "";
    [JsonPropertyName("peers")] public List<CoordinatorPeer> Peers { get; set; } = new();

    /// <summary>Bản ghi cũ đã bị thu hồi để nhường slot (server trả khi có `replace_device_id`).</summary>
    [JsonPropertyName("replaced")] public ReplacedDevice? Replaced { get; set; }
}

/// <summary>Kết quả nhường slot — `applyDeviceReplace` (control-plane/src/device-replace.js:61).</summary>
public sealed class ReplacedDevice
{
    [JsonPropertyName("device_id")] public string DeviceId { get; set; } = "";
    [JsonPropertyName("name")] public string? Name { get; set; }
}

/// <summary>
/// Exit node do coordinator quảng bá (kiểu Tailscale). App hiện trong location picker
/// và nối tới node được chọn. Tương ứng `ExitNode` — ControlAPIClient.swift:27-51.
/// </summary>
public sealed class ExitNode
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("country")] public string Country { get; set; } = "";
    [JsonPropertyName("city")] public string City { get; set; } = "";
    [JsonPropertyName("endpoint")] public string Endpoint { get; set; } = "";
    [JsonPropertyName("public_key")] public string PublicKey { get; set; } = "";

    /// <summary>
    /// Relay WS dẫn tới CHÍNH node này, do control plane cấp theo từng node.
    /// Một relay chỉ hạ cánh ở MỘT node: client được cấp khoá của node A mà đi qua relay
    /// của node B thì WireGuard im lặng tuyệt đối. Optional để cache cũ decode được.
    /// ControlAPIClient.swift:42.
    /// </summary>
    [JsonPropertyName("ws_relay_url")] public string? WsRelayUrl { get; set; }

    /// <summary>
    /// Relay cho transport WIREGUARD (UDP 443) — đường iOS/macOS dùng.
    /// ControlAPIClient.swift:50.
    /// </summary>
    [JsonPropertyName("wg_relay_url")] public string? WgRelayUrl { get; set; }

    /// <summary>
    /// Relay cho transport HYSTERIA (UDP 8443) của CHÍNH node này.
    /// Server cấp field này (control-plane/src/node-store.js:205); Android đọc nó
    /// (android .../api/Models.kt:41-44). Tách khỏi `ws_relay_url` vì một relay chỉ
    /// forward tới MỘT cổng UDP — dùng lẫn transport là handshake im lặng.
    /// </summary>
    [JsonPropertyName("hy_relay_url")] public string? HyRelayUrl { get; set; }

    /// <summary>
    /// Relay đưa vào tunnel WireGuard: ưu tiên field mới, lùi về field cũ cho coordinator
    /// chưa cập nhật. Tương ứng `ExitNode.relayURL` — ControlAPIClient.swift:55.
    /// </summary>
    [JsonIgnore]
    public string? RelayUrl => WgRelayUrl ?? WsRelayUrl;

    /// <summary>
    /// Relay cho nhánh Hysteria: ưu tiên field mới, lùi về field cũ.
    /// Tương ứng `hysteriaRelayUrl()` — android .../api/Models.kt:44.
    /// </summary>
    [JsonIgnore]
    public string? HysteriaRelayUrl => HyRelayUrl ?? WsRelayUrl;

    /// <summary>
    /// Node dự phòng dùng khi coordinator không tới được (mạng bị chặn). Sao chép
    /// nguyên `ExitNode.builtInFallback` — ControlAPIClient.swift:60-73.
    /// </summary>
    public static IReadOnlyList<ExitNode> BuiltInFallback { get; } = new List<ExitNode>
    {
        new()
        {
            Id = "node-1", Name = "vietnam-1", Country = "VN", City = "Hanoi",
            Endpoint = "103.173.155.50:443",
            PublicKey = "N0vGtqZ2SARCXkvVUU/KfAZMvfwszkvF/ROLL4DLIQ8=",
            WgRelayUrl = WSRelayDefaults.Url,
        },
        new()
        {
            Id = "vietnam-2", Name = "Vietnam 2", Country = "VN", City = "Hanoi",
            Endpoint = "165.101.114.162:443",
            PublicKey = "OJPfJLblLP2KCQkPdqI1B7WHJT/U4BlzSxUTwh6vZ2c=",
            WgRelayUrl = WSRelayDefaults.NodeTwoUrl,
        },
    };
}

/// <summary>
/// Relay WS mặc định, dùng khi node không khai relay URL của riêng nó.
/// Sao chép `WSRelayDefaults` — ControlAPIClient.swift:244-252.
/// </summary>
public static class WSRelayDefaults
{
    /// <summary>Tailscale Funnel -> wsrelay -> UDP 443 của node-1 (giá trị ĐOÁN).</summary>
    public const string Url = "wss://fcnvpn.tail303be3.ts.net:10000";

    /// <summary>Relay WireGuard của node-2 — cùng hostname, khác path.</summary>
    public const string NodeTwoUrl = "wss://fcnvpn.tail303be3.ts.net/vn2";
}

/// <summary>
/// Hosts mà coordinator có thể tới được. Sao chép `ControlAPIHosts` —
/// ControlAPIClient.swift:257-268. Host dự phòng đi qua hạ tầng dùng chung
/// (Tailscale Funnel) thay vì IP node, để mạng chặn IP vẫn gọi được API.
/// </summary>
public static class ControlApiHosts
{
    public static IReadOnlyList<string> FallbackBaseUrls { get; } = new List<string>
    {
        "https://fcnvpn.tail303be3.ts.net",
    };
}

/// <summary>Bọc `NodesResponse` — ControlAPIClient.swift:125-127.</summary>
public sealed class NodesResponse
{
    [JsonPropertyName("nodes")] public List<ExitNode> Nodes { get; set; } = new();
}

/// <summary>
/// Phiên đăng nhập do coordinator cấp sau khi user login.
/// Tương ứng `CoordinatorAuthSession` — ControlAPIClient.swift:130-135.
/// </summary>
public sealed class CoordinatorAuthSession
{
    [JsonPropertyName("access_token")] public string AccessToken { get; set; } = "";
    [JsonPropertyName("token_type")] public string? TokenType { get; set; }
    [JsonPropertyName("expires_at")] public string? ExpiresAt { get; set; }
    [JsonPropertyName("user")] public CoordinatorUser User { get; set; } = new();
}

/// <summary>ControlAPIClient.swift:137-142.</summary>
public sealed class CoordinatorUser
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("email")] public string? Email { get; set; }
    [JsonPropertyName("apple_user_id")] public string? AppleUserId { get; set; }
    [JsonPropertyName("subscription_status")] public CoordinatorSubscriptionStatus? SubscriptionStatus { get; set; }
}

/// <summary>ControlAPIClient.swift:144-160.</summary>
public sealed class CoordinatorSubscriptionStatus
{
    [JsonPropertyName("is_active")] public bool IsActive { get; set; }
    [JsonPropertyName("product_id")] public string? ProductId { get; set; }
    [JsonPropertyName("expires_at")] public string? ExpiresAt { get; set; }

    /// <summary>Đang dùng bản dùng thử 1 ngày (`product_id` bắt đầu bằng `trial.`).</summary>
    [JsonPropertyName("is_trial")] public bool? IsTrial { get; set; }

    /// <summary>Số giờ còn lại của trial; null khi không phải trial, 0 khi đã hết giờ.</summary>
    [JsonPropertyName("trial_hours_left")] public int? TrialHoursLeft { get; set; }

    /// <summary>Tên gói khách đã mua (plan-store: "Monthly", "3 Months", "Yearly"…).</summary>
    [JsonPropertyName("plan_badge")] public string? PlanBadge { get; set; }
}

/// <summary>
/// Một thiết bị của user đang đăng nhập. `public_key` để app đánh dấu thiết bị hiện tại.
/// Tương ứng `CoordinatorDevice` — ControlAPIClient.swift:164-176.
/// </summary>
public sealed class CoordinatorDevice
{
    [JsonPropertyName("device_id")] public string DeviceId { get; set; } = "";
    [JsonPropertyName("name")] public string? Name { get; set; }
    [JsonPropertyName("platform")] public string? Platform { get; set; }
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("created_at")] public string? CreatedAt { get; set; }
    [JsonPropertyName("assigned_ip")] public string? AssignedIp { get; set; }
    [JsonPropertyName("public_key")] public string? PublicKey { get; set; }

    [JsonIgnore] public bool IsActive => Status == "active";
}

/// <summary>
/// Bản ghi CŨ của CHÍNH máy này, dùng để nhường slot khi server chặn vì hết hạn mức
/// thiết bị. Vì sao chỉ nhận khi DUY NHẤT một ứng viên: server cho phép thu hồi bản ghi
/// cùng `platform` của cùng tài khoản, nên nếu khách có hai máy cùng platform thì đoán
/// sai là chiếc kia mất kết nối. Nhiều ứng viên ⇒ trả null.
/// Sao chép `previousInstallCandidate` — ControlAPIClient.swift:186-195.
/// </summary>
public static class DeviceRegistration
{
    public static CoordinatorDevice? PreviousInstallCandidate(
        IEnumerable<CoordinatorDevice> devices,
        string platform,
        string publicKey)
    {
        var samePlatform = devices
            .Where(d => (d.Platform ?? "") == platform
                        && d.IsActive
                        && (d.PublicKey ?? "") != publicKey)
            .ToList();
        return samePlatform.Count == 1 ? samePlatform[0] : null;
    }
}

/// <summary>Bọc `DevicesResponse` — ControlAPIClient.swift:197-200.</summary>
public sealed class DevicesResponse
{
    [JsonPropertyName("count")] public int Count { get; set; }
    [JsonPropertyName("devices")] public List<CoordinatorDevice> Devices { get; set; } = new();
}

/// <summary>
/// Thông tin phiên bản app từ coordinator (cổng ép cập nhật).
/// Tương ứng `AppVersionInfo` — ControlAPIClient.swift:205-235.
/// </summary>
public sealed class AppVersionInfo
{
    [JsonPropertyName("platform")] public string? Platform { get; set; }
    [JsonPropertyName("minimum_version")] public string MinimumVersion { get; set; } = "0.0.0";
    [JsonPropertyName("latest_version")] public string LatestVersion { get; set; } = "0.0.0";

    /// <summary>Kênh iOS: link tải IPA (server cũng đặt `store_url` bằng link này).</summary>
    [JsonPropertyName("ipa_url")] public string? IpaUrl { get; set; }

    /// <summary>Link tải bản mới; bản cũ chỉ đọc khoá này.</summary>
    [JsonPropertyName("store_url")] public string StoreUrl { get; set; } = "";

    /// <summary>Manifest OTA của iOS — chỉ có trên kênh iOS.</summary>
    [JsonPropertyName("ipa_manifest_url")] public string? IpaManifestUrl { get; set; }

    /// <summary>Link dùng khi ép cập nhật — ưu tiên khoá mới, lùi về khoá cũ.</summary>
    [JsonIgnore]
    public string DownloadUrl
    {
        get
        {
            var ipa = (IpaUrl ?? "").Trim();
            return ipa.Length == 0 ? StoreUrl : ipa;
        }
    }
}

/// <summary>
/// Phản hồi của `POST /v1/devices/claim` (control-plane/src/index.js:4220-4226).
/// Windows claim thiết bị ở chế độ không có WireGuard peer (hysteria).
/// </summary>
public sealed class ClaimDeviceResponse
{
    [JsonPropertyName("ok")] public bool Ok { get; set; }
    [JsonPropertyName("device_id")] public string DeviceId { get; set; } = "";
    [JsonPropertyName("created")] public bool Created { get; set; }
    [JsonPropertyName("transferred")] public bool? Transferred { get; set; }
    [JsonPropertyName("replaced")] public ReplacedDevice? Replaced { get; set; }
}

// --- Các body nội bộ dùng khi gọi API (không xuất ra ngoài) ---

/// <summary>Body lỗi chung `{ error, message }` — ControlAPIClient.swift:617-620.</summary>
public sealed class ErrorBody
{
    [JsonPropertyName("error")] public string? Error { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
}

/// <summary>403 `device_limit_reached` — ControlAPIClient.swift:622-628 + index.js:4111-4116.</summary>
public sealed class DeviceLimitBody
{
    [JsonPropertyName("error")] public string? Error { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("devices")] public List<CoordinatorDevice>? Devices { get; set; }
    [JsonPropertyName("max_devices")] public int? MaxDevices { get; set; }
}

/// <summary>`{ token }` — ControlAPIClient.swift:609-611.</summary>
public sealed class TokenResponse
{
    [JsonPropertyName("token")] public string Token { get; set; } = "";
    [JsonPropertyName("expires_in")] public int? ExpiresIn { get; set; }
}

/// <summary>`{ debug_code }` của email login — ControlAPIClient.swift:613-615.</summary>
public sealed class EmailLoginStartResponse
{
    [JsonPropertyName("debug_code")] public string? DebugCode { get; set; }
}
