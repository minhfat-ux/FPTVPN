namespace VpnFlow.Core.Tunnel;

/// <summary>Trạng thái service tunnel WireGuard trên Windows.</summary>
public enum WireGuardTunnelState
{
    /// <summary>Không tra được (chưa cài wireguard.exe hoặc không phải Windows).</summary>
    Unknown,
    /// <summary>Service <c>WireGuardTunnel$&lt;name&gt;</c> chưa tồn tại.</summary>
    NotInstalled,
    /// <summary>Service tồn tại nhưng đang dừng.</summary>
    Stopped,
    /// <summary>Service đang chạy.</summary>
    Running,
}

/// <summary>
/// Cài/gỡ/kiểm tra tunnel WireGuard trên Windows qua <c>wireguard.exe</c>.
/// Không hard-code đường dẫn máy: driver tự dò wireguard.exe (xem
/// <see cref="WireGuardWindowsDriver.ResolveExecutable"/>).
/// </summary>
public interface IWireGuardDriver
{
    /// <summary>True khi nền tảng hiện tại là Windows và driver có thể chạy.</summary>
    bool IsSupported { get; }

    /// <summary>Dò wireguard.exe; trả null nếu không tìm thấy.</summary>
    string? ResolveExecutable();

    /// <summary>
    /// Cài tunnel từ file <c>.conf</c>: <c>wireguard.exe /installtunnelservice &lt;conf&gt;</c>.
    /// Tên tunnel lấy theo tên file conf (không có phần mở rộng) — đây là quy ước của
    /// wireguard.exe, nên <paramref name="confPath"/> phải là <c>&lt;tunnelName&gt;.conf</c>.
    /// </summary>
    Task InstallAsync(string tunnelName, string confPath, CancellationToken cancellationToken = default);

    /// <summary>Gỡ tunnel: <c>wireguard.exe /uninstalltunnelservice &lt;name&gt;</c>.</summary>
    Task UninstallAsync(string tunnelName, CancellationToken cancellationToken = default);

    /// <summary>Kiểm tra service <c>WireGuardTunnel$&lt;name&gt;</c> đang chạy hay không.</summary>
    Task<WireGuardTunnelState> GetStateAsync(string tunnelName, CancellationToken cancellationToken = default);
}

/// <summary>Lỗi khi điều khiển wireguard.exe (không tìm thấy, lệnh trả mã lỗi, …).</summary>
public sealed class WireGuardDriverException : Exception
{
    public WireGuardDriverException(string message) : base(message)
    {
    }

    public WireGuardDriverException(string message, Exception innerException) : base(message, innerException)
    {
    }
}
