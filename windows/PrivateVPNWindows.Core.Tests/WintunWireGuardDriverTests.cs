using VpnFlow.Core.Tunnel;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra phần THUẦN của driver Wintun userspace — chạy được trên macOS:
/// quy tắc chọn driver, dựng chuỗi UAPI, dựng lệnh route/DNS/interface, chia default
/// route, parse conf, và fail mềm ngoài Windows.
///
/// Phần KHÔNG kiểm được ở đây (cần máy Windows thật): wireguard-go.exe có tạo được
/// adapter Wintun không, UAPI pipe có mở đúng tên không, netsh/powershell có chấp
/// nhận tham số không. Xem mục "chưa kiểm chứng" trong README/báo cáo.
/// </summary>
public class WintunWireGuardDriverTests
{
    private const string ZeroPrivateKeyBase64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    private const string OnesPublicKeyBase64 = "//////////////////////////////////////////8=";

    [Fact]
    public void Selector_UsesWintun_WhenBothBundledAssetsExist()
    {
        using var dir = new TempDirectory();
        File.WriteAllBytes(Path.Combine(dir.Path, WireGuardDriverSelector.WintunDllName), new byte[] { 0 });
        File.WriteAllBytes(Path.Combine(dir.Path, WireGuardDriverSelector.WireGuardGoExeName), new byte[] { 0 });

        Assert.True(WireGuardDriverSelector.HasBundledWintunAssets(dir.Path));
        Assert.Equal(WireGuardDriverKind.Wintun, WireGuardDriverSelector.SelectKind(dir.Path));
        Assert.IsType<WintunWireGuardDriver>(WireGuardDriverSelector.Create(dir.Path));
    }

    [Fact]
    public void Selector_FallsBackToExternal_WhenEitherAssetMissing()
    {
        using var dir = new TempDirectory();
        Assert.False(WireGuardDriverSelector.HasBundledWintunAssets(dir.Path));
        Assert.Equal(WireGuardDriverKind.External, WireGuardDriverSelector.SelectKind(dir.Path));
        Assert.IsType<WireGuardWindowsDriver>(WireGuardDriverSelector.Create(dir.Path));

        // Chỉ có wintun.dll (thiếu wireguard-go.exe) vẫn phải fallback.
        File.WriteAllBytes(Path.Combine(dir.Path, WireGuardDriverSelector.WintunDllName), new byte[] { 0 });
        Assert.Equal(WireGuardDriverKind.External, WireGuardDriverSelector.SelectKind(dir.Path));
    }

    [Fact]
    public void UapiPipeName_MatchesWireguardGoNamedPipePath()
    {
        Assert.Equal(
            @"ProtectedPrefix\Administrators\WireGuard\vpnflow",
            WintunWireGuardDriver.UapiPipeNameFor("vpnflow"));
    }

    [Fact]
    public void Uapi_SetConf_ConvertsKeysToHex_AndTerminatesWithBlankLine()
    {
        var config = SampleConfig();

        var text = WireGuardUapi.BuildSetConf(config);

        var privateHex = Convert.ToHexString(Convert.FromBase64String(ZeroPrivateKeyBase64)).ToLowerInvariant();
        var publicHex = Convert.ToHexString(Convert.FromBase64String(OnesPublicKeyBase64)).ToLowerInvariant();

        Assert.Contains("set=1\n", text);
        Assert.Contains($"private_key={privateHex}\n", text);
        Assert.Contains($"public_key={publicHex}\n", text);
        Assert.Contains("replace_peers=true\n", text);
        Assert.Contains("replace_allowed_ips=true\n", text);
        Assert.Contains("allowed_ip=0.0.0.0/0\n", text);
        Assert.Contains("endpoint=127.0.0.1:51820\n", text);
        Assert.Contains("persistent_keepalive_interval=25\n", text);
        Assert.EndsWith("\n\n", text);

        // Khoá base64 KHÔNG được lọt vào payload UAPI.
        Assert.DoesNotContain(ZeroPrivateKeyBase64, text);
        Assert.DoesNotContain(OnesPublicKeyBase64, text);
    }

    [Fact]
    public void Uapi_KeyBase64ToHex_RejectsWrongLength()
    {
        var sixteenBytes = Convert.ToBase64String(new byte[16]);
        Assert.Throws<WireGuardConfigException>(() => WireGuardUapi.KeyBase64ToHex(sixteenBytes));
    }

    [Theory]
    [InlineData("errno=0\n\n", 0)]
    [InlineData("errno=22\n\n", 22)]
    [InlineData("errno=98", 98)]
    public void Uapi_ParseErrno_ReadsCode(string response, int expected)
    {
        Assert.Equal(expected, WireGuardUapi.ParseErrno(response));
    }

    [Theory]
    [InlineData("")]
    [InlineData("garbage\n\n")]
    [InlineData("errno=abc\n\n")]
    public void Uapi_ParseErrno_ReturnsNull_OnMalformedResponse(string response)
    {
        Assert.Null(WireGuardUapi.ParseErrno(response));
    }

    [Fact]
    public void SplitAllowedIps_SplitsDefaultRouteIntoTwoHalves()
    {
        var split = WireGuardWindowsCommands.SplitAllowedIps(new[] { "0.0.0.0/0" });

        Assert.Equal(
            new[] { "0.0.0.0/1", "128.0.0.0/1" },
            split);
    }

    [Fact]
    public void SplitAllowedIps_PassesThroughSpecificPrefixes_AndDeduplicates()
    {
        var split = WireGuardWindowsCommands.SplitAllowedIps(
            new[] { "0.0.0.0/0", "10.0.0.0/24", "10.0.0.0/24" });

        Assert.Equal(new[] { "0.0.0.0/1", "128.0.0.0/1", "10.0.0.0/24" }, split);
    }

    [Theory]
    [InlineData(0, "0.0.0.0")]
    [InlineData(8, "255.0.0.0")]
    [InlineData(24, "255.255.255.0")]
    [InlineData(32, "255.255.255.255")]
    public void PrefixToMask_ProducesDottedMask(int prefix, string expected)
    {
        Assert.Equal(expected, WireGuardWindowsCommands.PrefixToMask(prefix));
    }

    [Fact]
    public void SetAddress_BuildsNetshCommandWithMask()
    {
        var command = WireGuardWindowsCommands.SetAddress("vpnflow", "10.10.0.2/24");

        Assert.Equal("netsh.exe", command.FileName);
        Assert.Contains("interface ipv4 set address", command.Arguments);
        Assert.Contains("name=\"vpnflow\"", command.Arguments);
        Assert.Contains("addr=10.10.0.2", command.Arguments);
        Assert.Contains("mask=255.255.255.0", command.Arguments);
    }

    [Fact]
    public void SetAddress_RejectsIpv6_ButTreatsBareIpv4AsHostPrefix()
    {
        Assert.Throws<WireGuardConfigException>(() => WireGuardWindowsCommands.SetAddress("vpnflow", "fd00::2/64"));

        // wg-quick cho phép Address không kèm prefix; IPv4 hiểu là /32.
        var bare = WireGuardWindowsCommands.SetAddress("vpnflow", "10.0.0.2");
        Assert.Contains("addr=10.0.0.2", bare.Arguments);
        Assert.Contains("mask=255.255.255.255", bare.Arguments);
    }

    [Fact]
    public void AddRoute_UsesOnLinkNexthop()
    {
        var command = WireGuardWindowsCommands.AddRoute("vpnflow", "0.0.0.0/1");

        Assert.Contains("add route prefix=0.0.0.0/1", command.Arguments);
        Assert.Contains("interface=\"vpnflow\"", command.Arguments);
        Assert.Contains("nexthop=0.0.0.0", command.Arguments);
    }

    [Fact]
    public void BuildInterfaceConfiguration_OrdersEnableAddressMtuRouteDns()
    {
        var commands = WireGuardWindowsCommands.BuildInterfaceConfiguration("vpnflow", SampleConfig());

        Assert.Contains("admin=enable", commands[0].Arguments);

        Assert.Contains(commands, c => c.Arguments.Contains("set address") && c.Arguments.Contains("addr=10.10.0.2"));
        Assert.Contains(commands, c => c.Arguments.Contains("set subinterface") && c.Arguments.Contains("mtu=1420"));
        Assert.Contains(commands, c => c.Arguments.Contains("add route prefix=0.0.0.0/1"));
        Assert.Contains(commands, c => c.Arguments.Contains("add route prefix=128.0.0.0/1"));
        Assert.Contains(commands, c => c.Arguments.Contains("set dnsservers") && c.Arguments.Contains("address=1.1.1.1"));

        // Interface phải được enable trước khi gán address.
        var enableIndex = commands.ToList().FindIndex(c => c.Arguments.Contains("admin=enable"));
        var addressIndex = commands.ToList().FindIndex(c => c.Arguments.Contains("set address"));
        Assert.True(enableIndex < addressIndex);
    }

    [Fact]
    public void BuildRouteDeletes_MirrorRouteAdds()
    {
        var config = SampleConfig();

        var adds = WireGuardWindowsCommands.BuildRouteAdds("vpnflow", config);
        var deletes = WireGuardWindowsCommands.BuildRouteDeletes("vpnflow", config);

        Assert.Equal(adds.Count, deletes.Count);
        Assert.All(deletes, c => Assert.Contains("delete route", c.Arguments));
        Assert.Contains(deletes, c => c.Arguments.Contains("prefix=0.0.0.0/1"));
        Assert.Contains(deletes, c => c.Arguments.Contains("prefix=128.0.0.0/1"));
    }

    [Fact]
    public void RemoveInterface_UsesPowerShellRemoveNetAdapter()
    {
        var command = WireGuardWindowsCommands.RemoveInterface("vpnflow");

        Assert.Equal("powershell.exe", command.FileName);
        Assert.Contains("Remove-NetAdapter", command.Arguments);
        Assert.Contains("'vpnflow'", command.Arguments);
    }

    [Fact]
    public void ConfParser_RoundTripsConfigWrittenByToConfText()
    {
        var original = SampleConfig();

        var parsed = WireGuardConfParser.Parse(original.ToConfText());

        Assert.Equal(original.PrivateKeyBase64, parsed.PrivateKeyBase64);
        Assert.Equal(original.Addresses, parsed.Addresses);
        Assert.Equal(original.DnsServers, parsed.DnsServers);
        Assert.Equal(original.Mtu, parsed.Mtu);
        Assert.Single(parsed.Peers);
        Assert.Equal(original.Peers[0].PublicKeyBase64, parsed.Peers[0].PublicKeyBase64);
        Assert.Equal(original.Peers[0].Endpoint, parsed.Peers[0].Endpoint);
        Assert.Equal(original.Peers[0].AllowedIPs, parsed.Peers[0].AllowedIPs);
        Assert.Equal(original.Peers[0].PersistentKeepAlive, parsed.Peers[0].PersistentKeepAlive);
    }

    [Fact]
    public void ConfParser_NoMtuLine_LeavesMtuNull_AndSplitsCommaSeparatedValues()
    {
        const string conf =
            "[Interface]\n" +
            "PrivateKey = " + ZeroPrivateKeyBase64 + "\n" +
            "Address = 10.10.0.2/24, fd00::2/64\n" +
            "DNS = 1.1.1.1, 8.8.8.8\n" +
            "\n" +
            "[Peer]\n" +
            "PublicKey = " + OnesPublicKeyBase64 + "\n" +
            "AllowedIPs = 0.0.0.0/0\n";

        var parsed = WireGuardConfParser.Parse(conf);

        Assert.Null(parsed.Mtu);
        Assert.Equal(new[] { "10.10.0.2/24", "fd00::2/64" }, parsed.Addresses);
        Assert.Equal(new[] { "1.1.1.1", "8.8.8.8" }, parsed.DnsServers);
    }

    [Fact]
    public async Task InstallAndUninstall_OnNonWindows_FailSoft()
    {
        if (OperatingSystem.IsWindows())
        {
            return; // test này chỉ có nghĩa ngoài Windows.
        }

        using var dir = new TempDirectory();
        var driver = new WintunWireGuardDriver(assetDirectory: dir.Path, workingDirectory: dir.Path);

        Assert.False(driver.IsSupported);
        await Assert.ThrowsAsync<PlatformNotSupportedException>(() => driver.InstallAsync("vpnflow", "/nonexistent.conf"));
        await Assert.ThrowsAsync<PlatformNotSupportedException>(() => driver.UninstallAsync("vpnflow"));
        Assert.Equal(WireGuardTunnelState.Unknown, await driver.GetStateAsync("vpnflow"));
    }

    private static WireGuardConfig SampleConfig()
    {
        return new WireGuardConfig
        {
            Name = "vpnflow",
            PrivateKeyBase64 = ZeroPrivateKeyBase64,
            Addresses = { "10.10.0.2/24" },
            DnsServers = { "1.1.1.1" },
            Mtu = 1420,
            Peers =
            {
                new WireGuardConfig.WireGuardPeer
                {
                    PublicKeyBase64 = OnesPublicKeyBase64,
                    Endpoint = "127.0.0.1:51820",
                    AllowedIPs = { "0.0.0.0/0" },
                    PersistentKeepAlive = 25,
                },
            },
        };
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "vpnflow-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (Exception)
            {
                // Best effort.
            }
        }
    }
}
