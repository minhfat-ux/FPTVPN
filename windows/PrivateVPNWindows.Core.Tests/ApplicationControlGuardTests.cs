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

    /// <summary>
    /// Chốt lại YÊU CẦU TỪ KHÁCH (13/10/2026): app Windows báo "sing-box.exe đang phải có chữ ký"
    /// làm khách tưởng app hỏng. Từ 1.4.8 không còn binary bên thứ ba nào, nên thông báo cho khách
    /// KHÔNG được nhắc tên binary bên thứ ba và KHÔNG được nói tới chuyện ký số — chỉ nói app vẫn
    /// chạy được bằng đường nào.
    /// </summary>
    [Fact]
    public void UserMessage_khong_nhac_binary_ben_thu_ba_va_khong_noi_ve_chu_ky()
    {
        ApplicationControlGuard.Reset();
        ApplicationControlGuard.MarkBlocked(HysteriaRelayDefaults.RelayExeName);

        var message = ApplicationControlGuard.UserMessage();

        Assert.DoesNotContain("sing-box", message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("chữ ký", message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ký số", message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("WireGuard", message, StringComparison.Ordinal);
        Assert.Contains(HysteriaRelayDefaults.RelayExeName, message, StringComparison.Ordinal);

        ApplicationControlGuard.Reset();
    }
}
