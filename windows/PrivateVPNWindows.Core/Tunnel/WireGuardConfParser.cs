using System.Globalization;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Đọc ngược file wg-quick (<c>.conf</c>) thành <see cref="WireGuardConfig"/>.
///
/// Cần cho driver userspace: <see cref="IWireGuardDriver.InstallAsync"/> chỉ nhận
/// đường dẫn <c>.conf</c> (để dùng chung với driver <c>wireguard.exe</c>), nhưng UAPI
/// của wireguard-go chỉ hiểu khoá dạng hex + các dòng <c>allowed_ip</c>, nên phải
/// parse lại. Chỉ hỗ trợ đúng các khoá mà <see cref="WireGuardConfig.ToConfText"/>
/// ghi ra; khoá lạ bị bỏ qua (không throw) để conf do người dùng tự thêm không làm
/// hỏng tunnel.
/// </summary>
public static class WireGuardConfParser
{
    public static WireGuardConfig Parse(string text)
    {
        ArgumentNullException.ThrowIfNull(text);

        // Mtu mặc định của WireGuardConfig là 1420; ở đây phân biệt "conf không ghi MTU"
        // (null) với "conf ghi 1420" để driver biết có cần set MTU qua netsh hay không.
        var config = new WireGuardConfig { Mtu = null };
        string? section = null;
        WireGuardConfig.WireGuardPeer? peer = null;

        foreach (var rawLine in text.Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#') || line.StartsWith(';'))
            {
                continue;
            }

            if (line.StartsWith('[') && line.EndsWith(']'))
            {
                section = line[1..^1].Trim().ToLowerInvariant();
                if (section == "peer")
                {
                    peer = new WireGuardConfig.WireGuardPeer();
                    config.Peers.Add(peer);
                }
                continue;
            }

            var separator = line.IndexOf('=');
            if (separator < 0)
            {
                continue;
            }

            var key = line[..separator].Trim().ToLowerInvariant();
            var value = line[(separator + 1)..].Trim();

            if (section == "interface")
            {
                ApplyInterfaceLine(config, key, value);
            }
            else if (section == "peer" && peer is not null)
            {
                ApplyPeerLine(peer, key, value);
            }
        }

        return config;
    }

    private static void ApplyInterfaceLine(WireGuardConfig config, string key, string value)
    {
        switch (key)
        {
            case "privatekey":
                config.PrivateKeyBase64 = value;
                break;
            case "address":
                AddCsv(config.Addresses, value);
                break;
            case "dns":
                AddCsv(config.DnsServers, value);
                break;
            case "mtu":
                if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var mtu))
                {
                    config.Mtu = mtu;
                }
                break;
        }
    }

    private static void ApplyPeerLine(WireGuardConfig.WireGuardPeer peer, string key, string value)
    {
        switch (key)
        {
            case "publickey":
                peer.PublicKeyBase64 = value;
                break;
            case "presharedkey":
                peer.PreSharedKeyBase64 = value;
                break;
            case "allowedips":
                AddCsv(peer.AllowedIPs, value);
                break;
            case "endpoint":
                peer.Endpoint = value;
                break;
            case "persistentkeepalive":
                if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var keepAlive))
                {
                    peer.PersistentKeepAlive = keepAlive;
                }
                break;
        }
    }

    // wg-quick cho phép nhiều giá trị trên một dòng, phân tách bằng dấu phẩy.
    private static void AddCsv(List<string> target, string value)
    {
        foreach (var part in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            target.Add(part);
        }
    }
}
