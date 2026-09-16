using VpnFlow.Core.Tunnel;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra phần sinh/parse lệnh cấu hình mạng Windows — đặc biệt route loại trừ IP
/// endpoint, thứ mà thiếu nó thì gói UDP của chính tunnel bị hút vào tunnel và máy mất mạng.
/// </summary>
public class WireGuardWindowsCommandsTests
{
    [Theory]
    [InlineData("10.193.44.1|Wi-Fi", "10.193.44.1", "Wi-Fi")]
    [InlineData("  10.193.44.1|Wi-Fi  \r\n", "10.193.44.1", "Wi-Fi")]
    [InlineData("\r\n192.168.1.1|Ethernet\r\n", "192.168.1.1", "Ethernet")]
    [InlineData("172.16.0.1|Local Area Connection", "172.16.0.1", "Local Area Connection")]
    public void ParseDefaultRouteOutput_DocDungGatewayVaInterface(string stdout, string gateway, string @interface)
    {
        var parsed = WireGuardWindowsCommands.ParseDefaultRouteOutput(stdout);

        Assert.NotNull(parsed);
        Assert.Equal(gateway, parsed!.Value.Gateway);
        Assert.Equal(@interface, parsed.Value.Interface);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("khong-co-dau-pipe")]
    [InlineData("|Wi-Fi")]
    [InlineData("10.193.44.1|")]
    public void ParseDefaultRouteOutput_TraNullKhiKhongDocDuoc(string stdout)
    {
        Assert.Null(WireGuardWindowsCommands.ParseDefaultRouteOutput(stdout));
    }

    [Fact]
    public void AddEndpointRoute_DungDuongDiGatewayVatLy()
    {
        var command = WireGuardWindowsCommands.AddEndpointRoute("Wi-Fi", "10.193.44.1", "165.101.114.162");

        Assert.Equal("netsh.exe", command.FileName);
        Assert.Contains("prefix=165.101.114.162/32", command.Arguments);
        Assert.Contains("interface=\"Wi-Fi\"", command.Arguments);
        Assert.Contains("nexthop=10.193.44.1", command.Arguments);
    }

    [Fact]
    public void DeleteEndpointRoute_KhopVoiLucThem()
    {
        var command = WireGuardWindowsCommands.DeleteEndpointRoute("Wi-Fi", "10.193.44.1", "165.101.114.162");

        Assert.Equal("netsh.exe", command.FileName);
        Assert.Contains("delete route", command.Arguments);
        Assert.Contains("prefix=165.101.114.162/32", command.Arguments);
        Assert.Contains("nexthop=10.193.44.1", command.Arguments);
    }

    [Fact]
    public void SplitAllowedIps_DefaultRouteThanhHaiNua()
    {
        var prefixes = WireGuardWindowsCommands.SplitAllowedIps(new[] { "0.0.0.0/0" }).ToList();

        Assert.Contains(WireGuardWindowsCommands.DefaultRouteLowHalf, prefixes);
        Assert.Contains(WireGuardWindowsCommands.DefaultRouteHighHalf, prefixes);
    }

    [Fact]
    public void BuildIpv6BlockAdds_PhuToanBoIPv6QuaTunnel()
    {
        var commands = WireGuardWindowsCommands.BuildIpv6BlockAdds("vpnflow");

        Assert.Equal(2, commands.Count);
        Assert.All(commands, command => Assert.Equal("netsh.exe", command.FileName));

        Assert.Contains("prefix=::/1", commands[0].Arguments);
        Assert.Contains("prefix=8000::/1", commands[1].Arguments);
        Assert.All(commands, command =>
        {
            Assert.Contains("interface=\"vpnflow\"", command.Arguments);
            Assert.Contains("nexthop=::", command.Arguments);
            Assert.Contains("store=active", command.Arguments);
        });
    }

    [Fact]
    public void BuildIpv6BlockDeletes_KhopVoiLucThem()
    {
        var commands = WireGuardWindowsCommands.BuildIpv6BlockDeletes("vpnflow");

        Assert.Equal(2, commands.Count);
        Assert.Contains("delete route", commands[0].Arguments);
        Assert.Contains("prefix=::/1", commands[0].Arguments);
        Assert.Contains("prefix=8000::/1", commands[1].Arguments);
    }
}
