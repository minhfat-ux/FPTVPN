using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization.Metadata;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Sinh hai file cấu hình JSON của đường "hysteria2-over-WebSocket + sing-box":
///  1. <c>flowvpnrelay.exe</c> — schema đúng theo <c>tools/hysteria-relay/runner.go</c>
///     (<c>config</c> struct trong file đó là nguồn sự thật; đổi ở đây phải đổi ở đó).
///  2. <c>sing-box.exe</c> v1.14 — TUN + định tuyến + DNS, outbound trỏ vào SOCKS5 nội bộ
///     của flowvpnrelay.
///
/// Hai hàm ở đây THUẦN (không mở socket, không đọc file) nên test được trên macOS; phần
/// cấp cổng trống là hàm riêng vì nó có side-effect.
/// </summary>
public static class SingBoxConfigBuilder
{
    /// <summary>Address của TUN. /30 để sing-box có gateway ảo, tránh đụng LAN 192.168.x/10.x.</summary>
    public const string TunAddress = "172.19.0.1/30";

    /// <summary>MTU của TUN: trên QUIC/WS relay thì 1500 vẫn qua được (datagram ≤ ~1500).</summary>
    public const int TunMtu = 1500;

    /// <summary>gvisor chạy userspace, không cần driver kernel — hợp với app tự lo tunnel.</summary>
    public const string TunStack = "gvisor";

    public const string DefaultDnsServer = "1.1.1.1";

    public const string TunInboundTag = "tun-in";
    public const string RelayOutboundTag = "hyrelay";
    public const string DirectOutboundTag = "direct";
    public const string DnsServerTag = "remote";

    /// <summary>
    /// Tên miền đi THẲNG (không qua VPN), dùng cho "vượt qua cho WeChat" mà chủ dự án
    /// yêu cầu: bật VPN làm WeChat lỗi đăng nhập/dùng chậm vì traffic bị vòng qua node ở
    /// Việt Nam, trong khi dịch vụ nội địa Trung Quốc vốn truy cập tốt tại chỗ.
    ///
    /// Danh sách này là điểm khởi đầu (WeChat/Tencent + tên miền .cn). Phần đầy đủ hơn
    /// (geoip:cn / geosite:cn theo rule-set) là việc tiếp theo — xem
    /// docs/WINDOWS_HARNESS_TEST_PLAN.md và docs/TRANSPORT_SPEED_2026-09-19.md mục 7.
    /// </summary>
    public static readonly IReadOnlyList<string> ChinaDirectDomainSuffixes = new[]
    {
        // WeChat / Tencent
        "weixin.qq.com",
        "wechat.com",
        "weixinbridge.com",
        "servicewechat.com",
        "qpic.cn",
        "gtimg.com",
        "gtimg.cn",
        "qlogo.cn",
        "tencent.com",
        "tencent-cloud.com",
        "myqcloud.com",
        "qq.com",
        "qcloud.com",
        // Tên miền quốc gia .cn nói chung
        "cn",
    };

    // JsonNode.ToJsonString cần TypeInfoResolver (net8.0 từ chối options chỉ có WriteIndented).
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        TypeInfoResolver = new DefaultJsonTypeInfoResolver(),
    };

    /// <summary>
    /// Cấu hình cho <c>flowvpnrelay.exe -c &lt;file&gt;</c>.
    /// <paramref name="server"/> là <c>&lt;ip-node&gt;:8443</c> — chỉ còn là danh tính khi đi qua relay.
    /// </summary>
    public static string BuildRelayConfig(
        string server,
        string relayUrl,
        int socksPort,
        string? password = null,
        string? obfs = null,
        string? relayHost = null,
        int upKbps = HysteriaRelayDefaults.UpKbps,
        int downKbps = HysteriaRelayDefaults.DownKbps,
        int dialTimeoutSec = HysteriaRelayDefaults.DialTimeoutSec)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(server);
        ArgumentException.ThrowIfNullOrWhiteSpace(relayUrl);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(socksPort);

        var relay = new JsonObject
        {
            ["server"] = server,
            ["password"] = password ?? HysteriaRelayDefaults.Password,
            ["obfs"] = obfs ?? HysteriaRelayDefaults.Obfs,
            // Server dùng cert tự ký: KHÔNG xác thực chuỗi chứng chỉ, đúng như runner.go mặc định.
            ["insecure"] = true,
            ["upKbps"] = upKbps,
            ["downKbps"] = downKbps,
            ["transport"] = new JsonObject
            {
                ["type"] = "wsrelay",
                ["url"] = relayUrl,
                ["host"] = relayHost ?? HostOf(relayUrl) ?? HysteriaRelayDefaults.RelayHost,
            },
            ["socks5"] = new JsonObject { ["listen"] = $"127.0.0.1:{socksPort}" },
            ["dialTimeoutSec"] = dialTimeoutSec,
        };

        return relay.ToJsonString(WriteOptions);
    }

    /// <summary>
    /// Cấu hình cho <c>sing-box.exe run -c &lt;file&gt;</c> (v1.14).
    /// <paramref name="relaySocksPort"/> phải là cổng SOCKS5 mà flowvpnrelay đang mở; chỉ
    /// khi đó sang đây thì toàn bộ traffic mới đi qua relay.
    /// </summary>
    public static string BuildSingBoxConfig(
        int relaySocksPort,
        string logPath,
        int clashApiPort,
        string tunAddress = TunAddress,
        int tunMtu = TunMtu,
        string dnsServer = DefaultDnsServer)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(relaySocksPort);
        ArgumentException.ThrowIfNullOrWhiteSpace(logPath);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(clashApiPort);

        var root = new JsonObject
        {
            ["log"] = new JsonObject
            {
                ["level"] = "info",
                ["output"] = logPath,
                ["timestamp"] = true,
            },
            ["dns"] = new JsonObject
            {
                ["servers"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["type"] = "udp",
                        ["tag"] = DnsServerTag,
                        ["server"] = dnsServer,
                    },
                },
                ["final"] = DnsServerTag,
            },
            ["inbounds"] = new JsonArray
            {
                new JsonObject
                {
                    ["type"] = "tun",
                    ["tag"] = TunInboundTag,
                    ["address"] = new JsonArray { tunAddress },
                    ["mtu"] = tunMtu,
                    // auto_route: tự thêm route 0.0.0.0/0 qua TUN; strict_route: chặn rò rỉ
                    // ngoài TUN (bind thẳng interface vật lý) — cần cho full-tunnel thật.
                    ["auto_route"] = true,
                    ["strict_route"] = true,
                    ["stack"] = TunStack,
                },
            },
            ["outbounds"] = new JsonArray
            {
                new JsonObject
                {
                    ["type"] = "socks",
                    ["tag"] = RelayOutboundTag,
                    ["server"] = "127.0.0.1",
                    ["server_port"] = relaySocksPort,
                    ["version"] = "5",
                },
                new JsonObject
                {
                    ["type"] = "direct",
                    ["tag"] = DirectOutboundTag,
                },
            },
            ["route"] = new JsonObject
            {
                ["rules"] = new JsonArray
                {
                    // sniff trước để có domain/protocol cho các rule sau.
                    new JsonObject { ["action"] = "sniff" },
                    // LAN + dải nội bộ KHÔNG đi vào tunnel (mất truy cập máy in/NAS nếu đi).
                    new JsonObject { ["ip_is_private"] = true, ["outbound"] = DirectOutboundTag },
                    // WeChat/Tencent + .cn đi thẳng: xem ChinaDirectDomainSuffixes.
                    new JsonObject
                    {
                        ["domain_suffix"] = new JsonArray(
                            ChinaDirectDomainSuffixes.Select(d => (JsonNode)d!).ToArray()),
                        ["outbound"] = DirectOutboundTag,
                    },
                    new JsonObject { ["protocol"] = "dns", ["action"] = "hijack-dns" },
                },
                ["final"] = RelayOutboundTag,
                ["auto_detect_interface"] = true,
            },
            ["experimental"] = new JsonObject
            {
                ["clash_api"] = new JsonObject
                {
                    ["external_controller"] = $"127.0.0.1:{clashApiPort}",
                },
            },
        };

        return root.ToJsonString(WriteOptions);
    }

    /// <summary>
    /// Cấp <paramref name="count"/> cổng TCP trống. Mở đồng thời mọi listener rồi mới đóng để
    /// hai lần gọi liên tiếp không trả về CÙNG một cổng (kernel có thể tái dùng ngay).
    /// </summary>
    public static IReadOnlyList<int> AllocateFreePorts(int count)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(count);

        var listeners = new List<TcpListener>(count);
        try
        {
            var ports = new List<int>(count);
            for (var i = 0; i < count; i++)
            {
                var listener = new TcpListener(IPAddress.Loopback, 0);
                listener.Start();
                listeners.Add(listener);
                ports.Add(((IPEndPoint)listener.LocalEndpoint).Port);
            }

            return ports;
        }
        finally
        {
            foreach (var listener in listeners)
            {
                try
                {
                    listener.Stop();
                }
                catch (Exception)
                {
                    // Best effort: cổng vẫn được nhả khi listener bị GC.
                }
            }
        }
    }

    /// <summary>Một cổng TCP trống (dùng cho SOCKS5 hoặc clash_api).</summary>
    public static int AllocateFreePort() => AllocateFreePorts(1)[0];

    /// <summary>Host của URL relay (để trống host header thì runner.go tự lấy Host của URL).</summary>
    private static string? HostOf(string url)
        => Uri.TryCreate(url, UriKind.Absolute, out var uri) && !string.IsNullOrWhiteSpace(uri.Host)
            ? uri.Host
            : null;
}
