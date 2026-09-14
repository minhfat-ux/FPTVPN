using Avalonia;

namespace VpnFlow.App;

internal static class Program
{
    // Điểm vào của app desktop Avalonia (chạy được cả khi build từ macOS).
    [STAThread]
    public static void Main(string[] args) => BuildAvaloniaApp()
        .StartWithClassicDesktopLifetime(args);

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
