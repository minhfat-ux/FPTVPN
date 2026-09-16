using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;

namespace VpnFlow.App.Views;

public partial class MainView : UserControl
{
    // Màu trạng thái lấy đúng bảng màu iOS/mac: đỏ khi chưa kết nối,
    // xanh brand #33C773 khi đã kết nối.
    private static readonly IBrush DangerBrush = new SolidColorBrush(Color.Parse("#FF4D4D"));
    private static readonly IBrush SuccessBrush = new SolidColorBrush(Color.Parse("#33C773"));

    // Chỉ là trạng thái hiển thị tạm — chưa nối vào tầng tunnel thật.
    private bool _connected;

    public MainView() => InitializeComponent();

    private void OnConnectClick(object? sender, RoutedEventArgs e)
    {
        _connected = !_connected;

        var brush = _connected ? SuccessBrush : DangerBrush;
        var label = _connected ? "Connected" : "Disconnected";

        StatusText.Text = label;
        StatusText.Foreground = brush;
        StatusDot.Fill = brush;
        DiagStateText.Text = label;
        DiagStateText.Foreground = brush;

        ConnectButton.Background = brush;
    }
}
