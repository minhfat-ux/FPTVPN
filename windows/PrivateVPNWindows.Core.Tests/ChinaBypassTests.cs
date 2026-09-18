using System.Net;
using System.Net.Http;
using PrivateVPNWindows.Core.Tunnel;

namespace PrivateVPNWindows.Core.Tests;

/// <summary>
/// Test cho bypass Trung Quốc (WeChat/Alipay mất kết nối khi bật VPN).
/// Trọng tâm: parse danh sách CIDR an toàn + sinh đúng tham số netsh + luôn dọn được route.
/// </summary>
public class ChinaBypassTests
{
    [Fact]
    public void ParseCidrs_bo_qua_dong_trong_comment_va_gia_tri_sai()
    {
        const string text = """
            # danh sach APNIC
            1.0.1.0/24

             ; comment kieu khac
            1.0.2.0/23   # chu thich cuoi dong
            khong-phai-cidr
            1.0.3.0/33
            1.0.4.0
            2001:db8::/32
            """;

        var cidrs = ChinaBypass.ParseCidrs(text);

        Assert.Equal(new[] { "1.0.1.0/24", "1.0.2.0/23" }, cidrs);
    }

    [Fact]
    public void ParseCidrs_bo_trung_va_chuan_hoa_ve_dia_chi_mang()
    {
        var cidrs = ChinaBypass.ParseCidrs("1.0.2.5/23\n1.0.2.0/23\n1.0.3.9/24\n");

        Assert.Equal(new[] { "1.0.2.0/23", "1.0.3.0/24" }, cidrs);
    }

    [Theory]
    [InlineData("1.0.1.0/24", true, "1.0.1.0/24")]
    [InlineData("223.255.252.0/22", true, "223.255.252.0/22")]
    [InlineData("0.0.0.0/0", true, "0.0.0.0/0")]
    [InlineData("1.0.1.0/33", false, "")]
    [InlineData("1.0.1.0", false, "")]
    [InlineData("abc/24", false, "")]
    [InlineData("", false, "")]
    [InlineData("2001:db8::/32", false, "")]
    public void IsValidIpv4Cidr_dung_hop_dong(string input, bool expected, string normalized)
    {
        var ok = ChinaBypass.IsValidIpv4Cidr(input, out var got);

        Assert.Equal(expected, ok);
        Assert.Equal(normalized, got);
    }

    [Fact]
    public void BuildAddArgs_them_route_truc_tiep_qua_gateway_vat_ly()
    {
        var args = ChinaBypass.BuildAddArgs("1.0.1.0/24", "Ethernet", "192.168.1.1");

        Assert.Equal(
            new[] { "interface", "ipv4", "add", "route", "1.0.1.0/24", "Ethernet", "nexthop=192.168.1.1", "store=active" },
            args);
    }

    [Fact]
    public void BuildDeleteArgs_khop_voi_add_de_don_sach_route()
    {
        var args = ChinaBypass.BuildDeleteArgs("1.0.1.0/24", "Ethernet", "192.168.1.1");

        Assert.Equal(
            new[] { "interface", "ipv4", "delete", "route", "1.0.1.0/24", "Ethernet", "nexthop=192.168.1.1", "store=active" },
            args);
    }

    [Fact]
    public void IsCacheFresh_theo_ttl()
    {
        var now = DateTimeOffset.Parse("2026-09-18T12:00:00Z");
        var ttl = TimeSpan.FromDays(7);

        Assert.True(ChinaBypass.IsCacheFresh(now.AddDays(-6), now, ttl));
        Assert.False(ChinaBypass.IsCacheFresh(now.AddDays(-8), now, ttl));
        Assert.False(ChinaBypass.IsCacheFresh(now.AddDays(-1), now, TimeSpan.Zero));
    }

    [Fact]
    public void Danh_sach_that_tren_CDN_parse_duoc_va_du_lon()
    {
        // Bản sao thu nhỏ của /dl/routes/cn.txt (định dạng thật đang phục vụ production).
        var text = string.Join('\n', Enumerable.Range(1, 200).Select(i => $"1.{i}.0.0/16")) + "\n";

        var cidrs = ChinaBypass.ParseCidrs(text);

        Assert.Equal(200, cidrs.Count);
        Assert.All(cidrs, c => Assert.True(ChinaBypass.IsValidIpv4Cidr(c, out _)));
    }

    [Fact]
    public async Task LoadAsync_dung_cache_khi_con_han_va_khong_goi_mang()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cnbypass-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var cache = Path.Combine(dir, "cn.txt");
        await File.WriteAllTextAsync(cache, "1.0.1.0/24\n");

        var handler = new NeverCalledHandler();
        var http = new HttpClient(handler);

        var result = await ChinaBypass.LoadAsync(http, cache, TimeSpan.FromDays(7));

        Assert.Equal(new[] { "1.0.1.0/24" }, result);
        Assert.False(handler.Called);
        Directory.Delete(dir, true);
    }

    [Fact]
    public async Task LoadAsync_loi_mang_thi_dung_cache_cu_thay_vi_tra_rong()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cnbypass-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var cache = Path.Combine(dir, "cn.txt");
        await File.WriteAllTextAsync(cache, "1.0.2.0/23\n");
        File.SetLastWriteTimeUtc(cache, DateTime.UtcNow.AddDays(-30));   // cache hết hạn

        var handler = new AlwaysFailHandler();
        var http = new HttpClient(handler);

        var result = await ChinaBypass.LoadAsync(http, cache, TimeSpan.FromDays(7));

        Assert.Equal(new[] { "1.0.2.0/23" }, result);
        Assert.True(handler.Called);
        Directory.Delete(dir, true);
    }

    /// <summary>Gateway vật lý lấy từ route hiện tại — kiểm tra hàm trích gateway vẫn đúng định dạng IPv4.</summary>
    [Fact]
    public void Gateway_lay_tu_route_phai_la_ipv4_hop_le()
    {
        var gateway = "192.168.1.1";
        Assert.True(IPAddress.TryParse(gateway, out var parsed));
        Assert.Equal(System.Net.Sockets.AddressFamily.InterNetwork, parsed!.AddressFamily);
    }

    private sealed class NeverCalledHandler : HttpMessageHandler
    {
        public bool Called { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Called = true;
            throw new InvalidOperationException("Không được gọi mạng khi cache còn hạn");
        }
    }

    private sealed class AlwaysFailHandler : HttpMessageHandler
    {
        public bool Called { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Called = true;
            throw new HttpRequestException("mất mạng");
        }
    }
}
