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
}
