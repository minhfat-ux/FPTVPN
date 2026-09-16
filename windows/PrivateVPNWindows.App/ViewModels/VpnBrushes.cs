using Avalonia.Media;

namespace VpnFlow.App.ViewModels;

/// <summary>
/// Brush dùng trong ViewModel, giữ đúng bảng màu của Theme/VpnTheme.axaml
/// (NFR-WIN-004, đồng bộ bản iOS/mac). VM không tra được DynamicResource nên khai
/// báo hằng ở đây; khi đổi màu theme phải đổi cả hai chỗ.
/// </summary>
public static class VpnBrushes
{
    /// <summary>Xanh system blue #007AFF — hành động chính (giống iOS/mac).</summary>
    public static readonly IBrush Accent = new SolidColorBrush(Color.Parse("#007AFF"));

    /// <summary>Xanh brand #33C773 — chỉ dùng cho trạng thái ĐÃ kết nối.</summary>
    public static readonly IBrush Success = new SolidColorBrush(Color.Parse("#33C773"));

    public static readonly IBrush Danger = new SolidColorBrush(Color.Parse("#FF4D4D"));
    public static readonly IBrush Warning = new SolidColorBrush(Color.Parse("#FFA733"));
    public static readonly IBrush TextSecondary = new SolidColorBrush(Color.Parse("#99FFFFFF"));
    public static readonly IBrush TextTertiary = new SolidColorBrush(Color.Parse("#66FFFFFF"));
}
