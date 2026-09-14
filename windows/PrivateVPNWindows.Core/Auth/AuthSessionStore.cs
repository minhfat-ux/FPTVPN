using System.Text.Json;
using VpnFlow.Core.Api;

namespace VpnFlow.Core.Auth;

/// <summary>
/// Đường dẫn lưu trữ cục bộ của app. Trên Windows
/// <see cref="Environment.SpecialFolder.ApplicationData"/> chính là %APPDATA%
/// (Roaming) — đúng yêu cầu "%APPDATA%\VPNFlow". Trên macOS trỏ về thư mục
/// Application Support để project vẫn build/chạy được khi dev trên Mac.
/// </summary>
internal static class AppStorage
{
    public static string RootDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "VPNFlow");

    public static string SessionFilePath => Path.Combine(RootDirectory, "session.json");

    public static string DeviceFilePath => Path.Combine(RootDirectory, "device.json");

    public static void EnsureDirectory() => Directory.CreateDirectory(RootDirectory);
}

/// <summary>
/// Lưu phiên đăng nhập coordinator (token/email) vào
/// %APPDATA%\VPNFlow\session.json. Không dùng Keychain/DPAPI (theo yêu cầu task).
///
/// Bám sát `AuthSessionStore` — mac/PrivateVPNMac/AuthSessionStoreMac.swift:7-92
/// (chỉ đổi chỗ lưu: file JSON thay cho Keychain). Không bao giờ log token.
/// </summary>
public sealed class AuthSessionStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly object _gate = new();
    private readonly string _filePath;

    public CoordinatorAuthSession? Session { get; private set; }
    public string? LastError { get; private set; }

    public string? AccessToken => Session?.AccessToken;
    public bool IsSignedIn => !string.IsNullOrEmpty(AccessToken);

    public AuthSessionStore(string? filePath = null)
    {
        _filePath = filePath ?? AppStorage.SessionFilePath;
        Session = Load();
    }

    /// <summary>Lưu phiên và ghi xuống đĩa.</summary>
    public void Save(CoordinatorAuthSession session)
    {
        lock (_gate)
        {
            try
            {
                AppStorage.EnsureDirectory();
                File.WriteAllText(_filePath, JsonSerializer.Serialize(session, JsonOptions));
                Session = session;
                LastError = null;
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
            }
        }
    }

    /// <summary>Đăng xuất: xoá file phiên và bỏ session trong bộ nhớ.</summary>
    public void SignOut()
    {
        lock (_gate)
        {
            try
            {
                if (File.Exists(_filePath)) File.Delete(_filePath);
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
            }

            Session = null;
        }
    }

    private CoordinatorAuthSession? Load()
    {
        try
        {
            if (!File.Exists(_filePath)) return null;
            var raw = File.ReadAllText(_filePath);
            return JsonSerializer.Deserialize<CoordinatorAuthSession>(raw, JsonOptions);
        }
        catch
        {
            return null;
        }
    }
}
