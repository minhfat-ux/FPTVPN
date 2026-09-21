using System.Net.Http;
using System.Text.Json;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Watchdog cho đường <b>hysteria2-over-WS + sing-box</b> (đường relay).
///
/// Vì sao cần: đường WireGuard đã có watchdog riêng (đọc handshake/rx của wireguard-go). Đường relay
/// KHÔNG có tunnel WireGuard nên trước đây chỉ phát hiện được khi tiến trình con <b>chết</b>; còn
/// trường hợp tunnel "đứng" (tiến trình vẫn sống nhưng không truyền được dữ liệu) thì app giữ nguyên
/// route full-tunnel trỏ vào đường chết ⇒ máy như mất mạng mà không có cảnh báo nào.
///
/// Cách phát hiện — dùng HAI tín hiệu và chỉ kết luận khi CẢ HAI cùng bất thường:
///  1. Số byte luỹ kế của sing-box (clash_api <c>/connections</c>: downloadTotal + uploadTotal) không
///     tăng trong <see cref="NoTrafficSeconds"/>.
///  2. Phép thử CHỦ ĐỘNG qua chính tunnel (GET một URL health của mình) thất bại
///     <see cref="ProbeFailures"/> lần liên tiếp.
///
/// Tín hiệu (1) một mình KHÔNG đủ: người dùng không duyệt web thì cũng không có byte nào, nên nếu chỉ
/// dựa vào đó là báo oan và cắt VPN của khách đang để yên. Chỉ khi không có dữ liệu MÀ thử qua tunnel
/// cũng không xong mới kết luận tunnel đứng.
///
/// An toàn: mọi lỗi (mạng, log, JSON) đều bị nuốt và chỉ ghi log — watchdog không bao giờ ném ra ngoài,
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
    /// Bản dùng thật cho đường relay: đọc số liệu từ clash_api của sing-box và thử qua tunnel bằng
    /// HTTP tới <paramref name="probeUrl"/> (mặc định <see cref="DefaultProbeUrl"/>).
    /// </summary>
    public static RelayHealthWatchdog ForSingBox(
        int clashApiPort,
        Action<string> log,
        Action<string> onStall,
        string probeUrl = DefaultProbeUrl,
        int probeTimeoutSeconds = DefaultProbeTimeoutSeconds,
        int intervalSeconds = DefaultIntervalSeconds,
        int noTrafficSeconds = DefaultNoTrafficSeconds,
        int probeFailures = DefaultProbeFailures)
    {
        var connectionsUri = new Uri($"http://127.0.0.1:{clashApiPort}/connections");
        var probeUri = new Uri(probeUrl);

        // Một HttpClient cho việc đọc số liệu (rất nhẹ, gọi nội bộ trong máy).
        using var trafficClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        // HttpClient riêng cho phép thử: timeout ngắn, KHÔNG dùng proxy hệ thống (proxy có thể là
        // chính phần mềm đang tranh chấp và làm sai kết quả đo).
        var probeClient = new HttpClient(new SocketsHttpHandler { UseProxy = false })
        {
            Timeout = TimeSpan.FromSeconds(Math.Max(1, probeTimeoutSeconds)),
        };

        return new RelayHealthWatchdog(
            async token =>
            {
                try
                {
                    using var response = await trafficClient.GetAsync(connectionsUri, token).ConfigureAwait(false);
                    if (!response.IsSuccessStatusCode)
                    {
                        return -1;
                    }

                    var json = await response.Content.ReadAsStringAsync(token).ConfigureAwait(false);
                    using var document = JsonDocument.Parse(json);
                    var root = document.RootElement;

                    long total = 0;
                    var found = false;
                    if (root.TryGetProperty("downloadTotal", out var down) && down.TryGetInt64(out var d))
                    {
                        total += d;
                        found = true;
                    }

                    if (root.TryGetProperty("uploadTotal", out var up) && up.TryGetInt64(out var u))
                    {
                        total += u;
                        found = true;
                    }

                    return found ? total : -1;
                }
                catch (Exception)
                {
                    // Đọc không được thì coi như "không có số liệu" (-1): tự nó KHÔNG đủ để kết luận.
                    return -1;
                }
            },
            async token =>
            {
                try
                {
                    using var response = await probeClient
                        .GetAsync(probeUri, HttpCompletionOption.ResponseHeadersRead, token)
                        .ConfigureAwait(false);
                    return response.IsSuccessStatusCode;
                }
                catch (Exception)
                {
                    return false;
                }
            },
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
