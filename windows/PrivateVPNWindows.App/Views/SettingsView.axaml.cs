using System.Reflection;
using Avalonia.Controls;
using VpnFlow.App.ViewModels;

namespace VpnFlow.App.Views;

/// <summary>
/// Màn cài đặt. Trước đây chỉ gọi InitializeComponent nên không nút nào hoạt động.
/// Nay hiện đúng tài khoản đang đăng nhập, cho đăng xuất, và mở các trang web thật
/// (mua gói / hỗ trợ / quyền riêng tư / điều khoản) bằng <see cref="UrlLauncher"/>.
/// </summary>
public partial class SettingsView : UserControl
{
    private readonly AppServices _services;

    /// <summary>Đang tự gán index từ settings — không được coi là người dùng vừa chọn.</summary>
    private bool _syncingTransport;

    /// <summary>Số hiệu app đang cài — để đối chiếu với mốc phiên bản trên server.</summary>
    private string _version = "";

    /// <summary>Đã đăng xuất → shell quay về màn đăng nhập.</summary>
    public event Action? SignedOut;

    public SettingsView() : this(AppServices.Shared)
    {
    }

    public SettingsView(AppServices services)
    {
        _services = services ?? throw new ArgumentNullException(nameof(services));
        InitializeComponent();

        TransportCombo.SelectionChanged += (_, _) => OnTransportChanged();
        SignOutButton.Click += (_, _) => OnSignOut();
        UpgradeButton.Click += (_, _) => UrlLauncher.Open(_services.Api.BuyUrl);
        ContactSupportButton.Click += (_, _) => UrlLauncher.Open(WebUrl("SupportPrivateVPN.html"));
        PrivacyButton.Click += (_, _) => UrlLauncher.Open(WebUrl("FlowVPNPrivacy.html"));
        TermsButton.Click += (_, _) => UrlLauncher.Open(WebUrl("terms"));

        Refresh();
        _ = RefreshServerVersionAsync();
    }

    private void OnSignOut()
    {
        _services.Auth.SignOut();
        if (_services.Connection.IsConnected || _services.Connection.IsBusy)
        {
            // Đăng xuất phải ngắt tunnel: khoá đăng ký gắn với tài khoản vừa bỏ.
            _ = _services.Connection.DisconnectAsync();
        }

        SignedOut?.Invoke();
        Refresh();
    }

    private void Refresh()
    {
        var session = _services.Auth.Session;
        AccountText.Text = _services.Auth.IsSignedIn
            ? session?.User.Email ?? "Signed in"
            : "Not signed in.";

        SignOutButton.IsVisible = _services.Auth.IsSignedIn;
        RefreshVersionText();

        // Gán lại lựa chọn đang lưu. Cờ này chặn SelectionChanged ghi đè khi ta tự đổi index.
        _syncingTransport = true;
        try
        {
            TransportCombo.SelectedIndex = (int)_services.Settings.Transport;
        }
        finally
        {
            _syncingTransport = false;
        }
    }

    /// <summary>
    /// Người dùng đổi transport: lưu ngay để lần kết nối sau dùng đúng đường đã chọn.
    /// Thứ tự item của ComboBox phải khớp <see cref="TransportPreference"/> (đọc theo index).
    /// </summary>
    private void OnTransportChanged()
    {
        if (_syncingTransport || TransportCombo.SelectedIndex < 0)
        {
            return;
        }

        var chosen = (TransportPreference)TransportCombo.SelectedIndex;
        if (chosen == _services.Settings.Transport)
        {
            return;
        }

        _services.Settings.Transport = chosen;
        _services.Settings.Save();
    }

    /// <summary>URL trang web (khác host API) — suy từ BuyUrl để đổi host dự phòng vẫn đúng.</summary>
    private string WebUrl(string path)
    {
        var baseUrl = _services.Api.BuyUrl;
        const string buySuffix = "/buy";
        if (baseUrl.EndsWith(buySuffix, StringComparison.OrdinalIgnoreCase))
        {
            baseUrl = baseUrl[..^buySuffix.Length];
        }

        return $"{baseUrl.TrimEnd('/')}/{path.TrimStart('/')}";
    }

    /// <summary>
    /// Dòng "Phiên bản" lấy từ metadata của CHÍNH file .exe, không lấy từ tên bộ cài.
    /// Vì sao: 21/09/2026 bộ cài tên `VPNFlow-Setup-1.4.1.exe` nhưng app bên trong khai 1.0.0
    /// (build.ps1 giải version SAU bước publish nên `dotnet publish` không nhận `/p:Version`).
    /// Hiện số thật để kiểm chứng được bản đã publish, khỏi đoán theo tên file.
    /// </summary>
    private void RefreshVersionText()
    {
        var assembly = typeof(SettingsView).Assembly;
        var version = assembly.GetName().Version?.ToString(3) ?? "0.0.0";
        var informational =
            assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "";
        var plus = informational.IndexOf('+');
        var commit = plus >= 0 && plus + 1 < informational.Length ? informational[(plus + 1)..] : "";
        if (commit.Length > 7)
        {
            commit = commit[..7];
        }

        _version = version;
        VersionText.Text = commit.Length > 0 ? $"Phiên bản {version} (build {commit})" : $"Phiên bản {version}";
    }

    /// <summary>
    /// Mốc phiên bản trên server, hiện ngay dưới số của app: khác nhau nghĩa là bản publish chưa
    /// đúng (hoặc khách đang ở bản cũ) — nhìn là biết, không phải mở log. Lỗi mạng thì ghi rõ
    /// "(không đọc được)" chứ không im lặng.
    /// </summary>
    private async Task RefreshServerVersionAsync()
    {
        try
        {
            var info = await _services.Api.FetchAppVersionAsync("windows");
            ServerVersionText.Text = string.Equals(info.LatestVersion, _version, StringComparison.OrdinalIgnoreCase)
                ? $"Bản mới nhất trên server: {info.LatestVersion} (khớp)"
                : $"Bản mới nhất trên server: {info.LatestVersion} — KHÁC bản đang cài";
        }
        catch (Exception)
        {
            ServerVersionText.Text = "Bản mới nhất trên server: (không đọc được)";
        }
    }
}
