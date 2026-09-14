using System.Globalization;
using System.Text;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Cấu hình WireGuard dùng để dựng file <c>.conf</c> cho <c>wireguard.exe</c> trên Windows.
///
/// Port trung thực từ:
///  - iOS/macOS <c>WireGuardConfig.swift</c> (iOS/PrivateVPN/Services/WireGuardConfig.swift:17-165)
///    — model name/privateKey/addresses/dns/peers + relayHost/relayPorts/wsRelayURL.
///  - Android <c>WireGuardTunnelConfig.toWgQuickConfig()</c>
///    (android/.../vpn/VPNManager.kt:607-639) — đây là nơi DUY NHẤT trong repo
///    thực sự ghi ra định dạng wg-quick text, nên thứ tự/định dạng field bám theo file đó.
/// </summary>
public sealed class WireGuardConfig
{
    /// <summary>
    /// MTU mặc định của WireGuard là 1420. Android dùng 1500 cho TUN của Hysteria
    /// (HysteriaVpnService.kt:1083), nhưng đó là MTU của interface hysteria2, không
    /// phải của WireGuard, nên ở đây giữ 1420 và cho phép ghi đè.
    /// </summary>
    public const int DefaultMtu = 1420;

    public string Name { get; set; } = "vpnflow";
    public string PrivateKeyBase64 { get; set; } = string.Empty;
    public List<string> Addresses { get; set; } = new();
    public List<string> DnsServers { get; set; } = new();
    public List<WireGuardPeer> Peers { get; set; } = new();

    /// <summary>MTU ghi vào [Interface]; null = không ghi dòng MTU (wireguard.exe dùng mặc định).</summary>
    public int? Mtu { get; set; } = DefaultMtu;

    /// <summary>
    /// Peer của WireGuard, mirror <c>WireGuardConfig.WireGuardPeer</c>
    /// (WireGuardConfig.swift:45-51) và <c>WireGuardPeer</c> (VPNManager.kt:632-639).
    /// </summary>
    public sealed class WireGuardPeer
    {
        public string PublicKeyBase64 { get; set; } = string.Empty;
        public string? Endpoint { get; set; }
        public List<string> AllowedIPs { get; set; } = new();
        public string? PreSharedKeyBase64 { get; set; }
        public int? PersistentKeepAlive { get; set; }
    }

    /// <summary>
    /// Dựng nội dung file <c>.conf</c> (wg-quick) — tương đương
    /// <c>WireGuardTunnelConfig.toWgQuickConfig()</c> (VPNManager.kt:615-629),
    /// thêm dòng MTU mà bản Android không ghi.
    /// </summary>
    public string ToConfText()
    {
        Validate();

        var sb = new StringBuilder();
        sb.Append("[Interface]\n");
        sb.Append("PrivateKey = ").Append(PrivateKeyBase64).Append('\n');
        foreach (var address in Addresses)
        {
            sb.Append("Address = ").Append(address).Append('\n');
        }
        foreach (var dns in DnsServers)
        {
            sb.Append("DNS = ").Append(dns).Append('\n');
        }
        if (Mtu is { } mtu)
        {
            sb.Append("MTU = ").Append(mtu.ToString(CultureInfo.InvariantCulture)).Append('\n');
        }

        foreach (var peer in Peers)
        {
            sb.Append('\n').Append("[Peer]\n");
            sb.Append("PublicKey = ").Append(peer.PublicKeyBase64).Append('\n');
            if (!string.IsNullOrWhiteSpace(peer.PreSharedKeyBase64))
            {
                sb.Append("PresharedKey = ").Append(peer.PreSharedKeyBase64).Append('\n');
            }
            foreach (var allowedIp in peer.AllowedIPs)
            {
                sb.Append("AllowedIPs = ").Append(allowedIp).Append('\n');
            }
            if (!string.IsNullOrWhiteSpace(peer.Endpoint))
            {
                sb.Append("Endpoint = ").Append(peer.Endpoint).Append('\n');
            }
            if (peer.PersistentKeepAlive is { } keepAlive)
            {
                sb.Append("PersistentKeepalive = ")
                    .Append(keepAlive.ToString(CultureInfo.InvariantCulture)).Append('\n');
            }
        }

        return sb.ToString();
    }

    /// <summary>Ghi file <c>.conf</c>; thư mục cha phải tồn tại.</summary>
    public void WriteTo(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        File.WriteAllText(path, ToConfText(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    }

    /// <summary>
    /// Trỏ peer đầu tiên vào listener local của transport (relay).
    /// Mirror <c>PacketTunnelProvider.configuration(_:pointingAt:)</c>
    /// (PacketTunnelProvider.swift:170-182): chỉ peer đầu bị đổi, các peer khác giữ nguyên.
    /// Trả về bản sao, không sửa instance gốc (để còn dùng lại endpoint trực tiếp).
    /// </summary>
    public WireGuardConfig WithFirstPeerEndpoint(string endpoint)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(endpoint);
        var copy = Copy();
        if (copy.Peers.Count == 0)
        {
            return copy;
        }
        copy.Peers[0].Endpoint = endpoint;
        return copy;
    }

    /// <summary>Bản sao sâu, để transport có thể đổi endpoint mà không phá cấu hình gốc.</summary>
    public WireGuardConfig Copy()
    {
        return new WireGuardConfig
        {
            Name = Name,
            PrivateKeyBase64 = PrivateKeyBase64,
            Addresses = new List<string>(Addresses),
            DnsServers = new List<string>(DnsServers),
            Mtu = Mtu,
            Peers = Peers.Select(peer => new WireGuardPeer
            {
                PublicKeyBase64 = peer.PublicKeyBase64,
                Endpoint = peer.Endpoint,
                AllowedIPs = new List<string>(peer.AllowedIPs),
                PreSharedKeyBase64 = peer.PreSharedKeyBase64,
                PersistentKeepAlive = peer.PersistentKeepAlive,
            }).ToList(),
        };
    }

    /// <summary>
    /// Kiểm tra tối thiểu trước khi ghi file. Mirror các lỗi cấu hình của iOS
    /// (WireGuardConfig.swift:143-163) ở mức cần thiết cho wireguard.exe.
    /// </summary>
    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(PrivateKeyBase64))
        {
            throw new WireGuardConfigException("PrivateKey is required.");
        }
        if (Addresses.Count == 0)
        {
            throw new WireGuardConfigException("At least one Address is required.");
        }
        if (Peers.Count == 0)
        {
            throw new WireGuardConfigException("At least one Peer is required.");
        }
        foreach (var peer in Peers)
        {
            if (string.IsNullOrWhiteSpace(peer.PublicKeyBase64))
            {
                throw new WireGuardConfigException("Peer PublicKey is required.");
            }
            if (peer.AllowedIPs.Count == 0)
            {
                throw new WireGuardConfigException("Peer AllowedIPs is required.");
            }
        }
    }
}

/// <summary>Lỗi cấu hình WireGuard (mirror <c>WireGuardConfig.ConfigError</c>).</summary>
public sealed class WireGuardConfigException : Exception
{
    public WireGuardConfigException(string message) : base(message)
    {
    }
}
