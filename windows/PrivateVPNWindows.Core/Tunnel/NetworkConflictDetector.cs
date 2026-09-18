namespace PrivateVPNWindows.Core.Tunnel;

/// <summary>Mức độ cảnh báo khi phát hiện phần mềm mạng khác đang tranh chấp với VPNFlow.</summary>
public enum NetworkConflictSeverity
{
    /// <summary>Chỉ là thông tin (không chắc gây lỗi).</summary>
    Info,

    /// <summary>Có thể làm chậm/kết nối chập chờn — nên xử lý.</summary>
    Warning,

    /// <summary>Gần như chắc chắn làm VPNFlow không kết nối / không đăng nhập được.</summary>
    Blocking,
}

/// <summary>Một xung đột mạng phát hiện được, kèm hướng dẫn cho người dùng.</summary>
public sealed record NetworkConflict(
    NetworkConflictSeverity Severity,
    string Title,
    string Detail,
    string Advice);

/// <summary>Thông tin adapter cần cho việc phân tích (tách khỏi API hệ thống để test được).</summary>
public sealed record AdapterInfo(
    string Name,
    string Description,
    bool IsTunnelType,
    bool HasDefaultRoute,
    string? Gateway);

/// <summary>Ảnh chụp trạng thái hệ thống (do tầng App cung cấp).</summary>
public sealed record NetworkConflictInputs(
    IReadOnlyList<AdapterInfo> Adapters,
    IReadOnlyList<string> RunningProcessNames,
    bool SystemProxyEnabled,
    string? SystemProxyServer);

/// <summary>
/// Phát hiện phần mềm mạng khác đang tranh chấp với VPNFlow trên Windows.
///
/// Vì sao cần: Clash Verge / Mihomo / v2rayN… bật TUN sẽ chiếm default route và (mặc định)
/// chạy DNS fake-IP. Khi đó:
///   · gói WireGuard/Hysteria (UDP) của VPNFlow bị đẩy vào TUN của họ ⇒ không bắt tay được;
///   · route loại trừ endpoint của VPNFlow trỏ vào gateway ảo của họ ⇒ tự tạo vòng lặp;
///   · request HTTPS tới api.meetflowai.site bị proxy/fake-IP ⇒ KHÔNG đăng nhập, KHÔNG nhận OTP.
/// Người dùng chỉ thấy "connecting mãi" nên rất khó tự đoán ra — vì vậy phải cảnh báo rõ.
/// </summary>
public static class NetworkConflictDetector
{
    /// <summary>Tên adapter của chính VPNFlow — không được coi là xung đột.</summary>
    public static readonly string[] OwnAdapterMarkers = { "vpnflow", "privatevpn" };

    /// <summary>Dấu hiệu adapter ảo/TUN của phần mềm khác (so khớp không phân biệt hoa thường).</summary>
    public static readonly string[] VirtualAdapterMarkers =
    {
        "clash", "mihomo", "wintun", "tap-windows", "tap0901", "wireguard", "sing-box", "singbox",
        "netch", "openvpn", "tailscale", "zerotier", "proxy", "tun", "tap",
        "v2ray", "xray", "nekoray", "nekobox", "hysteria", "shadowsocks", "trojan", "proxifier", "sstap",
    };

    /// <summary>Tiến trình của các phần mềm proxy/VPN phổ biến (không kèm .exe).</summary>
    public static readonly string[] KnownProxyProcesses =
    {
        "clash", "clash-verge", "clash-verge-service", "verge-mihomo", "mihomo", "clash-meta",
        "v2rayn", "v2ray", "xray", "sing-box", "netch", "nekoray", "nekobox", "qv2ray",
        "openvpn", "wireguard", "wintun", "shadowsocks", "ss-local", "trojan", "hysteria",
        "tailscale", "zerotier-one", "proxifier", "sstap",
    };

    /// <summary>Adapter này có phải của phần mềm khác (không phải VPNFlow) không.</summary>
    public static bool IsForeignVirtualAdapter(string? name, string? description, bool isTunnelType)
    {
        var text = $"{name} {description}".ToLowerInvariant();
        if (OwnAdapterMarkers.Any(marker => text.Contains(marker, StringComparison.Ordinal)))
        {
            return false;
        }

        if (isTunnelType)
        {
            return true;
        }

        return VirtualAdapterMarkers.Any(marker => text.Contains(marker, StringComparison.Ordinal));
    }

    /// <summary>Tên tiến trình có phải phần mềm proxy/VPN đã biết không (bỏ đuôi .exe).</summary>
    public static bool IsKnownProxyProcess(string? processName)
    {
        if (string.IsNullOrWhiteSpace(processName))
        {
            return false;
        }

        var name = processName.Trim().ToLowerInvariant();
        if (name.EndsWith(".exe", StringComparison.Ordinal))
        {
            name = name[..^4];
        }

        return KnownProxyProcesses.Any(known => known.Equals(name, StringComparison.Ordinal));
    }

    /// <summary>Phân tích và trả về danh sách cảnh báo (rỗng = không có xung đột).</summary>
    public static IReadOnlyList<NetworkConflict> Analyze(NetworkConflictInputs inputs)
    {
        ArgumentNullException.ThrowIfNull(inputs);
        var conflicts = new List<NetworkConflict>();

        var foreignWithDefaultRoute = inputs.Adapters
            .Where(a => IsForeignVirtualAdapter(a.Name, a.Description, a.IsTunnelType))
            .Where(a => a.HasDefaultRoute)
            .ToList();

        if (foreignWithDefaultRoute.Count > 0)
        {
            var names = string.Join(", ", foreignWithDefaultRoute.Select(a => string.IsNullOrWhiteSpace(a.Name) ? a.Description : a.Name));
            conflicts.Add(new NetworkConflict(
                NetworkConflictSeverity.Blocking,
                "Có phần mềm VPN/proxy khác đang giữ đường mạng mặc định",
                $"Adapter đang chiếm default route: {names}. VPNFlow sẽ không bắt tay được và cũng không gọi được API để đăng nhập.",
                "Hãy TẮT chế độ TUN (hoặc thoát hẳn Clash Verge / v2rayN / sing-box) rồi bấm Kết nối lại. "
                + "Nếu buộc chạy song song, thêm các rule DIRECT sau LÊN ĐẦU danh sách rules:\n"
                + "  PROCESS-NAME,PrivateVPNWindows.App.exe,DIRECT\n"
                + "  DOMAIN-SUFFIX,meetflowai.site,DIRECT\n"
                + "  IP-CIDR,165.101.114.162/32,DIRECT,no-resolve\n"
                + "  IP-CIDR,103.173.155.50/32,DIRECT,no-resolve\n"
                + "và thêm meetflowai.site vào fake-ip-filter của DNS."));
        }

        if (inputs.SystemProxyEnabled)
        {
            var server = string.IsNullOrWhiteSpace(inputs.SystemProxyServer) ? "" : $" ({inputs.SystemProxyServer})";
            conflicts.Add(new NetworkConflict(
                NetworkConflictSeverity.Warning,
                "Đang bật proxy hệ thống của Windows",
                $"Proxy hệ thống đang bật{server}. Request HTTPS tới api.meetflowai.site có thể bị đẩy qua proxy/fake-IP nên đăng nhập hoặc nhận mã OTP sẽ thất bại.",
                "Tắt proxy hệ thống (Settings → Network & Internet → Proxy) hoặc thêm DOMAIN-SUFFIX,meetflowai.site,DIRECT vào rules."));
        }

        var running = inputs.RunningProcessNames
            .Where(IsKnownProxyProcess)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (running.Count > 0)
        {
            var alreadyWarned = conflicts.Any(c => c.Severity == NetworkConflictSeverity.Blocking);
            conflicts.Add(new NetworkConflict(
                alreadyWarned ? NetworkConflictSeverity.Info : NetworkConflictSeverity.Warning,
                "Phát hiện phần mềm proxy/VPN đang chạy",
                $"Tiến trình: {string.Join(", ", running)}. Phần mềm này có thể đang chặn hoặc định tuyến lại traffic của VPNFlow.",
                alreadyWarned
                    ? "Đã cảnh báo ở trên — xử lý theo hướng dẫn đó là đủ."
                    : "Nếu VPNFlow kết nối chập chờn, hãy tắt TUN/proxy của phần mềm này hoặc thêm rule DIRECT cho meetflowai.site."));
        }

        return conflicts;
    }
}
