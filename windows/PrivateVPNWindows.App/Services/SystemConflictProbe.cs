using System.Net;
using System.Net.NetworkInformation;
using PrivateVPNWindows.Core.Tunnel;
using VpnFlow.Core.Tunnel;

namespace VpnFlow.App.Services;

/// <summary>
/// Đọc trạng thái mạng thật của máy Windows để đưa cho <see cref="NetworkConflictDetector"/>.
///
/// Vì sao cần: Clash Verge / Mihomo / v2rayN bật TUN sẽ chiếm default route và chạy DNS fake-IP,
/// làm VPNFlow không bắt tay được VÀ không gọi được API (không đăng nhập / không nhận OTP).
/// Người dùng chỉ thấy "connecting mãi" nên phải cảnh báo rõ ngay trong app.
/// </summary>
public static class SystemConflictProbe
{
    /// <summary>Chụp trạng thái hệ thống hiện tại. Không ném exception — lỗi đọc chỉ trả về rỗng.</summary>
    public static NetworkConflictInputs Capture()
    {
        var adapters = new List<AdapterInfo>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                var props = ni.GetIPProperties();
                string? gateway = null;
                try
                {
                    gateway = props.GatewayAddresses
                        .Select(g => g.Address)
                        .FirstOrDefault(a => a is not null && a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        ?.ToString();
                }
                catch (NetworkInformationException)
                {
                    // adapter đang thay đổi trạng thái — bỏ qua
                }

                adapters.Add(new AdapterInfo(
                    ni.Name,
                    ni.Description,
                    ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel,
                    ni.OperationalStatus == OperationalStatus.Up && gateway is not null,
                    gateway));
            }
        }
        catch (NetworkInformationException)
        {
            // không đọc được danh sách adapter
        }

        var processes = new List<string>();
        try
        {
            foreach (var p in System.Diagnostics.Process.GetProcesses())
            {
                try
                {
                    processes.Add(p.ProcessName);
                }
                catch (InvalidOperationException)
                {
                    // tiến trình đã thoát
                }
                finally
                {
                    p.Dispose();
                }
            }
        }
        catch (Exception)
        {
            // không đọc được danh sách tiến trình
        }

        var (proxyEnabled, proxyServer) = ReadSystemProxy();

        return new NetworkConflictInputs(adapters, processes, proxyEnabled, proxyServer);
    }

    /// <summary>Phát hiện và trả về danh sách cảnh báo (rỗng = hệ thống sạch).</summary>
    public static IReadOnlyList<NetworkConflict> Detect()
    {
        var conflicts = NetworkConflictDetector.Analyze(Capture()).ToList();

        // Máy khách bật Smart App Control: binary bên thứ ba chưa ký (sing-box.exe) bị Application
        // Control chặn ⇒ đường hysteria2-over-WebSocket không lên được. Cảnh báo NGAY khi mở app
        // thay vì để khách bấm Kết nối rồi thấy "connecting" rồi tự rơi về WireGuard mà không hiểu.
        var singBox = Path.Combine(AppContext.BaseDirectory, HysteriaRelayDefaults.SingBoxExeName);
        if (ApplicationControlGuard.ProbeBlocked(singBox))
        {
            conflicts.Add(new NetworkConflict(
                NetworkConflictSeverity.Warning,
                "Windows đang chặn công cụ tunnel (Smart App Control)",
                "sing-box.exe bị Application Control chặn vì chưa ký số ⇒ đường hysteria2-over-WebSocket " +
                "không dùng được. App sẽ tự đi đường WireGuard.",
                ApplicationControlGuard.UserMessage()));
        }

        return conflicts;
    }

    /// <summary>
    /// Proxy hệ thống: hỏi thẳng .NET xem có proxy nào đang áp cho HTTPS không
    /// (cách này bắt được cả PAC/registry mà không cần đọc registry).
    /// </summary>
    private static (bool Enabled, string? Server) ReadSystemProxy()
    {
        try
        {
            var proxy = HttpClient.DefaultProxy;
            if (proxy is null)
            {
                return (false, null);
            }

            var probe = proxy.GetProxy(new Uri("https://api.meetflowai.site/"));
            if (probe is null || probe == new Uri("https://api.meetflowai.site/"))
            {
                return (false, null);
            }

            // Proxy trỏ về chính máy (127.0.0.1:7890…) là Clash Verge/v2rayN kiểu phổ biến.
            return (true, probe.IsDefaultPort ? probe.Host : $"{probe.Host}:{probe.Port}");
        }
        catch (Exception)
        {
            return (false, null);
        }
    }
}
