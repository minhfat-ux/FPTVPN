using System.Diagnostics;

namespace VpnFlow.App.ViewModels;

/// <summary>
/// Mở URL bằng trình duyệt mặc định của hệ điều hành. Dùng cho trang mua, Terms,
/// Privacy, Support và nút tải bản mới — không mở WebView nội bộ (khác bản mac).
/// </summary>
public static class UrlLauncher
{
    public static void Open(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
            // Không mở được trình duyệt không phải lỗi chí mạng.
        }
    }
}
