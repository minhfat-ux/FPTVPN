using System.Globalization;
using System.Net;
using System.Net.Sockets;

namespace VpnFlow.Core.Tunnel;

/// <summary>Một lệnh Windows đã dựng sẵn (chương trình + tham số) để chạy qua Process.</summary>
public sealed record WindowsCommand(string FileName, string Arguments)
{
    public override string ToString() => $"{FileName} {Arguments}";
}

/// <summary>
/// Dựng các lệnh cấu hình mạng Windows cho tunnel userspace: địa chỉ IP, MTU,
/// route (chia mặc định) và DNS. Tách thành hàm thuần để test được trên macOS —
/// phần thực thi nằm ở <see cref="WintunWireGuardDriver"/>.
///
/// Vì sao dùng netsh/powershell thay vì P/Invoke IP Helper API: project net8.0
/// thuần, brief cấm thêm dependency, và netsh có sẵn trên mọi Windows 10/11.
/// </summary>
public static class WireGuardWindowsCommands
{
    public const string Netsh = "netsh.exe";
    public const string PowerShell = "powershell.exe";

    public const string DefaultRouteCidr = "0.0.0.0/0";

    /// <summary>
    /// Hai nửa của default route. Chia 0.0.0.0/0 thành /1 + /1 thay vì ghi đè
    /// 0.0.0.0/0 (mirror cách wg-quick/WireGuard for Windows làm) để route cụ thể
    /// hơn của hệ thống vẫn thắng, và để xoá default route sạch khi ngắt.
    /// </summary>
    public const string DefaultRouteLowHalf = "0.0.0.0/1";

    public const string DefaultRouteHighHalf = "128.0.0.0/1";

    /// <summary>
    /// Hai nửa default route IPv6 dùng để CHẶN IPv6 khi tunnel chỉ có IPv4
    /// (xem <see cref="AddIpv6BlockRoute"/>).
    /// </summary>
    public const string Ipv6BlockLowHalf = "::/1";

    public const string Ipv6BlockHighHalf = "8000::/1";

    /// <summary>Chia các AllowedIPs thành tập route; 0.0.0.0/0 → hai nửa /1.</summary>
    public static IReadOnlyList<string> SplitAllowedIps(IEnumerable<string> allowedIps)
    {
        ArgumentNullException.ThrowIfNull(allowedIps);

        var result = new List<string>();
        foreach (var raw in allowedIps)
        {
            var prefix = raw.Trim();
            if (prefix.Length == 0)
            {
                continue;
            }

            if (prefix == DefaultRouteCidr)
            {
                AddUnique(result, DefaultRouteLowHalf);
                AddUnique(result, DefaultRouteHighHalf);
            }
            else
            {
                AddUnique(result, prefix);
            }
        }
        return result;
    }

    /// <summary>Đổi độ dài prefix IPv4 sang mặt nạ dạng chấm (vd 24 → 255.255.255.0).</summary>
    public static string PrefixToMask(int prefixLength)
    {
        if (prefixLength is < 0 or > 32)
        {
            throw new WireGuardConfigException($"IPv4 prefix length out of range: {prefixLength}.");
        }

        var mask = prefixLength == 0 ? 0u : uint.MaxValue << (32 - prefixLength);
        var bytes = new[]
        {
            (byte)(mask >> 24), (byte)(mask >> 16), (byte)(mask >> 8), (byte)mask,
        };
        return string.Join('.', bytes);
    }

    public static bool TryParseCidr(string cidr, out string address, out int prefixLength)
    {
        address = string.Empty;
        prefixLength = 0;
        if (string.IsNullOrWhiteSpace(cidr))
        {
            return false;
        }

        var slash = cidr.IndexOf('/');
        var host = slash < 0 ? cidr : cidr[..slash];
        var prefixText = slash < 0 ? null : cidr[(slash + 1)..];

        if (!IPAddress.TryParse(host.Trim(), out var parsed) || parsed.AddressFamily != AddressFamily.InterNetwork)
        {
            return false;
        }

        if (prefixText is not null
            && !int.TryParse(prefixText, NumberStyles.Integer, CultureInfo.InvariantCulture, out prefixLength))
        {
            return false;
        }
        else if (prefixText is null)
        {
            prefixLength = 32;
        }

        address = parsed.ToString();
        return prefixLength is >= 0 and <= 32;
    }

    public static bool IsIpv4Cidr(string cidr) => TryParseCidr(cidr, out _, out _);

    /// <summary>Đưa interface lên (adapter Wintun tạo ra có thể đang disabled).</summary>
    public static WindowsCommand EnableInterface(string interfaceName)
        => new(Netsh, $"interface set interface name=\"{interfaceName}\" admin=enable");

    /// <summary>Gán địa chỉ IPv4 tĩnh, không gateway (tunnel point-to-point).</summary>
    public static WindowsCommand SetAddress(string interfaceName, string cidr)
    {
        if (!TryParseCidr(cidr, out var address, out var prefixLength))
        {
            throw new WireGuardConfigException($"Address must be IPv4 CIDR (got '{cidr}').");
        }

        var mask = PrefixToMask(prefixLength);
        return new WindowsCommand(
            Netsh,
            $"interface ipv4 set address name=\"{interfaceName}\" source=static addr={address} mask={mask}");
    }

    public static WindowsCommand SetMtu(string interfaceName, int mtu)
    {
        if (mtu <= 0)
        {
            throw new WireGuardConfigException($"MTU must be positive (got {mtu}).");
        }

        return new WindowsCommand(
            Netsh,
            $"interface ipv4 set subinterface \"{interfaceName}\" mtu={mtu.ToString(CultureInfo.InvariantCulture)} store=persistent");
    }

    /// <summary>Thêm route on-link (nexthop 0.0.0.0) qua interface tunnel.</summary>
    public static WindowsCommand AddRoute(string interfaceName, string cidr)
    {
        EnsureRouteCidr(cidr);
        return new WindowsCommand(
            Netsh,
            $"interface ipv4 add route prefix={cidr} interface=\"{interfaceName}\" nexthop=0.0.0.0 metric=1 store=active");
    }

    public static WindowsCommand DeleteRoute(string interfaceName, string cidr)
    {
        EnsureRouteCidr(cidr);
        return new WindowsCommand(
            Netsh,
            $"interface ipv4 delete route prefix={cidr} interface=\"{interfaceName}\" nexthop=0.0.0.0");
    }

    /// <summary>Đặt DNS đầu tiên (static).</summary>
    public static WindowsCommand SetDns(string interfaceName, string server)
        => new(Netsh,
            $"interface ipv4 set dnsservers name=\"{interfaceName}\" source=static address={server} register=primary validate=no");

    /// <summary>Thêm DNS tiếp theo theo index.</summary>
    public static WindowsCommand AddDns(string interfaceName, string server, int index)
        => new(Netsh,
            $"interface ipv4 add dnsservers name=\"{interfaceName}\" address={server} index={index.ToString(CultureInfo.InvariantCulture)} validate=no");

    /// <summary>Gỡ adapter khỏi hệ thống. Dùng PowerShell <c>Remove-NetAdapter</c> vì netsh
    /// không có lệnh xoá interface ảo. Chỉ gọi SAU khi đã kill wireguard-go (adapter
    /// đang được session giữ sẽ không xoá được).
    /// Lưu ý: module <c>NetAdapter</c> không có trên mọi máy — thiếu thì lệnh này thất bại
    /// (đã log WARN) nhưng không chặn luồng ngắt kết nối.</summary>
    public static WindowsCommand RemoveInterface(string interfaceName)
        => new(PowerShell,
            $"-NoProfile -NonInteractive -Command \"Remove-NetAdapter -Name '{interfaceName}' -Confirm:$false -ErrorAction SilentlyContinue\"");

    /// <summary>
    /// Đọc default route đang dùng của máy, in ra <c>gateway|interface</c>.
    ///
    /// Vì sao cần: sau khi thêm <c>0.0.0.0/1</c> + <c>128.0.0.0/1</c> trỏ vào tunnel, gói UDP
    /// của CHÍNH wireguard-go gửi tới endpoint cũng khớp route đó và bị hút vào tunnel chưa
    /// hoạt động ⇒ handshake chết ngay sau khi kết nối và máy mất mạng. Phải thêm route /32
    /// cho IP endpoint đi qua gateway vật lý để tránh vòng lặp này.
    /// </summary>
    public static WindowsCommand GetDefaultRoute()
        => new(PowerShell,
            "-NoProfile -NonInteractive -Command \"(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric,ifIndex | Select-Object -First 1) | ForEach-Object { $_.NextHop + '|' + $_.InterfaceAlias }\"");

    /// <summary>Parsea output của <see cref="GetDefaultRoute"/>: dòng đầu dạng <c>gateway|interface</c>.</summary>
    public static (string Gateway, string Interface)? ParseDefaultRouteOutput(string stdout)
    {
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return null;
        }

        foreach (var raw in stdout.Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0)
            {
                continue;
            }

            var parts = line.Split('|');
            if (parts.Length < 2)
            {
                continue;
            }

            var gateway = parts[0].Trim();
            var @interface = parts[1].Trim();
            if (gateway.Length > 0 && @interface.Length > 0)
            {
                return (gateway, @interface);
            }
        }

        return null;
    }

    /// <summary>Route /32 cho IP endpoint của peer, đi qua gateway/interface vật lý.</summary>
    public static WindowsCommand AddEndpointRoute(string physicalInterface, string gateway, string endpointIp)
        => new(Netsh,
            $"interface ipv4 add route prefix={endpointIp}/32 interface=\"{physicalInterface}\" nexthop={gateway} metric=1 store=active");

    /// <summary>Xoá route loại trừ endpoint đã thêm lúc kết nối.</summary>
    public static WindowsCommand DeleteEndpointRoute(string physicalInterface, string gateway, string endpointIp)
        => new(Netsh,
            $"interface ipv4 delete route prefix={endpointIp}/32 interface=\"{physicalInterface}\" nexthop={gateway}");

    /// <summary>
    /// Chặn IPv6 khi tunnel chỉ có IPv4: hai nửa default route IPv6 trỏ vào interface tunnel
    /// (interface này không có địa chỉ IPv6) nên gói IPv6 bị đen.
    ///
    /// Vì sao bắt buộc: AllowedIPs của tunnel chỉ có <c>0.0.0.0/0</c>. Nếu máy có IPv6, mọi
    /// kết nối IPv6 sẽ đi thẳng ra ngoài — rò IP thật ra khỏi VPN (RULE-VPN-005). Đã đo thật:
    /// sau khi thêm 2 route này, <c>curl -6</c> timeout thay vì đi ra ngoài.
    /// </summary>
    public static WindowsCommand AddIpv6BlockRoute(string interfaceName, string cidr)
        => new(Netsh,
            $"interface ipv6 add route prefix={cidr} interface=\"{interfaceName}\" nexthop=:: metric=1 store=active");

    /// <summary>Gỡ route chặn IPv6, trả IPv6 về như trước khi kết nối.</summary>
    public static WindowsCommand DeleteIpv6BlockRoute(string interfaceName, string cidr)
        => new(Netsh,
            $"interface ipv6 delete route prefix={cidr} interface=\"{interfaceName}\" nexthop=::");

    /// <summary>Hai route chặn IPv6 (::/1 + 8000::/1 phủ toàn bộ ::/0).</summary>
    public static IReadOnlyList<WindowsCommand> BuildIpv6BlockAdds(string interfaceName)
        => new[]
        {
            AddIpv6BlockRoute(interfaceName, Ipv6BlockLowHalf),
            AddIpv6BlockRoute(interfaceName, Ipv6BlockHighHalf),
        };

    /// <summary>Gỡ hai route chặn IPv6.</summary>
    public static IReadOnlyList<WindowsCommand> BuildIpv6BlockDeletes(string interfaceName)
        => new[]
        {
            DeleteIpv6BlockRoute(interfaceName, Ipv6BlockLowHalf),
            DeleteIpv6BlockRoute(interfaceName, Ipv6BlockHighHalf),
        };

    /// <summary>Tập route cần thêm, từ AllowedIPs của mọi peer (đã chia default route).</summary>
    public static IReadOnlyList<WindowsCommand> BuildRouteAdds(string interfaceName, WireGuardConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);
        var commands = new List<WindowsCommand>();
        foreach (var prefix in SplitAllowedIps(EnumerateAllowedIps(config)))
        {
            // Tunnel này chỉ cấu hình IPv4; AllowedIPs IPv6 bỏ qua (xem README).
            if (IsIpv4Cidr(prefix))
            {
                commands.Add(AddRoute(interfaceName, prefix));
            }
        }
        return commands;
    }

    /// <summary>Tập route cần xoá — luôn suy ra từ chính AllowedIPs đã dùng lúc thêm.</summary>
    public static IReadOnlyList<WindowsCommand> BuildRouteDeletes(string interfaceName, WireGuardConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);
        var commands = new List<WindowsCommand>();
        foreach (var prefix in SplitAllowedIps(EnumerateAllowedIps(config)))
        {
            if (IsIpv4Cidr(prefix))
            {
                commands.Add(DeleteRoute(interfaceName, prefix));
            }
        }
        return commands;
    }

    /// <summary>Toàn bộ lệnh cấu hình interface theo thứ tự: enable → address → MTU → route → DNS.</summary>
    public static IReadOnlyList<WindowsCommand> BuildInterfaceConfiguration(string interfaceName, WireGuardConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);

        var commands = new List<WindowsCommand> { EnableInterface(interfaceName) };

        foreach (var address in config.Addresses)
        {
            if (IsIpv4Cidr(address))
            {
                commands.Add(SetAddress(interfaceName, address));
            }
        }

        if (config.Mtu is { } mtu)
        {
            commands.Add(SetMtu(interfaceName, mtu));
        }

        commands.AddRange(BuildRouteAdds(interfaceName, config));

        var dnsIndex = 1;
        foreach (var server in config.DnsServers)
        {
            if (!IPAddress.TryParse(server, out _))
            {
                continue; // bỏ qua search domain / giá trị không phải IP
            }

            commands.Add(dnsIndex == 1 ? SetDns(interfaceName, server) : AddDns(interfaceName, server, dnsIndex));
            dnsIndex++;
        }

        return commands;
    }

    private static IEnumerable<string> EnumerateAllowedIps(WireGuardConfig config)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var peer in config.Peers)
        {
            foreach (var allowedIp in peer.AllowedIPs)
            {
                if (seen.Add(allowedIp))
                {
                    yield return allowedIp;
                }
            }
        }
    }

    private static void EnsureRouteCidr(string cidr)
    {
        if (!IsIpv4Cidr(cidr))
        {
            throw new WireGuardConfigException($"Route must be IPv4 CIDR (got '{cidr}').");
        }
    }

    private static void AddUnique(List<string> list, string value)
    {
        if (!list.Contains(value, StringComparer.Ordinal))
        {
            list.Add(value);
        }
    }
}
