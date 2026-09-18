using System.Net;
using System.Net.Sockets;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace VpnFlow.Core.Api;

/// <summary>
/// Háº±ng sá»‘ cá»§a táº§ng API, táº­p trung má»™t chá»— (khÃ´ng hiá»‡n ra UI cÃ´ng khai).
/// Nguá»“n: android .../Config.kt + docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md.
/// </summary>
public static class ControlApiDefaults
{
    /// <summary>Coordinator production.</summary>
    public const string BaseUrl = "https://api.meetflowai.site";

    /// <summary>Web gá»‘c (plan picker + QR payment) â€” host chÃ­nh.</summary>
    public const string WebUrl = "https://meetflowai.site";

    /// <summary>Trang mua gÃ³i (plan picker + QR) â€” giá»‘ng iOS/macOS. URL Ä‘á»™ng khi Ä‘Ã£ chá»n
    /// Ä‘Æ°á»£c host dá»± phÃ²ng: xem <see cref="ControlPlaneHosts.BuyUrl"/>.</summary>
    public const string BuyUrl = WebUrl + "/buy";

    public const string SupportUrl = "https://meetflowai.site/SupportPrivateVPN.html";
    public const string PrivacyUrl = "https://meetflowai.site/FlowVPNPrivacy.html";
    public const string TermsUrl = "https://meetflowai.site/vpnflow/terms";

    /// <summary>
    /// Web base tÆ°Æ¡ng á»©ng tá»«ng host API, Ä‘á»ƒ trang mua dá»±ng theo host Ä‘ang dÃ¹ng Ä‘Æ°á»£c.
    /// Host khÃ´ng cÃ³ trong map (vÃ­ dá»¥ tunnel dÃ¹ng chung) lÃ¹i vá» <see cref="WebUrl"/>.
    /// </summary>
    public static IReadOnlyDictionary<string, string> WebBaseByApiBase { get; } =
        new Dictionary<string, string>
        {
            [BaseUrl] = WebUrl,
            ["https://t1.meetflowai.site"] = "https://t1.meetflowai.site",
        };
}

/// <summary>
/// NÃ³i chuyá»‡n vá»›i PrivateVPN coordinator (mesh control plane) Ä‘á»ƒ Ä‘Äƒng kÃ½ thiáº¿t bá»‹ vÃ 
/// biáº¿t exit node cáº§n ná»‘i tá»›i. BÃ¡m sÃ¡t `ControlAPIClient` â€”
/// iOS/PrivateVPN/Services/ControlAPIClient.swift:307-629.
/// </summary>
public sealed class ControlApiClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _httpClient;
    private readonly ControlPlaneHosts _hosts;
    private readonly bool _ownsHttpClient;

    /// <summary>Host chÃ­nh cá»§a coordinator (khÃ´ng cÃ³ dáº¥u "/" cuá»‘i).</summary>
    public string BaseUrl => _hosts.PrimaryBaseUrl;

    /// <summary>URL trang mua dá»±ng theo host Ä‘ang dÃ¹ng Ä‘Æ°á»£c (Ä‘á»•i khi Ä‘Ã£ chuyá»ƒn host dá»± phÃ²ng).</summary>
    public string BuyUrl => _hosts.BuyUrl;

    /// <summary>Join token má»™t láº§n dÃ¹ng Ä‘á»ƒ Ä‘Äƒng kÃ½ thiáº¿t bá»‹.</summary>
    public string JoinToken { get; }

    /// <param name="baseUrl">Host chÃ­nh (truyá»n tá»« App; máº·c Ä‘á»‹nh <see cref="ControlApiDefaults.BaseUrl"/>).</param>
    /// <param name="joinToken">Join token legacy.</param>
    /// <param name="httpClient">HttpClient Ä‘á»ƒ test; null thÃ¬ tá»± táº¡o (vÃ  tá»± Dispose).</param>
    /// <param name="fallbackBaseUrls">Host dá»± phÃ²ng theo thá»© tá»±; null thÃ¬ dÃ¹ng
    /// <see cref="ControlApiHosts.FallbackBaseUrls"/>. Tham sá»‘ hoÃ¡ Ä‘á»ƒ test Ä‘Æ°á»£c quy táº¯c chuyá»ƒn host.</param>
    public ControlApiClient(
        string baseUrl,
        string joinToken = "",
        HttpClient? httpClient = null,
        IEnumerable<string>? fallbackBaseUrls = null)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
            throw new ArgumentException("baseUrl lÃ  báº¯t buá»™c.", nameof(baseUrl));

        _hosts = new ControlPlaneHosts(baseUrl, fallbackBaseUrls);
        JoinToken = joinToken;
        _ownsHttpClient = httpClient is null;
        // Má»—i láº§n thá»­ má»™t host tá»‘i Ä‘a 6s (khoáº£ng 4â€“6s): host bá»‹ cháº·n (nuá»‘t gÃ³i / SNI) pháº£i
        // tháº¥t báº¡i nhanh Ä‘á»ƒ cÃ²n ká»‹p rÆ¡i xuá»‘ng host dá»± phÃ²ng. HttpClient.Timeout Ã¡p cho tá»«ng
        // SendAsync nÃªn Ä‘Ãºng báº±ng má»™t láº§n thá»­ host.
        _httpClient = httpClient ?? CreateHttpClientWithDohFallback();
    }

    /// <summary>
    /// HttpClient cÃ³ fallback DNS qua DoH (1.1.1.1).
    ///
    /// VÃ¬ sao cáº§n: khi khÃ¡ch báº­t Clash Verge/v2rayN á»Ÿ cháº¿ Ä‘á»™ TUN + fake-IP, DNS há»‡ thá»‘ng tráº£ vá»
    /// IP giáº£ hoáº·c bá»‹ cháº·n â‡’ app KHÃ”NG gá»i Ä‘Æ°á»£c API (khÃ´ng Ä‘Äƒng nháº­p, khÃ´ng nháº­n OTP). Ta chá»§ Ä‘á»™ng
    /// phÃ¢n giáº£i tÃªn miá»n qua DoH rá»“i tá»± má»Ÿ socket tá»›i IP tháº­t; náº¿u DoH lá»—i thÃ¬ quay vá» DNS há»‡ thá»‘ng.
    /// </summary>
    private static HttpClient CreateHttpClientWithDohFallback()
    {
        var handler = new SocketsHttpHandler
        {
            ConnectTimeout = TimeSpan.FromSeconds(5),
            ConnectCallback = async (context, cancellationToken) =>
            {
                var host = context.DnsEndPoint.Host;
                var port = context.DnsEndPoint.Port;

                var addresses = await ResolveWithDohAsync(host, cancellationToken).ConfigureAwait(false);
                if (addresses.Count == 0)
                {
                    try
                    {
                        addresses = (await Dns.GetHostAddressesAsync(host, cancellationToken).ConfigureAwait(false))
                            .Where(a => a.AddressFamily == AddressFamily.InterNetwork)
                            .ToList();
                    }
                    catch (SocketException)
                    {
                        // rÆ¡i xuá»‘ng dÆ°á»›i: nÃ©m HttpRequestException vá»›i thÃ´ng bÃ¡o rÃµ rÃ ng
                    }
                }

                foreach (var ip in addresses)
                {
                    var socket = new Socket(ip.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                    try
                    {
                        await socket.ConnectAsync(new IPEndPoint(ip, port), cancellationToken).ConfigureAwait(false);
                        return new NetworkStream(socket, ownsSocket: true);
                    }
                    catch (Exception)
                    {
                        socket.Dispose();
                    }
                }

                throw new HttpRequestException($"KhÃ´ng káº¿t ná»‘i Ä‘Æ°á»£c tá»›i {host}:{port} (DNS/DoH Ä‘á»u khÃ´ng cÃ³ IP dÃ¹ng Ä‘Æ°á»£c).");
            },
        };

        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(6) };
    }

    private static readonly Lazy<HttpClient> DohClient = new(() =>
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        client.DefaultRequestHeaders.Accept.ParseAdd("application/dns-json");
        return client;
    });

    /// <summary>PhÃ¢n giáº£i A record qua DoH cá»§a Cloudflare; lá»—i thÃ¬ tráº£ danh sÃ¡ch rá»—ng.</summary>
    private static async Task<List<IPAddress>> ResolveWithDohAsync(string host, CancellationToken cancellationToken)
    {
        var result = new List<IPAddress>();
        if (IPAddress.TryParse(host, out _))
        {
            return result;
        }

        try
        {
            var url = $"https://1.1.1.1/dns-query?name={Uri.EscapeDataString(host)}&type=A";
            var json = await DohClient.Value.GetStringAsync(url, cancellationToken).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("Answer", out var answers))
            {
                return result;
            }

            foreach (var answer in answers.EnumerateArray())
            {
                if (answer.TryGetProperty("data", out var data)
                    && IPAddress.TryParse(data.GetString(), out var ip)
                    && ip.AddressFamily == AddressFamily.InterNetwork)
                {
                    result.Add(ip);
                }
            }
        }
        catch (Exception)
        {
            // DoH khÃ´ng dÃ¹ng Ä‘Æ°á»£c â‡’ Ä‘á»ƒ caller quay vá» DNS há»‡ thá»‘ng
        }

        return result;
    }

    /// <summary>Máº¡ng Ä‘á»•i -> thá»­ láº¡i host chÃ­nh á»Ÿ request sau.</summary>
    public void OnNetworkChanged() => _hosts.OnNetworkChanged();

    public void Dispose()
    {
        _hosts.Dispose();
        if (_ownsHttpClient) _httpClient.Dispose();
    }

    // ---------------------------------------------------------------------
    // Thiáº¿t bá»‹ (register / claim / revoke / devices)
    // ---------------------------------------------------------------------

    /// <summary>
    /// ÄÄƒng kÃ½ thiáº¿t bá»‹ vá»›i coordinator. `wireguardPublicKey` lÃ  khoÃ¡ cÃ´ng khai WireGuard;
    /// `endpoint` lÃ  endpoint WireGuard cá»§a chÃ­nh mÃ¡y (thiáº¿t bá»‹ outbound-only nÃªn placeholder
    /// lÃ  Ä‘Æ°á»£c). TÆ°Æ¡ng á»©ng `register` â€” ControlAPIClient.swift:350-399.
    /// NÃ©m <see cref="DeviceLimitException"/> khi server tráº£ 403 `device_limit_reached`.
    /// </summary>
    /// <param name="joinToken">Token vá»«a xin tá»« <see cref="FetchJoinTokenAsync"/> (legacy) hoáº·c
    /// <see cref="FetchEnrollmentTokenAsync"/> (Ä‘Ã£ Ä‘Äƒng nháº­p). Bá» trá»‘ng thÃ¬ dÃ¹ng token cá»§a
    /// constructor.</param>
    public async Task<CoordinatorRegisterResponse> RegisterAsync(
        string name,
        string platform,
        string wireguardPublicKey,
        string endpoint,
        string? accessToken = null,
        string? exitNodeId = null,
        string? replaceDeviceId = null,
        string? joinToken = null,
        CancellationToken cancellationToken = default)
    {
        var body = new Dictionary<string, object?>
        {
            ["name"] = name,
            ["platform"] = platform,
            ["wireguard_public_key"] = wireguardPublicKey,
            ["endpoint"] = endpoint,
            // Æ¯u tiÃªn token truyá»n vÃ o: token láº¥y tá»« /v1/tokens (legacy) hoáº·c
            // /v1/enrollment-tokens (Ä‘Ã£ Ä‘Äƒng nháº­p) Ä‘á»u Ä‘i qua field nÃ y. KhÃ´ng truyá»n thÃ¬
            // lÃ¹i vá» token cá»§a constructor (tÆ°Æ¡ng á»©ng ControlAPIClient(baseURL:joinToken:)).
            ["join_token"] = joinToken ?? JoinToken,
        };
        // Chá»‰ gá»­i khoÃ¡ khi cÃ³ giÃ¡ trá»‹ â€” giá»‘ng `compactMapValues { $0 }` (Swift:378).
        if (!string.IsNullOrEmpty(exitNodeId)) body["exit_node_id"] = exitNodeId;
        // NhÆ°á»ng slot: server chá»‰ cháº¥p nháº­n khi báº£n ghi Ä‘Ã³ cá»§a CHÃNH tÃ i khoáº£n nÃ y
        // vÃ  CÃ™NG platform (device-replace.js).
        if (!string.IsNullOrEmpty(replaceDeviceId)) body["replace_device_id"] = replaceDeviceId;

        using var response = await SendWithFallbackAsync(
            baseUri => BuildJsonRequest(HttpMethod.Post, baseUri, "v1/peers/register", body, accessToken),
            "registration",
            cancellationToken).ConfigureAwait(false);

        var raw = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            // Device limit: giá»¯ message cá»§a coordinator VÃ€ danh sÃ¡ch thiáº¿t bá»‹ Ä‘á»ƒ UI
            // hiá»‡n Ä‘Æ°á»£c "Ä‘Äƒng xuáº¥t thiáº¿t bá»‹ cÅ©".
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
    /// Gá»­i heartbeat giá»¯ peer á»Ÿ tráº¡ng thÃ¡i online. LÆ¯U Ã: route
    /// `POST /v1/peers/heartbeat` KHÃ”NG tá»“n táº¡i trong control-plane/src (Ä‘Ã£ Ä‘á»‘i chiáº¿u
    /// index.js) â€” Windows theo tÃ i liá»‡u requirements khÃ´ng dÃ¹ng heartbeat, giá»¯ káº¿t ná»‘i
    /// báº±ng reconnect + kiá»ƒm tra `/v1/devices` Ä‘á»‹nh ká»³. Giá»¯ hÃ m Ä‘á»ƒ parity vá»›i Swift
    /// (`heartbeat` â€” ControlAPIClient.swift:402-412).
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
    /// Claim báº£n cÃ i nÃ y cho user Ä‘ang Ä‘Äƒng nháº­p. Cháº¿ Ä‘á»™ Hysteria khÃ´ng cÃ³ WireGuard peer
    /// nÃªn háº¡n má»©c 3 thiáº¿t bá»‹ Ä‘Æ°á»£c Ã¡p á»Ÿ Ä‘Ã¢y. TÆ°Æ¡ng á»©ng `claimDevice` â€”
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
    /// Liá»‡t kÃª thiáº¿t bá»‹ cá»§a user Ä‘ang Ä‘Äƒng nháº­p (active trÆ°á»›c), kÃ¨m status, IP overlay
    /// vÃ  public key (FR-REVOKE-001). TÆ°Æ¡ng á»©ng `fetchMyDevices` â€” ControlAPIClient.swift:456-465.
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
    /// Thu há»“i má»™t thiáº¿t bá»‹ cá»§a user (xoÃ¡ wg peer Ä‘á»ƒ khÃ´ng káº¿t ná»‘i Ä‘Æ°á»£c ná»¯a â€” AC-011/AC-012).
    /// TÆ°Æ¡ng á»©ng `revokeDevice` â€” ControlAPIClient.swift:469-477.
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

    /// <summary>XoÃ¡ tÃ i khoáº£n user Ä‘ang Ä‘Äƒng nháº­p (Apple 5.1.1(v)): user, devices, sessions.
    /// TÆ°Æ¡ng á»©ng `deleteAccount` â€” ControlAPIClient.swift:443-452.</summary>
    public async Task DeleteAccountAsync(string accessToken, CancellationToken cancellationToken = default)
    {
        await SendForStringAsync(
            baseUri => BuildRequest(HttpMethod.Delete, baseUri, "v1/account", accessToken),
            "account deletion",
            cancellationToken).ConfigureAwait(false);
    }

    // ---------------------------------------------------------------------
    // Exit nodes / phiÃªn báº£n app
    // ---------------------------------------------------------------------

    /// <summary>
    /// Láº¥y danh sÃ¡ch exit node. Tráº£ rá»—ng khi server tráº£ non-2xx (Ä‘á»ƒ caller lÃ¹i vá» cache),
    /// nhÆ°ng NÃ‰M lá»—i transport khi khÃ´ng tá»›i Ä‘Æ°á»£c host nÃ o â€” giá»‘ng `fetchNodes`
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
    /// Láº¥y phiÃªn báº£n app yÃªu cáº§u/má»›i nháº¥t (cá»•ng Ã©p cáº­p nháº­t). `platform` tuá»³ chá»n Ä‘á»ƒ server
    /// tráº£ Ä‘Ãºng kÃªnh (Windows cáº§n backend bá»• sung kÃªnh â€” xem docs/spec/WINDOWS_CLIENT_REQUIREMENTS.md Â§6).
    /// TÆ°Æ¡ng á»©ng `fetchAppVersion` â€” ControlAPIClient.swift:431-440.
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
    // Token / Ä‘Äƒng nháº­p
    // ---------------------------------------------------------------------

    /// <summary>
    /// Xin má»™t join token má»™t láº§n tá»« coordinator (server cÃ³ thá»ƒ cáº§n admin token).
    /// App runtime khÃ´ng dÃ¹ng bootstrap public/dev nÃ y trong production; dÃ¹ng
    /// `FetchEnrollmentTokenAsync` thay tháº¿. TÆ°Æ¡ng á»©ng `fetchJoinToken` â€”
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
    /// Xin enrollment token má»™t láº§n, gáº¯n vá»›i user Ä‘ang Ä‘Äƒng nháº­p + subscription.
    /// TÆ°Æ¡ng á»©ng `fetchEnrollmentToken` â€” ControlAPIClient.swift:503-522.
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
    /// ÄÄƒng nháº­p báº±ng mÃ£ email (fallback cho vÃ¹ng cháº·n SSO). Tráº£ `debug_code` náº¿u cÃ³.
    /// TÆ°Æ¡ng á»©ng `startEmailLogin` â€” ControlAPIClient.swift:525-533.
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

    /// <summary>XÃ¡c minh mÃ£ email vÃ  nháº­n session. TÆ°Æ¡ng á»©ng `verifyEmailLogin` â€”
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

    /// <summary>ÄÄƒng nháº­p báº±ng Sign in with Apple. TÆ°Æ¡ng á»©ng `signInWithApple` â€”
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
    /// Äá»c láº¡i session tá»« coordinator Ä‘á»ƒ tháº¥y thay Ä‘á»•i quyá»n Premium mÃ  khÃ´ng pháº£i
    /// Ä‘Äƒng xuáº¥t/Ä‘Äƒng nháº­p láº¡i. Coordinator cÅ© tráº£ 404 â‡’ caller pháº£i coi tháº¥t báº¡i lÃ 
    /// "giá»¯ nguyÃªn quyá»n Ä‘ang cÃ³", KHÃ”NG pháº£i "chÆ°a mua". TÆ°Æ¡ng á»©ng `fetchSession` â€”
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
    /// Gá»­i request tá»›i host cá»§a chÃ­nh nÃ³; sau lá»—i transport (khÃ´ng cÃ³ pháº£n há»“i: IP bá»‹ cháº·n,
    /// DNS há»ng, máº¥t route) thá»­ láº¡i y nguyÃªn request qua tá»«ng host dá»± phÃ²ng má»™t láº§n.
    /// HTTP status lÃ  "cÃ³ tráº£ lá»i", khÃ´ng pháº£i route bá»‹ cháº·n, nÃªn KHÃ”NG thá»­ láº¡i â€” thá»­ láº¡i
    /// sáº½ láº·p side-effect cá»§a POST. TÆ°Æ¡ng á»©ng `ControlAPIHosts.sendWithFallback` â€”
    /// ControlAPIClient.swift:282-302.
    /// </summary>
    private async Task<HttpResponseMessage> SendWithFallbackAsync(
        Func<Uri, HttpRequestMessage> requestFactory,
        string endpoint,
        CancellationToken cancellationToken)
    {
        Exception? lastError = null;

        // Thá»© tá»± host: host Ä‘ang nhá»› (sticky) trÆ°á»›c, rá»“i host chÃ­nh, rá»“i cÃ¡c host dá»± phÃ²ng.
        foreach (var baseUrl in _hosts.Candidates())
        {
            try
            {
                var response = await _httpClient
                    .SendAsync(requestFactory(new Uri(baseUrl)), cancellationToken)
                    .ConfigureAwait(false);

                // HTTP status lÃ  "host cÃ³ tráº£ lá»i" (ká»ƒ cáº£ 401/403): nhá»› host vÃ  tráº£ response,
                // KHÃ”NG thá»­ host khÃ¡c â€” Ä‘á»•i host khÃ´ng sá»­a Ä‘Æ°á»£c lá»—i xÃ¡c thá»±c mÃ  cÃ²n láº·p
                // side-effect cá»§a POST.
                _hosts.Remember(baseUrl);
                return response;
            }
            catch (Exception ex) when (IsTransportFailure(ex, cancellationToken))
            {
                lastError = ex;
                // Host Ä‘ang nhá»› vá»«a há»ng: quÃªn ngay Ä‘á»ƒ láº§n sau cÃ²n dÃ² láº¡i tá»« host chÃ­nh.
                if (SameHost(baseUrl, _hosts.ActiveBaseUrl)) _hosts.Forget();
            }
        }

        throw new ApiTransportException(endpoint, lastError);
    }

    /// <summary>Gá»­i request rá»“i tráº£ body; non-2xx â‡’ <see cref="ApiServerException"/>.</summary>
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
        // Caller chá»§ Ä‘á»™ng huá»· â‡’ Ä‘á»ƒ OperationCanceledException ná»•i lÃªn, khÃ´ng bá»c thÃ nh transport.
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
