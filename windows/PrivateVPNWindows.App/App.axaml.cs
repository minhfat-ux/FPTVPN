using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using VpnFlow.App.Views;

namespace VpnFlow.App;

public partial class App : Application
{
    private MainWindow? _window;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            // Giống Tailscale: đóng cửa sổ chỉ ẩn xuống khay, app (và tunnel) vẫn chạy —
            // nên vòng đời app KHÔNG được kết thúc theo cửa sổ cuối.
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;

            _window = new MainWindow();
            desktop.MainWindow = _window;
        }

        base.OnFrameworkInitializationCompleted();
    }

    private void OnTrayOpen(object? sender, EventArgs e)
    {
        if (_window is null)
        {
            return;
        }

        _window.Show();
        if (_window.WindowState == WindowState.Minimized)
        {
            _window.WindowState = WindowState.Normal;
        }

        _window.Activate();
    }

    private void OnTrayQuit(object? sender, EventArgs e)
    {
        if (_window is not null)
        {
            // Cho phép cửa sổ đóng thật; MainWindow.Closed lo phần gỡ tunnel + dispose.
            _window.AllowClose = true;
        }

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.Shutdown();
        }
    }
}
