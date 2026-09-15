using System.Globalization;
using System.Text;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Dựng chuỗi <c>set</c> của UAPI WireGuard (xem
/// https://www.wireguard.com/xplatform/#configuration-protocol) để nạp cấu hình
/// vào wireguard-go qua named pipe.
///
/// Lưu ý định dạng: UAPI dùng khoá **hex thường** (32 byte → 64 ký tự), KHÁC với
/// base64 trong file <c>.conf</c>, nên phải đổi. Mỗi operation kết thúc bằng MỘT
/// dòng trống; response là <c>errno=0</c> (thành công) hoặc <c>errno=&lt;mã&gt;</c>.
/// </summary>
public static class WireGuardUapi
{
    public static string BuildSetConf(WireGuardConfig config)
    {
        ArgumentNullException.ThrowIfNull(config);
        config.Validate();

        var sb = new StringBuilder();
        sb.Append("set=1\n");
        sb.Append("private_key=").Append(KeyBase64ToHex(config.PrivateKeyBase64)).Append('\n');
        sb.Append("replace_peers=true\n");

        foreach (var peer in config.Peers)
        {
            sb.Append("public_key=").Append(KeyBase64ToHex(peer.PublicKeyBase64)).Append('\n');
            if (!string.IsNullOrWhiteSpace(peer.PreSharedKeyBase64))
            {
                sb.Append("preshared_key=").Append(KeyBase64ToHex(peer.PreSharedKeyBase64)).Append('\n');
            }
            if (!string.IsNullOrWhiteSpace(peer.Endpoint))
            {
                sb.Append("endpoint=").Append(peer.Endpoint).Append('\n');
            }
            if (peer.PersistentKeepAlive is { } keepAlive)
            {
                sb.Append("persistent_keepalive_interval=")
                    .Append(keepAlive.ToString(CultureInfo.InvariantCulture)).Append('\n');
            }
            sb.Append("replace_allowed_ips=true\n");
            foreach (var allowedIp in peer.AllowedIPs)
            {
                sb.Append("allowed_ip=").Append(allowedIp).Append('\n');
            }
        }

        // Dòng trống kết thúc operation — wireguard-go chỉ xử lý khi gặp dòng này.
        sb.Append('\n');
        return sb.ToString();
    }

    /// <summary>Đổi khoá base64 (như trong .conf) sang hex thường (như UAPI yêu cầu).</summary>
    public static string KeyBase64ToHex(string base64Key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(base64Key);

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(base64Key);
        }
        catch (FormatException ex)
        {
            throw new WireGuardConfigException($"WireGuard key is not valid base64: {ex.Message}");
        }

        if (bytes.Length != 32)
        {
            throw new WireGuardConfigException($"WireGuard key must be 32 bytes (got {bytes.Length}).");
        }

        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    /// <summary>
    /// Lấy <c>errno</c> từ response UAPI. Trả null khi response rỗng/không có dòng errno.
    /// </summary>
    public static int? ParseErrno(string? response)
    {
        if (string.IsNullOrEmpty(response))
        {
            return null;
        }

        foreach (var rawLine in response.Split('\n'))
        {
            var line = rawLine.Trim();
            if (!line.StartsWith("errno=", StringComparison.Ordinal))
            {
                continue;
            }

            return int.TryParse(line[6..], NumberStyles.Integer, CultureInfo.InvariantCulture, out var code)
                ? code
                : null;
        }

        return null;
    }
}
