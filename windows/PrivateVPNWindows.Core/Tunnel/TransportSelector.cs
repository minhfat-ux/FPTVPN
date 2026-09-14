namespace VpnFlow.Core.Tunnel;

/// <summary>Log tối thiểu cho tầng tunnel (không phụ thuộc Microsoft.Extensions.Logging).</summary>
public interface ITunnelLogger
{
    void Info(string message);

    void Warn(string message);

    void Error(string message);
}

/// <summary>Logger nuốt hết (dùng khi không cần log).</summary>
public sealed class NullTunnelLogger : ITunnelLogger
{
    public static readonly NullTunnelLogger Instance = new();

    private NullTunnelLogger()
    {
    }

    public void Info(string message)
    {
    }

    public void Warn(string message)
    {
    }

    public void Error(string message)
    {
    }
}

/// <summary>Logger ra console, tiện cho chạy thử trên macOS/CLI.</summary>
public sealed class ConsoleTunnelLogger : ITunnelLogger
{
    public static readonly ConsoleTunnelLogger Instance = new();

    public void Info(string message) => Console.WriteLine($"[tunnel] {message}");

    public void Warn(string message) => Console.WriteLine($"[tunnel][warn] {message}");

    public void Error(string message) => Console.Error.WriteLine($"[tunnel][error] {message}");
}

/// <summary>Lỗi khi mở/điều khiển một transport (socket, process, handshake SOCKS5).</summary>
public sealed class TunnelTransportException : Exception
{
    public TunnelTransportException(string message) : base(message)
    {
    }

    public TunnelTransportException(string message, Exception innerException) : base(message, innerException)
    {
    }
}

/// <summary>
/// Một đường truyền có listener UDP local để WireGuard trỏ vào.
/// WsRelayClient / WgRelayClient / HysteriaTransport đều cài đặt interface này,
/// nên selector xử lý chúng đồng nhất.
/// </summary>
public interface ITunnelTransport : IDisposable
{
    /// <summary>Id để nhớ đường đã thành công: "ws", "tcp:9445", "udp:8443", "hy".</summary>
    string TransportId { get; }

    /// <summary>Mở listener local; trả cổng UDP mà WireGuard phải trỏ tới.</summary>
    ushort Start();

    /// <summary>Cổng UDP local đang nghe (0 trước khi Start).</summary>
    ushort LocalPort { get; }

    /// <summary>True khi link của transport đã lên (không phải khi tunnel đã có mạng).</summary>
    bool IsConnected { get; }

    /// <summary>Chuỗi counter để log heartbeat, giống countersSummary() của bản Swift.</summary>
    string CountersSummary();
}

/// <summary>Loại đường truyền, dùng để quyết định budget và có được thử lại hay không.</summary>
public enum TransportKind
{
    /// <summary>WireGuard UDP trực tiếp tới node — không có listener local.</summary>
    DirectUdp,

    /// <summary>WireGuard-over-TCP relay (WgRelayClient).</summary>
    TcpRelay,

    /// <summary>WireGuard-over-WebSocket relay (WsRelayClient).</summary>
    WsRelay,

    /// <summary>Hysteria2 (HysteriaTransport).</summary>
    Hysteria,
}

/// <summary>Một đường truyền ứng viên. DirectUdp không có <see cref="Factory"/>.</summary>
public sealed class TransportCandidate
{
    public required string Id { get; init; }

    public required TransportKind Kind { get; init; }

    /// <summary>Tạo transport; null với DirectUdp.</summary>
    public Func<ITunnelTransport>? Factory { get; init; }

    /// <summary>
    /// Probe tuỳ chọn để biết đường đã "lên" chưa. Với DirectUdp, caller có thể truyền
    /// probe kiểm tra handshake WireGuard; nếu null thì coi như lên ngay (giống
    /// PacketTunnelProvider.activeTransportIsConnected trả true cho direct UDP,
    /// PacketTunnelProvider.swift:184-196).
    /// </summary>
    public Func<CancellationToken, Task<bool>>? Probe { get; init; }
}

/// <summary>
/// Kế hoạch transport, mirror thứ tự của Android oneConnectPass()
/// (HysteriaVpnService.kt:311-345): TCP relay trước, rồi 1 cổng UDP trực tiếp,
/// rồi WS relay, rồi Hysteria, cuối cùng là các cổng UDP còn lại.
/// </summary>
public sealed class TransportPlan
{
    public IReadOnlyList<TransportCandidate> TcpRelays { get; init; } = Array.Empty<TransportCandidate>();

    public IReadOnlyList<TransportCandidate> DirectUdp { get; init; } = Array.Empty<TransportCandidate>();

    public TransportCandidate? WsRelay { get; init; }

    public TransportCandidate? Hysteria { get; init; }

    public IReadOnlyList<TransportCandidate> BuildOrdered()
    {
        var ordered = new List<TransportCandidate>();
        ordered.AddRange(TcpRelays);
        if (DirectUdp.Count > 0)
        {
            ordered.Add(DirectUdp[0]);
        }
        if (WsRelay is not null)
        {
            ordered.Add(WsRelay);
        }
        if (Hysteria is not null)
        {
            ordered.Add(Hysteria);
        }
        for (var i = 1; i < DirectUdp.Count; i++)
        {
            ordered.Add(DirectUdp[i]);
        }
        return ordered;
    }
}

/// <summary>Kết quả một lượt chọn transport: candidate + transport đang chạy (null nếu direct).</summary>
public sealed record TransportSelection(TransportCandidate Candidate, ITunnelTransport? Transport)
{
    /// <summary>Cổng UDP local để WireGuard trỏ tới; 0 = dùng endpoint trực tiếp của node.</summary>
    public ushort LocalPort => Transport?.LocalPort ?? 0;

    public bool IsDirect => Transport is null;
}

/// <summary>
/// Thứ tự thử + failover + log cho các đường truyền, port từ Android
/// <c>oneConnectPass()</c>/<c>runTunnel()</c> (HysteriaVpnService.kt:146-345).
///
/// Khác biệt có chủ ý so với Android: Android thử hysteria (QUIC) trên mọi đường;
/// Windows giữ WireGuard làm tunnel nên "UDP trực tiếp" ở đây là endpoint WireGuard
/// của node, còn TCP/WS/Hysteria là các lớp chở. Vì tầng này không hỏi được
/// wireguard.exe xem handshake đã xong chưa, DirectUdp được coi là lên ngay trừ khi
/// caller truyền <see cref="TransportCandidate.Probe"/>.
/// </summary>
public sealed class TransportSelector
{
    /// <summary>Trần bắt tay của một đường trực tiếp (HysteriaVpnService.kt:1015).</summary>
    public const int AttemptUpBudgetMs = 4_000;

    /// <summary>Trần cho đường WS/Hysteria: đi 2 chặng nên chậm hơn thật (HysteriaVpnService.kt:1020).</summary>
    public const int WsAttemptUpBudgetMs = 15_000;

    public const int RetryBackoffStartMs = 3_000;

    public const int RetryBackoffMaxMs = 30_000;

    /// <summary>Số lượt thất bại liên tiếp trước khi đổi node (HysteriaVpnService.kt:1066).</summary>
    public const int NodeFailoverAfterPasses = 2;

    /// <summary>Nghỉ sau khi transport bị dỡ để Go/OS nhả socket (HysteriaVpnService.kt:1029).</summary>
    public const int RebuildSettleMs = 700;

    private readonly IReadOnlyList<TransportCandidate> _candidates;
    private readonly ITunnelLogger _log;
    private readonly Func<string?> _loadPreference;
    private readonly Action<string> _savePreference;

    public TransportSelector(
        IReadOnlyList<TransportCandidate> candidates,
        ITunnelLogger log,
        Func<string?>? loadPreference = null,
        Action<string>? savePreference = null)
    {
        _candidates = candidates ?? throw new ArgumentNullException(nameof(candidates));
        _log = log ?? throw new ArgumentNullException(nameof(log));
        _loadPreference = loadPreference ?? (() => null);
        _savePreference = savePreference ?? (_ => { });
    }

    /// <summary>
    /// Một lượt thử: đường đã thành công lần trước trước, rồi tới danh sách đã xếp.
    /// Trả null khi không đường nào lên được.
    /// </summary>
    public async Task<TransportSelection?> ConnectOnceAsync(CancellationToken cancellationToken = default)
    {
        var preferred = _loadPreference();
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            var candidate = _candidates.FirstOrDefault(c => c.Id == preferred);
            if (candidate is not null)
            {
                _log.Info($"transport: ưu tiên đường đã thành công lần trước: {candidate.Id}");
                var selection = await TryAsync(candidate, cancellationToken).ConfigureAwait(false);
                if (selection is not null)
                {
                    return selection;
                }
            }
        }

        foreach (var candidate in _candidates)
        {
            // Đường ưu tiên vừa thử thì bỏ qua trong cùng lượt — trừ ws/hysteria:
            // mở WS có thể hỏng tạm thời (Funnel/Cloudflare chớp) nên vẫn cho thử lại,
            // vì đây là đường duy nhất còn sống khi IP node bị chặn
            // (HysteriaVpnService.kt:311-345).
            if (candidate.Id == preferred && !IsRetryable(candidate.Kind))
            {
                continue;
            }

            var selection = await TryAsync(candidate, cancellationToken).ConfigureAwait(false);
            if (selection is not null)
            {
                return selection;
            }
        }

        return null;
    }

    /// <summary>
    /// Vòng đời đầy đủ: lặp các lượt thử với backoff có trần; mỗi khi một transport
    /// lên thì gọi <paramref name="onConnected"/> và chờ tới khi nó kết thúc; thất bại
    /// liên tiếp đủ ngưỡng thì gọi <paramref name="onNodeFailover"/>.
    /// </summary>
    public async Task RunAsync(
        Func<TransportSelection, CancellationToken, Task> onConnected,
        Func<Task>? onReconnecting = null,
        Func<Task>? onNodeFailover = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(onConnected);

        var backoffMs = RetryBackoffStartMs;
        var failedPasses = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            var selection = await ConnectOnceAsync(cancellationToken).ConfigureAwait(false);
            if (selection is null)
            {
                if (onReconnecting is not null)
                {
                    await onReconnecting().ConfigureAwait(false);
                }

                failedPasses++;
                _log.Warn(
                    $"transport: không đường nào tới được (lượt thất bại thứ {failedPasses}) " +
                    $"-> thử lại sau {backoffMs}ms");

                if (failedPasses >= NodeFailoverAfterPasses && onNodeFailover is not null)
                {
                    await onNodeFailover().ConfigureAwait(false);
                    failedPasses = 0;
                    backoffMs = RetryBackoffStartMs;
                }

                await DelayAsync(backoffMs, cancellationToken).ConfigureAwait(false);
                backoffMs = Math.Min(backoffMs * 2, RetryBackoffMaxMs);
                continue;
            }

            failedPasses = 0;
            backoffMs = RetryBackoffStartMs;

            try
            {
                await onConnected(selection, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                selection.Transport?.Dispose();
            }

            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            _log.Warn($"transport: {selection.Candidate.Id} đã kết thúc -> dựng lại transport");
            if (onReconnecting is not null)
            {
                await onReconnecting().ConfigureAwait(false);
            }
            await DelayAsync(RebuildSettleMs, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<TransportSelection?> TryAsync(TransportCandidate candidate, CancellationToken cancellationToken)
    {
        if (candidate.Kind == TransportKind.DirectUdp)
        {
            if (candidate.Probe is not null)
            {
                _log.Info($"transport: thử {candidate.Id} (UDP trực tiếp), budget={AttemptUpBudgetMs}ms");
                var reachable = await WaitProbeAsync(candidate.Probe, AttemptUpBudgetMs, cancellationToken)
                    .ConfigureAwait(false);
                if (!reachable)
                {
                    _log.Warn($"transport: {candidate.Id} không lên trong {AttemptUpBudgetMs}ms, thử đường khác");
                    return null;
                }
            }
            else
            {
                _log.Info($"transport: dùng {candidate.Id} (UDP trực tiếp)");
            }

            _savePreference(candidate.Id);
            return new TransportSelection(candidate, null);
        }

        if (candidate.Factory is null)
        {
            _log.Warn($"transport: {candidate.Id} thiếu factory, bỏ qua");
            return null;
        }

        ITunnelTransport? transport = null;
        try
        {
            transport = candidate.Factory();
            var port = transport.Start();
            var budget = IsSlow(candidate.Kind) ? WsAttemptUpBudgetMs : AttemptUpBudgetMs;
            _log.Info($"transport: thử {candidate.Id} local=127.0.0.1:{port} budget={budget}ms");

            var probe = candidate.Probe
                        ?? (_ => Task.FromResult(transport.IsConnected));
            var connected = await WaitProbeAsync(probe, budget, cancellationToken).ConfigureAwait(false);
            if (!connected)
            {
                _log.Warn($"transport: {candidate.Id} không lên trong {budget}ms, bỏ qua");
                transport.Dispose();
                return null;
            }

            _log.Info($"transport: {candidate.Id} đã lên");
            _savePreference(candidate.Id);
            return new TransportSelection(candidate, transport);
        }
        catch (Exception ex)
        {
            _log.Warn($"transport: {candidate.Id} start lỗi: {ex.Message}");
            transport?.Dispose();
            return null;
        }
    }

    private static async Task<bool> WaitProbeAsync(
        Func<CancellationToken, Task<bool>> probe,
        int budgetMs,
        CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(budgetMs);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (await probe(cancellationToken).ConfigureAwait(false))
            {
                return true;
            }
            await Task.Delay(200, cancellationToken).ConfigureAwait(false);
        }
        return await probe(cancellationToken).ConfigureAwait(false);
    }

    private static bool IsSlow(TransportKind kind)
    {
        return kind is TransportKind.WsRelay or TransportKind.Hysteria;
    }

    private static bool IsRetryable(TransportKind kind)
    {
        return kind is TransportKind.WsRelay or TransportKind.Hysteria;
    }

    private static async Task DelayAsync(int milliseconds, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(milliseconds, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Người gọi đã yêu cầu dừng.
        }
    }
}
