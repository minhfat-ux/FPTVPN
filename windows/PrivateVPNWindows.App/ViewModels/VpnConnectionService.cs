using Avalonia.Media;
using VpnFlow.Core.Api;
using VpnFlow.Core.Auth;
using VpnFlow.Core.Tunnel;

namespace VpnFlow.App.ViewModels;

/// <summary>Trạng thái kết nối hiển thị trên UI (bám 4 trạng thái của yêu cầu).</summary>
public enum VpnConnectionState
{
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// <summary>
/// Ghép tầng Core (WireGuardConfig + IWireGuardDriver/WireGuardWindowsDriver +
/// TransportSelector) thành một phiên kết nối thật.
///
/// HAI BẢO ĐẢM về đường full-tunnel (bài học từ sự cố 19:05 — app báo "Đã kết nối" trong khi
/// WireGuard liên tục "Handshake did not complete", và vì route 0.0.0.0/1 + 128.0.0.0/1 vẫn trỏ
/// vào tunnel chết nên CẢ MÁY mất internet):
///  1. Không nhận một transport chỉ vì driver báo Running — phải qua health gate bằng handshake/
///     rx thật; không đạt thì gỡ tunnel rồi thử transport kế tiếp (chế độ Tự động).
///  2. Tunnel đang Connected mà hết bằng chứng truyền dữ liệu thì watchdog GỠ NGAY để trả mạng về
///     đường vật lý và báo lỗi tiếng Việt, không giữ route trỏ vào tunnel chết.
///
/// QUAN TRỌNG — fail mềm trên macOS: <see cref="WireGuardWindowsDriver.InstallAsync"/>
/// ném <see cref="PlatformNotSupportedException"/> ngoài Windows. Ta BẮT exception đó,
/// ghi log và báo "Cần chạy trên Windows để cài tunnel WireGuard" — app không được crash.
/// Nhờ vậy vẫn smoke-test được UI trên macOS.
/// </summary>
public sealed class VpnConnectionService : ObservableObject, IDisposable
{
    /// <summary>Tên tunnel = tên file conf (quy ước wireguard.exe).</summary>
    public const string TunnelName = "vpnflow";

    private readonly DeviceIdentity _device;
    private readonly AppSettings _settings;
    private readonly IWireGuardDriver _driver;
    private readonly ITunnelLogger _log;

    /// <summary>Nhịp đọc lại số liệu runtime trong health gate (ms).</summary>
    private const int HealthGatePollMs = 1_000;

    private ITunnelTransport? _transport;
    private CancellationTokenSource? _cts;
    private CancellationTokenSource? _watchdogCts;

    /// <summary>Số liệu đọc được lúc tunnel qua health gate — mốc "có bằng chứng" cho watchdog.</summary>
    private WireGuardRuntimeStats _gateStats = WireGuardRuntimeStats.Unknown;

    /// <summary>
    /// Tăng mỗi phiên. Watchdog của phiên cũ thấy số này đổi thì không được gỡ tunnel của phiên mới.
    /// </summary>
    private int _sessionGeneration;

    public VpnConnectionService(
        DeviceIdentity device,
        AppSettings settings,
        IWireGuardDriver? driver = null,
        ITunnelLogger? logger = null)
    {
        _device = device ?? throw new ArgumentNullException(nameof(device));
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        // Quy tắc chọn: có đủ wintun.dll + wireguard-go.exe cạnh app → WintunWireGuardDriver
        // (không cần cài WireGuard for Windows); thiếu asset → lùi về wireguard.exe ngoài.
        // PHẢI truyền _log: không truyền thì driver dùng NullTunnelLogger và stdout/stderr của
        // wireguard-go bị nuốt sạch — đúng lý do lỗi "wireguard-go.exe đã thoát (exit code 1)"
        // trước đây không có thêm thông tin nào để chẩn đoán.
        _driver = driver ?? WireGuardDriverSelector.Create(log: logger);
        _log = logger ?? ConsoleTunnelLogger.Instance;
    }

    public IWireGuardDriver Driver => _driver;

    private VpnConnectionState _state = VpnConnectionState.Disconnected;

    public VpnConnectionState State
    {
        get => _state;
        private set
        {
            if (SetProperty(ref _state, value))
            {
                OnPropertyChanged(nameof(StateText));
                OnPropertyChanged(nameof(IsConnected));
                OnPropertyChanged(nameof(IsBusy));
                OnPropertyChanged(nameof(StatusBrush));
                OnPropertyChanged(nameof(ConnectButtonText));
            }
        }
    }

    private string? _lastError;

    public string? LastError
    {
        get => _lastError;
        private set
        {
            if (SetProperty(ref _lastError, value))
            {
                OnPropertyChanged(nameof(HasError));
            }
        }
    }

    public bool HasError => !string.IsNullOrWhiteSpace(_lastError);

    private string? _overlayIp;

    /// <summary>IP overlay cấp cho thiết bị (chỉ có sau khi đăng ký thành công).</summary>
    public string? OverlayIp
    {
        get => _overlayIp;
        private set => SetProperty(ref _overlayIp, value);
    }

    private string? _activeNodeTitle;

    /// <summary>Node đang dùng để hiển thị.</summary>
    public string? ActiveNodeTitle
    {
        get => _activeNodeTitle;
        private set => SetProperty(ref _activeNodeTitle, value);
    }

    public bool IsConnected => State == VpnConnectionState.Connected;

    public bool IsBusy => State == VpnConnectionState.Connecting;

    public string ConnectButtonText => IsConnected ? "Ngắt kết nối" : "Kết nối";

    public string StateText => State switch
    {
        VpnConnectionState.Connecting => "Đang kết nối…",
        VpnConnectionState.Connected => "Đã kết nối",
        VpnConnectionState.Error => "Lỗi",
        _ => "Đã ngắt kết nối",
    };

    public IBrush StatusBrush => State switch
    {
        VpnConnectionState.Connected => VpnBrushes.Success,
        VpnConnectionState.Connecting => VpnBrushes.Warning,
        _ => VpnBrushes.Danger,
    };

    /// <summary>Bắt đầu trạng thái "đang kết nối" trước khi đăng ký với coordinator.</summary>
    public void BeginConnecting()
    {
        LastError = null;
        State = VpnConnectionState.Connecting;
    }

    /// <summary>Báo lỗi trước khi kịp dựng tunnel (đăng ký thất bại, thiếu phiên…).</summary>
    public void Fail(string message)
    {
        LastError = message;
        State = VpnConnectionState.Error;
    }

    /// <summary>
    /// Dựng config từ kết quả đăng ký, chọn transport rồi cài tunnel qua driver.
    /// Mọi lỗi (kể cả không phải Windows) đều được nuốt thành trạng thái Error.
    ///
    /// Điểm khác căn bản so với bản cũ: KHÔNG nhận một transport chỉ vì driver báo Running.
    /// Mỗi candidate phải qua health gate bằng dữ liệu WireGuard thật (handshake/rx — xem
    /// <see cref="InstallAndVerifyAsync"/>); không đạt thì gỡ tunnel và thử candidate kế tiếp,
    /// nên route full-tunnel không bao giờ bị giữ lại trên một tunnel chết.
    /// </summary>
    public async Task StartTunnelAsync(
        ExitNode node,
        CoordinatorRegisterResponse registration,
        TransportPreference preference,
        CancellationToken cancellationToken = default)
    {
        StopWatchdog();
        StopTransport();
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var token = _cts.Token;
        var generation = Interlocked.Increment(ref _sessionGeneration);

        try
        {
            if (string.IsNullOrWhiteSpace(registration.OverlayIp))
            {
                throw new ApiBadResponseException("Coordinator không trả về IP overlay cho thiết bị.");
            }

            var config = BuildConfig(registration.OverlayIp, node);
            var candidates = BuildCandidates(node, preference);
            if (candidates.Count == 0)
            {
                throw new TunnelTransportException(NoCandidateMessage(preference));
            }

            // Chọn cứng một transport trong Settings = người dùng đã chỉ định đường đi; tự nhảy
            // sang đường khác (nhất là udp-direct) là làm trái ý họ, nên chỉ Auto mới được failover.
            var allowFailover = preference == TransportPreference.Auto;

            var selection = await new TransportSelector(candidates, _log)
                .ConnectHealthyAsync(
                    (candidate, ct) => InstallAndVerifyAsync(candidate, config, ct),
                    allowFailover,
                    token)
                .ConfigureAwait(false);

            if (selection is null)
            {
                // Không đường nào truyền được dữ liệu. Gỡ sạch trước khi báo lỗi: giữ tunnel lại
                // là giữ luôn route full-tunnel trỏ vào đường chết ⇒ cả máy mất internet.
                await UninstallQuietlyAsync().ConfigureAwait(false);
                throw new TunnelTransportException(NoHealthyTransportMessage(preference, candidates));
            }

            _transport = selection.Transport;
            OverlayIp = registration.OverlayIp;
            ActiveNodeTitle = NodeTitle(node);
            LastError = null;
            State = VpnConnectionState.Connected;
            _log.Info($"connect: tunnel đã lên (overlay={registration.OverlayIp})");
            _log.Info($"connect: transport đang dùng: {selection.Candidate.Id}");

            StartWatchdog(generation);
        }
        catch (PlatformNotSupportedException ex)
        {
            // Đường smoke-test trên macOS: driver Windows từ chối cài tunnel.
            _log.Warn($"connect: driver không hỗ trợ nền tảng này: {ex.Message}");
            StopTransport();
            OverlayIp = null;
            ActiveNodeTitle = null;
            LastError = "Cần chạy trên Windows để cài tunnel WireGuard.";
            State = VpnConnectionState.Error;
        }
        catch (Exception ex)
        {
            _log.Error($"connect: thất bại: {ex.Message}");
            // Lỗi giữa chừng có thể xảy ra SAU khi route full-tunnel đã được áp (ví dụ netsh
            // xong mới lỗi bước sau) — phải gỡ tunnel, không được để máy mất mạng.
            await UninstallQuietlyAsync().ConfigureAwait(false);
            StopTransport();
            OverlayIp = null;
            ActiveNodeTitle = null;
            LastError = ex.Message;
            State = VpnConnectionState.Error;
        }
    }

    /// <summary>Gỡ tunnel + đóng transport. Luôn fail mềm (driver macOS ném exception).</summary>
    public async Task DisconnectAsync()
    {
        State = VpnConnectionState.Connecting;
        Interlocked.Increment(ref _sessionGeneration);
        StopWatchdog();
        await UninstallQuietlyAsync().ConfigureAwait(false);

        StopTransport();
        OverlayIp = null;
        ActiveNodeTitle = null;
        LastError = null;
        State = VpnConnectionState.Disconnected;
    }

    /// <summary>
    /// Danh sách đường truyền ứng viên theo lựa chọn trong Settings.
    /// Auto: udp-direct đứng trước (nhanh nhất khi mạng cho UDP đi), rồi wg-relay từ
    /// <c>wg_relay_url</c>, rồi ws từ <c>ws_relay_url</c>. Chọn cứng một transport thì chỉ dựng
    /// đúng transport đó — không tự nhảy sang đường khác, kể cả khi đường đó chết.
    /// </summary>
    private IReadOnlyList<TransportCandidate> BuildCandidates(ExitNode node, TransportPreference preference)
    {
        return preference switch
        {
            TransportPreference.WireGuardUdp => WindowsTransportPlanner.Build(
                wgRelayUrl: null,
                wsRelayUrl: null,
                includeDirectUdp: true,
                includeRelays: false,
                log: _log),

            TransportPreference.WsRelay => WindowsTransportPlanner.Build(
                wgRelayUrl: null,
                wsRelayUrl: node.WsRelayUrl,
                includeDirectUdp: false,
                includeRelays: true,
                log: _log),

            // HysteriaTransport yêu cầu password/obfs không nằm trong payload /v1/nodes, nên chưa
            // dựng được candidate thật (xem báo cáo) — giữ nguyên hành vi cũ: UDP trực tiếp.
            TransportPreference.Hysteria => WindowsTransportPlanner.Build(
                wgRelayUrl: null,
                wsRelayUrl: null,
                includeDirectUdp: true,
                includeRelays: false,
                log: _log),

            _ => WindowsTransportPlanner.Build(
                node.WgRelayUrl,
                node.WsRelayUrl,
                includeDirectUdp: true,
                includeRelays: true,
                log: _log),
        };
    }

    private WireGuardConfig BuildConfig(string overlayIp, ExitNode node)
    {
        return new WireGuardConfig
        {
            Name = TunnelName,
            PrivateKeyBase64 = _device.PrivateKeyBase64,
            Addresses = { $"{overlayIp}/24" },
            DnsServers = { "1.1.1.1" },
            Peers =
            {
                new WireGuardConfig.WireGuardPeer
                {
                    PublicKeyBase64 = node.PublicKey,
                    Endpoint = node.Endpoint,
                    AllowedIPs = { "0.0.0.0/0" },
                    PersistentKeepAlive = 25,
                },
            },
        };
    }

    /// <summary>
    /// Cài tunnel với transport của <paramref name="selection"/> rồi kiểm tra sức khoẻ THẬT.
    /// Trả false nghĩa là tunnel đã được gỡ (route full-tunnel biến mất) và selector nên thử
    /// transport kế tiếp.
    /// </summary>
    private async Task<bool> InstallAndVerifyAsync(
        TransportSelection selection,
        WireGuardConfig config,
        CancellationToken cancellationToken)
    {
        var dialConfig = selection.LocalPort > 0
            ? config.WithFirstPeerEndpoint($"127.0.0.1:{selection.LocalPort}")
            : config;

        Directory.CreateDirectory(AppSettings.SettingsDirectory);
        var confPath = Path.Combine(AppSettings.SettingsDirectory, TunnelName + ".conf");
        dialConfig.WriteTo(confPath);
        _log.Info($"connect: đã ghi conf {confPath} (transport={selection.Candidate.Id})");

        await _driver.InstallAsync(TunnelName, confPath, cancellationToken).ConfigureAwait(false);

        // Driver "chạy" chỉ là điều kiện CẦN: nó không nói gì về việc gói có qua tunnel hay không,
        // nên đây chỉ là bước chờ service lên trước khi hỏi handshake thật.
        if (_driver.IsSupported && !await WaitForRunningAsync(cancellationToken).ConfigureAwait(false))
        {
            _log.Warn($"connect: service tunnel của {selection.Candidate.Id} không chạy sau khi cài — gỡ, thử đường khác.");
            await UninstallQuietlyAsync().ConfigureAwait(false);
            return false;
        }

        var gate = await WaitForHealthyTunnelAsync(cancellationToken).ConfigureAwait(false);
        switch (gate.Verdict)
        {
            case TunnelHealthVerdict.Healthy:
                _gateStats = gate.Stats;
                _log.Info($"connect: {selection.Candidate.Id} khoẻ — {DescribeRuntime(gate.Stats)}");
                return true;

            case TunnelHealthVerdict.Unknown:
                // Driver không có kênh đọc (wireguard.exe thiếu wg.exe): không có bằng chứng thì
                // không được kết luận chết, nhưng cũng không được im lặng coi như đã xác minh.
                _gateStats = WireGuardRuntimeStats.Unknown;
                _log.Warn(
                    $"connect: không đọc được handshake/rx của {selection.Candidate.Id} " +
                    "(driver không có kênh đọc UAPI) — bỏ qua health gate cho phiên này.");
                return true;

            default:
                _log.Warn(
                    $"connect: {selection.Candidate.Id} không truyền được dữ liệu sau " +
                    $"{TunnelHealth.InitialGateSeconds}s — gỡ tunnel để trả mạng về đường trực tiếp.");
                await UninstallQuietlyAsync().ConfigureAwait(false);
                return false;
        }
    }

    /// <summary>
    /// Health gate: chờ bằng chứng dữ liệu THẬT (handshake mới hoặc đã nhận byte từ node) trong
    /// tối đa <see cref="TunnelHealth.InitialGateSeconds"/> giây.
    /// Trả <see cref="TunnelHealthVerdict.Unknown"/> khi suốt thời gian đó driver không đọc được
    /// số liệu nào — "không đọc được" khác hẳn "không truyền được".
    /// </summary>
    private async Task<HealthGateResult> WaitForHealthyTunnelAsync(CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(TunnelHealth.InitialGateSeconds);
        var last = WireGuardRuntimeStats.Unknown;
        var sawAny = false;

        while (DateTimeOffset.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var stats = await _driver.GetRuntimeStatsAsync(TunnelName, cancellationToken).ConfigureAwait(false);
            if (stats.Available)
            {
                sawAny = true;
                last = stats;
                if (TunnelHealth.EvaluateGate(stats, DateTimeOffset.UtcNow) == TunnelHealthVerdict.Healthy)
                {
                    return new HealthGateResult(TunnelHealthVerdict.Healthy, stats);
                }
            }

            await Task.Delay(HealthGatePollMs, cancellationToken).ConfigureAwait(false);
        }

        return sawAny
            ? new HealthGateResult(TunnelHealthVerdict.Stale, last)
            : new HealthGateResult(TunnelHealthVerdict.Unknown, WireGuardRuntimeStats.Unknown);
    }

    /// <summary>Kết quả health gate: kết luận + mẫu runtime đọc được (nếu có).</summary>
    private readonly record struct HealthGateResult(TunnelHealthVerdict Verdict, WireGuardRuntimeStats Stats);

    private void StartWatchdog(int generation)
    {
        var token = _cts?.Token ?? CancellationToken.None;
        var cts = CancellationTokenSource.CreateLinkedTokenSource(token);
        _watchdogCts = cts;

        // Lấy token TRƯỚC khi giao cho task: StopWatchdog có thể Dispose CTS ngay sau đây.
        var watchdogToken = cts.Token;
        var baseline = _gateStats;
        _ = Task.Run(() => WatchdogLoopAsync(generation, baseline, watchdogToken));
    }

    /// <summary>
    /// Canh tunnel khi đang Connected. Mất bằng chứng truyền dữ liệu trong
    /// <see cref="TunnelHealth.WatchdogNoEvidenceSeconds"/> giây ⇒ gỡ tunnel NGAY: route
    /// full-tunnel biến mất, mạng về đường vật lý, và trạng thái báo lỗi rõ ràng.
    /// </summary>
    private async Task WatchdogLoopAsync(int generation, WireGuardRuntimeStats baseline, CancellationToken token)
    {
        var watchdog = new TunnelHealthWatchdog(DateTimeOffset.UtcNow, baseline.RxBytes);
        var warnedUnknown = false;

        while (!token.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(TunnelHealth.WatchdogIntervalSeconds), token)
                    .ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            WireGuardRuntimeStats stats;
            try
            {
                stats = await _driver.GetRuntimeStatsAsync(TunnelName, token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                _log.Warn($"watchdog: đọc runtime WireGuard lỗi (bỏ qua lượt này): {ex.Message}");
                continue;
            }

            var verdict = watchdog.Observe(stats, DateTimeOffset.UtcNow);
            if (verdict == TunnelHealthVerdict.Healthy)
            {
                continue;
            }

            if (verdict == TunnelHealthVerdict.Unknown)
            {
                if (!warnedUnknown)
                {
                    warnedUnknown = true;
                    _log.Warn(
                        "watchdog: driver không đọc được handshake/rx — không xác minh được tunnel " +
                        "còn truyền dữ liệu hay không.");
                }

                continue;
            }

            // Phiên đã bị thay (Disconnect hoặc connect lại) — không được gỡ tunnel của phiên mới.
            if (generation != Volatile.Read(ref _sessionGeneration) || State != VpnConnectionState.Connected)
            {
                return;
            }

            _log.Error(
                $"watchdog: không handshake mới và không nhận thêm byte nào trong " +
                $"{TunnelHealth.WatchdogNoEvidenceSeconds}s — tunnel không truyền được dữ liệu, gỡ ngay.");
            await FailWithNetworkRestoredAsync(
                    "Tunnel không truyền được dữ liệu — đã trả mạng về đường trực tiếp. " +
                    "Thử lại hoặc chọn transport khác.")
                .ConfigureAwait(false);
            return;
        }
    }

    /// <summary>
    /// Gỡ tunnel TRƯỚC rồi mới báo lỗi: mọi đường ra đang trỏ vào tunnel, giữ nó lại là giữ luôn
    /// cảnh mất internet cho cả máy.
    /// </summary>
    private async Task FailWithNetworkRestoredAsync(string message)
    {
        StopWatchdog();
        await UninstallQuietlyAsync().ConfigureAwait(false);
        StopTransport();
        OverlayIp = null;
        ActiveNodeTitle = null;
        LastError = message;
        State = VpnConnectionState.Error;
    }

    /// <summary>Gỡ tunnel, nuốt mọi lỗi — gọi được cả trên macOS nơi driver ném PlatformNotSupported.</summary>
    private async Task UninstallQuietlyAsync()
    {
        try
        {
            if (_driver.IsSupported)
            {
                await _driver.UninstallAsync(TunnelName).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"tunnel: gỡ tunnel lỗi (bỏ qua): {ex.Message}");
        }
    }

    /// <summary>Chờ service tunnel ở trạng thái Running; false nếu quá hạn (để còn đổi transport).</summary>
    private async Task<bool> WaitForRunningAsync(CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var state = await _driver.GetStateAsync(TunnelName, cancellationToken).ConfigureAwait(false);
            if (state == WireGuardTunnelState.Running)
            {
                return true;
            }

            await Task.Delay(300, cancellationToken).ConfigureAwait(false);
        }

        return false;
    }

    private void StopWatchdog()
    {
        try
        {
            _watchdogCts?.Cancel();
        }
        catch (Exception)
        {
            // Best effort.
        }

        try
        {
            _watchdogCts?.Dispose();
        }
        catch (Exception)
        {
            // Best effort: luồng watchdog có thể đang dùng token của CTS này.
        }

        _watchdogCts = null;
    }

    private static string DescribeRuntime(WireGuardRuntimeStats stats)
    {
        var handshake = stats.LastHandshake is { } last
            ? $"{(int)Math.Max(0, (DateTimeOffset.UtcNow - last).TotalSeconds)}s trước"
            : "chưa có";
        return $"handshake={handshake} rx={stats.RxBytes}B";
    }

    /// <summary>Vì sao không có candidate nào để thử (chọn cứng transport mà node không cấp URL).</summary>
    private static string NoCandidateMessage(TransportPreference preference)
        => preference switch
        {
            TransportPreference.WsRelay =>
                "Node không cấp relay WebSocket (ws_relay_url) nên transport 'ws' không dựng được. " +
                "Chọn transport Tự động (Auto) trong settings.",
            _ =>
                "Node không cấp transport nào dùng được (thiếu cả endpoint trực tiếp lẫn relay).",
        };

    /// <summary>Thông báo khi mọi candidate đều cài được nhưng KHÔNG truyền được dữ liệu.</summary>
    private static string NoHealthyTransportMessage(
        TransportPreference preference,
        IReadOnlyList<TransportCandidate> candidates)
    {
        var ids = new List<string>();
        foreach (var candidate in candidates)
        {
            ids.Add(candidate.Id);
        }

        var tried = string.Join(", ", ids);
        if (preference != TransportPreference.Auto)
        {
            return $"Transport bạn chọn ({tried}) không truyền được dữ liệu sau " +
                   $"{TunnelHealth.InitialGateSeconds}s. Đã gỡ tunnel, mạng về đường trực tiếp — " +
                   "đổi transport sang Tự động (Auto) để app tự thử relay.";
        }

        return $"Không transport nào truyền được dữ liệu (đã thử: {tried}). " +
               "Đã gỡ tunnel, mạng về đường trực tiếp — thử lại hoặc chọn máy chủ khác.";
    }

    private void StopTransport()
    {
        try
        {
            _cts?.Cancel();
        }
        catch (Exception)
        {
            // Best effort.
        }

        _transport?.Dispose();
        _transport = null;

        _cts?.Dispose();
        _cts = null;
    }

    private static string NodeTitle(ExitNode node)
        => string.IsNullOrWhiteSpace(node.City)
            ? node.Name
            : $"{node.City}, {node.Country} · {node.Name}";

    public void Dispose()
    {
        StopWatchdog();
        StopTransport();
    }
}
