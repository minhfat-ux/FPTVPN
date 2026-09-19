using System.ComponentModel;
using VpnFlow.Core.Tunnel;
using Xunit;

namespace PrivateVPNWindows.Core.Tests;

/// <summary>
/// Kiểm tra lớp phát hiện Application Control chặn binary (Smart App Control).
///
/// Vì sao có: máy khách bật Smart App Control (policy <c>VerifiedAndReputableDesktop</c>) chặn
/// binary chưa ký mà Microsoft chưa có "uy tín" — đo thật 19/09: <c>sing-box.exe</c> bị chặn
/// ("An Application Control policy has blocked this file", status 0xc0e90002) trong khi binary
/// của mình và mọi DLL chưa ký vẫn chạy. App phải nhận ra và báo rõ, không thử lại vô ích.
/// </summary>
public class ApplicationControlGuardTests
{
    private const string BlockMessage = "An Application Control policy has blocked this file";

    [Fact]
    public void IsBlocked_TrueForPolicyMessage()
    {
        ApplicationControlGuard.Reset();
        var ex = new Win32Exception(1260, BlockMessage);
        Assert.True(ApplicationControlGuard.IsBlocked(ex));
    }

    [Fact]
    public void IsBlocked_TrueWhenBlockIsInnerException()
    {
        ApplicationControlGuard.Reset();
        var inner = new Win32Exception(1260, BlockMessage);
        var outer = new InvalidOperationException("Không chạy được sing-box.exe", inner);
        Assert.True(ApplicationControlGuard.IsBlocked(outer));
    }

    [Fact]
    public void IsBlocked_FalseForUnrelatedErrors()
    {
        ApplicationControlGuard.Reset();
        Assert.False(ApplicationControlGuard.IsBlocked(new FileNotFoundException("thiếu file")));
        Assert.False(ApplicationControlGuard.IsBlocked(null));
    }

    [Fact]
    public void MarkBlocked_RemembersAndExplainsInVietnamese()
    {
        ApplicationControlGuard.Reset();
        Assert.False(ApplicationControlGuard.RelayBlocked);

        ApplicationControlGuard.MarkBlocked("sing-box.exe");

        Assert.True(ApplicationControlGuard.RelayBlocked);
        Assert.Equal("sing-box.exe", ApplicationControlGuard.BlockedBinary);
        var message = ApplicationControlGuard.UserMessage();
        Assert.Contains("sing-box.exe", message);
        Assert.Contains("Smart App Control", message);
        Assert.Contains("WireGuard", message);

        ApplicationControlGuard.Reset();
        Assert.False(ApplicationControlGuard.RelayBlocked);
    }
}
