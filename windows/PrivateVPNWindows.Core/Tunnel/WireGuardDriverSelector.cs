using System.Runtime.InteropServices;

namespace VpnFlow.Core.Tunnel;

/// <summary>Loại driver WireGuard sẽ dùng trên Windows.</summary>
public enum WireGuardDriverKind
{
    /// <summary>Userspace: wireguard-go.exe + wintun.dll nhúng trong app (không cần cài gì).</summary>
    Wintun,

    /// <summary>Dự phòng: gọi wireguard.exe bên ngoài (người dùng đã cài WireGuard for Windows).</summary>
    External,
}

/// <summary>
/// Quy tắc chọn driver, để tầng App không phải tự biết asset nào có mặt.
///
/// QUY TẮC: nếu trong thư mục asset (mặc định = thư mục file exe) có ĐỦ cả
/// <c>wintun.dll</c> và <c>wireguard-go.exe</c> → dùng <see cref="WintunWireGuardDriver"/>
/// (không cần cài WireGuard for Windows). Ngược lại → lùi về
/// <see cref="WireGuardWindowsDriver"/> (gọi wireguard.exe bên ngoài) để bản build
/// thiếu asset vẫn chạy được.
///
/// Trên macOS, <see cref="Create"/> vẫn trả driver bình thường; mọi lời gọi
/// Install/Uninstall sẽ ném <see cref="PlatformNotSupportedException"/> (fail mềm)
/// để smoke-test UI.
/// </summary>
public static class WireGuardDriverSelector
{
    public const string WintunDllName = "wintun.dll";
    public const string WireGuardGoExeName = "wireguard-go.exe";

    public static string DefaultAssetDirectory => AppContext.BaseDirectory;

    public static bool HasBundledWintunAssets(string assetDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(assetDirectory);
        return File.Exists(Path.Combine(assetDirectory, WintunDllName))
               && File.Exists(Path.Combine(assetDirectory, WireGuardGoExeName));
    }

    public static WireGuardDriverKind SelectKind(string assetDirectory)
        => HasBundledWintunAssets(assetDirectory) ? WireGuardDriverKind.Wintun : WireGuardDriverKind.External;

    public static IWireGuardDriver Create(string? assetDirectory = null, ITunnelLogger? log = null)
    {
        var directory = string.IsNullOrWhiteSpace(assetDirectory) ? DefaultAssetDirectory : assetDirectory;
        return SelectKind(directory) == WireGuardDriverKind.Wintun
            ? new WintunWireGuardDriver(directory, log: log)
            : new WireGuardWindowsDriver();
    }

    /// <summary>True khi nền tảng hiện tại là Windows (cả 2 driver đều cần Windows).</summary>
    public static bool IsWindows => RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
}
