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

    private ITunnelTransport? _transport;
    private CancellationTokenSource? _cts;

    public VpnConnectionService(
        DeviceIdentity device,
        AppSettings settings,
        IWireGuardDriver? driver = null,
        ITunnelLogger? logger = null)
    {
        _device = device ?? throw new ArgumentNullException(nameof(device));
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _driver = driver ?? new WireGuardWindowsDriver();
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
        VpnConnectionState.Connected => VpnBrushes.Accent,
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
    /// </summary>
    public async Task StartTunnelAsync(
        ExitNode node,
        CoordinatorRegisterResponse registration,
        TransportPreference preference,
        CancellationToken cancellationToken = default)
    {
        StopTransport();
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        try
        {
            if (string.IsNullOrWhiteSpace(registration.OverlayIp))
            {
                throw new ApiBadResponseException("Coordinator không trả về IP overlay cho thiết bị.");
            }

            var config = BuildConfig(registration.OverlayIp, node);

            var selection = await new TransportSelector(BuildCandidates(node, preference), _log)
                .ConnectOnceAsync(_cts.Token)
                .ConfigureAwait(false);

            if (selection is null)
            {
                throw new TunnelTransportException("Không mở được đường truyền nào tới máy chủ.");
            }

            _transport = selection.Transport;
            var localPort = selection.LocalPort;
            var dialConfig = localPort > 0
                ? config.WithFirstPeerEndpoint($"127.0.0.1:{localPort}")
                : config;

            Directory.CreateDirectory(AppSettings.SettingsDirectory);
            var confPath = Path.Combine(AppSettings.SettingsDirectory, TunnelName + ".conf");
            dialConfig.WriteTo(confPath);
            _log.Info($"connect: đã ghi conf {confPath} (transport={selection.Candidate.Id})");

            await _driver.InstallAsync(TunnelName, confPath, _cts.Token).ConfigureAwait(false);
            if (_driver.IsSupported)
            {
                await WaitForRunningAsync(_cts.Token).ConfigureAwait(false);
            }

            OverlayIp = registration.OverlayIp;
            ActiveNodeTitle = NodeTitle(node);
            LastError = null;
            State = VpnConnectionState.Connected;
            _log.Info($"connect: tunnel đã lên (overlay={registration.OverlayIp})");
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
        try
        {
            if (_driver.IsSupported)
            {
                await _driver.UninstallAsync(TunnelName).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"disconnect: gỡ tunnel lỗi (bỏ qua): {ex.Message}");
        }

        StopTransport();
        OverlayIp = null;
        ActiveNodeTitle = null;
        LastError = null;
        State = VpnConnectionState.Disconnected;
    }

    /// <summary>
    /// Danh sách đường truyền ứng viên theo lựa chọn trong Settings.
    /// UDP trực tiếp đứng trước trong chế độ Tự động để connect không phải chờ
    /// probe WS (WS chỉ lên được sau ~15s khi relay chết).
    /// </summary>
    private IReadOnlyList<TransportCandidate> BuildCandidates(ExitNode node, TransportPreference preference)
    {
        var candidates = new List<TransportCandidate>();
        var direct = new TransportCandidate
        {
            Id = "udp-direct",
            Kind = TransportKind.DirectUdp,
        };

        var relayUri = TryParseUri(node.RelayUrl);

        switch (preference)
        {
            case TransportPreference.WireGuardUdp:
                candidates.Add(direct);
                break;

            case TransportPreference.WsRelay:
                if (relayUri is not null)
                {
                    candidates.Add(BuildWsCandidate(relayUri));
                }
                candidates.Add(direct);
                break;

            case TransportPreference.Hysteria:
                // HysteriaTransport yêu cầu password/obfs không nằm trong payload /v1/nodes,
                // nên chưa dựng được candidate thật (xem báo cáo) — lùi về UDP trực tiếp.
                candidates.Add(direct);
                break;

            default:
                candidates.Add(direct);
                if (relayUri is not null)
                {
                    candidates.Add(BuildWsCandidate(relayUri));
                }
                break;
        }

        return candidates;
    }

    private TransportCandidate BuildWsCandidate(Uri relayUri)
    {
        return new TransportCandidate
        {
            Id = "ws",
            Kind = TransportKind.WsRelay,
            Factory = () => new WsRelayClient(relayUri, _log),
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

    private async Task WaitForRunningAsync(CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var state = await _driver.GetStateAsync(TunnelName, cancellationToken).ConfigureAwait(false);
            if (state == WireGuardTunnelState.Running)
            {
                return;
            }

            await Task.Delay(300, cancellationToken).ConfigureAwait(false);
        }

        throw new WireGuardDriverException("Service tunnel không chạy sau khi cài.");
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

    private static Uri? TryParseUri(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        return Uri.TryCreate(raw, UriKind.Absolute, out var uri) ? uri : null;
    }

    private static string NodeTitle(ExitNode node)
        => string.IsNullOrWhiteSpace(node.City)
            ? node.Name
            : $"{node.City}, {node.Country} · {node.Name}";

    public void Dispose()
    {
        StopTransport();
    }
}
