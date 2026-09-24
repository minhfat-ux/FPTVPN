using System.Net;
using System.Text;
using System.Text.Json;
using VpnFlow.Core.Api;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra tầng API: map JSON của coordinator, xử lý 403 device_limit_reached,
/// nhường slot và đường dự phòng host khi transport lỗi.
/// </summary>
public class ControlApiClientTests
{
    private const string NodesJson =
        """
        {"nodes":[{"id":"node-1","name":"vietnam-1","country":"VN","city":"Hanoi","endpoint":"103.173.155.50:443","public_key":"AAA=","ws_relay_url":null,"wg_relay_url":"wss://wg","hy_relay_url":"wss://hy"}]}
        """;

    [Fact]
    public void ExitNode_RelayFallbacks_PreferNewFields()
    {
        var node = JsonSerializer.Deserialize<ExitNode>(
            """{"id":"n","name":"n","country":"VN","city":"H","endpoint":"h:1","public_key":"A","ws_relay_url":"wss://old","wg_relay_url":"wss://wg","hy_relay_url":"wss://hy"}""")!;

        Assert.Equal("wss://wg", node.RelayUrl);
        Assert.Equal("wss://hy", node.HysteriaRelayUrl);
    }

    [Fact]
    public void ExitNode_RelayFallbacks_FallBackToLegacyField()
    {
        var node = JsonSerializer.Deserialize<ExitNode>(
            """{"id":"n","name":"n","country":"VN","city":"H","endpoint":"h:1","public_key":"A","ws_relay_url":"wss://old"}""")!;

        Assert.Equal("wss://old", node.RelayUrl);
        Assert.Equal("wss://old", node.HysteriaRelayUrl);
    }

    [Fact]
    public void DeviceRegistration_PreviousInstallCandidate_OnlyWhenExactlyOne()
    {
        var single = new[]
        {
            new CoordinatorDevice { DeviceId = "d1", Platform = "windows", Status = "active", PublicKey = "OLD" },
        };
        Assert.Equal("d1", DeviceRegistration.PreviousInstallCandidate(single, "windows", "NEW")?.DeviceId);

        // Khoá trùng chính thiết bị đang đăng ký ⇒ không phải bản ghi cũ.
        Assert.Null(DeviceRegistration.PreviousInstallCandidate(single, "windows", "OLD"));

        // Khác platform (không được "cướp" slot của thiết bị khác loại).
        Assert.Null(DeviceRegistration.PreviousInstallCandidate(single, "android", "NEW"));

        // Nhiều ứng viên ⇒ không đoán.
        var many = new[]
        {
            single[0],
            new CoordinatorDevice { DeviceId = "d2", Platform = "windows", Status = "active", PublicKey = "OLD2" },
        };
        Assert.Null(DeviceRegistration.PreviousInstallCandidate(many, "windows", "NEW"));
    }

    [Fact]
    public async Task Register_DeviceLimit_ThrowsWithDevicesAndMax()
    {
        const string body =
            """
            {"error":"device_limit_reached","message":"max","devices":[{"device_id":"d1","platform":"windows","status":"active","public_key":"PK"}],"max_devices":3}
            """;
        var client = Client(_ => Json(HttpStatusCode.Forbidden, body));

        var ex = await Assert.ThrowsAsync<DeviceLimitException>(() => client.RegisterAsync(
            "windows-x", "windows", "PUB", "0.0.0.0:51820", accessToken: "t", exitNodeId: "node-1"));

        Assert.Equal(3, ex.MaxDevices);
        Assert.Single(ex.Devices);
        Assert.Equal("d1", ex.Devices[0].DeviceId);
    }

    [Fact]
    public async Task Register_Success_ParsesOverlayAndReplaced()
    {
        const string body =
            """
            {"peer_id":"p1","overlay_ip":"10.77.0.9","network":"10.77.0.0/24","peer_credential":"c","peers":[],"replaced":{"device_id":"old","name":"windows-old"}}
            """;
        var client = Client(_ => Json(HttpStatusCode.Created, body));

        var result = await client.RegisterAsync(
            "windows-x", "windows", "PUB", "0.0.0.0:51820", accessToken: "t", replaceDeviceId: "old");

        Assert.Equal("10.77.0.9", result.OverlayIp);
        Assert.Equal("old", result.Replaced?.DeviceId);
    }

    [Fact]
    public async Task FetchNodes_RetriesFallbackHost_OnTransportFailure()
    {
        var client = Client(request =>
        {
            if (request.RequestUri!.Host == "api.meetflowai.site")
                throw new HttpRequestException("blocked");
            return Json(HttpStatusCode.OK, NodesJson);
        });

        var nodes = await client.FetchNodesAsync();

        Assert.Single(nodes);
        Assert.Equal("node-1", nodes[0].Id);
    }

    [Fact]
    public async Task FetchNodes_AllHostsFail_ThrowsTransport()
    {
        var client = Client(_ => throw new HttpRequestException("blocked"));

        await Assert.ThrowsAsync<ApiTransportException>(() => client.FetchNodesAsync());
    }

    /// <summary>
    /// Vòng thử lại: thử mỗi host ĐÚNG MỘT LẦN là chưa đủ — mạng Trung Quốc tới Cloudflare chập
    /// chờn (đo 23/09/2026: 5 lần gọi liên tiếp có 1 lần timeout ~21s, 4 lần còn lại HTTP 200 trong
    /// ~1,4s). Handler dưới đây hỏng 4 lần đầu (2 host x 2 vòng) rồi mới trả lời, nên test CHỈ pass
    /// khi có vòng thử lại thứ 3 — đúng ca khách báo "Không thể kết nối tới máy chủ VPNFlow khi gọi
    /// device claim".
    /// </summary>
    [Fact]
    public async Task FetchNodes_RetriesAgain_WhenEveryHostFailsOnce()
    {
        var attempts = 0;
        var client = Client(
            _ =>
            {
                attempts++;
                if (attempts <= 4) throw new HttpRequestException("blocked");
                return Json(HttpStatusCode.OK, NodesJson);
            },
            "https://t1.meetflowai.site");   // 2 host ⇒ 4 lần thử đầu là hết vòng 1 và vòng 2

        var nodes = await client.FetchNodesAsync();

        Assert.Single(nodes);
        Assert.Equal(5, attempts);
    }

    /// <summary>
    /// 401/403 là server ĐÃ TRẢ LỜI (lỗi xác thực), không phải route bị chặn: không được
    /// chuyển host (đổi host vô ích, còn lặp side-effect của POST).
    /// </summary>
    [Fact]
    public async Task FetchAppVersion_DoesNotFallBack_OnForbidden()
    {
        var fallbackHits = 0;
        var client = Client(request =>
        {
            if (request.RequestUri!.Host == "api.meetflowai.site")
                return Json(HttpStatusCode.Forbidden, """{"error":"forbidden"}""");
            fallbackHits++;
            return Json(HttpStatusCode.OK, """{"platform":"windows","minimum_version":"1.0.0","latest_version":"1.1.0"}""");
        }, "https://t1.meetflowai.site");

        await Assert.ThrowsAsync<ApiServerException>(() => client.FetchAppVersionAsync("windows"));

        Assert.Equal(0, fallbackHits);
    }

    /// <summary>Sticky: host dự phòng chạy được thì các request sau đi thẳng, không chờ host chính.</summary>
    [Fact]
    public async Task FetchNodes_StaysOnFallback_ForLaterRequests()
    {
        var primaryHits = 0;
        var fallbackHits = 0;
        var client = Client(request =>
        {
            if (request.RequestUri!.Host == "api.meetflowai.site")
            {
                primaryHits++;
                throw new HttpRequestException("blocked");
            }

            fallbackHits++;
            return Json(HttpStatusCode.OK, NodesJson);
        }, "https://t1.meetflowai.site");

        await client.FetchNodesAsync();
        await client.FetchNodesAsync();

        Assert.Equal(1, primaryHits);
        Assert.Equal(2, fallbackHits);
    }

    /// <summary>Mạng đổi -> quên host đang nhớ để request sau thử lại host chính.</summary>
    [Fact]
    public async Task FetchNodes_TriesPrimaryAgain_AfterNetworkChanged()
    {
        var primaryHits = 0;
        var client = Client(request =>
        {
            if (request.RequestUri!.Host == "api.meetflowai.site")
            {
                primaryHits++;
                throw new HttpRequestException("blocked");
            }

            return Json(HttpStatusCode.OK, NodesJson);
        }, "https://t1.meetflowai.site");

        await client.FetchNodesAsync();
        Assert.Equal(1, primaryHits);

        client.OnNetworkChanged();

        await client.FetchNodesAsync();
        Assert.Equal(2, primaryHits);
    }

    /// <summary>Thứ tự host: chính -> t1 (chống SNI) -> Tailscale (chống chặn IP); URL mua bám host.</summary>
    [Fact]
    public void HostOrder_IsPrimaryThenT1ThenPinned_AndBuyUrlFollowsActiveHost()
    {
        using var hosts = new ControlPlaneHosts(ControlApiDefaults.BaseUrl);

        Assert.Equal(ControlApiDefaults.BaseUrl, hosts.OrderedBaseUrls[0]);
        Assert.Equal("https://t1.meetflowai.site", hosts.OrderedBaseUrls[1]);
        Assert.Contains("https://fcnvpn.tail303be3.ts.net", hosts.OrderedBaseUrls);
        Assert.Equal("https://meetflowai.site/buy", hosts.BuyUrl);

        hosts.Remember("https://t1.meetflowai.site");
        Assert.Equal("https://t1.meetflowai.site", hosts.Candidates()[0]);
        Assert.Equal("https://t1.meetflowai.site/buy", hosts.BuyUrl);

        hosts.OnNetworkChanged();
        Assert.Equal(ControlApiDefaults.BaseUrl, hosts.Candidates()[0]);
    }

    [Fact]
    public async Task FetchEnrollmentToken_EmptySession_ThrowsMissingSession()
    {
        var client = Client(_ => Json(HttpStatusCode.OK, "{}"));

        await Assert.ThrowsAsync<MissingSessionException>(() => client.FetchEnrollmentTokenAsync(""));
    }

    [Fact]
    public async Task FetchSession_ParsesSubscriptionTrialFields()
    {
        const string body =
            """
            {"access_token":"tok","token_type":"Bearer","expires_at":"2026-12-31T00:00:00.000Z","user":{"id":"u1","email":"a@b.c","subscription_status":{"is_active":true,"product_id":"trial.1day","is_trial":true,"trial_hours_left":5,"plan_badge":"Trial"}}}
            """;
        var client = Client(_ => Json(HttpStatusCode.OK, body));

        var session = await client.FetchSessionAsync("tok");

        Assert.True(session.User.SubscriptionStatus!.IsTrial);
        Assert.Equal(5, session.User.SubscriptionStatus.TrialHoursLeft);
        Assert.Equal("Trial", session.User.SubscriptionStatus.PlanBadge);
    }

    [Fact]
    public async Task FetchAppVersion_UsesStoreUrlWhenIpaMissing()
    {
        const string body =
            """
            {"platform":"windows","minimum_version":"1.0.0","latest_version":"1.1.0","store_url":"https://dl/setup.exe"}
            """;
        var client = Client(_ => Json(HttpStatusCode.OK, body));

        var info = await client.FetchAppVersionAsync("windows");

        Assert.Equal("https://dl/setup.exe", info.DownloadUrl);
    }

    private static ControlApiClient Client(
        Func<HttpRequestMessage, HttpResponseMessage> responder,
        params string[] fallbackBaseUrls)
        => new(
            "https://api.meetflowai.site",
            "",
            new HttpClient(new StubHandler(responder)),
            fallbackBaseUrls.Length == 0 ? null : fallbackBaseUrls);

    private static HttpResponseMessage Json(HttpStatusCode status, string body)
        => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
            => Task.FromResult(_responder(request));
    }
}
