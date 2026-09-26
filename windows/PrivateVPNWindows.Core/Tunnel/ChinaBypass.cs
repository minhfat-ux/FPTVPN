using System.Net;
using System.Net.Http;

namespace PrivateVPNWindows.Core.Tunnel;

/// <summary>
/// Bypass Trung Quốc: WeChat / Alipay / web TQ mất kết nối khi bật VPN vì toàn bộ traffic
/// đang đi full-tunnel 0.0.0.0/0 qua exit Việt Nam (server TQ thấy IP nước ngoài → cắt).
///
/// Cách xử lý: tải danh sách CIDR Trung Quốc (sinh từ APNIC, phục vụ tại /dl/routes/cn.txt)
/// rồi thêm route trực tiếp qua gateway vật lý — traffic tới các dải đó KHÔNG đi vào tunnel.
///
/// Vì sao danh sách để ở server: cập nhật được mà không phải phát hành bản app mới; app cache lại
/// theo TTL và luôn có bản cache cũ dùng khi mạng lỗi.
/// </summary>
public static class ChinaBypass
{
    public const string DefaultListUrl = "https://meetflowai.site/dl/routes/cn.txt";

    /// <summary>
    /// Danh sách CIDR IPv6 của Trung Quốc. Vì sao cần: tunnel chỉ định tuyến IPv4 nên app chặn
    /// IPv6 bằng <c>::/1 + 8000::/1</c>; nếu không mở đường riêng cho dải TQ thì WeChat/Alipay
    /// trên IPv6 bị đen hoàn toàn (buộc phải chờ fallback IPv4).
    /// </summary>
    public const string DefaultListUrlV6 = "https://meetflowai.site/dl/routes/cn6.txt";

    /// <summary>TTL cache mặc định: 7 ngày (danh sách APNIC đổi rất chậm).</summary>
    public static readonly TimeSpan DefaultCacheTtl = TimeSpan.FromDays(7);

    /// <summary>Tên file cache IPv4 trong thư mục làm việc (dùng chung với driver WireGuard).</summary>
    public const string CacheFileNameV4 = "routes-cn.txt";

    /// <summary>Tên file cache IPv6 trong thư mục làm việc (dùng chung với driver WireGuard).</summary>
    public const string CacheFileNameV6 = "routes-cn6.txt";

    /// <summary>
    /// Đọc danh sách CIDR IPv4: bỏ dòng trống/comment, chỉ nhận IPv4 hợp lệ, bỏ trùng, giữ thứ tự xuất hiện.
    /// </summary>
    public static List<string> ParseCidrs(string? text) => ParseList(text, IsValidIpv4Cidr);

    /// <summary>
    /// Đọc danh sách CIDR IPv6 (file <c>cn6.txt</c>): bỏ dòng trống/comment, chuẩn hoá về địa chỉ
    /// mạng, bỏ trùng, giữ thứ tự xuất hiện.
    /// </summary>
    public static List<string> ParseIpv6Cidrs(string? text) => ParseList(text, IsValidIpv6Cidr);

    private delegate bool CidrValidator(string? value, out string normalized);

    private static List<string> ParseList(string? text, CidrValidator validator)
    {
        var result = new List<string>();
        if (string.IsNullOrWhiteSpace(text))
        {
            return result;
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim().TrimEnd('\r');
            if (line.Length == 0 || line.StartsWith('#') || line.StartsWith(';'))
            {
                continue;
            }

            // Bỏ phần chú thích cuối dòng nếu có.
            var comment = line.IndexOfAny(new[] { '#', ' ', '\t' });
            if (comment > 0)
            {
                line = line[..comment];
            }

            if (!validator(line, out var normalized))
            {
                continue;
            }

            if (seen.Add(normalized))
            {
                result.Add(normalized);
            }
        }

        return result;
    }

    /// <summary>Kiểm tra &amp; chuẩn hoá "a.b.c.d/len" (chỉ IPv4; trả về dạng network/prefix).</summary>
    public static bool IsValidIpv4Cidr(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var parts = value.Trim().Split('/');
        if (parts.Length != 2
            || !IPAddress.TryParse(parts[0], out var address)
            || address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork
            || !int.TryParse(parts[1], out var prefix)
            || prefix < 0
            || prefix > 32)
        {
            return false;
        }

        // Chuẩn hoá về địa chỉ mạng (ví dụ 1.0.2.5/23 -> 1.0.2.0/23) để so trùng chính xác.
        var bytes = address.GetAddressBytes();
        var mask = prefix == 0 ? 0u : 0xFFFFFFFFu << (32 - prefix);
        var value32 = ((uint)bytes[0] << 24) | ((uint)bytes[1] << 16) | ((uint)bytes[2] << 8) | bytes[3];
        var network = value32 & mask;
        normalized = string.Create(
            System.Globalization.CultureInfo.InvariantCulture,
            $"{(network >> 24) & 0xFF}.{(network >> 16) & 0xFF}.{(network >> 8) & 0xFF}.{network & 0xFF}/{prefix}");
        return true;
    }

    /// <summary>
    /// Kiểm tra &amp; chuẩn hoá "x::y/len" (chỉ IPv6; trả về dạng network/prefix). Không nhận IPv4
    /// nhúng kiểu <c>::ffff:1.2.3.4</c> vì <see cref="System.Net.IPAddress.TryParse(string, out System.Net.IPAddress)"/>
    /// coi nó là IPv6 — nhưng dải TQ thật không dùng dạng đó, và thêm nhầm route IPv4 vào bảng IPv6 là vô nghĩa.
    /// </summary>
    public static bool IsValidIpv6Cidr(string? value, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var parts = value.Trim().Split('/');
        if (parts.Length != 2
            || !IPAddress.TryParse(parts[0], out var address)
            || address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetworkV6
            || !int.TryParse(parts[1], out var prefix)
            || prefix < 0
            || prefix > 128)
        {
            return false;
        }

        var bytes = address.GetAddressBytes();
        if (bytes.Length != 16)
        {
            return false;
        }

        // Chuẩn hoá về địa chỉ mạng (giữ `prefix` bit đầu, phần còn lại = 0) để so trùng chính xác.
        var network = new byte[16];
        for (var index = 0; index < 16; index++)
        {
            var remaining = prefix - (index * 8);
            network[index] = remaining >= 8
                ? bytes[index]
                : remaining <= 0
                    ? (byte)0
                    : (byte)(bytes[index] & (0xFF << (8 - remaining)));
        }

        normalized = $"{new IPAddress(network)}/{prefix}";
        return true;
    }

    /// <summary>Cache còn dùng được không (theo thời điểm file cache được ghi).</summary>
    public static bool IsCacheFresh(DateTimeOffset lastWrite, DateTimeOffset now, TimeSpan ttl)
        => ttl > TimeSpan.Zero && now - lastWrite < ttl;
    /// <summary>
    /// Tham số cho `netsh interface ipv4 add route &lt;cidr&gt; &lt;iface&gt; nexthop=&lt;gw&gt; store=active`.
    /// Dùng nexthop= để không phụ thuộc thứ tự tham số của netsh.
    /// </summary>
    public static List<string> BuildAddArgs(string cidr, string interfaceName, string gateway)
        => new()
        {
            "interface", "ipv4", "add", "route", cidr, interfaceName,
            "nexthop=" + gateway, "store=active",
        };

    /// <summary>Tham số cho `netsh interface ipv4 delete route ...` (dọn khi ngắt tunnel).</summary>
    public static List<string> BuildDeleteArgs(string cidr, string interfaceName, string gateway)
        => new()
        {
            "interface", "ipv4", "delete", "route", cidr, interfaceName,
            "nexthop=" + gateway, "store=active",
        };

    /// <summary>Cmdlet PowerShell dùng để THÊM route trong <see cref="BuildRouteLoopScript"/>.</summary>
    public const string AddRouteVerb = "New-NetRoute";

    /// <summary>Cmdlet PowerShell dùng để XOÁ route trong <see cref="BuildRouteLoopScript"/>.</summary>
    public const string RemoveRouteVerb = "Remove-NetRoute";

    /// <summary>
    /// Script PowerShell thêm/xoá route cho cả danh sách CIDR trong MỘT tiến trình (gọi netsh từng
    /// dòng với 5.5k dải mất vài phút), in ra <c>"&lt;số-thành-công&gt;/&lt;tổng&gt;"</c>.
    ///
    /// Vì sao phải đếm theo KẾT QUẢ: bản cũ đặt <c>$ErrorActionPreference='SilentlyContinue'</c> rồi
    /// <c>$n++</c> VÔ ĐIỀU KIỆN, nên log luôn báo "đã thêm 5494 route" kể cả khi mọi lệnh đều thất bại
    /// — đúng ca khách báo "bật VPN không bypass được app Trung Quốc" mà log vẫn xanh. Ở đây mỗi dòng
    /// được bọc <c>try/catch</c> với <c>-ErrorAction Stop</c> để lỗi không bị nuốt.
    /// </summary>
    /// <param name="verb"><see cref="AddRouteVerb"/> hoặc <see cref="RemoveRouteVerb"/>.</param>
    /// <param name="activePath">File chứa danh sách CIDR, mỗi dòng một dải.</param>
    /// <param name="interfaceName">InterfaceAlias của NIC vật lý.</param>
    /// <param name="extraArguments">
    /// Đuôi tham số riêng của từng ca, giữ NGUYÊN như bản cũ để route thêm và xoá khớp nhau:
    /// <c>-NextHop '192.168.1.1' -PolicyStore ActiveStore </c> (IPv4), <c>-PolicyStore ActiveStore </c>
    /// (IPv6 on-link), hoặc <c>-NextHop '…' </c>/rỗng khi xoá.
    /// </param>
    public static string BuildRouteLoopScript(
        string verb,
        string activePath,
        string interfaceName,
        string extraArguments)
    {
        // Xoá route bắt buộc phải có -Confirm:$false, nếu không PowerShell sẽ hỏi lại và treo.
        var confirmArgument = verb == RemoveRouteVerb ? "-Confirm:$false " : string.Empty;

        return "$ErrorActionPreference='SilentlyContinue'; $ok=0; $fail=0; " +
               "foreach ($c in Get-Content '" + activePath + "') { " +
               "try { " + verb + " -DestinationPrefix $c -InterfaceAlias '" + interfaceName + "' " +
               extraArguments + confirmArgument + "-ErrorAction Stop | Out-Null; $ok++ } " +
               "catch { $fail++ } }; " +
               "\"$ok/$($ok+$fail)\"";
    }

    /// <summary>Đọc kết quả <c>"ok/tổng"</c> do <see cref="BuildRouteLoopScript"/> in ra.</summary>
    public static bool TryParseRouteResult(string? output, out int succeeded, out int total)
    {
        succeeded = 0;
        total = 0;
        if (string.IsNullOrWhiteSpace(output))
        {
            return false;
        }

        var parts = output.Trim().Split('/');
        return parts.Length == 2
               && int.TryParse(parts[0], out succeeded)
               && int.TryParse(parts[1], out total);
    }

    /// <summary>
    /// Lấy danh sách IPv4: cache còn hạn → dùng cache; hết hạn/lỗi mạng → thử tải, lỗi thì dùng cache cũ.
    /// Trả về rỗng khi không có gì dùng được (khi đó KHÔNG thêm route nào — tunnel giữ nguyên như cũ).
    /// </summary>
    public static Task<List<string>> LoadAsync(
        HttpClient http,
        string cachePath,
        TimeSpan ttl,
        CancellationToken cancellationToken = default)
        => LoadListAsync(http, DefaultListUrl, cachePath, ttl, ParseCidrs, cancellationToken);

    /// <summary>Như <see cref="LoadAsync"/> nhưng cho danh sách CIDR IPv6 (<c>cn6.txt</c>).</summary>
    public static Task<List<string>> LoadIpv6Async(
        HttpClient http,
        string cachePath,
        TimeSpan ttl,
        CancellationToken cancellationToken = default)
        => LoadListAsync(http, DefaultListUrlV6, cachePath, ttl, ParseIpv6Cidrs, cancellationToken);

    /// <summary>
    /// Nạp CẢ HAI danh sách (IPv4 <c>cn.txt</c> + IPv6 <c>cn6.txt</c>) thành một mảng.
    ///
    /// Vì sao cần hàm riêng: đường WireGuard thêm route từng dải qua <c>New-NetRoute</c>, còn đường
    /// relay (hysteria2-over-WS) đưa thẳng danh sách vào file cấu hình sing-box nên phải gộp sẵn.
    /// Một phần lỗi mạng không kéo phần kia chết theo — mỗi hàm con đã tự rơi về cache cũ.
    /// </summary>
    public static async Task<List<string>> LoadAllAsync(
        HttpClient http,
        string workDir,
        TimeSpan ttl,
        CancellationToken cancellationToken = default)
    {
        var v4 = await LoadAsync(http, Path.Combine(workDir, CacheFileNameV4), ttl, cancellationToken)
            .ConfigureAwait(false);
        var v6 = await LoadIpv6Async(http, Path.Combine(workDir, CacheFileNameV6), ttl, cancellationToken)
            .ConfigureAwait(false);

        var all = new List<string>(v4.Count + v6.Count);
        all.AddRange(v4);
        all.AddRange(v6);
        return all;
    }

    private static async Task<List<string>> LoadListAsync(
        HttpClient http,
        string url,
        string cachePath,
        TimeSpan ttl,
        Func<string?, List<string>> parse,
        CancellationToken cancellationToken)
    {
        var cached = ReadCache(cachePath, parse);
        if (cached.Count > 0 && IsCacheFresh(File.GetLastWriteTimeUtc(cachePath), DateTimeOffset.UtcNow, ttl))
        {
            return cached;
        }

        try
        {
            var text = await http.GetStringAsync(url, cancellationToken).ConfigureAwait(false);
            var fetched = parse(text);
            if (fetched.Count > 0)
            {
                WriteCache(cachePath, text);
                return fetched;
            }
        }
        catch (Exception)
        {
            // im lặng: rơi xuống cache cũ
        }

        return cached;
    }

    private static List<string> ReadCache(string cachePath, Func<string?, List<string>> parse)
    {
        try
        {
            return File.Exists(cachePath) ? parse(File.ReadAllText(cachePath)) : new List<string>();
        }
        catch (Exception)
        {
            return new List<string>();
        }
    }

    private static void WriteCache(string cachePath, string text)
    {
        try
        {
            var dir = Path.GetDirectoryName(cachePath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.WriteAllText(cachePath, text);
        }
        catch (Exception)
        {
            // không ghi được cache cũng không sao
        }
    }
}
