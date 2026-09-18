using PrivateVPNWindows.Core.Tunnel;
using VpnFlow.App.Services;
using VpnFlow.Core.Api;
using VpnFlow.Core.Auth;
using VpnFlow.Core.Tunnel;

namespace VpnFlow.App.ViewModels;

/// <summary>
/// Gốc ghép phụ thuộc của app Windows: một chỗ duy nhất tạo
/// <see cref="ControlApiClient"/> / <see cref="AuthSessionStore"/> /
/// <see cref="DeviceIdentity"/> / <see cref="AppSettings"/> /
/// <see cref="VpnConnectionService"/> rồi chia sẻ cho các màn hình.
///
/// Vì sao không dùng DI container: môi trường build offline, thêm gói là rủi ro hỏng
/// restore (xem ghi chú ở ObservableObject.cs) — và AGENTS.md §1 cấm thêm dependency.
/// </summary>
public sealed class AppServices : IDisposable
{
    /// <summary>
    /// Instance dùng chung cho cả app. Có nó thì mỗi view vẫn giữ được constructor nhận
    /// <see cref="AppServices"/> (tiện cho test) mà vẫn có constructor rỗng cho Avalonia.
    /// </summary>
    public static AppServices Shared { get; } = new();

    public AppServices()
    {
        Api = new ControlApiClient(ControlApiDefaults.BaseUrl);
        Auth = new AuthSessionStore();
        Device = DeviceIdentity.LoadOrCreate();
        Settings = new AppSettings();
        Logger = new FileTunnelLogger();
        Connection = new VpnConnectionService(Device, Settings, logger: Logger);
        Logger.Info($"app: khởi động (device={Device.DeviceId}, signedIn={Auth.IsSignedIn}, log={Logger.LogPath})");
        // Dựng tunnel Wintun/userspace BẮT BUỘC quyền admin — ghi ngay để lần sau đọc log là
        // biết chắc, thay vì đoán qua thông báo "Access is denied" của wireguard-go.
        Logger.Info(
            $"app: elevated={Environment.IsPrivilegedProcess}, " +
            $"driver={WireGuardDriverSelector.SelectKind(WireGuardDriverSelector.DefaultAssetDirectory)}, " +
            $"assets={WireGuardDriverSelector.DefaultAssetDirectory}, " +
            $"workDir={WintunWireGuardDriver.DefaultWorkingDirectory()}");

        // Phát hiện phần mềm mạng khác đang tranh chấp (Clash Verge/Mihomo TUN, proxy hệ thống…).
        // Clash bật TUN chiếm default route + DNS fake-IP ⇒ VPNFlow không bắt tay được và không
        // gọi được API (không đăng nhập/không nhận OTP), nhưng người dùng chỉ thấy "connecting mãi".
        SystemConflicts = SystemConflictProbe.Detect();
        foreach (var conflict in SystemConflicts)
        {
            Logger.Info($"net-conflict [{conflict.Severity}] {conflict.Title}: {conflict.Detail}");
        }

        if (SystemConflicts.Count == 0)
        {
            Logger.Info("net-conflict: không phát hiện phần mềm mạng nào tranh chấp");
        }
    }

    /// <summary>
    /// Cảnh báo xung đột mạng phát hiện lúc khởi động (rỗng = hệ thống sạch).
    /// Xem <see cref="NetworkConflictDetector"/> để biết vì sao Clash Verge TUN làm hỏng đăng nhập.
    /// </summary>
    public IReadOnlyList<NetworkConflict> SystemConflicts { get; }

    /// <summary>Client control-plane (đã có danh sách host dự phòng bên trong).</summary>
    public ControlApiClient Api { get; }

    /// <summary>Phiên đăng nhập email-OTP (%APPDATA%\VPNFlow\session.json).</summary>
    public AuthSessionStore Auth { get; }

    /// <summary>Danh tính bản cài + cặp khoá WireGuard (private key không rời máy).</summary>
    public DeviceIdentity Device { get; }

    /// <summary>Tuỳ chọn cục bộ (transport, node đã chọn…).</summary>
    public AppSettings Settings { get; }

    /// <summary>Log ra file — WinExe không có console nên đây là kênh chẩn đoán duy nhất.</summary>
    public FileTunnelLogger Logger { get; }

    /// <summary>Phiên kết nối thật: dựng config → chọn transport → cài tunnel.</summary>
    public VpnConnectionService Connection { get; }

    public void Dispose()
    {
        Connection.Dispose();
        Api.Dispose();
    }
}
