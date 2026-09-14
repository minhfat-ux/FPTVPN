using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;

namespace VpnFlow.App.Views;

public partial class MainView : UserControl
{
    private static readonly IBrush AccentBrush = new SolidColorBrush(Color.Parse("#33C773"));
    private static readonly IBrush DangerBrush = new SolidColorBrush(Color.Parse("#FF4D4D"));

    // Chỉ là trạng thái hiển thị tạm — chưa nối vào tầng tunnel thật.
    private bool _connected;

    public MainView() => InitializeComponent();

    private void OnConnectClick(object? sender, RoutedEventArgs e)
    {
        _connected = !_connected;

        StatusText.Text = _connected ? "Connected" : "Disconnected";
        ConnectButton.Content = _connected ? "Disconnect" : "Connect";
        ConnectButton.Classes.Set("vpnPrimary", !_connected);
        ConnectButton.Classes.Set("vpnDanger", _connected);

        var brush = _connected ? AccentBrush : DangerBrush;
        StatusDot.Fill = brush;
        StatusText.Foreground = brush;
    }
}
