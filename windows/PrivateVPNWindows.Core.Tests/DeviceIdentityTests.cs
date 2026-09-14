using VpnFlow.Core.Auth;
using VpnFlow.Core.Crypto;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra danh tính thiết bị ổn định (device.json): id giữ nguyên, khoá xoay được,
/// tên đăng ký đúng quy ước `windows-<8>`.
/// </summary>
public class DeviceIdentityTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "vpnflow-device-" + Guid.NewGuid().ToString("N"));
    private readonly string _file;

    public DeviceIdentityTests()
    {
        Directory.CreateDirectory(_dir);
        _file = Path.Combine(_dir, "device.json");
    }

    [Fact]
    public void LoadOrCreate_PersistsDeviceIdAndKeyPair()
    {
        var first = DeviceIdentity.LoadOrCreate(_file);
        Assert.True(File.Exists(_file));
        Assert.True(Guid.TryParse(first.DeviceId, out _));

        var second = DeviceIdentity.LoadOrCreate(_file);
        Assert.Equal(first.DeviceId, second.DeviceId);
        Assert.Equal(first.PublicKeyBase64, second.PublicKeyBase64);
    }

    [Fact]
    public void RegistrationName_FollowsWindowsConvention()
    {
        var identity = DeviceIdentity.LoadOrCreate(_file);

        var name = identity.RegistrationName();

        Assert.StartsWith("windows-", name);
        Assert.Equal("windows-".Length + 8, name.Length);
        Assert.Equal(name, name.ToLowerInvariant());
    }

    [Fact]
    public void RotateKeyPair_ChangesKeyButKeepsDeviceId()
    {
        var identity = DeviceIdentity.LoadOrCreate(_file);
        var deviceId = identity.DeviceId;
        var oldPublic = identity.PublicKeyBase64;

        identity.RotateKeyPair();

        Assert.NotEqual(oldPublic, identity.PublicKeyBase64);
        Assert.Equal(deviceId, identity.DeviceId);
        Assert.Equal(identity.PublicKeyBase64, DeviceIdentity.LoadOrCreate(_file).PublicKeyBase64);
    }

    [Fact]
    public void PublicKey_MatchesRecomputedFromPrivateKey()
    {
        var identity = DeviceIdentity.LoadOrCreate(_file);

        var recomputed = WireGuardKeyPair.ComputePublicKey(
            Convert.FromBase64String(identity.PrivateKeyBase64));

        Assert.Equal(identity.PublicKeyBase64, Convert.ToBase64String(recomputed));
    }

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, true);
    }
}
