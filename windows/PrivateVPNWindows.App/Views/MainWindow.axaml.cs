using Avalonia.Controls;
using Avalonia.Interactivity;
using VpnFlow.App.ViewModels;

namespace VpnFlow.App.Views;

/// <summary>
/// Shell của app: sở hữu <see cref="AppServices"/> và điều hướng giữa 3 màn hình
/// (chính / đăng nhập / cài đặt) theo đúng luồng bản macOS:
/// chưa đăng nhập ⇒ màn đăng nhập; bánh răng ⇒ cài đặt; "Done" ⇒ quay lại.
/// </summary>
public partial class MainWindow : Window
{
    private readonly AppServices _services;

    /// <summary>
    /// Đặt true khi người dùng chọn "Quit" ở khay hệ thống. Mặc định đóng cửa sổ chỉ
    /// ẩn xuống khay (giống Tailscale) để tunnel tiếp tục chạy.
    /// </summary>
    public bool AllowClose { get; set; }

    public MainWindow()
    {
        _services = AppServices.Shared;
        InitializeComponent();

        // Thoát app phải gỡ tunnel + đóng transport, không để lại adapter/route.
        Closed += (_, _) =>
        {
            _services.Connection.Dispose();
            _services.Dispose();
        };

        ShowInitial();
    }

    protected override void OnClosing(WindowClosingEventArgs e)
    {
        if (!AllowClose)
        {
            e.Cancel = true;
            Hide();
            return;
        }

        base.OnClosing(e);
    }

    private void ShowInitial()
    {
        if (_services.Auth.IsSignedIn)
        {
            ShowMain();
        }
        else
        {
            ShowLogin();
        }
    }

    private void ShowMain()
    {
        var view = new MainView(_services);
        view.SignInRequested += ShowLogin;
        HostContent.Content = view;
        BackButton.IsVisible = false;
    }

    private void ShowLogin()
    {
        var view = new LoginView(_services);
        view.SignedIn += ShowMain;
        HostContent.Content = view;
        BackButton.IsVisible = false;
    }

    private void ShowSettings()
    {
        var view = new SettingsView(_services);
        view.SignedOut += ShowLogin;
        HostContent.Content = view;
        BackButton.IsVisible = true;
    }

    private void OnSettingsClick(object? sender, RoutedEventArgs e) => ShowSettings();

    private void OnBackClick(object? sender, RoutedEventArgs e) => ShowInitial();
}
