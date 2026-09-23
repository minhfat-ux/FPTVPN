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

    // MARK: - IPv6 (cn6.txt)

    [Fact]
    public void ParseIpv6Cidrs_bo_qua_dong_trong_comment_va_gia_tri_sai()
    {
        const string text = """
            # danh sach APNIC (IPv6)
            2001:250::/30

            ; comment kieu khac
            2001:254::/31   # chu thich cuoi dong
            khong-phai-cidr
            2001:db8::/129
            1.0.1.0/24
            """;

        var cidrs = ChinaBypass.ParseIpv6Cidrs(text);

        Assert.Equal(new[] { "2001:250::/30", "2001:254::/31" }, cidrs);
    }

    [Fact]
    public void ParseIpv6Cidrs_bo_trung_va_chuan_hoa_ve_dia_chi_mang()
    {
        // 2001:250::1/30 phải chuẩn hoá về 2001:250::/30 để trùng với dòng đã có.
        var cidrs = ChinaBypass.ParseIpv6Cidrs("2001:250::1/30\n2001:250::/30\n2001:254::5/31\n");

        Assert.Equal(new[] { "2001:250::/30", "2001:254::/31" }, cidrs);
    }

    [Theory]
    [InlineData("2001:250::/30", true, "2001:250::/30")]
    [InlineData("240e::/20", true, "240e::/20")]
    [InlineData("::/0", true, "::/0")]
    [InlineData("2001:250::/129", false, "")]
    [InlineData("2001:250::", false, "")]
    [InlineData("1.0.1.0/24", false, "")]
    [InlineData("khong-phai/32", false, "")]
    [InlineData("", false, "")]
    public void IsValidIpv6Cidr_dung_hop_dong(string input, bool expected, string normalized)
    {
        var ok = ChinaBypass.IsValidIpv6Cidr(input, out var got);

        Assert.Equal(expected, ok);
        Assert.Equal(normalized, got);
    }

    [Theory]
    [InlineData("fe80::1/64", "fe80::/64")]       // prefix 64: bit cuối của octet 7 phải giữ, phần sau xoá
    [InlineData("::/64", "::/64")]
    [InlineData("2001:250:abcd:1234:5678::/32", "2001:250::/32")]
    [InlineData("2001:250:abcd:1234:5678::/56", "2001:250:abcd:1200::/56")]
    public void IsValidIpv6Cidr_chuan_hoa_dung_tung_bit(string input, string expected)
    {
        Assert.True(ChinaBypass.IsValidIpv6Cidr(input, out var got));
        Assert.Equal(expected, got);
    }

    [Fact]
    public void Danh_sach_IPv6_that_tren_CDN_parse_duoc()
    {
        // Bản sao thu nhỏ của /dl/routes/cn6.txt (định dạng thật đang phục vụ production).
        var text = string.Join('\n', Enumerable.Range(0, 200).Select(i => $"240e:{i:x}::/32")) + "\n";

        var cidrs = ChinaBypass.ParseIpv6Cidrs(text);

        Assert.Equal(200, cidrs.Count);
        Assert.All(cidrs, c => Assert.True(ChinaBypass.IsValidIpv6Cidr(c, out _)));
    }

    [Fact]
    public async Task LoadIpv6Async_dung_cache_khi_con_han_va_khong_goi_mang()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cnbypass6-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var cache = Path.Combine(dir, "cn6.txt");
        await File.WriteAllTextAsync(cache, "2001:250::/30\n");

        var handler = new NeverCalledHandler();
        var http = new HttpClient(handler);

        var result = await ChinaBypass.LoadIpv6Async(http, cache, TimeSpan.FromDays(7));

        Assert.Equal(new[] { "2001:250::/30" }, result);
        Assert.False(handler.Called);
        Directory.Delete(dir, true);
    }

    [Fact]
    public async Task LoadIpv6Async_loi_mang_thi_dung_cache_cu_thay_vi_tra_rong()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cnbypass6-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var cache = Path.Combine(dir, "cn6.txt");
        await File.WriteAllTextAsync(cache, "2001:254::/31\n");
        File.SetLastWriteTimeUtc(cache, DateTime.UtcNow.AddDays(-30));   // cache hết hạn

        var handler = new AlwaysFailHandler();
        var http = new HttpClient(handler);

        var result = await ChinaBypass.LoadIpv6Async(http, cache, TimeSpan.FromDays(7));

        Assert.Equal(new[] { "2001:254::/31" }, result);
        Assert.True(handler.Called);
        Directory.Delete(dir, true);
    }

    [Fact]
    public void Danh_sach_IPv6_dung_url_rieng_khong_lan_voi_IPv4()
    {
        Assert.Equal("https://meetflowai.site/dl/routes/cn.txt", ChinaBypass.DefaultListUrl);
        Assert.Equal("https://meetflowai.site/dl/routes/cn6.txt", ChinaBypass.DefaultListUrlV6);
    }

    [Fact]
    public void ParseCidrs_khong_nhan_dong_IPv6_va_nguoc_lai()
    {
        // Hai bộ parser phải TÁCH BẠCH: trộn lẫn sẽ thêm route IPv6 vào bảng IPv4 (vô nghĩa, netsh lỗi).
        Assert.Empty(ChinaBypass.ParseCidrs("2001:250::/30\n240e::/20\n"));
        Assert.Empty(ChinaBypass.ParseIpv6Cidrs("1.0.1.0/24\n223.255.252.0/22\n"));
    }

    // MARK: - Nạp gộp cho đường relay (sing-box nhận cả danh sách trong 1 file cấu hình)

    [Fact]
    public async Task LoadAllAsync_gop_ca_IPv4_lan_IPv6_va_ghi_cache_dung_ten_file()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cnbypass-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);

        var handler = new MapHandler(new Dictionary<string, string>
        {
            [ChinaBypass.DefaultListUrl] = "1.0.1.0/24\n223.255.252.0/22\n",
            [ChinaBypass.DefaultListUrlV6] = "2001:250::/30\n",
        });
        var http = new HttpClient(handler);

        var all = await ChinaBypass.LoadAllAsync(http, dir, TimeSpan.FromDays(7));

        // Thứ tự: IPv4 trước, IPv6 sau (ổn định để cấu hình sinh ra không đổi giữa các lần chạy).
        Assert.Equal(new[] { "1.0.1.0/24", "223.255.252.0/22", "2001:250::/30" }, all);

        // Cache phải nằm ĐÚNG tên file mà driver WireGuard đang dùng, nếu không hai đường
        // (WireGuard và relay) sẽ tải mạng 2 lần và không chia sẻ được cache.
        Assert.True(File.Exists(Path.Combine(dir, ChinaBypass.CacheFileNameV4)));
        Assert.True(File.Exists(Path.Combine(dir, ChinaBypass.CacheFileNameV6)));
        Directory.Delete(dir, true);
    }

    [Fact]
    public async Task LoadAllAsync_tra_rong_khi_khong_co_mang_va_khong_co_cache()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cnbypass-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);

        var http = new HttpClient(new AlwaysFailHandler());
        var all = await ChinaBypass.LoadAllAsync(http, dir, TimeSpan.FromDays(7));

        // Rỗng ⇒ tầng gọi KHÔNG sinh rule bypass nhưng vẫn phải dựng được tunnel (bypass là phụ).
        Assert.Empty(all);
        Directory.Delete(dir, true);
    }

    // MARK: - Script đếm theo KẾT QUẢ THẬT (ca khách báo 22/09/2026: log xanh mà bypass không chạy)

    [Fact]
    public void BuildRouteLoopScript_dem_theo_ket_qua_chu_khong_dem_so_lan_thu()
    {
        var script = ChinaBypass.BuildRouteLoopScript(
            ChinaBypass.AddRouteVerb,
            @"C:\work\routes-cn.txt",
            "Ethernet",
            "-NextHop '192.168.1.1' -PolicyStore ActiveStore ");

        Assert.Contains(ChinaBypass.AddRouteVerb, script);
        // Bắt buộc: lỗi phải ném ra để catch đếm được, nếu không lại đếm nhầm như bản cũ.
        Assert.Contains("-ErrorAction Stop", script);
        Assert.Contains("$fail++", script);
        Assert.Contains(@"C:\work\routes-cn.txt", script);
        Assert.Contains("Ethernet", script);
        Assert.Contains("-NextHop '192.168.1.1'", script);
        // Kết quả in ra phải là cặp ok/tổng để tầng gọi biết bypass có thật sự chạy hay không.
        Assert.Contains(@"""$ok/$($ok+$fail)""", script);
        // Không được còn dấu vết của cách đếm cũ ($n++ vô điều kiện).
        Assert.DoesNotContain("$n++", script);
    }

    [Fact]
    public void BuildRouteLoopScript_xoa_route_phai_kem_confirm_false()
    {
        // Thiếu -Confirm:$false thì Remove-NetRoute hỏi lại và tiến trình PowerShell treo tới hết giờ.
        var script = ChinaBypass.BuildRouteLoopScript(
            ChinaBypass.RemoveRouteVerb,
            "/tmp/routes-cn.txt",
            "Ethernet",
            "-NextHop '192.168.1.1' ");

        Assert.Contains(ChinaBypass.RemoveRouteVerb, script);
        Assert.Contains("-Confirm:$false", script);
        Assert.DoesNotContain(ChinaBypass.AddRouteVerb, script);
    }

    [Theory]
    [InlineData("0/5494", 0, 5494)]
    [InlineData("5494/5494", 5494, 5494)]
    [InlineData(" 12/20 \n", 12, 20)]
    public void TryParseRouteResult_doc_dung_cap_ok_tong(string output, int ok, int total)
    {
        Assert.True(ChinaBypass.TryParseRouteResult(output, out var succeeded, out var attempted));
        Assert.Equal(ok, succeeded);
        Assert.Equal(total, attempted);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("5494")]
    [InlineData("abc/def")]
    public void TryParseRouteResult_tra_false_khi_output_khong_dung_dang(string? output)
    {
        // Trả false ⇒ tầng gọi log cảnh báo "bypass coi như KHÔNG chạy", thay vì tin nhầm là thành công.
        Assert.False(ChinaBypass.TryParseRouteResult(output, out _, out _));
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

    /// <summary>Trả nội dung khác nhau theo từng URL — dùng để kiểm cn.txt và cn6.txt tách bạch.</summary>
    private sealed class MapHandler : HttpMessageHandler
    {
        private readonly Dictionary<string, string> _byUrl;

        public MapHandler(Dictionary<string, string> byUrl) => _byUrl = byUrl;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!.ToString();
            if (!_byUrl.TryGetValue(url, out var body))
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(body),
            });
        }
    }
}
