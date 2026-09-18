using VpnFlow.Core.Tunnel;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra phần THUẦN của cơ chế phát hiện "tunnel lên nhưng không truyền được dữ liệu" —
/// đúng sự cố 19:05 (WireGuard liên tục "Handshake did not complete" nhưng app vẫn báo
/// "Đã kết nối" trong khi route full-tunnel đã trỏ vào tunnel chết):
///  - parse số liệu runtime thật (UAPI get=1 của wireguard-go, wg.exe dump của WireGuard for Windows);
///  - quyết định khoẻ/không của health gate và của watchdog;
///  - thứ tự candidate + failover chỉ nhận đường đã có bằng chứng truyền dữ liệu.
///
/// Không phần nào ở đây cần mạng thật, driver thật, hay máy Windows.
/// </summary>
public class TunnelHealthTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-03-01T12:00:00Z");

    // MARK: - UAPI get=1

    [Fact]
    public void UapiGetResponse_ParsesHandshakeAndRxBytes()
    {
        const string response =
            "private_key=0000000000000000000000000000000000000000000000000000000000000000\n" +
            "public_key=1111111111111111111111111111111111111111111111111111111111111111\n" +
            "endpoint=203.0.113.7:443\n" +
            "allowed_ip=0.0.0.0/0\n" +
            "last_handshake_time_sec=1772366395\n" +
            "last_handshake_time_nsec=500000000\n" +
            "rx_bytes=2048\n" +
            "tx_bytes=1024\n" +
            "persistent_keepalive_interval=25\n" +
            "errno=0\n" +
            "\n";

        var stats = WireGuardUapi.ParseUapiGetResponse(response);

        Assert.True(stats.Available);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1772366395).AddTicks(5_000_000), stats.LastHandshake);
        Assert.Equal(2048, stats.RxBytes);
    }

    [Fact]
    public void UapiGetResponse_TakesNewestHandshakeAndSumsRxAcrossPeers()
    {
        const string response =
            "public_key=aa\n" +
            "last_handshake_time_sec=1772366000\n" +
            "last_handshake_time_nsec=0\n" +
            "rx_bytes=100\n" +
            "public_key=bb\n" +
            "last_handshake_time_sec=1772366500\n" +
            "last_handshake_time_nsec=0\n" +
            "rx_bytes=250\n" +
            "errno=0\n" +
            "\n";

        var stats = WireGuardUapi.ParseUapiGetResponse(response);

        Assert.True(stats.Available);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1772366500), stats.LastHandshake);
        Assert.Equal(350, stats.RxBytes);
    }

    [Fact]
    public void UapiGetResponse_ZeroHandshakeMeansNoHandshakeButStillReadable()
    {
        const string response =
            "public_key=aa\n" +
            "last_handshake_time_sec=0\n" +
            "last_handshake_time_nsec=0\n" +
            "rx_bytes=0\n" +
            "errno=0\n" +
            "\n";

        var stats = WireGuardUapi.ParseUapiGetResponse(response);

        // Đọc được (Available) nhưng CHƯA từng handshake: khác hẳn "không đọc được".
        Assert.True(stats.Available);
        Assert.Null(stats.LastHandshake);
        Assert.Equal(0, stats.RxBytes);
    }

    [Fact]
    public void UapiGetResponse_HandshakeWithoutNsecLine_IsStillRead()
    {
        const string response =
            "public_key=aa\n" +
            "last_handshake_time_sec=1772366500\n" +
            "rx_bytes=10\n" +
            "errno=0\n" +
            "\n";

        var stats = WireGuardUapi.ParseUapiGetResponse(response);

        Assert.True(stats.Available);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1772366500), stats.LastHandshake);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   \n")]
    [InlineData("garbage without separator\n\n")]
    [InlineData("set=1\n")]
    public void UapiGetResponse_UnreadableResponseIsUnknown_NotDead(string response)
    {
        var stats = WireGuardUapi.ParseUapiGetResponse(response);

        // Một lần đọc hỏng KHÔNG được biến thành "tunnel chết".
        Assert.False(stats.Available);
    }

    [Fact]
    public void UapiGetResponse_OutOfRangeTimestampIsIgnored()
    {
        const string response =
            "public_key=aa\n" +
            "last_handshake_time_sec=99999999999999\n" +
            "rx_bytes=0\n" +
            "errno=0\n" +
            "\n";

        var stats = WireGuardUapi.ParseUapiGetResponse(response);

        Assert.True(stats.Available);
        Assert.Null(stats.LastHandshake);
    }

    // MARK: - wg.exe show <ifname> dump

    [Fact]
    public void WgDump_ParsesPeerRowAndSkipsInterfaceRow()
    {
        const string dump =
            "privkey\tpubkey\t51820\toff\n" +
            "peerkey\t(none)\t203.0.113.7:443\t0.0.0.0/0\t1772366500\t4096\t2048\t25\n";

        var stats = WireGuardUapi.ParseWgShowDump(dump);

        Assert.True(stats.Available);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1772366500), stats.LastHandshake);
        Assert.Equal(4096, stats.RxBytes);
    }

    [Fact]
    public void WgDump_NoPeerRowsIsUnknown()
    {
        // Interface không có peer nào (dòng chỉ 4 cột): thà "không biết" còn hơn gỡ nhầm tunnel.
        var stats = WireGuardUapi.ParseWgShowDump("privkey\tpubkey\t51820\toff\n");

        Assert.False(stats.Available);
    }

    [Fact]
    public void WgDump_ZeroHandshakeMeansNoHandshake()
    {
        const string dump =
            "peerkey\t(none)\t203.0.113.7:443\t0.0.0.0/0\t0\t0\t0\t25\n";

        var stats = WireGuardUapi.ParseWgShowDump(dump);

        Assert.True(stats.Available);
        Assert.Null(stats.LastHandshake);
        Assert.Equal(0, stats.RxBytes);
    }

    // MARK: - Health gate

    [Fact]
    public void Gate_FreshHandshakeIsHealthy_EvenWithNoBytesReceivedYet()
    {
        var stats = WireGuardRuntimeStats.Known(Now.AddSeconds(-5), rxBytes: 0);

        Assert.Equal(TunnelHealthVerdict.Healthy, TunnelHealth.EvaluateGate(stats, Now));
    }

    [Fact]
    public void Gate_StaleHandshakeWithReceivedBytesIsHealthy()
    {
        // Đã nhận được byte từ node là bằng chứng mạnh hơn cả handshake (handshake có thể cũ khi
        // tunnel chỉ nhận dữ liệu), nên không được gỡ.
        var stats = WireGuardRuntimeStats.Known(Now.AddSeconds(-300), rxBytes: 64);

        Assert.Equal(TunnelHealthVerdict.Healthy, TunnelHealth.EvaluateGate(stats, Now));
    }

    [Fact]
    public void Gate_NoHandshakeAndNoBytesIsStale()
    {
        Assert.Equal(
            TunnelHealthVerdict.Stale,
            TunnelHealth.EvaluateGate(WireGuardRuntimeStats.Known(null, 0), Now));

        // Đúng ca sự cố: handshake cũ 40s mà không nhận được byte nào.
        Assert.Equal(
            TunnelHealthVerdict.Stale,
            TunnelHealth.EvaluateGate(WireGuardRuntimeStats.Known(Now.AddSeconds(-40), 0), Now));
    }

    [Fact]
    public void Gate_UnreadableRuntimeIsUnknown()
    {
        Assert.Equal(TunnelHealthVerdict.Unknown, TunnelHealth.EvaluateGate(WireGuardRuntimeStats.Unknown, Now));
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(30, true)]
    [InlineData(31, false)]
    public void Gate_FreshnessThresholdIsThirtySeconds(int ageSeconds, bool expectedFresh)
    {
        var stats = WireGuardRuntimeStats.Known(Now.AddSeconds(-ageSeconds), rxBytes: 0);

        Assert.Equal(expectedFresh, TunnelHealth.IsHandshakeFresh(stats, Now));
    }

    [Fact]
    public void Gate_InitialBlindWindowIsAtMost25Seconds()
    {
        // Yêu cầu cứng: thời gian "mù" lúc kết nối không được quá ~20-25s.
        Assert.InRange(TunnelHealth.InitialGateSeconds, 1, 25);
        Assert.True(TunnelHealth.WatchdogIntervalSeconds < TunnelHealth.WatchdogNoEvidenceSeconds);
    }

    // MARK: - Watchdog

    [Fact]
    public void Watchdog_RxBytesGrowthKeepsTunnelHealthy_EvenWithOldHandshake()
    {
        // Tunnel khoẻ nhưng idle: handshake cũ, nhưng keepalive 25s làm rx_bytes tăng đều.
        var watchdog = new TunnelHealthWatchdog(Now, baselineRxBytes: 0);

        Assert.Equal(
            TunnelHealthVerdict.Healthy,
            watchdog.Observe(WireGuardRuntimeStats.Known(Now.AddSeconds(-100), 32), Now.AddSeconds(15)));
        Assert.Equal(
            TunnelHealthVerdict.Healthy,
            watchdog.Observe(WireGuardRuntimeStats.Known(Now.AddSeconds(-100), 64), Now.AddSeconds(30)));
        Assert.Equal(
            TunnelHealthVerdict.Healthy,
            watchdog.Observe(WireGuardRuntimeStats.Known(Now.AddSeconds(-100), 96), Now.AddSeconds(300)));
    }

    [Fact]
    public void Watchdog_NoEvidenceBeyondThresholdIsStale()
    {
        var watchdog = new TunnelHealthWatchdog(Now, baselineRxBytes: 512);
        var window = TunnelHealth.WatchdogNoEvidenceSeconds;

        // Handshake đã cũ ở mọi mốc, rx_bytes đứng yên: chỉ còn đồng hồ "mù" quyết định.
        var stale = WireGuardRuntimeStats.Known(Now.AddSeconds(-100), 512);

        // Trong ngưỡng ⇒ vẫn Healthy và mốc bằng chứng chưa đổi.
        Assert.Equal(TunnelHealthVerdict.Healthy, watchdog.Observe(stale, Now.AddSeconds(window / 2)));
        Assert.Equal(Now, watchdog.LastEvidenceAt);

        // Vượt ngưỡng ⇒ Stale (đây là thứ cắt thời gian mất mạng của khách).
        Assert.Equal(TunnelHealthVerdict.Stale, watchdog.Observe(stale, Now.AddSeconds(window + 5)));
    }

    [Fact]
    public void Watchdog_FreshHandshakeRefreshesEvidenceWindow()
    {
        var watchdog = new TunnelHealthWatchdog(Now, baselineRxBytes: 0);
        var window = TunnelHealth.WatchdogNoEvidenceSeconds;
        var freshHandshake = WireGuardRuntimeStats.Known(Now.AddSeconds(window - 5), 0);

        // Gần hết ngưỡng mà có handshake mới ⇒ bằng chứng được đặt lại, vẫn Healthy.
        Assert.Equal(TunnelHealthVerdict.Healthy, watchdog.Observe(freshHandshake, Now.AddSeconds(window)));
        Assert.Equal(TunnelHealthVerdict.Healthy, watchdog.Observe(freshHandshake, Now.AddSeconds(window + 5)));

        // Bỏ mặc đủ lâu (3 lần ngưỡng, không bằng chứng mới) ⇒ Stale.
        Assert.Equal(TunnelHealthVerdict.Stale, watchdog.Observe(freshHandshake, Now.AddSeconds(window * 3)));
    }

    [Fact]
    public void Watchdog_UnreadableRuntimeIsUnknownAndKeepsEvidenceClock()
    {
        var watchdog = new TunnelHealthWatchdog(Now, baselineRxBytes: 0);

        Assert.Equal(TunnelHealthVerdict.Unknown, watchdog.Observe(WireGuardRuntimeStats.Unknown, Now.AddSeconds(600)));
        Assert.Equal(Now, watchdog.LastEvidenceAt);
    }

    // MARK: - Thứ tự candidate

    [Fact]
    public void Planner_OrdersDirectThenWgRelayThenWsRelay()
    {
        var candidates = WindowsTransportPlanner.Build(
            wgRelayUrl: "wss://relay.example:10000",
            wsRelayUrl: "wss://relay.example/vn2",
            includeDirectUdp: true,
            includeRelays: true,
            log: NullTunnelLogger.Instance);

        Assert.Equal(new[] { "udp-direct", "wg-relay", "ws" }, candidates.Select(c => c.Id));
        Assert.Equal(TransportKind.DirectUdp, candidates[0].Kind);
        // Cả hai relay của shop đều là WebSocket (Tailscale Funnel -> wsrelay.js), kể cả field
        // mang tên wg_relay_url — client phải chọn theo SCHEME, xem BuildRelay.
        Assert.Equal(TransportKind.WsRelay, candidates[1].Kind);
        Assert.Equal(TransportKind.WsRelay, candidates[2].Kind);
        Assert.Null(candidates[0].Factory);
    }

    [Fact]
    public void Planner_ServerTodayOnlyCaresWgRelayUrl_SoNoWsCandidateIsInvented()
    {
        // /v1/nodes hiện trả wg_relay_url và ws_relay_url = null: chỉ được có udp-direct + wg-relay.
        var candidates = WindowsTransportPlanner.Build(
            wgRelayUrl: "wss://relay.example:10000",
            wsRelayUrl: null,
            includeDirectUdp: true,
            includeRelays: true,
            log: NullTunnelLogger.Instance);

        Assert.Equal(new[] { "udp-direct", "wg-relay" }, candidates.Select(c => c.Id));
    }

    [Fact]
    public void Planner_WgRelayUrlIsWebSocketToday_SoItMustBuildWsRelayClient()
    {
        // Đúng hình dạng production: wss://fcnvpn.tail303be3.ts.net/vn2 (443, có path /vn2).
        var candidate = WindowsTransportPlanner.BuildWgRelay(
            "wss://fcnvpn.tail303be3.ts.net/vn2",
            NullTunnelLogger.Instance);

        Assert.NotNull(candidate);
        Assert.Equal(TransportKind.WsRelay, candidate!.Kind);
        var transport = candidate.Factory!();
        Assert.IsType<WsRelayClient>(transport);
        // Id giữ theo field để log/UI còn phân biệt nguồn URL.
        Assert.Equal("wg-relay", transport.TransportId);
        (transport as IDisposable)?.Dispose();
    }

    [Fact]
    public void Planner_RawTcpRelayUrlStillUsesTcpClient()
    {
        // Relay cũ (không phải WebSocket) vẫn phải chạy được: tcp://host:9444 -> WgRelayClient.
        var candidate = WindowsTransportPlanner.BuildWgRelay("tcp://relay.example:9444", NullTunnelLogger.Instance);

        Assert.NotNull(candidate);
        Assert.Equal(TransportKind.TcpRelay, candidate!.Kind);
        var transport = candidate.Factory!();
        Assert.IsType<WgRelayClient>(transport);
        Assert.Equal("wg-relay", transport.TransportId);
        (transport as IDisposable)?.Dispose();
    }

    [Fact]
    public void Planner_DuplicateRelayUrlIsNotTriedTwice()
    {
        // ws_relay_url cũ có thể trỏ đúng URL của wg_relay_url: chỉ thử một lần.
        var candidates = WindowsTransportPlanner.Build(
            wgRelayUrl: "wss://relay.example/vn2",
            wsRelayUrl: "wss://relay.example/vn2",
            includeDirectUdp: false,
            includeRelays: true,
            log: NullTunnelLogger.Instance);

        Assert.Single(candidates);
        Assert.Equal("wg-relay", candidates[0].Id);
    }

    [Fact]
    public void Planner_WsRelayCandidateUsesWsRelayClient()
    {
        var candidate = WindowsTransportPlanner.BuildWsRelay("wss://relay.example/vn2", NullTunnelLogger.Instance);

        Assert.NotNull(candidate);
        var transport = candidate!.Factory!();
        Assert.IsType<WsRelayClient>(transport);
        Assert.Equal("ws", transport.TransportId);
        (transport as IDisposable)?.Dispose();
    }

    [Fact]
    public void Planner_MissingUrlsProduceNoRelayCandidate()
    {
        Assert.Null(WindowsTransportPlanner.BuildWgRelay(null, NullTunnelLogger.Instance));
        Assert.Null(WindowsTransportPlanner.BuildWgRelay("   ", NullTunnelLogger.Instance));
        Assert.Null(WindowsTransportPlanner.BuildWgRelay("not a url", NullTunnelLogger.Instance));
        Assert.Null(WindowsTransportPlanner.BuildWsRelay(null, NullTunnelLogger.Instance));
    }

    [Fact]
    public void Planner_ForcedDirectHasNoRelayAndForcedRelayHasNoDirect()
    {
        var directOnly = WindowsTransportPlanner.Build(
            "wss://relay.example:10000",
            "wss://relay.example/vn2",
            includeDirectUdp: true,
            includeRelays: false,
            log: NullTunnelLogger.Instance);
        Assert.Equal(new[] { "udp-direct" }, directOnly.Select(c => c.Id));

        var relayOnly = WindowsTransportPlanner.Build(
            wgRelayUrl: null,
            wsRelayUrl: "wss://relay.example/vn2",
            includeDirectUdp: false,
            includeRelays: true,
            log: NullTunnelLogger.Instance);
        Assert.Equal(new[] { "ws" }, relayOnly.Select(c => c.Id));
    }

    // MARK: - Failover chỉ nhận đường đã truyền được dữ liệu

    [Fact]
    public async Task ConnectHealthy_FallsBackToNextTransport_WhenFirstCarriesNoData()
    {
        var log = new CapturingLogger();
        var first = new FakeTransport("tcp-relay-1");
        var second = new FakeTransport("tcp-relay-2");
        var tried = new List<string>();

        var selector = new TransportSelector(
            new[]
            {
                RelayCandidate("udp-direct", () => first),
                RelayCandidate("wg-relay", () => second),
            },
            log);

        var selection = await selector.ConnectHealthyAsync((candidate, _) =>
        {
            tried.Add(candidate.Candidate.Id);
            return Task.FromResult(candidate.Candidate.Id == "wg-relay");
        });

        Assert.NotNull(selection);
        Assert.Equal("wg-relay", selection!.Candidate.Id);
        Assert.Same(second, selection.Transport);
        Assert.Equal(new[] { "udp-direct", "wg-relay" }, tried);

        // Đường không truyền được dữ liệu phải bị đóng trước khi thử đường kế.
        Assert.True(first.Disposed);
        Assert.False(second.Disposed);

        Assert.Contains(
            log.Lines,
            line => line.Contains("connect: udp-direct không truyền được dữ liệu sau 20s")
                    && line.Contains("thử transport kế tiếp (wg-relay)"));
    }

    [Fact]
    public async Task ConnectHealthy_ForcedPreferenceDoesNotJumpToAnotherTransport()
    {
        var log = new CapturingLogger();
        var first = new FakeTransport("forced");
        var second = new FakeTransport("other");
        var tried = new List<string>();

        var selector = new TransportSelector(
            new[]
            {
                RelayCandidate("udp-direct", () => first),
                RelayCandidate("wg-relay", () => second),
            },
            log);

        var selection = await selector.ConnectHealthyAsync(
            (candidate, _) =>
            {
                tried.Add(candidate.Candidate.Id);
                return Task.FromResult(false);
            },
            allowFailover: false);

        Assert.Null(selection);
        Assert.Equal(new[] { "udp-direct" }, tried);
        Assert.True(first.Disposed);
        Assert.False(second.Disposed);
    }

    [Fact]
    public async Task ConnectHealthy_ReturnsNullWhenNoTransportCarriesData()
    {
        var log = new CapturingLogger();
        var transport = new FakeTransport("only");

        var selector = new TransportSelector(new[] { RelayCandidate("wg-relay", () => transport) }, log);

        var selection = await selector.ConnectHealthyAsync((_, _) => Task.FromResult(false));

        Assert.Null(selection);
        Assert.True(transport.Disposed);
        Assert.Contains(log.Lines, line => line.Contains("hết danh sách"));
    }

    [Fact]
    public async Task ConnectHealthy_DirectCandidateHasNoTransportButStillNeedsHealth()
    {
        var log = new CapturingLogger();
        var relay = new FakeTransport("relay");

        var selector = new TransportSelector(
            new[]
            {
                new TransportCandidate { Id = "udp-direct", Kind = TransportKind.DirectUdp },
                RelayCandidate("wg-relay", () => relay),
            },
            log);

        var selection = await selector.ConnectHealthyAsync((candidate, _) =>
            Task.FromResult(candidate.Candidate.Kind != TransportKind.DirectUdp));

        Assert.NotNull(selection);
        Assert.Equal("wg-relay", selection!.Candidate.Id);
        Assert.Same(relay, selection.Transport);
    }

    [Fact]
    public async Task ConnectHealthy_DisposesTransportWhenHealthCheckThrows()
    {
        var log = new CapturingLogger();
        var transport = new FakeTransport("boom");

        var selector = new TransportSelector(new[] { RelayCandidate("wg-relay", () => transport) }, log);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            selector.ConnectHealthyAsync((_, _) => throw new InvalidOperationException("driver lỗi")));

        Assert.True(transport.Disposed);
    }

    // MARK: - Driver: đọc runtime không được ném exception

    [Fact]
    public async Task WintunDriver_RuntimeStatsOfMissingTunnelIsUnknown_NotAnException()
    {
        using var driver = new WintunWireGuardDriver(
            assetDirectory: Path.GetTempPath(),
            workingDirectory: Path.GetTempPath(),
            log: NullTunnelLogger.Instance);

        var stats = await driver.GetRuntimeStatsAsync("vpnflow-test-khong-ton-tai");

        // Không có pipe UAPI (hoặc không phải Windows) ⇒ Unknown, KHÔNG ném ra ngoài đường chẩn đoán.
        Assert.False(stats.Available);
    }

    [Fact]
    public async Task ExternalDriver_RuntimeStatsOfMissingTunnelIsUnknown_NotAnException()
    {
        var driver = new WireGuardWindowsDriver();

        var stats = await driver.GetRuntimeStatsAsync("vpnflow-test-khong-ton-tai");

        Assert.False(stats.Available);
    }

    private static TransportCandidate RelayCandidate(string id, Func<ITunnelTransport> factory)
        => new()
        {
            Id = id,
            Kind = TransportKind.TcpRelay,
            Factory = factory,
        };

    private sealed class FakeTransport : ITunnelTransport
    {
        public FakeTransport(string transportId)
        {
            TransportId = transportId;
        }

        public string TransportId { get; }

        public ushort LocalPort { get; private set; }

        public bool IsConnected => true;

        public bool Disposed { get; private set; }

        public ushort Start()
        {
            LocalPort = 41234;
            return LocalPort;
        }

        public string CountersSummary() => "fake";

        public void Dispose() => Disposed = true;
    }

    private sealed class CapturingLogger : ITunnelLogger
    {
        public List<string> Lines { get; } = new();

        public void Info(string message) => Lines.Add($"info: {message}");

        public void Warn(string message) => Lines.Add($"warn: {message}");

        public void Error(string message) => Lines.Add($"error: {message}");
    }
}
