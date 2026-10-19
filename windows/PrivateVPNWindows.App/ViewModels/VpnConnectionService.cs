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

    /// <summary>
    /// Id của đường relay (hysteria2-over-WS, TUN nằm TRONG flowvpnrelay.exe) — dùng trong log để luôn
    /// nói rõ "đang chạy đường nào": người dùng chọn/tự động đều có thể rơi về WireGuard.
    /// </summary>
    public const string RelayTransportId = "hy-ws-relay";

    /// <summary>
    /// Trần thời gian cho đường relay trước khi rơi về chuỗi WireGuard hiện có. Đường này đi 2 chặng
    /// (Cloudflare → node) rồi mới dựng TUN nên cần rộng hơn UDP trực tiếp; phải LỚN HƠN
    /// <see cref="HysteriaRelayTunnel.ReadyTimeoutSeconds"/> để tầng dưới còn kịp báo lý do thật.
    /// </summary>
    private const int RelayTunnelBudgetSeconds = 35;

    private readonly DeviceIdentity _device;
    private readonly AppSettings _settings;
    private readonly IWireGuardDriver _driver;
    private readonly ITunnelLogger _log;

    /// <summary>Nhịp đọc lại số liệu runtime trong health gate (ms).</summary>
    private const int HealthGatePollMs = 1_000;

    private ITunnelTransport? _transport;
    private HysteriaRelayTunnel? _relayTunnel;

    /// <summary>
    /// Watchdog RIÊNG cho đường relay (thử chủ động qua tunnel; không còn số byte của sing-box).
    /// Không liên quan tới watchdog WireGuard ở trên: chỉ chạy khi transport là
    /// <see cref="RelayTransportId"/>.
    /// </summary>
    private RelayHealthWatchdog? _relayWatchdog;

    /// <summary>
    /// Số lần tự dựng lại đường relay sau sự cố (tiến trình con chết hoặc tunnel đứng) trước khi
    /// trả mạng về đường trực tiếp và báo lỗi. Có trần để không lặp vô hạn và không che mất lỗi.
    /// </summary>
    private const int RelayAutoReconnectAttempts = 3;

    /// <summary>Tham số phiên gần nhất, dùng cho việc tự dựng lại đường relay.</summary>
    private ExitNode? _lastNode;
    private CoordinatorRegisterResponse? _lastRegistration;

    /// <summary>Khoá riêng cho <see cref="_relayTunnel"/> (không lock(this) trên lớp public).</summary>
    private readonly object _relayLock = new();
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
        StopRelayWatchdog();
        _lastNode = node;
        _lastRegistration = registration;
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

            // Đường MỚI (hysteria2-over-WS, TUN nằm trong chính flowvpnrelay.exe) thử trước: đây là
            // đường duy nhất còn đi được khi mạng chặn thẳng IP node (đo thật: TCP tới IP node
            // timeout, chỉ api.meetflowai.site:443 đi qua). Không lên trong
            // RelayTunnelBudgetSeconds thì rơi về NGUYÊN chuỗi WireGuard bên dưới — không xoá/đổi
            // hành vi WireGuard.
            if (preference is TransportPreference.SingBoxHysteriaRelay or TransportPreference.Auto)
            {
                // Binary của mình bị Application Control chặn ⇒ biết chắc đường relay không lên
                // được, bỏ qua luôn (không tốn ngân sách chờ) và nói rõ lý do trong log.
                if (ApplicationControlGuard.RelayBlocked)
                {
                    _log.Warn("connect: " + ApplicationControlGuard.UserMessage());
                }
                else if (await TryStartRelayTunnelAsync(node, token).ConfigureAwait(false))
                {
                    OverlayIp = registration.OverlayIp;
                    ActiveNodeTitle = NodeTitle(node);
                    LastError = null;
                    State = VpnConnectionState.Connected;
                    _log.Info($"connect: tunnel đã lên (overlay={registration.OverlayIp})");
                    _log.Info(
                        $"connect: transport đang dùng: {RelayTransportId} " +
                        $"(relay={_relayTunnel?.RelayUrlInUse}) — KHÔNG đi qua WireGuard");

                    // Không chạy watchdog WireGuard ở đường này: watchdog đọc handshake/rx của
                    // wireguard-go, mà đường relay không có tunnel WireGuard nào. Sức khoẻ ở đây do
                    // sự kiện Faulted của tiến trình con + watchdog relay báo (xem OnRelayTunnelFaulted).
                    return;
                }

                else
                {
                    _log.Warn(
                        $"connect: {RelayTransportId} không lên trong {RelayTunnelBudgetSeconds}s " +
                        "— rơi về chuỗi WireGuard (đường cũ).");
                }
            }

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

        // Ngắt đường relay TRƯỚC khi đóng transport còn lại: kill flowvpnrelay để HĐH thu hồi adapter
        // TUN + route, nếu không máy vẫn trỏ ra ngoài qua một TUN đã chết.
        await StopRelayTunnelAsync().ConfigureAwait(false);

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

            // Đường relay KHÔNG phải candidate của TransportSelector: nó tự dựng TUN bên trong
            // flowvpnrelay.exe chứ không đưa cổng UDP local cho WireGuard (xem
            // TryStartRelayTunnelAsync). Tới được đây nghĩa là đường relay đã thất bại, nên đây là
            // chuỗi WireGuard để rơi về.
            TransportPreference.SingBoxHysteriaRelay => WindowsTransportPlanner.Build(
                node.WgRelayUrl,
                node.WsRelayUrl,
                includeDirectUdp: true,
                includeRelays: true,
                log: _log),

            _ => WindowsTransportPlanner.Build(
                node.WgRelayUrl,
                node.WsRelayUrl,
                includeDirectUdp: true,
                includeRelays: true,
                log: _log),
        };
    }

    /// <summary>
    /// Thử dựng đường relay: MỘT tiến trình <c>flowvpnrelay.exe</c> lo cả hysteria2-over-WS và TUN +
    /// auto_route + DNS. Trả false (KHÔNG ném) khi hết <see cref="RelayTunnelBudgetSeconds"/> giây
    /// hoặc khi đường này không dựng được — người gọi quyết định rơi về chuỗi WireGuard.
    ///
    /// Chạy được cả trên macOS: thiếu binary cạnh app thì <see cref="HysteriaRelayTunnel.StartAsync"/>
    /// ném lỗi rõ ràng và ta rơi về đường cũ — nhờ vậy vẫn smoke-test được UI ngoài Windows.
    /// </summary>
    private async Task<bool> TryStartRelayTunnelAsync(ExitNode node, CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(RelayTunnelBudgetSeconds);

        foreach (var (server, relayUrl) in RelayEndpointsFor(node))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var remaining = deadline - DateTimeOffset.UtcNow;
            if (remaining <= TimeSpan.Zero)
            {
                break;
            }

            var tunnel = new HysteriaRelayTunnel(log: _log);
            try
            {
                using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                budget.CancelAfter(remaining);
                await tunnel.StartAsync(server, relayUrl, budget.Token).ConfigureAwait(false);

                // CỔNG SỨC KHOẺ: TUN dựng xong KHÔNG có nghĩa là nó chở được gói. Đường relay đã
                // chiếm route 0.0.0.0/0 (metric 0) nên một TUN "sống mà câm" là CẢ MÁY mất mạng cho
                // tới khi watchdog phát hiện (rảnh 60s + 3 lần thử hỏng ≈ hơn 1 phút). Thử một
                // request THẬT đi qua tunnel rồi mới nhận đường này — đúng nguyên tắc của
                // TransportSelector: không nhận một transport chỉ vì nó báo "đang chạy".
                if (!await RelayCarriesTrafficAsync(budget.Token).ConfigureAwait(false))
                {
                    throw new TunnelTransportException(
                        "TUN đã dựng nhưng chưa chở được dữ liệu (thử qua tunnel thất bại) — " +
                        "gỡ TUN và rơi về đường WireGuard.");
                }

                // Gắn handler SAU khi lên: sự cố lúc đang dựng đã có nhánh exception lo, không
                // được báo lỗi hai lần.
                tunnel.Faulted += OnRelayTunnelFaulted;
                _relayTunnel = tunnel;
                StartRelayWatchdog(tunnel);
                return true;
            }
            catch (Exception ex)
            {
                tunnel.Faulted -= OnRelayTunnelFaulted;
                tunnel.Dispose();
                _log.Warn($"connect: {RelayTransportId} qua {relayUrl} thất bại: {ex.Message}");
            }
        }

        return false;
    }

    /// <summary>
    /// Thử một request THẬT đi qua tunnel relay vừa dựng (endpoint health của chính mình, đúng URL
    /// mà <see cref="RelayHealthWatchdog"/> dùng). Không dùng proxy hệ thống: proxy có thể là chính
    /// phần mềm đang tranh chấp và làm sai kết quả. Mọi lỗi đều là "chưa chở được dữ liệu".
    /// </summary>
    private static async Task<bool> RelayCarriesTrafficAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var client = new HttpClient(new SocketsHttpHandler { UseProxy = false })
            {
                Timeout = TimeSpan.FromSeconds(8),
            };
            using var response = await client
                .GetAsync(
                    RelayHealthWatchdog.DefaultProbeUrl,
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken)
                .ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch (Exception)
        {
            return false;
        }
    }

    /// <summary>
    /// Các cặp (server, relay URL) theo thứ tự thử. Ưu tiên relay mà NODE tự cấp
    /// (<c>hy_relay_url</c>) vì một relay chỉ hạ cánh ở MỘT node: đi qua relay của node khác thì
    /// QUIC hạ cánh sai chỗ. Node không cấp thì dùng cặp mặc định đã đo được — relay đi kèm đúng
    /// node của nó (vn2hy ↔ node-2, vn1hy ↔ node-1).
    /// </summary>
    private static IReadOnlyList<(string Server, string RelayUrl)> RelayEndpointsFor(ExitNode node)
    {
        if (!string.IsNullOrWhiteSpace(node.HysteriaRelayUrl))
        {
            return new[] { (HysteriaServerFor(node.Endpoint), node.HysteriaRelayUrl!) };
        }

        return new[]
        {
            (HysteriaServerFor(HysteriaRelayDefaults.NodeTwoAddress), HysteriaRelayDefaults.RelayUrl),
            (HysteriaServerFor(HysteriaRelayDefaults.NodeOneAddress), HysteriaRelayDefaults.FallbackRelayUrls[0]),
        };
    }

    /// <summary>
    /// Địa chỉ server cho hysteria: <c>&lt;host&gt;:8443</c>. Chỉ lấy HOST của endpoint node
    /// (endpoint WireGuard ghi cổng 443, còn hysteria nghe 8443). Khi đi qua relay, địa chỉ này
    /// chỉ còn là danh tính (SNI) — gói thật đi trong WebSocket.
    /// </summary>
    private static string HysteriaServerFor(string? endpoint)
    {
        var host = endpoint?.Split(':')[0]?.Trim();
        return string.IsNullOrWhiteSpace(host)
            ? HysteriaRelayDefaults.DefaultServer
            : $"{host}:{HysteriaRelayDefaults.ServerPort}";
    }

    /// <summary>
    /// Dừng đường relay: kill flowvpnrelay.exe (adapter TUN do nó giữ sẽ bị HĐH thu hồi cùng route).
    /// Idempotent.
    /// </summary>
    private async Task StopRelayTunnelAsync()
    {
        StopRelayWatchdog();

        HysteriaRelayTunnel? relay;
        lock (_relayLock)
        {
            relay = _relayTunnel;
            _relayTunnel = null;
        }

        if (relay is null)
        {
            return;
        }

        relay.Faulted -= OnRelayTunnelFaulted;
        try
        {
            await relay.StopAsync().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log.Warn($"connect: dừng đường relay lỗi (bỏ qua): {ex.Message}");
        }
        finally
        {
            relay.Dispose();
        }
    }

    /// <summary>
    /// Một tiến trình con của đường relay chết bất ngờ, HOẶC watchdog phát hiện tunnel "đứng".
    /// Nay KHÔNG bắt khách bấm Kết nối lại ngay: thử TỰ dựng lại tối đa
    /// <see cref="RelayAutoReconnectAttempts"/> lần (chờ tăng dần); hết lượt mới gỡ TUN, trả mạng về
    /// đường trực tiếp và báo lỗi. Có trần nên không lặp vô hạn và không che mất lỗi.
    /// </summary>
    private void OnRelayTunnelFaulted(object? sender, string message)
    {
        if (!ReferenceEquals(sender, _relayTunnel) || State != VpnConnectionState.Connected)
        {
            return;
        }

        var generation = _sessionGeneration;
        _log.Error($"connect: {RelayTransportId} sự cố — {message}");
        _ = RecoverRelayAsync(generation, message);
    }

    /// <summary>Tự dựng lại đường relay sau sự cố (có trần), rồi mới trả mạng về đường trực tiếp.</summary>
    private async Task RecoverRelayAsync(int generation, string message)
    {
        for (var attempt = 1; attempt <= RelayAutoReconnectAttempts; attempt++)
        {
            var waitSeconds = attempt switch { 1 => 2, 2 => 5, _ => 10 };
            _log.Warn(
                $"connect: thử tự dựng lại đường relay lần {attempt}/{RelayAutoReconnectAttempts} " +
                $"(chờ {waitSeconds}s)");

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(waitSeconds)).ConfigureAwait(false);
            }
            catch (Exception)
            {
                return;
            }

            // Người dùng đã bấm Ngắt hoặc Kết nối lại ⇒ phiên đổi: dừng ngay, không giẫm chân.
            if (generation != _sessionGeneration)
            {
                _log.Info("connect: phiên đã đổi — bỏ qua việc tự dựng lại.");
                return;
            }

            var node = _lastNode;
            if (node is null)
            {
                break;
            }

            await StopRelayTunnelAsync().ConfigureAwait(false);

            try
            {
                var token = _cts?.Token ?? CancellationToken.None;
                if (await TryStartRelayTunnelAsync(node, token).ConfigureAwait(false))
                {
                    OverlayIp = _lastRegistration?.OverlayIp ?? OverlayIp;
                    ActiveNodeTitle = NodeTitle(node);
                    LastError = null;
                    State = VpnConnectionState.Connected;
                    _log.Info(
                        $"connect: đã tự dựng lại đường relay (lần {attempt}) — transport={RelayTransportId}");
                    return;
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                _log.Warn($"connect: tự dựng lại đường relay lỗi: {ex.Message}");
            }
        }

        _log.Error("connect: tự dựng lại đường relay thất bại — gỡ TUN, trả mạng về đường trực tiếp.");
        await FailWithNetworkRestoredAsync(
            message + " Đã thử tự kết nối lại nhưng chưa thành công — bấm Kết nối lại.").ConfigureAwait(false);
    }

    /// <summary>
    /// Bật watchdog cho đường relay. CHỈ gọi khi transport là <see cref="RelayTransportId"/>,
    /// nên đường WireGuard (đã có watchdog riêng) không bị ảnh hưởng gì.
    /// </summary>
    private void StartRelayWatchdog(HysteriaRelayTunnel tunnel)
    {
        StopRelayWatchdog();
        try
        {
            var watchdog = RelayHealthWatchdog.ForRelayTunnel(
                log: message => _log.Info(message),
                onStall: reason => OnRelayTunnelFaulted(tunnel, reason));
            _relayWatchdog = watchdog;
            watchdog.Start();
            _log.Info(
                $"relay-watchdog: đã bật (tun={tunnel.TunInterfaceName}); " +
                $"rảnh {RelayHealthWatchdog.DefaultNoTrafficSeconds}s mà thử qua tunnel thất bại " +
                $"{RelayHealthWatchdog.DefaultProbeFailures} lần ⇒ dựng lại đường relay");
        }
        catch (Exception ex)
        {
            // Không bật được watchdog thì vẫn giữ nguyên hành vi cũ — không được làm hỏng tunnel.
            _log.Warn($"relay-watchdog: không bật được (bỏ qua, tunnel vẫn chạy bình thường): {ex.Message}");
        }
    }

    /// <summary>Tắt watchdog đường relay. Idempotent, không ném.</summary>
    private void StopRelayWatchdog()
    {
        var watchdog = Interlocked.Exchange(ref _relayWatchdog, null);
        if (watchdog is null)
        {
            return;
        }

        try
        {
            watchdog.Dispose();
        }
        catch (Exception)
        {
            // bỏ qua: chỉ là dọn watchdog
        }
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

        // Lưới an toàn: mọi đường thoát (kể cả lỗi giữa chừng) phải dọn tiến trình con. Đường
        // dừng "mềm" là StopRelayTunnelAsync, gọi trước ở Disconnect.
        StopRelayTunnelAsync().GetAwaiter().GetResult();

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
