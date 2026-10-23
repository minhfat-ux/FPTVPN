using System.Net;
using System.Net.Sockets;
using System.Net.Http;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Watchdog cho đường <b>hysteria2-over-WS</b> (đường relay).
///
/// Vì sao cần: đường WireGuard đã có watchdog riêng (đọc handshake/rx của wireguard-go). Đường relay
/// KHÔNG có tunnel WireGuard nên trước đây chỉ phát hiện được khi tiến trình con <b>chết</b>; còn
/// trường hợp tunnel "đứng" (tiến trình vẫn sống nhưng không truyền được dữ liệu) thì app giữ nguyên
/// route full-tunnel trỏ vào đường chết ⇒ máy như mất mạng mà không có cảnh báo nào.
///
/// Cách phát hiện (từ 1.4.8): phép thử CHỦ ĐỘNG qua chính tunnel (GET một URL health của mình) thất
/// bại <see cref="ProbeFailures"/> lần liên tiếp. Trước đây còn một tín hiệu thứ hai — số byte luỹ kế
/// đọc từ clash_api của sing-box — nhưng sing-box đã bị bỏ (xem <see cref="HysteriaRelayDefaults"/>)
/// nên không còn nguồn số đó; bù lại, phép thử chủ động vốn đã là tín hiệu QUYẾT ĐỊNH, còn số byte chỉ
/// để khỏi thử khi khách đang có lưu lượng. Nay ta thử mỗi <see cref="DefaultNoTrafficSeconds"/> giây
/// khi rảnh — tunnel khoẻ thì phép thử tự qua và bộ đếm được reset, nên không báo oan.
///
/// An toàn: mọi lỗi (mạng, JSON) đều bị nuốt và chỉ ghi log — watchdog không bao giờ ném ra ngoài,
/// và <c>onStall</c> chỉ được gọi MỘT lần cho mỗi lần phát hiện.
/// </summary>
public sealed class RelayHealthWatchdog : IDisposable
{
    /// <summary>Nhịp kiểm tra (giây).</summary>
    public const int DefaultIntervalSeconds = 15;

    /// <summary>Không có byte mới trong bao lâu thì mới coi là nghi vấn (giây).</summary>
    public const int DefaultNoTrafficSeconds = 60;

    /// <summary>Thời gian chờ tối đa của phép thử chủ động (giây).</summary>
    public const int DefaultProbeTimeoutSeconds = 8;

    /// <summary>Số lần thử qua tunnel thất bại liên tiếp để kết luận tunnel đứng.</summary>
    public const int DefaultProbeFailures = 3;

    /// <summary>URL mặc định để thử qua tunnel — endpoint của chính mình (không phụ thuộc bên thứ ba).</summary>
    public const string DefaultProbeUrl = "https://api.meetflowai.site/v1/health";

    private readonly Func<CancellationToken, Task<long>> _readTrafficTotal;
    private readonly Func<CancellationToken, Task<bool>> _probe;
    private readonly Action<string> _log;
    private readonly Action<string> _onStall;
    private readonly int _intervalSeconds;
    private readonly int _noTrafficSeconds;
    private readonly int _probeFailures;
    private readonly CancellationTokenSource _cts = new();

    private Task? _loop;
    private long _lastTotal = -1;
    private DateTimeOffset _lastGrowthAt = DateTimeOffset.UtcNow;
    private int _failuresInARow;
    private int _stalled;

    /// <summary>
    /// Dùng cho test: bơm sẵn hai phép đo.
    /// </summary>
    public RelayHealthWatchdog(
        Func<CancellationToken, Task<long>> readTrafficTotal,
        Func<CancellationToken, Task<bool>> probe,
        Action<string> log,
        Action<string> onStall,
        int intervalSeconds = DefaultIntervalSeconds,
        int noTrafficSeconds = DefaultNoTrafficSeconds,
        int probeFailures = DefaultProbeFailures)
    {
        _readTrafficTotal = readTrafficTotal ?? throw new ArgumentNullException(nameof(readTrafficTotal));
        _probe = probe ?? throw new ArgumentNullException(nameof(probe));
        _log = log ?? (_ => { });
        _onStall = onStall ?? throw new ArgumentNullException(nameof(onStall));
        _intervalSeconds = Math.Max(1, intervalSeconds);
        _noTrafficSeconds = Math.Max(1, noTrafficSeconds);
        _probeFailures = Math.Max(1, probeFailures);
    }

    /// <summary>
    /// Bản dùng thật cho đường relay: thử qua tunnel bằng HTTP tới <paramref name="probeUrl"/>
    /// <summary>
    /// Phép thử chủ động KHÔNG phụ thuộc DNS: mở TCP tới một IP công cộng cố định xuyên tunnel.
    ///
    /// Vì sao không dùng HTTPS + tên miền (sự cố 22/10/2026): sau khi tunnel lên, DNS của máy trỏ vào
    /// adapter TUN ⇒ chính phép thử cũng phải đi qua bộ chia DNS trong tunnel. DNS chập chờn một nhịp
    /// là watchdog kết luận OAN "tunnel đứng" rồi gỡ một đường hầm vẫn chở dữ liệu tốt (đo thật: relay
    /// vẫn ra được 103.173.155.50 trong khi watchdog báo hỏng). TCP tới IP cố định chỉ đo đúng thứ
    /// cần đo: tunnel còn chở gói hay không.
    /// </summary>
    private static readonly IPAddress[] ProbeIps =
    {
        IPAddress.Parse("1.1.1.1"),
        IPAddress.Parse("8.8.8.8"),
        IPAddress.Parse("104.21.83.112"),   // Cloudflare của API mình
    };

    private static async Task<bool> ProbeTcpAsync(CancellationToken token, int timeoutSeconds)
    {
        foreach (var ip in ProbeIps)
        {
            try
            {
                using var socket = new Socket(ip.AddressFamily, SocketType.Stream, ProtocolType.Tcp)
                {
                    NoDelay = true,
                };
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(token);
                cts.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds)));
                await socket.ConnectAsync(new IPEndPoint(ip, 443), cts.Token).ConfigureAwait(false);
                return true;
            }
            catch (Exception)
            {
                // Thử IP kế tiếp.
            }
        }

        return false;
    }

    public static RelayHealthWatchdog ForRelayTunnel(
        Action<string> log,
        Action<string> onStall,
        string probeUrl = DefaultProbeUrl,
        int probeTimeoutSeconds = DefaultProbeTimeoutSeconds,
        int intervalSeconds = DefaultIntervalSeconds,
        int noTrafficSeconds = DefaultNoTrafficSeconds,
        int probeFailures = DefaultProbeFailures)
    {
        // probeUrl giữ lại trong chữ ký để không phá caller/test; phép thử thật dùng TCP tới IP.
        _ = probeUrl;

        return new RelayHealthWatchdog(
            // -1 = "không có số liệu lưu lượng": TickAsync khi đó chỉ dựa vào phép thử chủ động.
            _ => Task.FromResult(-1L),
            token => ProbeTcpAsync(token, probeTimeoutSeconds),
            log,
            onStall,
            intervalSeconds,
            noTrafficSeconds,
            probeFailures);
    }

    /// <summary>Bắt đầu theo dõi. Gọi nhiều lần vô hại.</summary>
    public void Start()
    {
        if (_loop is not null)
        {
            return;
        }

        _lastGrowthAt = DateTimeOffset.UtcNow;
        _loop = Task.Run(() => LoopAsync(_cts.Token));
    }

    /// <summary>Dừng theo dõi (không ném).</summary>
    public void Stop()
    {
        try
        {
            _cts.Cancel();
        }
        catch (Exception)
        {
            // bỏ qua
        }
    }

    public void Dispose()
    {
        Stop();
        _cts.Dispose();
    }

    private async Task LoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_intervalSeconds), token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            try
            {
                await TickAsync(token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex)
            {
                // Watchdog không bao giờ được làm chết app.
                SafeLog($"relay-watchdog: bỏ qua lỗi khi kiểm tra: {ex.Message}");
            }
        }
    }

    private async Task TickAsync(CancellationToken token)
    {
        var total = await _readTrafficTotal(token).ConfigureAwait(false);
        var now = DateTimeOffset.UtcNow;

        if (total > _lastTotal)
        {
            _lastTotal = total;
            _lastGrowthAt = now;
            _failuresInARow = 0;
            return;
        }

        var idle = now - _lastGrowthAt;
        if (idle < TimeSpan.FromSeconds(_noTrafficSeconds))
        {
            return;
        }

        if (await _probe(token).ConfigureAwait(false))
        {
            // Tunnel vẫn thông (chỉ là không ai dùng) — coi như bằng chứng sống, không báo oan.
            _lastGrowthAt = now;
            _failuresInARow = 0;
            return;
        }

        _failuresInARow++;
        SafeLog(
            $"relay-watchdog: {idle.TotalSeconds:F0}s không có byte mới và thử qua tunnel thất bại " +
            $"{_failuresInARow}/{_probeFailures}");

        if (_failuresInARow >= _probeFailures && Interlocked.Exchange(ref _stalled, 1) == 0)
        {
            Stop();
            try
            {
                _onStall(
                    $"Đường relay không truyền được dữ liệu ({idle.TotalSeconds:F0}s không có byte mới, " +
                    $"thử qua tunnel thất bại {_failuresInARow} lần).");
            }
            catch (Exception ex)
            {
                SafeLog($"relay-watchdog: onStall lỗi (bỏ qua): {ex.Message}");
            }
        }
    }

    private void SafeLog(string message)
    {
        try
        {
            _log(message);
        }
        catch (Exception)
        {
            // Không để logger làm hỏng watchdog.
        }
    }
}
