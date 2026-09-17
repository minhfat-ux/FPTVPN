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

    /// <summary>
    /// Parse phản hồi UAPI <c>get=1</c> (wireguard-go qua named pipe) thành số liệu runtime:
    /// handshake MỚI NHẤT trong tất cả peer + tổng <c>rx_bytes</c>.
    ///
    /// Trả <see cref="WireGuardRuntimeStats.Unknown"/> khi response rỗng hoặc không có trường nào
    /// nhận ra được: một lần đọc hỏng KHÔNG được biến thành kết luận "tunnel chết".
    /// </summary>
    public static WireGuardRuntimeStats ParseUapiGetResponse(string? response)
    {
        if (string.IsNullOrWhiteSpace(response))
        {
            return WireGuardRuntimeStats.Unknown;
        }

        var sawField = false;
        long? pendingSec = null;
        DateTimeOffset? latest = null;
        long rxBytes = 0;

        foreach (var rawLine in response.Split('\n'))
        {
            var line = rawLine.Trim();
            var separator = line.IndexOf('=');
            if (separator <= 0)
            {
                continue;
            }

            var key = line[..separator];
            var value = line[(separator + 1)..];

            switch (key)
            {
                case "last_handshake_time_sec":
                    sawField = true;
                    // Một peer có thể có sec mà không có nsec (bản WireGuard khác nhau); chốt peer
                    // trước đó rồi giữ sec này chờ dòng nsec đi kèm.
                    if (pendingSec is { } previous)
                    {
                        latest = MaxTimestamp(latest, TimestampFromUnix(previous, 0));
                    }
                    pendingSec = ParseNonNegativeLong(value);
                    break;

                case "last_handshake_time_nsec":
                    sawField = true;
                    if (pendingSec is { } sec)
                    {
                        latest = MaxTimestamp(latest, TimestampFromUnix(sec, ParseNonNegativeLong(value) ?? 0));
                        pendingSec = null;
                    }
                    break;

                case "rx_bytes":
                    sawField = true;
                    rxBytes += ParseNonNegativeLong(value) ?? 0;
                    break;

                case "public_key":
                case "preshared_key":
                case "endpoint":
                case "allowed_ip":
                case "persistent_keepalive_interval":
                case "protocol_version":
                case "errno":
                    sawField = true;
                    break;
            }
        }

        if (pendingSec is { } trailing)
        {
            latest = MaxTimestamp(latest, TimestampFromUnix(trailing, 0));
        }

        return sawField ? WireGuardRuntimeStats.Known(latest, rxBytes) : WireGuardRuntimeStats.Unknown;
    }

    /// <summary>
    /// Parse <c>wg.exe show &lt;ifname&gt; dump</c> của WireGuard for Windows (TSV, mỗi peer 8 cột:
    /// public_key, preshared_key, endpoint, allowed_ips, latest_handshake, transfer_rx, transfer_tx,
    /// persistent_keepalive). Dòng đầu là interface (4 cột) nên bị bỏ qua theo số cột.
    ///
    /// Trả Unknown khi không có dòng peer nào — thà "không biết" còn hơn gỡ nhầm tunnel vì một
    /// lần đọc lệch định dạng.
    /// </summary>
    public static WireGuardRuntimeStats ParseWgShowDump(string? output)
    {
        if (string.IsNullOrWhiteSpace(output))
        {
            return WireGuardRuntimeStats.Unknown;
        }

        var sawPeer = false;
        DateTimeOffset? latest = null;
        long rxBytes = 0;

        foreach (var rawLine in output.Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.Length == 0)
            {
                continue;
            }

            var columns = line.Split('\t');
            if (columns.Length < 8)
            {
                continue;
            }

            sawPeer = true;
            if (TryParseUnixSeconds(columns[4], out var seconds))
            {
                latest = MaxTimestamp(latest, TimestampFromUnix(seconds, 0));
            }

            if (long.TryParse(columns[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out var rx) && rx > 0)
            {
                rxBytes += rx;
            }
        }

        return sawPeer ? WireGuardRuntimeStats.Known(latest, rxBytes) : WireGuardRuntimeStats.Unknown;
    }

    private static long? ParseNonNegativeLong(string value)
        => long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed) && parsed >= 0
            ? parsed
            : null;

    private static bool TryParseUnixSeconds(string value, out long seconds)
        => long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out seconds) && seconds > 0;

    /// <summary>
    /// Đổi cặp giây/nano-giây của UAPI thành thời điểm UTC. Bỏ qua giá trị 0 (WireGuard ghi 0 khi
    /// peer chưa từng handshake) và giá trị ngoài dải <see cref="DateTimeOffset"/> để không ném
    /// exception từ dữ liệu driver.
    /// </summary>
    private static DateTimeOffset? TimestampFromUnix(long seconds, long nanoseconds)
    {
        if (seconds <= 0 || seconds > MaxUnixSeconds)
        {
            return null;
        }

        var ticks = nanoseconds is > 0 and < NanosecondsPerSecond ? nanoseconds / 100 : 0;
        return DateTimeOffset.FromUnixTimeSeconds(seconds).AddTicks(ticks);
    }

    private static DateTimeOffset? MaxTimestamp(DateTimeOffset? current, DateTimeOffset? candidate)
    {
        if (candidate is null)
        {
            return current;
        }

        return current is null || candidate > current ? candidate : current;
    }

    /// <summary>9999-12-31T23:59:59Z — trần của <see cref="DateTimeOffset.FromUnixTimeSeconds"/>.</summary>
    private const long MaxUnixSeconds = 253_402_300_799;

    private const long NanosecondsPerSecond = 1_000_000_000;
}
