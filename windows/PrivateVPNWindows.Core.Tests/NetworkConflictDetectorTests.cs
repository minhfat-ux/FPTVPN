using PrivateVPNWindows.Core.Tunnel;

namespace PrivateVPNWindows.Core.Tests;

/// <summary>
/// Test phát hiện xung đột mạng (Clash Verge/Mihomo TUN, proxy hệ thống) — nguyên nhân
/// "connecting mãi" và "không đăng nhập được / không nhận OTP" của người dùng Windows.
/// </summary>
public class NetworkConflictDetectorTests
{
    [Theory]
    [InlineData("Clash Verge", "", false, true)]
    [InlineData("", "Mihomo TUN", false, true)]
    [InlineData("Ethernet", "Intel(R) Ethernet Connection", false, false)]
    [InlineData("Wi-Fi", "Realtek 8822CE Wireless LAN", false, false)]
    [InlineData("v2rayN", "", false, true)]
    [InlineData("", "sing-box tunnel", false, true)]
    [InlineData("Tunnel", "Some unrelated NIC", true, true)]
    public void IsForeignVirtualAdapter_nhan_dien_dung(string name, string desc, bool tunnel, bool expected)
    {
        Assert.Equal(expected, NetworkConflictDetector.IsForeignVirtualAdapter(name, desc, tunnel));
    }

    [Theory]
    [InlineData("VPNFlow", "VPNFlow Wintun Tunnel", true)]
    [InlineData("vpnflow-tun", "", true)]
    [InlineData("PrivateVPN Tunnel", "", true)]
    public void IsForeignVirtualAdapter_bo_qua_adapter_cua_chinh_minh(string name, string desc, bool tunnel)
    {
        Assert.False(NetworkConflictDetector.IsForeignVirtualAdapter(name, desc, tunnel));
    }

    [Theory]
    [InlineData("clash-verge.exe", true)]
    [InlineData("verge-mihomo", true)]
    [InlineData("mihomo.exe", true)]
    [InlineData("v2rayN.EXE", true)]
    [InlineData("sing-box.exe", true)]
    [InlineData("Hysteria.exe", true)]
    [InlineData("chrome.exe", false)]
    [InlineData("PrivateVPNWindows.App.exe", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsKnownProxyProcess_dung_danh_sach(string? name, bool expected)
    {
        Assert.Equal(expected, NetworkConflictDetector.IsKnownProxyProcess(name));
    }

    [Fact]
    public void Analyze_bao_BLOCKING_khi_TUN_khac_giu_default_route()
    {
        var inputs = new NetworkConflictInputs(
            new[]
            {
                new AdapterInfo("Ethernet", "Intel Ethernet", false, false, "192.168.1.1"),
                new AdapterInfo("Clash Verge", "Mihomo TUN", true, true, "198.18.0.1"),
            },
            Array.Empty<string>(),
            false,
            null);

        var conflicts = NetworkConflictDetector.Analyze(inputs);

        var blocking = Assert.Single(conflicts);
        Assert.Equal(NetworkConflictSeverity.Blocking, blocking.Severity);
        Assert.Contains("Clash Verge", blocking.Detail);
        Assert.Contains("PROCESS-NAME,PrivateVPNWindows.App.exe,DIRECT", blocking.Advice);
        Assert.Contains("fake-ip-filter", blocking.Advice);
    }

    [Fact]
    public void Analyze_bao_WARNING_khi_bat_proxy_he_thong()
    {
        var inputs = new NetworkConflictInputs(
            new[] { new AdapterInfo("Ethernet", "Intel Ethernet", false, true, "192.168.1.1") },
            Array.Empty<string>(),
            true,
            "127.0.0.1:7890");

        var conflicts = NetworkConflictDetector.Analyze(inputs);

        var warning = Assert.Single(conflicts);
        Assert.Equal(NetworkConflictSeverity.Warning, warning.Severity);
        Assert.Contains("127.0.0.1:7890", warning.Detail);
        Assert.Contains("OTP", warning.Detail);
    }

    [Fact]
    public void Analyze_bao_WARNING_khi_co_tien_trinh_proxy_nhung_khong_doi_default_route()
    {
        var inputs = new NetworkConflictInputs(
            new[] { new AdapterInfo("Ethernet", "Intel Ethernet", false, true, "192.168.1.1") },
            new[] { "clash-verge.exe", "chrome.exe", "mihomo.exe" },
            false,
            null);

        var conflicts = NetworkConflictDetector.Analyze(inputs);

        var warning = Assert.Single(conflicts);
        Assert.Equal(NetworkConflictSeverity.Warning, warning.Severity);
        Assert.Contains("clash-verge.exe", warning.Detail);
        Assert.Contains("mihomo.exe", warning.Detail);
        Assert.DoesNotContain("chrome.exe", warning.Detail);
    }

    [Fact]
    public void Analyze_khong_bao_gi_khi_he_thong_sach()
    {
        var inputs = new NetworkConflictInputs(
            new[]
            {
                new AdapterInfo("Ethernet", "Intel Ethernet", false, true, "192.168.1.1"),
                new AdapterInfo("Wi-Fi", "Realtek Wireless", false, false, null),
            },
            new[] { "chrome.exe", "explorer.exe" },
            false,
            null);

        Assert.Empty(NetworkConflictDetector.Analyze(inputs));
    }

    [Fact]
    public void Analyze_khong_tinh_adapter_VPNFlow_la_xung_dot()
    {
        var inputs = new NetworkConflictInputs(
            new[]
            {
                new AdapterInfo("Ethernet", "Intel Ethernet", false, false, "192.168.1.1"),
                new AdapterInfo("VPNFlow", "VPNFlow Wintun Tunnel", true, true, "0.0.0.0"),
            },
            new[] { "PrivateVPNWindows.App.exe" },
            false,
            null);

        Assert.Empty(NetworkConflictDetector.Analyze(inputs));
    }

    [Fact]
    public void Analyze_khi_da_co_BLOCKING_thi_tien_trinh_chi_con_Info()
    {
        var inputs = new NetworkConflictInputs(
            new[] { new AdapterInfo("Clash Verge", "Mihomo TUN", true, true, "198.18.0.1") },
            new[] { "clash-verge.exe" },
            false,
            null);

        var conflicts = NetworkConflictDetector.Analyze(inputs);

        Assert.Equal(2, conflicts.Count);
        Assert.Equal(NetworkConflictSeverity.Blocking, conflicts[0].Severity);
        Assert.Equal(NetworkConflictSeverity.Info, conflicts[1].Severity);
    }
}
