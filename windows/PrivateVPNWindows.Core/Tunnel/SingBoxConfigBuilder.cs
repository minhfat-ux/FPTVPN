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

    /// <summary>
    /// DNS nội địa Trung Quốc (AliDNS). Vì sao cần: truy vấn DNS của đường relay đi qua node ở
    /// Việt Nam, nên tên miền dịch vụ TQ bị phân giải từ góc nhìn nước ngoài và trả về IP CDN
    /// ngoài TQ — khi đó rule <c>ip_cidr</c> (dải TQ) KHÔNG khớp và traffic lại chui vào tunnel,
    /// tức là bypass vô hiệu dù đã có danh sách. Phân giải bằng resolver nội địa thì IP trả về
    /// nằm trong dải TQ ⇒ rule mới thật sự có tác dụng.
    /// </summary>
    public const string ChinaDomesticDnsServer = "223.5.5.5";

    /// <summary>Tag DNS server nội địa Trung Quốc.</summary>
    public const string ChinaDnsServerTag = "cn";

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

    /// <summary>
    /// Tên miền dịch vụ Trung Quốc KHÔNG thuộc <c>.cn</c> và không thuộc Tencent — đúng nhóm bị
    /// <see cref="ChinaDirectDomainSuffixes"/> bỏ sót hoàn toàn.
    ///
    /// Vì sao có danh sách này: đo ngày 22/09/2026 (khách báo "bật VPN không bypass được app Trung
    /// Quốc"), đối chiếu 36 tên miền app TQ phổ biến với danh sách cũ thì chỉ **3 khớp** — 33 tên
    /// miền còn lại (alipay.com, taobao.com, baidu.com, jd.com, meituan.com, bilibili.com,
    /// douyin.com…) đều đi qua tunnel ⇒ server TQ thấy IP nước ngoài ⇒ cắt kết nối.
    ///
    /// Dùng cho HAI việc, có chủ ý khác nhau:
    ///  · rule <c>domain_suffix → direct</c>: đi thẳng theo TÊN MIỀN, không phụ thuộc IP;
    ///  · rule DNS: phân giải bằng resolver nội địa (xem <see cref="ChinaDomesticDnsServer"/>).
    /// KHÔNG đưa <c>.cn</c>/Tencent vào rule DNS: nhóm đó đã đi thẳng theo tên miền nên không cần,
    /// và giữ nguyên như vậy thì resolver nội địa có trục trặc cũng không làm hỏng thứ đang chạy tốt.
    /// </summary>
    public static readonly IReadOnlyList<string> ChinaServiceDomainSuffixes = new[]
    {
        // Thanh toán / ngân hàng / tài chính
        "alipay.com", "alipayobjects.com", "unionpay.com", "ccb.com", "abchina.com",
        "cmbchina.com", "bankcomm.com", "psbc.com",
        // Mua sắm / vận chuyển
        "taobao.com", "tmall.com", "alicdn.com", "alibaba.com", "alibabacloud.com", "1688.com",
        "jd.com", "pinduoduo.com", "yangkeduo.com", "suning.com", "cainiao.com", "sf-express.com",
        // Tìm kiếm / bản đồ / gọi xe / đồ ăn
        "baidu.com", "bdstatic.com", "meituan.com", "dianping.com", "ele.me",
        "didiglobal.com", "amap.com", "autonavi.com",
        // Video / nhạc / mạng xã hội
        "bilibili.com", "hdslb.com", "douyin.com", "bytedance.com", "ixigua.com", "kuaishou.com",
        "iqiyi.com", "youku.com", "weibo.com", "zhihu.com", "xiaohongshu.com", "163.com",
        // Du lịch / văn phòng
        "qunar.com", "ctrip.com", "wps.com",
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
    /// <paramref name="chinaCidrs"/> là danh sách dải IP Trung Quốc (cn.txt + cn6.txt) sẽ đi
    /// THẲNG, không vào tunnel. Bỏ trống/null ⇒ không sinh rule bypass nào (giữ nguyên hành vi cũ).
    /// </summary>
    public static string BuildSingBoxConfig(
        int relaySocksPort,
        string logPath,
        int clashApiPort,
        string tunAddress = TunAddress,
        int tunMtu = TunMtu,
        string dnsServer = DefaultDnsServer,
        IReadOnlyList<string>? chinaCidrs = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(relaySocksPort);
        ArgumentException.ThrowIfNullOrWhiteSpace(logPath);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(clashApiPort);

        var bypassChina = chinaCidrs is { Count: > 0 };

        // Rule đi thẳng theo TÊN MIỀN: danh sách cũ (Tencent + .cn) gộp với nhóm dịch vụ TQ đã đo
        // được là bị bỏ sót. Một rule duy nhất để thứ tự rule không phụ thuộc việc ai được thêm sau.
        var directDomainSuffixes = ChinaDirectDomainSuffixes
            .Concat(ChinaServiceDomainSuffixes)
            .ToArray();

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
                ["servers"] = BuildDnsServers(dnsServer, bypassChina),
                ["rules"] = BuildDnsRules(bypassChina),
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
            ["route"] = BuildRoute(directDomainSuffixes, chinaCidrs, bypassChina),
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
    /// Khối <c>route</c>: rule định tuyến + final + resolver mặc định.
    /// </summary>
    private static JsonObject BuildRoute(
        IReadOnlyList<string> directDomainSuffixes,
        IReadOnlyList<string>? chinaCidrs,
        bool bypassChina)
    {
        var route = new JsonObject
        {
            ["rules"] = BuildRouteRules(directDomainSuffixes, chinaCidrs, bypassChina),
            ["final"] = RelayOutboundTag,
            ["auto_detect_interface"] = true,
        };

        if (bypassChina)
        {
            // BẮT BUỘC khi có dns.rules/DNS server thứ hai: từ 1.14 sing-box coi việc thiếu trường này
            // là lỗi FATAL ("missing `route.default_domain_resolver` … removed in sing-box 1.14.0") —
            // đã kiểm bằng chính sing-box.exe 1.14.1 đóng trong repo.
            route["default_domain_resolver"] = DnsServerTag;
        }

        return route;
    }

    /// <summary>
    /// DNS server của đường relay. Chỉ thêm resolver nội địa TQ khi CÓ danh sách bypass — không có
    /// rule <c>ip_cidr</c> thì đổi resolver chẳng đem lại gì mà lại thêm một phụ thuộc mạng.
    /// </summary>
    private static JsonArray BuildDnsServers(string dnsServer, bool bypassChina)
    {
        var servers = new JsonArray
        {
            new JsonObject
            {
                ["type"] = "udp",
                ["tag"] = DnsServerTag,
                ["server"] = dnsServer,
                // ĐI QUA TUNNEL - sự cố production 23/09/2026 (khách TQ không vào được Google/YouTube).
                //
                // Vì sao BẮT BUỘC có `detour`: DNS server KHÔNG có `detour` thì sing-box tự dial
                // THẲNG ra ngoài, không qua tunnel ⇒ ở Trung Quốc truy vấn bị GFW nhiễm độc. Bằng
                // chứng đo trên máy harness (mạng TQ, bản 1.4.5) trong sing-box.log:
                //   exchanged A www.youtube.com -> 69.171.235.22   (IP của FACEBOOK, không phải YouTube)
                //   exchanged A www.google.com  -> 69.171.235.22
                //   exchanged AAAA www.google.com -> 2001::1       (địa chỉ rác kinh điển của GFW)
                //   KHÔNG có dòng nào cho thấy DNS đi qua outbound/socks[hyrelay]
                // Đặt `detour: hyrelay` thì truy vấn được gửi qua relay (exit Việt Nam) ⇒ trả lời THẬT.
                ["detour"] = RelayOutboundTag,
            },
        };

        if (bypassChina)
        {
            servers.Add(new JsonObject
            {
                ["type"] = "udp",
                ["tag"] = ChinaDnsServerTag,
                ["server"] = ChinaDomesticDnsServer,
                // KHÔNG đặt "detour":"direct" ở đây - sing-box 1.14.1 FATAL ngay khi chạy:
                //   "start service: start dns/udp[cn]: detour to an empty direct outbound makes no sense"
                // (cổng `sing-box check` KHÔNG bắt được lỗi này, chỉ khi `run` mới lộ - đã kiểm chứng
                // 23/09/2026 bằng cách chạy thật với mixed inbound). Bỏ trống detour thì resolver này
                // được dial thẳng - đúng ý muốn: tên miền nội địa TQ không bị nhiễm độc.
            });
        }

        return servers;
    }

    /// <summary>
    /// Phân giải tên miền dịch vụ TQ bằng resolver nội địa (xem <see cref="ChinaDomesticDnsServer"/>).
    ///
    /// Chỉ áp cho <see cref="ChinaServiceDomainSuffixes"/> — cố ý KHÔNG áp cho <c>.cn</c>/Tencent: nhóm
    /// đó đã đi thẳng theo tên miền nên không cần, và giữ nguyên như vậy thì resolver nội địa có trục
    /// trặc cũng không làm hỏng thứ đang chạy tốt (không tạo hồi quy cho khách đang dùng được).
    /// </summary>
    private static JsonArray BuildDnsRules(bool bypassChina)
    {
        var rules = new JsonArray();
        if (!bypassChina)
        {
            return rules;
        }

        rules.Add(new JsonObject
        {
            ["domain_suffix"] = new JsonArray(ChinaServiceDomainSuffixes.Select(d => (JsonNode)d!).ToArray()),
            ["server"] = ChinaDnsServerTag,
        });
        return rules;
    }

    /// <summary>
    /// Rule định tuyến, thứ tự QUAN TRỌNG: sniff trước (để có domain), rồi LAN, rồi dải TQ đi thẳng
    /// theo IP, rồi tên miền TQ đi thẳng, cuối cùng mới hijack DNS.
    /// </summary>
    private static JsonArray BuildRouteRules(
        IReadOnlyList<string> directDomainSuffixes,
        IReadOnlyList<string>? chinaCidrs,
        bool bypassChina)
    {
        var rules = new JsonArray
        {
            // THỨ TỰ BẮT BUỘC - sự cố production 23/09/2026 (bản 1.4.5 làm khách TQ mất mạng và
            // không vào được Google/YouTube):
            //
            //  1. `sniff` PHẢI đứng TRƯỚC `hijack-dns`, vì matcher `protocol` chỉ khớp SAU khi sniff.
            //     Bằng chứng (đo trên máy harness, mạng TQ): khi đặt hijack-dns ở vị trí 1 (trước
            //     sniff), sing-box.log VẪN ghi
            //       "inbound packet connection to 10.193.111.16:53 -> outbound/direct[direct]"
            //     tức rule hijack-dns KHÔNG khớp, DNS của khách vẫn đi thẳng ra resolver TQ.
            //  2. `hijack-dns` PHẢI đứng TRƯỚC mọi rule khớp theo IP (`ip_is_private`, `ip_cidr`).
            //     Khách ở TQ khai resolver là IP TQ / IP nội bộ (10.x, 192.168.x); nếu rule IP đứng
            //     trước thì `outbound: direct` thắng => DNS đi thẳng => GFW nhiễm độc:
            //       exchanged A www.youtube.com -> 69.171.235.22 (IP Facebook)
            //       exchanged AAAA www.google.com -> 2001::1
            //
            // Đủ hai điều kiện trên thì MỌI truy vấn DNS vào TUN được sing-box tự phân giải: qua
            // `remote` (1.1.1.1, TRONG tunnel) cho tên miền thường, hoặc `cn` (223.5.5.5) cho nhóm
            // tên miền dịch vụ TQ - xem BuildDnsRules/BuildDnsServers.
            new JsonObject { ["action"] = "sniff" },
            new JsonObject { ["protocol"] = "dns", ["action"] = "hijack-dns" },
            // LAN + dải nội bộ KHÔNG đi vào tunnel (mất truy cập máy in/NAS nếu đi).
            new JsonObject { ["ip_is_private"] = true, ["outbound"] = DirectOutboundTag },
        };

        if (bypassChina)
        {
            // Dải IP Trung Quốc đi THẲNG. Vì sao theo IP chứ không chỉ theo tên miền: phần lớn app TQ
            // gọi API bằng tên miền .com (alipay.com, taobao.com…) mà danh sách tên miền không bao giờ
            // đủ; theo dải APNIC thì phủ hết mà không phải bảo trì từng app.
            // KHÔNG dùng "geoip": sing-box đã bỏ geoip từ 1.12 (kiểm bằng chính binary 1.14.1).
            rules.Add(new JsonObject
            {
                ["ip_cidr"] = new JsonArray(chinaCidrs!.Select(c => (JsonNode)c!).ToArray()),
                ["outbound"] = DirectOutboundTag,
            });
        }

        rules.Add(new JsonObject
        {
            ["domain_suffix"] = new JsonArray(directDomainSuffixes.Select(d => (JsonNode)d!).ToArray()),
            ["outbound"] = DirectOutboundTag,
        });

        return rules;
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
