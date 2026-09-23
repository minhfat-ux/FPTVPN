using System.Linq;
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
    public void BuildSingBoxConfig_WeChat_va_ten_mien_cn_di_thang()
    {
        // "Vượt qua cho WeChat": traffic tới WeChat/Tencent và tên miền .cn phải đi THẲNG,
        // không vòng qua node ở Việt Nam (đó là lý do WeChat lỗi/chậm khi bật VPN).
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, "/tmp/sing-box.log", ClashPort);

        using var doc = JsonDocument.Parse(json);
        var rules = doc.RootElement.GetProperty("route").GetProperty("rules");

        JsonElement? directRule = null;
        foreach (var rule in rules.EnumerateArray())
        {
            if (!rule.TryGetProperty("domain_suffix", out _)) continue;
            if (rule.TryGetProperty("outbound", out var ob) && ob.GetString() == SingBoxConfigBuilder.DirectOutboundTag)
            {
                directRule = rule;
            }
        }

        Assert.NotNull(directRule);
        var suffixes = directRule!.Value.GetProperty("domain_suffix")
            .EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.Contains("weixin.qq.com", suffixes);
        Assert.Contains("qq.com", suffixes);
        Assert.Contains("cn", suffixes);
        // Rule đi thẳng phải đứng TRƯỚC rule DNS và trước "final" (route cuối = relay).
        Assert.Equal(SingBoxConfigBuilder.RelayOutboundTag,
            doc.RootElement.GetProperty("route").GetProperty("final").GetString());
    }

    [Fact]
    public void BuildSingBoxConfig_nhung_dai_IP_Trung_Quoc_di_thang()
    {
        // Lỗi khách báo 22/09/2026: bật VPN thì app TQ hỏng. Nguyên nhân là đường relay chỉ có rule
        // theo tên miền nên phần lớn app TQ (tên miền .com) đi hết qua tunnel.
        var cidrs = new[] { "1.0.1.0/24", "223.255.252.0/22", "2001:250::/30" };
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(
            SocksPort, "/tmp/sing-box.log", ClashPort, chinaCidrs: cidrs);

        using var doc = JsonDocument.Parse(json);
        var rules = doc.RootElement.GetProperty("route").GetProperty("rules");
        var order = rules.EnumerateArray().ToList();

        var ipRule = order.Single(r => r.TryGetProperty("ip_cidr", out _));
        Assert.Equal(SingBoxConfigBuilder.DirectOutboundTag, ipRule.GetProperty("outbound").GetString());
        Assert.Equal(
            cidrs,
            ipRule.GetProperty("ip_cidr").EnumerateArray().Select(e => e.GetString()).ToArray());

        // Thứ tự QUAN TRỌNG - sự cố production 23/09/2026 (1.4.5 làm khách TQ MẤT MẠNG và không vào
        // được Google/YouTube): hijack-dns PHẢI đứng ĐẦU TIÊN. Nếu bất kỳ rule nào khớp theo IP
        // (ip_is_private, ip_cidr) đứng trước, truy vấn DNS tới resolver của khách (IP TQ, hoặc IP
        // nội bộ 10.x/192.168.x) bị đẩy `outbound: direct` => DNS đi thẳng ra resolver TQ =>
        // nhiễm độc/không phân giải => mất mạng. Bằng chứng: sing-box.log phiên hỏng ghi
        // "inbound packet connection to 10.193.111.16:53 -> outbound/direct[direct]".
        var indexDns = order.FindIndex(r => r.TryGetProperty("protocol", out var p) && p.GetString() == "dns");
        var indexPrivate = order.FindIndex(r => r.TryGetProperty("ip_is_private", out _));
        var indexIp = order.FindIndex(r => r.TryGetProperty("ip_cidr", out _));
        Assert.Equal(0, indexDns);
        Assert.True(indexDns < indexPrivate, "hijack-dns phải đứng TRƯỚC rule ip_is_private");
        Assert.True(indexDns < indexIp, "hijack-dns phải đứng TRƯỚC rule dải TQ (ip_cidr)");
        Assert.True(indexPrivate < indexIp, "rule LAN phải đứng trước rule dải TQ");

        // Đường ra cuối vẫn là relay: bypass chỉ đổi đường cho dải TQ, không đổi mặc định.
        Assert.Equal(SingBoxConfigBuilder.RelayOutboundTag, doc.RootElement.GetProperty("route").GetProperty("final").GetString());
    }

    [Fact]
    public void BuildSingBoxConfig_khong_co_danh_sach_thi_khong_sinh_bypass()
    {
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(SocksPort, "/tmp/sing-box.log", ClashPort);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        // Không có danh sách (mất mạng, chưa cache) ⇒ KHÔNG rule ip_cidr, KHÔNG DNS nội địa,
        // KHÔNG default_domain_resolver. Bypass là tính năng phụ: lỗi mạng không được biến thành
        // cấu hình khác đi, càng không được chặn kết nối.
        Assert.DoesNotContain(
            root.GetProperty("route").GetProperty("rules").EnumerateArray(),
            r => r.TryGetProperty("ip_cidr", out _));
        Assert.Single(root.GetProperty("dns").GetProperty("servers").EnumerateArray());
        Assert.Empty(root.GetProperty("dns").GetProperty("rules").EnumerateArray());
        Assert.False(root.GetProperty("route").TryGetProperty("default_domain_resolver", out _));
    }

    [Fact]
    public void BuildSingBoxConfig_co_dns_noi_dia_va_default_domain_resolver()
    {
        var json = SingBoxConfigBuilder.BuildSingBoxConfig(
            SocksPort, "/tmp/sing-box.log", ClashPort, chinaCidrs: new[] { "1.0.1.0/24" });

        using var doc = JsonDocument.Parse(json);
        var dns = doc.RootElement.GetProperty("dns");

        var cnServer = dns.GetProperty("servers").EnumerateArray()
            .Single(s => s.GetProperty("tag").GetString() == SingBoxConfigBuilder.ChinaDnsServerTag);
        Assert.Equal(SingBoxConfigBuilder.ChinaDomesticDnsServer, cnServer.GetProperty("server").GetString());

        var dnsRule = dns.GetProperty("rules").EnumerateArray()
            .Single(r => r.TryGetProperty("server", out var s)
                         && s.GetString() == SingBoxConfigBuilder.ChinaDnsServerTag);
        var suffixes = dnsRule.GetProperty("domain_suffix").EnumerateArray()
            .Select(e => e.GetString()).ToList();
        Assert.Contains("alipay.com", suffixes);
        // Cố ý KHÔNG đưa ".cn" vào rule DNS: nhóm đó đã đi thẳng theo tên miền nên không cần, và
        // như vậy resolver nội địa có trục trặc cũng không tạo hồi quy cho thứ đang chạy tốt.
        Assert.DoesNotContain("cn", suffixes);

        // BẮT BUỘC: thiếu trường này thì sing-box 1.14 FATAL ngay khi khởi động
        // ("missing `route.default_domain_resolver` … removed in sing-box 1.14.0").
        Assert.Equal(
            SingBoxConfigBuilder.DnsServerTag,
            doc.RootElement.GetProperty("route").GetProperty("default_domain_resolver").GetString());

        // `detour` của DNS upstream - sự cố production 23/09/2026: DNS server KHÔNG có `detour` thì
        // sing-box dial THẲNG ra ngoài ⇒ ở TQ bị GFW nhiễm độc (đo thật: www.youtube.com trả về
        // 69.171.235.22 = IP Facebook, AAAA google.com trả 2001::1). Bắt buộc đi qua relay.
        var remoteServer = dns.GetProperty("servers").EnumerateArray()
            .Single(s => s.GetProperty("tag").GetString() == SingBoxConfigBuilder.DnsServerTag);
        Assert.Equal(SingBoxConfigBuilder.RelayOutboundTag, remoteServer.GetProperty("detour").GetString());
        Assert.Equal(SingBoxConfigBuilder.DirectOutboundTag, cnServer.GetProperty("detour").GetString());
    }

    [Fact]
    public void ChinaServiceDomainSuffixes_phu_het_ten_mien_app_TQ_da_do()
    {
        // 33 tên miền dưới đây là kết quả ĐO ngày 22/09/2026 (khách báo "bật VPN không bypass được app
        // Trung Quốc"): đối chiếu danh sách cũ thì chỉ 3 khớp. Test này chặn lỗ hổng quay lại — ai
        // thêm/bớt tên miền mà để rơi mất nhóm này là fail ngay.
        var measured = new[]
        {
            "alipay.com", "taobao.com", "tmall.com", "alicdn.com", "baidu.com", "jd.com",
            "meituan.com", "dianping.com", "amap.com", "didiglobal.com", "bilibili.com",
            "douyin.com", "iqiyi.com", "youku.com", "weibo.com", "zhihu.com", "xiaohongshu.com",
            "kuaishou.com", "163.com", "unionpay.com", "ccb.com", "abchina.com", "cmbchina.com",
            "bankcomm.com", "psbc.com", "sf-express.com", "ele.me", "pinduoduo.com", "suning.com",
            "cainiao.com", "qunar.com", "ctrip.com", "wps.com",
        };

        var direct = SingBoxConfigBuilder.ChinaDirectDomainSuffixes
            .Concat(SingBoxConfigBuilder.ChinaServiceDomainSuffixes)
            .ToArray();

        var unmatched = measured.Where(d => !MatchesAny(direct, d)).ToArray();
        Assert.True(
            unmatched.Length == 0,
            "tên miền app TQ vẫn đi qua VPN: " + string.Join(", ", unmatched));
    }

    /// <summary>Luật khớp domain_suffix của sing-box: bằng hệt, hoặc kết thúc bằng ".&lt;suffix&gt;".</summary>
    private static bool MatchesAny(IEnumerable<string> suffixes, string domain)
        => suffixes.Any(s => domain.Equals(s, StringComparison.OrdinalIgnoreCase)
                             || domain.EndsWith("." + s, StringComparison.OrdinalIgnoreCase));

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
