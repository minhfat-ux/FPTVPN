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

    /// <summary>TTL cache mặc định: 7 ngày (danh sách APNIC đổi rất chậm).</summary>
    public static readonly TimeSpan DefaultCacheTtl = TimeSpan.FromDays(7);

    /// <summary>
    /// Đọc danh sách CIDR: bỏ dòng trống/comment, chỉ nhận IPv4 hợp lệ, bỏ trùng, giữ thứ tự xuất hiện.
    /// </summary>
    public static List<string> ParseCidrs(string? text)
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

            if (!IsValidIpv4Cidr(line, out var normalized))
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

    /// <summary>
    /// Lấy danh sách: cache còn hạn → dùng cache; hết hạn/lỗi mạng → thử tải, lỗi thì dùng cache cũ.
    /// Trả về rỗng khi không có gì dùng được (khi đó KHÔNG thêm route nào — tunnel giữ nguyên như cũ).
    /// </summary>
    public static async Task<List<string>> LoadAsync(
        HttpClient http,
        string cachePath,
        TimeSpan ttl,
        CancellationToken cancellationToken = default)
    {
        var cached = ReadCache(cachePath);
        if (cached.Count > 0 && IsCacheFresh(File.GetLastWriteTimeUtc(cachePath), DateTimeOffset.UtcNow, ttl))
        {
            return cached;
        }

        try
        {
            var text = await http.GetStringAsync(DefaultListUrl, cancellationToken).ConfigureAwait(false);
            var fetched = ParseCidrs(text);
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

    private static List<string> ReadCache(string cachePath)
    {
        try
        {
            return File.Exists(cachePath) ? ParseCidrs(File.ReadAllText(cachePath)) : new List<string>();
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
