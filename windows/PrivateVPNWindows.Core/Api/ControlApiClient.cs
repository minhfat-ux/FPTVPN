using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace VpnFlow.Core.Api;

/// <summary>
/// Hằng số của tầng API, tập trung một chỗ (không hiện ra UI công khai).
/// Nguồn: android .../Config.kt + docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md.
/// </summary>
public static class ControlApiDefaults
{
    /// <summary>Coordinator production.</summary>
    public const string BaseUrl = "https://api.meetflowai.site";

    /// <summary>Trang mua gói (plan picker + QR) — giống iOS/macOS.</summary>
    public const string BuyUrl = "https://meetflowai.site/buy";

    public const string SupportUrl = "https://meetflowai.site/SupportPrivateVPN.html";
    public const string PrivacyUrl = "https://meetflowai.site/FlowVPNPrivacy.html";
    public const string TermsUrl = "https://meetflowai.site/vpnflow/terms";
}

/// <summary>
/// Nói chuyện với PrivateVPN coordinator (mesh control plane) để đăng ký thiết bị và
/// biết exit node cần nối tới. Bám sát `ControlAPIClient` —
/// iOS/PrivateVPN/Services/ControlAPIClient.swift:307-629.
/// </summary>
public sealed class ControlApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _httpClient;

    /// <summary>Base URL coordinator (không có dấu "/" cuối).</summary>
    public string BaseUrl { get; }

    /// <summary>Join token một lần dùng để đăng ký thiết bị.</summary>
    public string JoinToken { get; }

    public ControlApiClient(string baseUrl, string joinToken = "", HttpClient? httpClient = null)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
            throw new ArgumentException("baseUrl là bắt buộc.", nameof(baseUrl));

        BaseUrl = baseUrl.TrimEnd('/');
        JoinToken = joinToken;
        // Timeout 10s để mạng bị chặn thất bại nhanh rồi rơi xuống host dự phòng
        // (Swift đặt timeoutInterval = 10 cho register/nodes/devices).
        _httpClient = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    }

    // ---------------------------------------------------------------------
    // Thiết bị (register / claim / revoke / devices)
    // ---------------------------------------------------------------------

    /// <summary>
    /// Đăng ký thiết bị với coordinator. `wireguardPublicKey` là khoá công khai WireGuard;
    /// `endpoint` là endpoint WireGuard của chính máy (thiết bị outbound-only nên placeholder
    /// là được). Tương ứng `register` — ControlAPIClient.swift:350-399.
    /// Ném <see cref="DeviceLimitException"/> khi server trả 403 `device_limit_reached`.
    /// </summary>
    public async Task<CoordinatorRegisterResponse> RegisterAsync(
        string name,
        string platform,
        string wireguardPublicKey,
        string endpoint,
        string? accessToken = null,
        string? exitNodeId = null,
        string? replaceDeviceId = null,
        CancellationToken cancellationToken = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["name"] = name,
            ["platform"] = platform,
            ["wireguard_public_key"] = wireguardPublicKey,
            ["endpoint"] = endpoint,
            ["join_token"] = JoinToken,
        };
        // Chỉ gửi khoá khi có giá trị — giống `compactMapValues { $0 }` (Swift:378).
        if (!string.IsNullOrEmpty(exitNodeId)) body["exit_node_id"] = exitNodeId;
        // Nhường slot: server chỉ chấp nhận khi bản ghi đó của CHÍNH tài khoản này
        // và CÙNG platform (device-replace.js).
        if (!string.IsNullOrEmpty(replaceDeviceId)) body["replace_device_id"] = replaceDeviceId;

        using var response = await SendWithFallbackAsync(
            baseUri => BuildJsonRequest(HttpMethod.Post, baseUri, "v1/peers/register", body, accessToken),
            "registration",
            cancellationToken).ConfigureAwait(false);

        var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            // Device limit: giữ message của coordinator VÀ danh sách thiết bị để UI
            // hiện được "đăng xuất thiết bị cũ".
            var limit = TryDeserialize<DeviceLimitBody>(raw);
            if (limit is { Error: "device_limit_reached" })
            {
                throw new DeviceLimitException(limit.Message, limit.Devices, limit.MaxDevices);
            }

            throw new ApiServerException(ExtractMessage(raw) ?? $"HTTP {(int)response.StatusCode}");
        }

        return Deserialize<CoordinatorRegisterResponse>(raw);
    }

    /// <summary>
    /// Gửi heartbeat giữ peer ở trạng thái online. LƯU Ý: route
    /// `POST /v1/peers/heartbeat` KHÔNG tồn tại trong control-plane/src (đã đối chiếu
    /// index.js) — Windows theo tài liệu requirements không dùng heartbeat, giữ kết nối
    /// bằng reconnect + kiểm tra `/v1/devices` định kỳ. Giữ hàm để parity với Swift
    /// (`heartbeat` — ControlAPIClient.swift:402-412).
    /// </summary>
    public async Task HeartbeatAsync(
        string peerId,
        string credential,
        CancellationToken cancellationToken = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["peer_id"] = peerId,
            ["credential"] = credential,
        };
        await SendForStringAsync(
            baseUri => BuildJsonRequest(HttpMethod.Post, baseUri, "v1/peers/heartbeat", body, accessToken: null),
            "heartbeat",
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Claim bản cài này cho user đang đăng nhập. Chế độ Hysteria không có WireGuard peer
    /// nên hạn mức 3 thiết bị được áp ở đây. Tương ứng `claimDevice` —
    /// android .../api/ControlAPIClient.kt:273-287; route index.js:4142-4231.
    /// </summary>
    public async Task<ClaimDeviceResponse> ClaimDeviceAsync(
        string accessToken,
        string deviceKey,
        string name,
        string platform = "windows",
        string? replaceDeviceId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(accessToken)) throw new MissingSessionException();

        var body = new Dictionary<string, object?>
        {
            ["device_key"] = deviceKey,
            ["name"] = name,
            ["platform"] = platform,
        };
        if (!string.IsNullOrEmpty(replaceDeviceId)) body["replace_device_id"] = replaceDeviceId;

        using var response = await SendWithFallbackAsync(
            baseUri => BuildJsonRequest(HttpMethod.Post, baseUri, "v1/devices/claim", body, accessToken),
            "device claim",
            cancellationToken).ConfigureAwait(false);

        var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var limit = TryDeserialize<DeviceLimitBody>(raw);
            if (limit is { Error: "device_limit_reached" })
            {
                throw new DeviceLimitException(limit.Message, limit.Devices, limit.MaxDevices);
            }

            throw new ApiServerException(ExtractMessage(raw) ?? $"HTTP {(int)response.StatusCode}");
        }

        return Deserialize<ClaimDeviceResponse>(raw);
    }

    /// <summary>
    /// Liệt kê thiết bị của user đang đăng nhập (active trước), kèm status, IP overlay
    /// và public key (FR-REVOKE-001). Tương ứng `fetchMyDevices` — ControlAPIClient.swift:456-465.
    /// </summary>
    public async Task<List<CoordinatorDevice>> FetchMyDevicesAsync(
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(accessToken)) throw new MissingSessionException();

        var raw = await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Get, baseUri, "v1/devices", accessToken),
            "devices",
            cancellationToken).ConfigureAwait(false);

        return Deserialize<DevicesResponse>(raw).Devices;
    }

    /// <summary>
    /// Thu hồi một thiết bị của user (xoá wg peer để không kết nối được nữa — AC-011/AC-012).
    /// Tương ứng `revokeDevice` — ControlAPIClient.swift:469-477.
    /// </summary>
    public async Task RevokeDeviceAsync(
        string id,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(accessToken)) throw new MissingSessionException();

        await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Delete, baseUri, $"v1/devices/{id}", accessToken),
            "device revocation",
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Xoá tài khoản user đang đăng nhập (Apple 5.1.1(v)): user, devices, sessions.
    /// Tương ứng `deleteAccount` — ControlAPIClient.swift:443-452.</summary>
    public async Task DeleteAccountAsync(string accessToken, CancellationToken cancellationToken = default)
    {
        await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Delete, baseUri, "v1/account", accessToken),
            "account deletion",
            cancellationToken).ConfigureAwait(false);
    }

    // ---------------------------------------------------------------------
    // Exit nodes / phiên bản app
    // ---------------------------------------------------------------------

    /// <summary>
    /// Lấy danh sách exit node. Trả rỗng khi server trả non-2xx (để caller lùi về cache),
    /// nhưng NÉM lỗi transport khi không tới được host nào — giống `fetchNodes`
    /// (ControlAPIClient.swift:415-428).
    /// </summary>
    public async Task<List<ExitNode>> FetchNodesAsync(CancellationToken cancellationToken = default)
    {
        using var response = await SendWithFallbackAsync(
            baseUri => BuildRequest(HttpMethod.Get, baseUri, "v1/nodes", accessToken: null),
            "locations",
            cancellationToken).ConfigureAwait(false);

        if (!response.IsSuccessStatusCode) return new List<ExitNode>();

        var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return Deserialize<NodesResponse>(raw).Nodes;
    }

    /// <summary>
    /// Lấy phiên bản app yêu cầu/mới nhất (cổng ép cập nhật). `platform` tuỳ chọn để server
    /// trả đúng kênh (Windows cần backend bổ sung kênh — xem docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md §6).
    /// Tương ứng `fetchAppVersion` — ControlAPIClient.swift:431-440.
    /// </summary>
    public async Task<AppVersionInfo> FetchAppVersionAsync(
        string? platform = null,
        CancellationToken cancellationToken = default)
    {
        var path = "v1/app-version";
        if (!string.IsNullOrEmpty(platform)) path += $"?platform={Uri.EscapeDataString(platform)}";

        var raw = await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Get, baseUri, path, accessToken: null),
            "app version",
            cancellationToken).ConfigureAwait(false);

        return Deserialize<AppVersionInfo>(raw);
    }

    // ---------------------------------------------------------------------
    // Token / đăng nhập
    // ---------------------------------------------------------------------

    /// <summary>
    /// Xin một join token một lần từ coordinator (server có thể cần admin token).
    /// App runtime không dùng bootstrap public/dev này trong production; dùng
    /// `FetchEnrollmentTokenAsync` thay thế. Tương ứng `fetchJoinToken` —
    /// ControlAPIClient.swift:483-499.
    /// </summary>
    public async Task<string> FetchJoinTokenAsync(
        string? adminToken = null,
        CancellationToken cancellationToken = default)
    {
        var raw = await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Post, baseUri, "v1/tokens", adminToken),
            "token",
            cancellationToken).ConfigureAwait(false);

        return Deserialize<TokenResponse>(raw).Token;
    }

    /// <summary>
    /// Xin enrollment token một lần, gắn với user đang đăng nhập + subscription.
    /// Tương ứng `fetchEnrollmentToken` — ControlAPIClient.swift:503-522.
    /// </summary>
    public async Task<string> FetchEnrollmentTokenAsync(
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(accessToken)) throw new MissingSessionException();

        var raw = await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Post, baseUri, "v1/enrollment-tokens", accessToken),
            "enrollment token",
            cancellationToken).ConfigureAwait(false);

        return Deserialize<TokenResponse>(raw).Token;
    }

    /// <summary>
    /// Đăng nhập bằng mã email (fallback cho vùng chặn SSO). Trả `debug_code` nếu có.
    /// Tương ứng `startEmailLogin` — ControlAPIClient.swift:525-533.
    /// </summary>
    public async Task<string?> StartEmailLoginAsync(string email, CancellationToken cancellationToken = default)
    {
        var body = new Dictionary<string, object?> { ["email"] = email };

        var raw = await SendForStringAsync(
            baseUri => BuildJsonRequest(HttpMethod.Post, baseUri, "v1/auth/email/start", body, accessToken: null),
            "email login",
            cancellationToken).ConfigureAwait(false);

        return TryDeserialize<EmailLoginStartResponse>(raw)?.DebugCode;
    }

    /// <summary>Xác minh mã email và nhận session. Tương ứng `verifyEmailLogin` —
    /// ControlAPIClient.swift:535-542.</summary>
    public async Task<CoordinatorAuthSession> VerifyEmailLoginAsync(
        string email,
        string code,
        CancellationToken cancellationToken = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["email"] = email,
            ["code"] = code,
        };

        var raw = await SendForStringAsync(
            baseUri => BuildJsonRequest(HttpMethod.Post, baseUri, "v1/auth/email/verify", body, accessToken: null),
            "email verification",
            cancellationToken).ConfigureAwait(false);

        return Deserialize<CoordinatorAuthSession>(raw);
    }

    /// <summary>Đăng nhập bằng Sign in with Apple. Tương ứng `signInWithApple` —
    /// ControlAPIClient.swift:544-554.</summary>
    public async Task<CoordinatorAuthSession> SignInWithAppleAsync(
        string identityToken,
        string? authorizationCode,
        CancellationToken cancellationToken = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["identity_token"] = identityToken,
            ["authorization_code"] = authorizationCode,
        };

        var raw = await SendForStringAsync(
            baseUri => BuildJsonRequest(HttpMethod.Post, baseUri, "v1/auth/apple", body, accessToken: null),
            "apple login",
            cancellationToken).ConfigureAwait(false);

        return Deserialize<CoordinatorAuthSession>(raw);
    }

    /// <summary>
    /// Đọc lại session từ coordinator để thấy thay đổi quyền Premium mà không phải
    /// đăng xuất/đăng nhập lại. Coordinator cũ trả 404 ⇒ caller phải coi thất bại là
    /// "giữ nguyên quyền đang có", KHÔNG phải "chưa mua". Tương ứng `fetchSession` —
    /// ControlAPIClient.swift:564-572.
    /// </summary>
    public async Task<CoordinatorAuthSession> FetchSessionAsync(
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(accessToken)) throw new MissingSessionException();

        var raw = await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Get, baseUri, "v1/auth/session", accessToken),
            "session",
            cancellationToken).ConfigureAwait(false);

        return Deserialize<CoordinatorAuthSession>(raw);
    }

    // ---------------------------------------------------------------------
    // HTTP helpers
    // ---------------------------------------------------------------------

    /// <summary>
    /// Gửi request tới host của chính nó; sau lỗi transport (không có phản hồi: IP bị chặn,
    /// DNS hỏng, mất route) thử lại y nguyên request qua từng host dự phòng một lần.
    /// HTTP status là "có trả lời", không phải route bị chặn, nên KHÔNG thử lại — thử lại
    /// sẽ lặp side-effect của POST. Tương ứng `ControlAPIHosts.sendWithFallback` —
    /// ControlAPIClient.swift:282-302.
    /// </summary>
    private async Task<HttpResponseMessage> SendWithFallbackAsync(
        Func<Uri, HttpRequestMessage> requestFactory,
        string endpoint,
        CancellationToken cancellationToken)
    {
        Exception? lastError = null;

        try
        {
            return await _httpClient.SendAsync(requestFactory(new Uri(BaseUrl)), cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex) when (IsTransportFailure(ex, cancellationToken))
        {
            lastError = ex;
        }

        foreach (var fallback in ControlApiHosts.FallbackBaseUrls)
        {
            // Không bao giờ đánh cùng host hai lần: caller có thể đã trỏ vào host dự phòng.
            if (SameHost(fallback, BaseUrl)) continue;

            try
            {
                return await _httpClient.SendAsync(requestFactory(new Uri(fallback)), cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (Exception ex) when (IsTransportFailure(ex, cancellationToken))
            {
                lastError = ex;
            }
        }

        throw new ApiTransportException(endpoint, lastError);
    }

    /// <summary>Gửi request rồi trả body; non-2xx ⇒ <see cref="ApiServerException"/>.</summary>
    private async Task<string> SendForStringAsync(
        Func<Uri, HttpRequestMessage> requestFactory,
        string endpoint,
        CancellationToken cancellationToken)
    {
        using var response = await SendWithFallbackAsync(requestFactory, endpoint, cancellationToken)
            .ConfigureAwait(false);

        var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new ApiServerException(ExtractMessage(raw) ?? $"HTTP {(int)response.StatusCode}");
        }

        return raw;
    }

    private static HttpRequestMessage BuildRequest(
        HttpMethod method,
        Uri baseUri,
        string relativePath,
        string? accessToken)
    {
        var request = new HttpRequestMessage(method, new Uri(baseUri, relativePath));
        if (!string.IsNullOrEmpty(accessToken))
        {
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {accessToken}");
        }

        return request;
    }

    private static HttpRequestMessage BuildJsonRequest(
        HttpMethod method,
        Uri baseUri,
        string relativePath,
        object body,
        string? accessToken)
    {
        var request = BuildRequest(method, baseUri, relativePath, accessToken);
        request.Content = new StringContent(
            JsonSerializer.Serialize(body, JsonOptions),
            Encoding.UTF8,
            "application/json");
        return request;
    }

    private static bool IsTransportFailure(Exception exception, CancellationToken cancellationToken)
    {
        // Caller chủ động huỷ ⇒ để OperationCanceledException nổi lên, không bọc thành transport.
        if (cancellationToken.IsCancellationRequested) return false;
        return exception is HttpRequestException or OperationCanceledException
            or System.IO.IOException or System.Net.Sockets.SocketException;
    }

    private static bool SameHost(string first, string second)
    {
        return Uri.TryCreate(first, UriKind.Absolute, out var a)
               && Uri.TryCreate(second, UriKind.Absolute, out var b)
               && string.Equals(a.Host, b.Host, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ExtractMessage(string body)
    {
        var error = TryDeserialize<ErrorBody>(body);
        if (!string.IsNullOrWhiteSpace(error?.Message)) return error!.Message;
        return error?.Error;
    }

    private static T? TryDeserialize<T>(string body) where T : class
    {
        try
        {
            return JsonSerializer.Deserialize<T>(body, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static T Deserialize<T>(string body) where T : class
    {
        return TryDeserialize<T>(body) ?? throw new ApiBadResponseException();
    }
}
