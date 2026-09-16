using VpnFlow.Core.Api;
using VpnFlow.Core.Auth;

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
        Connection = new VpnConnectionService(Device, Settings);
    }

    /// <summary>Client control-plane (đã có danh sách host dự phòng bên trong).</summary>
    public ControlApiClient Api { get; }

    /// <summary>Phiên đăng nhập email-OTP (%APPDATA%\VPNFlow\session.json).</summary>
    public AuthSessionStore Auth { get; }

    /// <summary>Danh tính bản cài + cặp khoá WireGuard (private key không rời máy).</summary>
    public DeviceIdentity Device { get; }

    /// <summary>Tuỳ chọn cục bộ (transport, node đã chọn…).</summary>
    public AppSettings Settings { get; }

    /// <summary>Phiên kết nối thật: dựng config → chọn transport → cài tunnel.</summary>
    public VpnConnectionService Connection { get; }

    public void Dispose()
    {
        Connection.Dispose();
        Api.Dispose();
    }
}
