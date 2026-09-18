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

/// <summary>Kết luận sức khoẻ tunnel từ số liệu runtime THẬT của WireGuard.</summary>
public enum TunnelHealthVerdict
{
    /// <summary>Không đọc được runtime (driver không có kênh đọc) — không kết luận được gì.</summary>
    Unknown,

    /// <summary>Có bằng chứng tunnel đang truyền dữ liệu.</summary>
    Healthy,

    /// <summary>Hết bằng chứng trong ngưỡng cho phép ⇒ tunnel không truyền được dữ liệu.</summary>
    Stale,
}

/// <summary>
/// Ngưỡng thời gian + quyết định khoẻ/không của tunnel. Thuần (không I/O) nên test được.
/// </summary>
public static class TunnelHealth
{
    /// <summary>
    /// Handshake trong 30s gần nhất ⇒ tunnel truyền được dữ liệu. Tunnel sống luôn có handshake
    /// rất mới: WireGuard gửi lại handshake mỗi 5s khi chưa xong, và rekey khi có gói đi.
    /// </summary>
    public const int HandshakeFreshSeconds = 30;

    /// <summary>
    /// Health gate lúc connect: tối đa 20s để có bằng chứng thật, rồi mới được coi là "đã kết nối".
    /// Chặn thời gian "mù": không nói "Đã kết nối" rồi để route full-tunnel trỏ vào tunnel chết.
    /// </summary>
    public const int InitialGateSeconds = 20;

    /// <summary>Chu kỳ watchdog khi đã Connected.</summary>
    public const int WatchdogIntervalSeconds = 15;

    /// <summary>
    /// Không còn bằng chứng nào (handshake mới HOẶC nhận thêm byte) trong 90s ⇒ tunnel chết.
    /// Vì sao 90s vẫn không gỡ nhầm tunnel khoẻ nhưng idle: config luôn đặt PersistentKeepAlive=25
    /// nên tunnel sống luôn nhận keepalive trả lời từ node (rx_bytes tăng, xem
    /// <see cref="TunnelHealthWatchdog"/>); tunnel chết thì rx đứng yên và handshake không mới lên.
    /// </summary>
    public const int WatchdogNoEvidenceSeconds = 90;

    /// <summary>Handshake của peer có nằm trong ngưỡng "mới" hay không.</summary>
    public static bool IsHandshakeFresh(WireGuardRuntimeStats stats, DateTimeOffset now)
        => stats.Available
           && stats.LastHandshake is { } handshake
           && now - handshake <= TimeSpan.FromSeconds(HandshakeFreshSeconds);

    /// <summary>
    /// Quyết định của health gate lúc connect: handshake mới, hoặc đã nhận được byte từ node
    /// (bằng chứng mạnh hơn cả handshake), còn lại là không đạt.
    /// </summary>
    public static TunnelHealthVerdict EvaluateGate(WireGuardRuntimeStats stats, DateTimeOffset now)
    {
        if (!stats.Available)
        {
            return TunnelHealthVerdict.Unknown;
        }

        return IsHandshakeFresh(stats, now) || stats.RxBytes > 0
            ? TunnelHealthVerdict.Healthy
            : TunnelHealthVerdict.Stale;
    }
}

/// <summary>
/// Theo dõi "tunnel còn truyền được dữ liệu" giữa các lượt watchdog. Giữ trạng thái giữa hai lần
/// đọc vì bằng chứng mạnh nhất là <c>rx_bytes</c> TĂNG so với lượt trước.
///
/// Vì sao cần cả rx_bytes: chỉ nhìn tuổi handshake thì một tunnel khoẻ nhưng không có traffic vẫn
/// có handshake cũ (WireGuard chỉ rekey khi có gói), nên ngưỡng ngắn sẽ gỡ nhầm. Ngược lại tunnel
/// chết (sự cố 19:05) thì rx đứng yên tuyệt đối — đúng dấu hiệu cần bắt.
/// </summary>
public sealed class TunnelHealthWatchdog
{
    private long _lastRxBytes;
    private DateTimeOffset _lastEvidenceAt;

    /// <param name="startedAt">
    /// Thời điểm tunnel đã qua health gate — mốc "có bằng chứng" đầu tiên, để watchdog không đếm
    /// thời gian mù từ trước khi tunnel lên.
    /// </param>
    /// <param name="baselineRxBytes">rx_bytes đọc được lúc qua gate.</param>
    public TunnelHealthWatchdog(DateTimeOffset startedAt, long baselineRxBytes)
    {
        _lastEvidenceAt = startedAt;
        _lastRxBytes = baselineRxBytes;
    }

    /// <summary>Lần cuối cùng có bằng chứng tunnel truyền được dữ liệu.</summary>
    public DateTimeOffset LastEvidenceAt => _lastEvidenceAt;

    /// <summary>Nạp một mẫu runtime; trả kết luận cho lượt này.</summary>
    public TunnelHealthVerdict Observe(WireGuardRuntimeStats stats, DateTimeOffset now)
    {
        if (!stats.Available)
        {
            return TunnelHealthVerdict.Unknown;
        }

        var hasEvidence = TunnelHealth.IsHandshakeFresh(stats, now) || stats.RxBytes > _lastRxBytes;
        _lastRxBytes = stats.RxBytes;

        if (hasEvidence)
        {
            _lastEvidenceAt = now;
            return TunnelHealthVerdict.Healthy;
        }

        // Chưa đủ ngưỡng "mù" thì chưa kết luận chết — watchdog còn lượt sau.
        return now - _lastEvidenceAt >= TimeSpan.FromSeconds(TunnelHealth.WatchdogNoEvidenceSeconds)
            ? TunnelHealthVerdict.Stale
            : TunnelHealthVerdict.Healthy;
    }
}

/// <summary>Id các đường truyền, dùng trong log và phần nhớ đường đã thành công.</summary>
public static class TransportIds
{
    public const string DirectUdp = "udp-direct";

    /// <summary>WireGuard-over-TCP relay (WgRelayClient) — dữ liệu từ <c>wg_relay_url</c>.</summary>
    public const string WgRelay = "wg-relay";

    /// <summary>WireGuard-over-WebSocket relay (WsRelayClient) — dữ liệu từ <c>ws_relay_url</c>.</summary>
    public const string WsRelay = "ws";
}

/// <summary>
/// Dựng danh sách candidate cho Windows. THUẦN — không mở socket, chỉ tạo factory — nên thứ tự
/// failover kiểm tra được bằng test.
///
/// Thứ tự: udp-direct (nhanh nhất, nhưng bị chặn thì chết im lặng) → wg-relay (WgRelayClient, field
/// <c>wg_relay_url</c>) → ws (WsRelayClient, field <c>ws_relay_url</c>). Server hiện chỉ trả
/// <c>wg_relay_url</c>: đưa URL đó vào WsRelayClient nghĩa là nói chuyện WebSocket với một relay
/// WireGuard-over-TCP — handshake im lặng, đúng loại lỗi đã gặp.
/// </summary>
public static class WindowsTransportPlanner
{
    public static IReadOnlyList<TransportCandidate> Build(
        string? wgRelayUrl,
        string? wsRelayUrl,
        bool includeDirectUdp,
        bool includeRelays,
        ITunnelLogger log)
    {
        ArgumentNullException.ThrowIfNull(log);

        var candidates = new List<TransportCandidate>();

        if (includeDirectUdp)
        {
            candidates.Add(new TransportCandidate
            {
                Id = TransportIds.DirectUdp,
                Kind = TransportKind.DirectUdp,
            });
        }

        if (includeRelays)
        {
            // Cùng một URL có thể xuất hiện ở cả hai field (ws_relay_url cũ = wg_relay_url mới),
            // nên chống trùng để không thử lại đúng một đường hai lần.
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var (raw, id) in new[] { (wgRelayUrl, TransportIds.WgRelay), (wsRelayUrl, TransportIds.WsRelay) })
            {
                if (string.IsNullOrWhiteSpace(raw) || !seen.Add(raw.Trim()))
                {
                    continue;
                }

                if (BuildRelay(raw, id, log) is { } candidate)
                {
                    candidates.Add(candidate);
                }
            }
        }

        return candidates;
    }

    /// <summary>Candidate wg-relay; null khi node không cấp <c>wg_relay_url</c>.</summary>
    public static TransportCandidate? BuildWgRelay(string? rawUrl, ITunnelLogger log)
        => BuildRelay(rawUrl, TransportIds.WgRelay, log);

    /// <summary>Candidate ws (field cũ); null khi node không cấp <c>ws_relay_url</c>.</summary>
    public static TransportCandidate? BuildWsRelay(string? rawUrl, ITunnelLogger log)
        => BuildRelay(rawUrl, TransportIds.WsRelay, log);

    /// <summary>
    /// Dựng candidate từ URL relay, chọn client theo SCHEME chứ không theo tên field.
    ///
    /// Vì sao: relay của shop hiện phục vụ qua Tailscale Funnel dạng WebSocket
    /// (<c>https://fcnvpn.tail303be3.ts.net/vn2 → wsrelay.js</c>) nên <c>wg_relay_url</c> là
    /// <c>wss://host/vn2</c> — KHÔNG ghi port và CÓ path. <see cref="WgRelayClient"/> nói TCP thô
    /// (mặc định 9444) nên chỉ đúng cho relay cũ <c>tcp://host:9444</c>. Chọn nhầm client thì
    /// fallback trượt đúng lúc cần nhất (mạng chặn UDP).
    /// </summary>
    private static TransportCandidate? BuildRelay(string? rawUrl, string id, ITunnelLogger log)
    {
        ArgumentNullException.ThrowIfNull(log);

        var uri = TryParseUri(rawUrl);
        if (uri is null)
        {
            return null;
        }

        if (IsWebSocketScheme(uri.Scheme))
        {
            // WsRelayClient nhận nguyên Uri nên giữ host + port (443 khi không ghi) + path (/vn2).
            return new TransportCandidate
            {
                Id = id,
                Kind = TransportKind.WsRelay,
                Factory = () => new WsRelayClient(ToWebSocketUri(uri), log, id),
            };
        }

        // TCP thô: chỉ truyền port khi URL ghi rõ, còn lại để client dùng mặc định của nó.
        var ports = uri.IsDefaultPort || uri.Port <= 0
            ? Array.Empty<ushort>()
            : new[] { (ushort)uri.Port };

        return new TransportCandidate
        {
            Id = id,
            Kind = TransportKind.TcpRelay,
            Factory = () => new WgRelayClient(uri.Host, ports, log, id),
        };
    }

    /// <summary>ws/wss là WebSocket; http/https cũng vậy vì Funnel công bố URL qua HTTPS.</summary>
    private static bool IsWebSocketScheme(string scheme)
        => scheme.Equals("ws", StringComparison.OrdinalIgnoreCase)
            || scheme.Equals("wss", StringComparison.OrdinalIgnoreCase)
            || scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
            || scheme.Equals("https", StringComparison.OrdinalIgnoreCase);

    /// <summary>Đổi http(s) sang ws(s) vì ClientWebSocket chỉ nhận hai scheme này.</summary>
    private static Uri ToWebSocketUri(Uri uri)
    {
        if (uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase))
        {
            return new UriBuilder(uri) { Scheme = "ws" }.Uri;
        }

        if (uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
        {
            return new UriBuilder(uri) { Scheme = "wss" }.Uri;
        }

        return uri;
    }

    private static Uri? TryParseUri(string? raw)
        => !string.IsNullOrWhiteSpace(raw) && Uri.TryCreate(raw, UriKind.Absolute, out var uri) ? uri : null;
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
///
/// <see cref="ConnectHealthyAsync"/> là đường dùng thật của app Windows: nó kiểm tra
/// sức khoẻ bằng dữ liệu WireGuard thật sau khi tunnel đã cài (do caller làm), nên
/// "lên rồi mà không truyền được gói" sẽ bị gỡ và đổi sang đường kế tiếp.
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
    /// Thử lần lượt từng candidate và chỉ nhận đường mà <paramref name="isHealthy"/> xác nhận có
    /// TRUYỀN ĐƯỢC DỮ LIỆU THẬT (handshake/rx của WireGuard, không phải "service Running").
    ///
    /// Khác <see cref="ConnectOnceAsync"/> ở đúng điểm đã gây sự cố: đường "lên" nhưng không mang
    /// được gói vẫn bị coi là thành công. Ở đây đường không khoẻ bị đóng ngay rồi thử đường kế tiếp.
    ///
    /// <paramref name="allowFailover"/> = false (người dùng chọn cứng một transport trong Settings)
    /// ⇒ chỉ thử candidate đầu, không tự nhảy sang transport khác; trả null để caller báo lỗi rõ.
    /// </summary>
    public async Task<TransportSelection?> ConnectHealthyAsync(
        Func<TransportSelection, CancellationToken, Task<bool>> isHealthy,
        bool allowFailover = true,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(isHealthy);

        var order = allowFailover ? _candidates : _candidates.Take(1).ToList();

        for (var index = 0; index < order.Count; index++)
        {
            var candidate = order[index];
            var selection = await TryAsync(candidate, cancellationToken, savePreference: false).ConfigureAwait(false);
            if (selection is null)
            {
                if (!allowFailover)
                {
                    return null;
                }

                continue;
            }

            bool healthy;
            try
            {
                healthy = await isHealthy(selection, cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                selection.Transport?.Dispose();
                throw;
            }

            if (healthy)
            {
                _log.Info($"connect: {candidate.Id} đã truyền được dữ liệu (handshake/rx thật)");
                _savePreference(candidate.Id);
                return selection;
            }

            // Gỡ đường vừa rồi trước khi thử đường kế: hai transport cùng mở listener/socket làm
            // WireGuard gửi handshake qua cả hai và không đường nào xong.
            selection.Transport?.Dispose();

            var next = index + 1 < order.Count ? order[index + 1].Id : "hết danh sách";
            _log.Warn(
                $"connect: {candidate.Id} không truyền được dữ liệu sau {TunnelHealth.InitialGateSeconds}s " +
                $"— thử transport kế tiếp ({next})");

            if (!allowFailover)
            {
                return null;
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

    /// <param name="savePreference">
    /// Ghi nhớ đường này là "đã thành công lần trước". <see cref="ConnectHealthyAsync"/> truyền
    /// false vì "mở được link" chưa phải "truyền được dữ liệu" — chỉ ghi nhớ sau khi qua health gate.
    /// </param>
    private async Task<TransportSelection?> TryAsync(
        TransportCandidate candidate,
        CancellationToken cancellationToken,
        bool savePreference = true)
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

            if (savePreference)
            {
                _savePreference(candidate.Id);
            }

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
            if (savePreference)
            {
                _savePreference(candidate.Id);
            }

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
        // Relay TCP cũng đi hai chặng (client → relay daemon → node) nên cần budget dài như WS:
        // 4s của đường trực tiếp là quá ngắn để phân giải DNS + bắt tay TCP tới relay.
        return kind is TransportKind.TcpRelay or TransportKind.WsRelay or TransportKind.Hysteria;
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
