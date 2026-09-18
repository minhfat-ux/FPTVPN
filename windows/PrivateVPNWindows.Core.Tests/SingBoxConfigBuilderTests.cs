using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using VpnFlow.Core.Tunnel;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra phần THUẦN của đường "hysteria2 bọc trong WebSocket + sing-box":
/// cấu hình sinh ra cho hai tiến trình con phải đúng schema mà chúng thật sự đọc
/// (<c>tools/hysteria-relay/runner.go</c> và sing-box v1.14), và cổng phải được cấp động.
///
/// Phần KHÔNG kiểm được ở đây (cần máy Windows thật): sing-box có dựng được TUN/route
/// không, relay có bắt tay được không — xem <c>windows/installer/verify-relay.ps1</c>.
/// </summary>
public class SingBoxConfigBuilderTests
{
    private const int SocksPort = 21081;
    private const int ClashPort = 21082;

    [Fact]
    public void BuildSingBoxConfig_hop_le_va_outbound_socks_tro_dung_cong_relay()
    {
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, "/tmp/sing-box.log", ClashPort);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var outbounds = root.GetProperty("outbounds");
        var socks = outbounds[0];
        Assert.Equal("socks", socks.GetProperty("type").GetString());
        Assert.Equal(SingBoxConfigBuilder.RelayOutboundTag, socks.GetProperty("tag").GetString());
        Assert.Equal("127.0.0.1", socks.GetProperty("server").GetString());
        Assert.Equal(SocksPort, socks.GetProperty("server_port").GetInt32());
        Assert.Equal("5", socks.GetProperty("version").GetString());

        // Đường ra cuối cùng PHẢI là outbound qua relay: đây là điều quyết định traffic có
        // thật sự đi qua WebSocket relay hay không.
        Assert.Equal(SingBoxConfigBuilder.RelayOutboundTag, root.GetProperty("route").GetProperty("final").GetString());
        Assert.Equal(SingBoxConfigBuilder.DirectOutboundTag, outbounds[1].GetProperty("tag").GetString());
    }

    [Fact]
    public void BuildSingBoxConfig_bat_tun_voi_auto_route_va_strict_route()
    {
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, "C:\\log.txt", ClashPort);

        using var doc = JsonDocument.Parse(json);
        var tun = doc.RootElement.GetProperty("inbounds")[0];

        Assert.Equal("tun", tun.GetProperty("type").GetString());
        Assert.Equal(SingBoxConfigBuilder.TunInboundTag, tun.GetProperty("tag").GetString());
        // Không có auto_route thì TUN dựng lên mà mọi gói vẫn đi đường vật lý (tunnel "chết im lặng").
        Assert.True(tun.GetProperty("auto_route").GetBoolean());
        Assert.True(tun.GetProperty("strict_route").GetBoolean());
        Assert.Equal(SingBoxConfigBuilder.TunAddress, tun.GetProperty("address")[0].GetString());
        Assert.Equal(SingBoxConfigBuilder.TunMtu, tun.GetProperty("mtu").GetInt32());
        Assert.Equal(SingBoxConfigBuilder.TunStack, tun.GetProperty("stack").GetString());
    }

    [Fact]
    public void BuildSingBoxConfig_co_rule_lan_di_truc_tiep_va_hijack_dns()
    {
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, "/tmp/sing-box.log", ClashPort);

        using var doc = JsonDocument.Parse(json);
        var rules = doc.RootElement.GetProperty("route").GetProperty("rules");

        // Dải nội bộ (máy in/NAS) không được chui vào tunnel; DNS phải bị hijack để không rò rỉ.
        var privateRule = rules.EnumerateArray()
            .Single(r => r.TryGetProperty("ip_is_private", out var flag) && flag.GetBoolean());
        Assert.Equal(SingBoxConfigBuilder.DirectOutboundTag, privateRule.GetProperty("outbound").GetString());

        Assert.Contains(
            rules.EnumerateArray(),
            r => r.TryGetProperty("protocol", out var p) && p.GetString() == "dns"
                 && r.TryGetProperty("action", out var a) && a.GetString() == "hijack-dns");
    }

    [Fact]
    public void BuildSingBoxConfig_ghi_dung_cong_clash_va_duong_dan_log()
    {
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, @"C:\Users\a\sing-box.log", ClashPort);

        using var doc = JsonDocument.Parse(json);
        Assert.Equal(
            $"127.0.0.1:{ClashPort}",
            doc.RootElement.GetProperty("experimental").GetProperty("clash_api")
                .GetProperty("external_controller").GetString());
        Assert.Equal(
            @"C:\Users\a\sing-box.log",
            doc.RootElement.GetProperty("log").GetProperty("output").GetString());
    }

    [Fact]
    public void BuildSingBoxConfig_tu_choi_cong_khong_hop_le()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => SingBoxConfigBuilder.BuildSingBoxConfig(0, "/tmp/log.txt", ClashPort));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, "/tmp/log.txt", -1));
        Assert.Throws<ArgumentException>(
            () => SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, " ", ClashPort));
    }

    [Fact]
    public void BuildRelayConfig_dung_schema_cua_runner_go()
    {
        var json = SingBoxConfigBuilder.BuildRelayConfig(
            "165.101.114.162:8443",
            HysteriaRelayDefaults.RelayUrl,
            SocksPort);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("165.101.114.162:8443", root.GetProperty("server").GetString());
        Assert.Equal($"{HysteriaRelayDefaults.Password}", root.GetProperty("password").GetString());
        Assert.Equal($"{HysteriaRelayDefaults.Obfs}", root.GetProperty("obfs").GetString());
        Assert.True(root.GetProperty("insecure").GetBoolean());
        Assert.Equal(HysteriaRelayDefaults.UpKbps, root.GetProperty("upKbps").GetInt32());
        Assert.Equal(HysteriaRelayDefaults.DownKbps, root.GetProperty("downKbps").GetInt32());
        Assert.Equal(HysteriaRelayDefaults.DialTimeoutSec, root.GetProperty("dialTimeoutSec").GetInt32());

        // transport.type PHẢI là wsrelay: runner.go chỉ đi qua Cloudflare với transport này,
        // còn "udp" (mặc định) sẽ bị chặn thẳng ở mạng đang chặn IP node.
        var transport = root.GetProperty("transport");
        Assert.Equal("wsrelay", transport.GetProperty("type").GetString());
        Assert.Equal(HysteriaRelayDefaults.RelayUrl, transport.GetProperty("url").GetString());
        Assert.Equal(HysteriaRelayDefaults.RelayHost, transport.GetProperty("host").GetString());

        Assert.Equal($"127.0.0.1:{SocksPort}", root.GetProperty("socks5").GetProperty("listen").GetString());
    }

    [Fact]
    public void BuildRelayConfig_host_lay_tu_url_khi_khong_truyen_ro()
    {
        var json = SingBoxConfigBuilder.BuildRelayConfig(
            "103.173.155.50:8443",
            "wss://relay.example.com/relay/vn1hy",
            SocksPort);

        using var doc = JsonDocument.Parse(json);
        Assert.Equal(
            "relay.example.com",
            doc.RootElement.GetProperty("transport").GetProperty("host").GetString());
    }

    [Fact]
    public void BuildRelayConfig_tu_choi_tham_so_rong()
    {
        Assert.Throws<ArgumentException>(
            () => SingBoxConfigBuilder.BuildRelayConfig(" ", HysteriaRelayDefaults.RelayUrl, SocksPort));
        Assert.Throws<ArgumentException>(
            () => SingBoxConfigBuilder.BuildRelayConfig("165.101.114.162:8443", " ", SocksPort));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => SingBoxConfigBuilder.BuildRelayConfig("165.101.114.162:8443", HysteriaRelayDefaults.RelayUrl, 0));
    }

    [Fact]
    public void AllocateFreePorts_tra_ve_cong_khac_nhau_va_con_trong()
    {
        var ports = SingBoxConfigBuilder.AllocateFreePorts(2);

        Assert.Equal(2, ports.Count);
        Assert.All(ports, p => Assert.InRange(p, 1, 65535));
        // Cấp cùng lúc 2 cổng: kernel có thể tái dùng ngay cổng vừa đóng nên phải khác nhau.
        Assert.NotEqual(ports[0], ports[1]);

        // Cổng trả về phải THẬT SỰ còn trống (nếu không, flowvpnrelay/sing-box sẽ không bind được).
        foreach (var port in ports)
        {
            var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            listener.Stop();
        }
    }

    [Fact]
    public void AllocateFreePort_tu_choi_so_luong_khong_hop_le()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => SingBoxConfigBuilder.AllocateFreePorts(0));
    }

    [Fact]
    public void HysteriaRelayDefaults_khop_gia_tri_dang_dung()
    {
        // Relay mặc định = exit node-2 (đo nhanh hơn node-1); dự phòng = node-1.
        Assert.Equal("wss://api.meetflowai.site/relay/vn2hy", HysteriaRelayDefaults.RelayUrl);
        Assert.Contains("wss://api.meetflowai.site/relay/vn1hy", HysteriaRelayDefaults.FallbackRelayUrls);
        Assert.Equal("165.101.114.162:8443", HysteriaRelayDefaults.DefaultServer);
        Assert.Equal(8443, HysteriaRelayDefaults.ServerPort);
    }
}
