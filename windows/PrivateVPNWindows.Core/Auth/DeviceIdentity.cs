using System.Text.Json;
using System.Text.Json.Serialization;
using VpnFlow.Core.Crypto;

namespace VpnFlow.Core.Auth;

/// <summary>
/// Danh tính thiết bị ổn định theo bản cài + cặp khoá WireGuard, lưu tại
/// %APPDATA%\VPNFlow\device.json. Chỉ gửi public key lên coordinator; không bao giờ
/// gửi hay log private key.
///
/// Bám sát `DeviceIdentity` — android .../storage/DeviceIdentity.kt:10-59 (stable
/// device id + keypair, rotate khi bị revoke) và cách đặt tên của bản mac
/// `VPNManagerMac.stableSuffix/randomRegistrationName` — VPNManagerMac.swift:96-105.
/// Tên đăng ký theo đúng quy ước Windows: `windows-<stable-short-id>`
/// (docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md:113).
/// </summary>
public sealed class DeviceIdentity
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly object _gate = new();
    private readonly string _filePath;

    /// <summary>Mã định danh bản cài (UUID), ổn định qua các lần xoay khoá.</summary>
    public string DeviceId { get; }

    public WireGuardKeyPair KeyPair { get; private set; }

    public string PrivateKeyBase64 => KeyPair.PrivateKeyBase64;
    public string PublicKeyBase64 => KeyPair.PublicKeyBase64;

    private DeviceIdentity(string deviceId, WireGuardKeyPair keyPair, string filePath)
    {
        DeviceId = deviceId;
        KeyPair = keyPair;
        _filePath = filePath;
    }

    /// <summary>Đọc device.json; tạo mới (device id + keypair) nếu chưa có/hỏng.</summary>
    public static DeviceIdentity LoadOrCreate(string? filePath = null)
    {
        var path = filePath ?? AppStorage.DeviceFilePath;

        DeviceFile? stored = null;
        try
        {
            if (File.Exists(path))
            {
                stored = JsonSerializer.Deserialize<DeviceFile>(File.ReadAllText(path), JsonOptions);
            }
        }
        catch
        {
            stored = null;
        }

        var deviceId = string.IsNullOrWhiteSpace(stored?.DeviceId)
            ? Guid.NewGuid().ToString()
            : stored!.DeviceId!;

        WireGuardKeyPair keyPair;
        try
        {
            keyPair = string.IsNullOrWhiteSpace(stored?.PrivateKey)
                ? WireGuardKeyPair.Generate()
                : WireGuardKeyPair.FromPrivateKeyBase64(stored!.PrivateKey!);
        }
        catch
        {
            keyPair = WireGuardKeyPair.Generate();
        }

        var identity = new DeviceIdentity(deviceId, keyPair, path);
        identity.Save();
        return identity;
    }

    /// <summary>
    /// Xoay sang cặp khoá mới (giữ nguyên device id). Dùng khi coordinator coi thiết bị
    /// này là revoked: khoá cũ không thể đăng ký lại nên quay về như thiết bị MỚI.
    /// Tương ứng `DeviceIdentity.rotateKeyPair` — DeviceIdentity.kt:44-48.
    /// </summary>
    public WireGuardKeyPair RotateKeyPair()
    {
        lock (_gate)
        {
            KeyPair = WireGuardKeyPair.Generate();
            Save();
            return KeyPair;
        }
    }

    /// <summary>Tên đăng ký ổn định: `windows-<8 ký tự đầu của public key>`.</summary>
    public string RegistrationName() => "windows-" + StableSuffix(PublicKeyBase64);

    /// <summary>Tên đăng ký ngẫu nhiên khi server từ chối tên trùng.
    /// Tương ứng `VPNManagerMac.randomRegistrationName` — VPNManagerMac.swift:103-105.</summary>
    public static string RandomRegistrationName()
        => "windows-" + Guid.NewGuid().ToString("N")[..8];

    /// <summary>
    /// Hậu tố ổn định từ public key: lowercase, chỉ giữ chữ/số, lấy 8 ký tự đầu.
    /// Tương ứng `VPNManagerMac.stableSuffix` — VPNManagerMac.swift:96-101.
    /// </summary>
    public static string StableSuffix(string publicKey)
    {
        var safe = new string(publicKey
            .ToLowerInvariant()
            .Where(char.IsLetterOrDigit)
            .ToArray());
        return safe.Length <= 8 ? safe : safe[..8];
    }

    private void Save()
    {
        lock (_gate)
        {
            AppStorage.EnsureDirectory();
            var payload = new DeviceFile
            {
                DeviceId = DeviceId,
                PrivateKey = KeyPair.PrivateKeyBase64,
                PublicKey = KeyPair.PublicKeyBase64,
                CreatedAt = DateTimeOffset.UtcNow.ToString("o"),
            };
            File.WriteAllText(_filePath, JsonSerializer.Serialize(payload, JsonOptions));
        }
    }

    /// <summary>Nội dung device.json.</summary>
    private sealed class DeviceFile
    {
        [JsonPropertyName("device_id")] public string? DeviceId { get; set; }
        [JsonPropertyName("wireguard_private_key")] public string? PrivateKey { get; set; }
        [JsonPropertyName("wireguard_public_key")] public string? PublicKey { get; set; }
        [JsonPropertyName("created_at")] public string? CreatedAt { get; set; }
    }
}
