using System.Text.Json;
using System.Text.Json.Serialization;

namespace VpnFlow.App.ViewModels;

/// <summary>Đường truyền người dùng chọn trong Settings (bám nhãn UI của bản mac/iOS).</summary>
public enum TransportPreference
{
    /// <summary>Tự động: thử UDP trực tiếp trước, rồi WS relay.</summary>
    Auto,

    /// <summary>WireGuard UDP trực tiếp tới endpoint của node.</summary>
    WireGuardUdp,

    /// <summary>WireGuard-over-WebSocket relay của node.</summary>
    WsRelay,

    /// <summary>Hysteria2 (cần credential ngoài payload node — xem báo cáo).</summary>
    Hysteria,
}

/// <summary>
/// Tuỳ chọn cục bộ của bản Windows, lưu tại %APPDATA%\VPNFlow\windows-settings.json.
/// Tách khỏi Core vì Core đang được worker khác sửa song song (không sửa file ngoài phạm vi).
/// </summary>
public sealed class AppSettings
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly string _filePath;

    public TransportPreference Transport { get; set; } = TransportPreference.Auto;

    /// <summary>Tự kết nối khi mở app (mặc định tắt, giống bản mac không auto).</summary>
    public bool AutoConnectOnLaunch { get; set; }

    /// <summary>Node đã chọn lần trước; khôi phục để picker không reset.</summary>
    public string? SelectedNodeId { get; set; }

    public AppSettings(string? filePath = null)
    {
        _filePath = filePath ?? Path.Combine(SettingsDirectory, "windows-settings.json");
        Load();
    }

    /// <summary>Thư mục dữ liệu app — trùng quy ước %APPDATA%\VPNFlow của Core.</summary>
    public static string SettingsDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "VPNFlow");

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(SettingsDirectory);
            File.WriteAllText(_filePath, JsonSerializer.Serialize(this, JsonOptions));
        }
        catch
        {
            // Không lưu được tuỳ chọn không phải lỗi chí mạng; app vẫn chạy với mặc định.
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_filePath))
            {
                return;
            }

            var stored = JsonSerializer.Deserialize<SettingsFile>(File.ReadAllText(_filePath), JsonOptions);
            if (stored is null)
            {
                return;
            }

            Transport = stored.Transport;
            AutoConnectOnLaunch = stored.AutoConnectOnLaunch;
            SelectedNodeId = stored.SelectedNodeId;
        }
        catch
        {
            // File hỏng: giữ mặc định.
        }
    }

    /// <summary>DTO phẳng để file JSON ổn định qua các phiên bản.</summary>
    private sealed class SettingsFile
    {
        [JsonPropertyName("transport")] public TransportPreference Transport { get; set; } = TransportPreference.Auto;
        [JsonPropertyName("auto_connect_on_launch")] public bool AutoConnectOnLaunch { get; set; }
        [JsonPropertyName("selected_node_id")] public string? SelectedNodeId { get; set; }
    }
}
