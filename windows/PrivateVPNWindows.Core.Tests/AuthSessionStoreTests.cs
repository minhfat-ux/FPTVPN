using VpnFlow.Core.Api;
using VpnFlow.Core.Auth;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra lưu phiên đăng nhập vào session.json (không dùng Keychain).
/// </summary>
public class AuthSessionStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "vpnflow-session-" + Guid.NewGuid().ToString("N"));
    private readonly string _file;

    public AuthSessionStoreTests()
    {
        Directory.CreateDirectory(_dir);
        _file = Path.Combine(_dir, "session.json");
    }

    [Fact]
    public void Save_ThenReload_PreservesTokenAndTrialFields()
    {
        var store = new AuthSessionStore(_file);
        store.Save(Session());

        var reloaded = new AuthSessionStore(_file);

        Assert.True(reloaded.IsSignedIn);
        Assert.Equal("PVPN-AUTH-test", reloaded.AccessToken);
        Assert.True(reloaded.Session!.User.SubscriptionStatus!.IsTrial);
        Assert.Equal(5, reloaded.Session.User.SubscriptionStatus.TrialHoursLeft);
        Assert.Equal("Trial", reloaded.Session.User.SubscriptionStatus.PlanBadge);
    }

    [Fact]
    public void SignOut_DeletesFileAndClearsSession()
    {
        var store = new AuthSessionStore(_file);
        store.Save(Session());

        store.SignOut();

        Assert.False(store.IsSignedIn);
        Assert.False(File.Exists(_file));
        Assert.False(new AuthSessionStore(_file).IsSignedIn);
    }

    [Fact]
    public void Load_WithCorruptFile_ReturnsSignedOut()
    {
        File.WriteAllText(_file, "{ not json");

        var store = new AuthSessionStore(_file);

        Assert.False(store.IsSignedIn);
    }

    private static CoordinatorAuthSession Session() => new()
    {
        AccessToken = "PVPN-AUTH-test",
        TokenType = "Bearer",
        ExpiresAt = "2026-12-31T00:00:00.000Z",
        User = new CoordinatorUser
        {
            Id = "u1",
            Email = "a@b.c",
            SubscriptionStatus = new CoordinatorSubscriptionStatus
            {
                IsActive = true,
                ProductId = "trial.1day",
                IsTrial = true,
                TrialHoursLeft = 5,
                PlanBadge = "Trial",
            },
        },
    };

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, true);
    }
}
