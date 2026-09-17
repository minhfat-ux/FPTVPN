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
/// Số liệu runtime THẬT của WireGuard cho một tunnel — dùng để biết tunnel có truyền được
/// dữ liệu hay không, thay vì chỉ tin "service đang Running".
///
/// <see cref="Available"/> = false nghĩa là driver KHÔNG có kênh đọc số liệu (không kết luận
/// được gì). Khi Available = true: <see cref="LastHandshake"/> null = chưa từng handshake
/// (tunnel chắc chắn không truyền được), <see cref="RxBytes"/> = tổng byte đã NHẬN từ peer.
/// </summary>
public readonly record struct WireGuardRuntimeStats(bool Available, DateTimeOffset? LastHandshake, long RxBytes)
{
    /// <summary>Không đọc được số liệu — không được suy ra "khoẻ" cũng không được suy ra "chết".</summary>
    public static readonly WireGuardRuntimeStats Unknown = new(false, null, 0);

    public static WireGuardRuntimeStats Known(DateTimeOffset? lastHandshake, long rxBytes)
        => new(true, lastHandshake, rxBytes);
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

    /// <summary>
    /// Đọc handshake + byte nhận được của peer từ runtime WireGuard (UAPI <c>get=1</c> với
    /// wireguard-go, <c>wg.exe show &lt;name&gt; dump</c> với wireguard.exe đóng sẵn).
    ///
    /// Vì sao cần: trạng thái service "Running" không nói gì về việc gói có đi qua tunnel hay
    /// không — sự cố thật 19:05 cho thấy WireGuard liên tục "Handshake did not complete" mà app
    /// vẫn báo "Đã kết nối" trong khi route full-tunnel đã trỏ vào tunnel chết.
    ///
    /// Trả <see cref="WireGuardRuntimeStats.Unknown"/> khi không đọc được (không phải Windows,
    /// thiếu kênh đọc) — KHÔNG ném exception vì đây là đường đọc chẩn đoán.
    /// </summary>
    Task<WireGuardRuntimeStats> GetRuntimeStatsAsync(string tunnelName, CancellationToken cancellationToken = default);
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
