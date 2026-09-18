using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;
using Avalonia.Threading;
using VpnFlow.App.ViewModels;
using VpnFlow.Core.Api;

namespace VpnFlow.App.Views;

/// <summary>
/// Màn hình chính. Nối UI vào tầng thật: danh sách exit node lấy từ
/// <c>GET /v1/nodes</c>, trạng thái lấy từ <see cref="VpnConnectionService"/>, và nút
/// nguồn gọi đăng ký thiết bị + dựng tunnel thật.
///
/// Trước đây nút này chỉ lật một cờ bool và tự hiện "Connected" — vi phạm ADR-0004 /
/// FR-VPN-005 (no fake connected). Không còn đường nào đặt trạng thái từ cú bấm.
/// </summary>
public partial class MainView : UserControl
{
    private readonly AppServices _services;
    private readonly List<ExitNode> _nodes = new();

    private ExitNode? _selectedNode;
    private bool _loadedOnce;

    /// <summary>Người dùng bấm Connect khi chưa đăng nhập → shell mở màn đăng nhập.</summary>
    public event Action? SignInRequested;

    public MainView() : this(AppServices.Shared)
    {
    }

    public MainView(AppServices services)
    {
        _services = services ?? throw new ArgumentNullException(nameof(services));
        InitializeComponent();

        ShowNetworkConflictBanner();

        _services.Connection.PropertyChanged += (_, _) => UpdateUi();
        Loaded += OnLoaded;
    }

    /// <summary>
    /// Hiện cảnh báo nếu có phần mềm mạng khác đang tranh chấp (Clash Verge/Mihomo TUN, proxy
    /// hệ thống…). Ưu tiên hiện cảnh báo nặng nhất trước — đây là lý do phổ biến nhất khiến
    /// khách "connecting mãi" hoặc không đăng nhập/không nhận được mã OTP.
    /// </summary>
    private void ShowNetworkConflictBanner()
    {
        var conflicts = _services.SystemConflicts;
        if (conflicts.Count == 0)
        {
            return;
        }

        var worst = conflicts
            .OrderByDescending(c => c.Severity)
            .First();

        ConflictBanner.IsVisible = true;
        ConflictTitle.Text = worst.Title;
        ConflictDetail.Text = worst.Detail;
        ConflictAdvice.Text = worst.Advice;

        // Nhiều cảnh báo: ghi thêm số còn lại để khách biết vẫn còn việc phải xử lý.
        if (conflicts.Count > 1)
        {
            ConflictAdvice.Text += $"\n\n(Còn {conflicts.Count - 1} cảnh báo khác — xem log: {_services.Logger.LogPath})";
        }
    }

    private async void OnLoaded(object? sender, RoutedEventArgs e)
    {
        if (_loadedOnce)
        {
            return;
        }

        _loadedOnce = true;
        UpdateUi();
        await RefreshNodesAsync();
    }

    // -------------------------------------------------------------------
    // Exit nodes
    // -------------------------------------------------------------------

    private async Task RefreshNodesAsync()
    {
        SetRefreshing(true);
        try
        {
            var nodes = await _services.Api.FetchNodesAsync();
            if (nodes.Count == 0)
            {
                // Coordinator trả rỗng (hoặc non-2xx): dùng danh sách dựng sẵn để app
                // vẫn kết nối được khi backend trục trặc — giống ExitNode.builtInFallback
                // của bản iOS/mac.
                nodes = ExitNode.BuiltInFallback.ToList();
                OfflineHintText.IsVisible = true;
            }
            else
            {
                OfflineHintText.IsVisible = false;
            }

            ApplyNodes(nodes);
        }
        catch (Exception ex)
        {
            // Không tới được host nào: vẫn phải để người dùng kết nối được.
            ApplyNodes(ExitNode.BuiltInFallback.ToList());
            OfflineHintText.IsVisible = true;
            ShowError($"Không tải được danh sách máy chủ: {ex.Message}");
        }
        finally
        {
            SetRefreshing(false);
            UpdateUi();
        }
    }

    private void ApplyNodes(List<ExitNode> nodes)
    {
        _nodes.Clear();
        _nodes.AddRange(nodes);
        ExitNodeList.Items.Clear();

        foreach (var node in _nodes)
        {
            ExitNodeList.Items.Add(new ListBoxItem { Content = BuildServerRow(node) });
        }

        NoServerText.IsVisible = _nodes.Count == 0;

        var wanted = _services.Settings.SelectedNodeId;
        var index = _nodes.FindIndex(n => n.Id == wanted);
        ExitNodeList.SelectedIndex = index >= 0 ? index : (_nodes.Count > 0 ? 0 : -1);
    }

    /// <summary>Dựng một dòng server giống bản iOS/mac: vòng chọn + tên có cờ quốc gia.</summary>
    private Control BuildServerRow(ExitNode node)
    {
        var panel = new Panel { Width = 18, Height = 18, VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center };
        AddIndicator(panel, "VpnCheckRingGeometry", "vpnCheckRing", 18);
        AddIndicator(panel, "VpnCheckCircleGeometry", "vpnCheckCircle", 18);
        AddIndicator(panel, "VpnCheckGlyphGeometry", "vpnCheckGlyph", 12);

        var text = new TextBlock
        {
            Text = NodeTitle(node),
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center,
        };
        text.Classes.Add("vpnServerName");

        var row = new StackPanel { Orientation = Avalonia.Layout.Orientation.Horizontal, Spacing = 8 };
        row.Children.Add(panel);
        row.Children.Add(text);
        return row;
    }

    private void AddIndicator(Panel host, string geometryKey, string className, double size)
    {
        if (!this.TryFindResource(geometryKey, out var value) || value is not Geometry geometry)
        {
            return;
        }

        var path = new Avalonia.Controls.Shapes.Path
        {
            Data = geometry,
            Width = size,
            Height = size,
            Stretch = Stretch.Uniform,
        };
        path.Classes.Add(className);
        host.Children.Add(path);
    }

    private void OnExitNodeSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        var index = ExitNodeList.SelectedIndex;
        _selectedNode = index >= 0 && index < _nodes.Count ? _nodes[index] : null;

        if (_selectedNode is not null)
        {
            _services.Settings.SelectedNodeId = _selectedNode.Id;
            _services.Settings.Save();
        }

        UpdateUi();
    }

    private async void OnRefreshNodesClick(object? sender, RoutedEventArgs e)
        => await RefreshNodesAsync();

    // -------------------------------------------------------------------
    // Connect / Disconnect
    // -------------------------------------------------------------------

    private async void OnConnectClick(object? sender, RoutedEventArgs e)
    {
        if (_services.Connection.IsBusy)
        {
            return;
        }

        if (_services.Connection.IsConnected)
        {
            await _services.Connection.DisconnectAsync();
            UpdateUi();
            return;
        }

        if (!_services.Auth.IsSignedIn)
        {
            SignInRequested?.Invoke();
            return;
        }

        var node = _selectedNode;
        if (node is null)
        {
            ShowError("Chưa có máy chủ khả dụng.");
            return;
        }

        HideError();
        var log = _services.Logger;
        log.Info($"connect: bắt đầu (node={node.Id}, transport={_services.Settings.Transport})");

        // Dựng adapter Wintun cần quyền admin. Không có thì wireguard-go chỉ trả
        // "Access is denied" rất khó đoán, nên chặn sớm và nói rõ.
        if (!Environment.IsPrivilegedProcess)
        {
            log.Warn("connect: app KHÔNG chạy bằng quyền admin — dừng trước khi gọi wireguard-go");
            _services.Connection.Fail(
                "VPNFlow cần quyền Administrator để tạo tunnel. Hãy đóng app, mở lại và chọn Yes ở hộp thoại UAC.");
            UpdateUi();
            return;
        }

        _services.Connection.BeginConnecting();
        try
        {
            var accessToken = _services.Auth.AccessToken;
            await RegisterDeviceAsync(accessToken);
            log.Info("connect: đã claim bản cài cho tài khoản");

            // Join token một lần để coordinator cấp IP overlay + provision peer.
            // PHẢI truyền token này vào RegisterAsync: mặc định hàm đó dùng token của
            // constructor (đang rỗng) nên nếu bỏ qua sẽ bị 401 "Invalid or expired join token".
            var joinToken = await _services.Api.FetchJoinTokenAsync();
            log.Info("connect: đã xin join token");

            var registration = await _services.Api.RegisterAsync(
                name: _services.Device.RegistrationName(),
                platform: "windows",
                wireguardPublicKey: _services.Device.PublicKeyBase64,
                endpoint: "0.0.0.0:51820",
                accessToken: null,
                exitNodeId: node.Id,
                joinToken: joinToken,
                cancellationToken: default);
            log.Info($"connect: register xong (overlay={registration.OverlayIp})");

            await _services.Connection.StartTunnelAsync(node, registration, _services.Settings.Transport);
        }
        catch (DeviceLimitException ex)
        {
            log.Warn($"connect: chạm hạn mức thiết bị: {ex.Message}");
            _services.Connection.Fail(DescribeDeviceLimit(ex));
        }
        catch (Exception ex)
        {
            log.Error($"connect: thất bại: {ex.GetType().Name}: {ex.Message}");
            _services.Connection.Fail(ex.Message);
        }

        UpdateUi();
    }

    /// <summary>
    /// Gắn bản cài này vào tài khoản đang đăng nhập (route <c>POST /v1/devices/claim</c>)
    /// để danh sách thiết bị và hạn mức 3 máy có hiệu lực. Lỗi mạng/hạ tầng KHÔNG chặn
    /// kết nối; chỉ riêng chạm hạn mức thiết bị mới dừng.
    /// </summary>
    private async Task RegisterDeviceAsync(string? accessToken)
    {
        if (string.IsNullOrEmpty(accessToken))
        {
            return;
        }

        await _services.Api.ClaimDeviceAsync(
            accessToken: accessToken,
            deviceKey: _services.Device.PublicKeyBase64,
            name: _services.Device.RegistrationName());
    }

    private static string DescribeDeviceLimit(DeviceLimitException ex)
    {
        var max = ex.MaxDevices is > 0 ? ex.MaxDevices.Value : 3;
        return $"Tài khoản đã dùng đủ {max} thiết bị. Hãy đăng xuất một thiết bị cũ rồi thử lại.";
    }

    // -------------------------------------------------------------------
    // Trạng thái UI — luôn suy từ tầng tunnel thật, không đoán theo cú bấm
    // -------------------------------------------------------------------

    private void UpdateUi()
    {
        // VpnConnectionService đổi State bên trong các await có ConfigureAwait(false), nên
        // PropertyChanged bắn từ thread pool. Chạm control từ đó thì Avalonia ném
        // "Call from invalid thread" — phải đẩy về UI thread trước.
        if (!Dispatcher.UIThread.CheckAccess())
        {
            Dispatcher.UIThread.Post(UpdateUi);
            return;
        }

        var connection = _services.Connection;

        var (label, subtitle, brush) = connection.State switch
        {
            VpnConnectionState.Connected => ("Connected", "Your traffic is protected", VpnBrushes.Success),
            VpnConnectionState.Connecting => ("Connecting", "Starting secure VPN tunnel", VpnBrushes.Warning),
            VpnConnectionState.Error => ("Failed", "VPN needs attention", VpnBrushes.Danger),
            _ => ("Disconnected", "Your VPN tunnel is off", VpnBrushes.Danger),
        };

        StatusText.Text = label;
        StatusText.Foreground = brush;
        StatusDot.Fill = brush;
        StatusSubtitle.Text = subtitle;
        DiagStateText.Text = label;
        DiagStateText.Foreground = brush;

        DiagLocationText.Text = _selectedNode is null
            ? "—"
            : NodeTitle(_selectedNode, includeName: false);

        ConnectButton.Background = brush;
        ConnectButton.IsEnabled = !connection.IsBusy;
        ConnectGlyph.IsVisible = !connection.IsBusy;
        ConnectBusyText.IsVisible = connection.IsBusy;

        if (connection.HasError && !string.IsNullOrWhiteSpace(connection.LastError))
        {
            ShowError(connection.LastError!);
        }
        else
        {
            HideError();
        }
    }

    private void ShowError(string message)
    {
        ErrorText.Text = message;
        ErrorBanner.IsVisible = true;
        DiagMessageText.Text = message;
        DiagMessageRow.IsVisible = true;
    }

    private void HideError()
    {
        ErrorBanner.IsVisible = false;
        DiagMessageRow.IsVisible = false;
    }

    private void SetRefreshing(bool refreshing)
    {
        RefreshNodesButton.IsEnabled = !refreshing;
        ExitNodeList.IsEnabled = !refreshing;
    }

    // -------------------------------------------------------------------
    // Hiển thị tên node — giống serverTitle(for:) của bản iOS/mac
    // -------------------------------------------------------------------

    private static string NodeTitle(ExitNode node, bool includeName = true)
    {
        var country = node.Country == "VN" ? "Vietnam" : node.Country;
        var core = string.IsNullOrWhiteSpace(node.City) ? country : $"{node.City}, {country}";
        var withFlag = $"{FlagEmoji(node.Country)} {core}".Trim();
        return includeName && !string.IsNullOrWhiteSpace(node.Name) ? $"{withFlag} · {node.Name}" : withFlag;
    }

    /// <summary>ISO 3166-1 alpha-2 → emoji cờ (giống flagEmoji(for:) của bản iOS/mac).</summary>
    private static string FlagEmoji(string countryCode)
    {
        if (string.IsNullOrWhiteSpace(countryCode) || countryCode.Length != 2)
        {
            return string.Empty;
        }

        const int baseValue = 127397;
        var result = string.Empty;
        foreach (var c in countryCode.ToUpperInvariant())
        {
            if (c is < 'A' or > 'Z')
            {
                return string.Empty;
            }

            result += char.ConvertFromUtf32(baseValue + c);
        }

        return result;
    }
}
