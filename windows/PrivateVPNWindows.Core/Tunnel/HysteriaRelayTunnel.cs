using System.Diagnostics;
using PrivateVPNWindows.Core.Tunnel;

namespace VpnFlow.Core.Tunnel;

/// <summary>Trạng thái của tiến trình con flowvpnrelay.</summary>
public enum HysteriaRelayState
{
    Stopped,
    Starting,
    Running,

    /// <summary>Tiến trình con chết bất ngờ khi đang chạy — tầng trên quyết định kết nối lại.</summary>
    Faulted,
}

/// <summary>
/// Bộ điều khiển đường "hysteria2 bọc trong WebSocket" trên Windows: chạy MỘT tiến trình con cạnh
/// app — <c>flowvpnrelay.exe -c relay.json</c> — và tiến trình đó tự lo cả ba việc:
///
///  1. transport hysteria2-over-WebSocket (<c>/relay/vn*hy</c> sau Cloudflare) — đường duy nhất còn
///     đi được khi mạng chặn thẳng IP node;
///  2. TUN + auto_route, kèm danh sách dải IP Trung Quốc đi THẲNG (bypass TQ);
///  3. SOCKS5 nội bộ (giữ lại cho chẩn đoán/đo băng thông).
///
/// Trước 1.4.7 việc (2) do <c>sing-box.exe</c> làm. Bỏ được nó là mục tiêu của bản này: sing-box là
/// binary bên thứ ba CHƯA KÝ nên bị <b>Smart App Control</b> chặn trên máy khách (Win32 4551,
/// CodeIntegrity 3033/3077/3118) — xem <see cref="HysteriaRelayDefaults"/>.
///
/// Mốc "tunnel đã lên" là dòng <c>TUNREADY</c> trên stderr (adapter TUN đã tồn tại và được cấu
/// hình), KHÔNG phải dòng <c>READY</c> của SOCKS5: có SOCKS5 mà chưa có TUN thì máy vẫn chưa có
/// route nào. Ngay sau <c>TUNREADY</c> ta đặt DNS lên chính adapter đó — cùng cách đường WireGuard
/// vẫn làm (netsh), để truy vấn DNS đi TRONG tunnel thay vì ra resolver của mạng khách.
///
/// KHÔNG tự kết nối lại: tiến trình con chết bất ngờ thì báo qua <see cref="Faulted"/>; việc thử lại
/// thuộc về <c>VpnConnectionService</c> (vòng lặp vô hạn ở tầng này sẽ che mất lỗi).
/// </summary>
public sealed class HysteriaRelayTunnel : IDisposable
{
    /// <summary>
    /// Hạn chờ dòng TUNREADY: bắt tay WS + TLS + QUIC qua 2 chặng (trần 12s ở phía Go) rồi tạo
    /// adapter TUN (Go chờ tối đa 15s). Cộng lại có biên.
    /// </summary>
    public const int ReadyTimeoutSeconds = 30;

    private readonly string _assetDirectory;
    private readonly string _workingDirectory;
    private readonly ITunnelLogger _log;
    private readonly object _lock = new();

    private Process? _relayProcess;

    /// <summary>True khi ta CHỦ ĐỘNG dừng: Exited của tiến trình con không được coi là sự cố.</summary>
    private volatile bool _stopping;

    private HysteriaRelayState _state = HysteriaRelayState.Stopped;
    private string? _lastError;

    public HysteriaRelayTunnel(
        string? assetDirectory = null,
        string? workingDirectory = null,
        ITunnelLogger? log = null)
    {
        _assetDirectory = string.IsNullOrWhiteSpace(assetDirectory) ? AppContext.BaseDirectory : assetDirectory;
        _workingDirectory = string.IsNullOrWhiteSpace(workingDirectory)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "VPNFlow", "hysteria-relay")
            : workingDirectory;
        _log = log ?? NullTunnelLogger.Instance;

        // App thoát (kể cả crash của tầng UI) không được để lại TUN/route trỏ vào hư không.
        AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
    }

    /// <summary>Đổi trạng thái (Stopped/Starting/Running/Faulted).</summary>
    public event EventHandler<HysteriaRelayState>? StateChanged;

    /// <summary>Tiến trình con chết bất ngờ khi đang chạy; tham số là thông báo lỗi tiếng Việt.</summary>
    public event EventHandler<string>? Faulted;

    public HysteriaRelayState State
    {
        get
        {
            lock (_lock)
            {
                return _state;
            }
        }
    }

    /// <summary>Lỗi gần nhất (null khi chưa có).</summary>
    public string? LastError
    {
        get
        {
            lock (_lock)
            {
                return _lastError;
            }
        }
    }

    /// <summary>Cổng SOCKS5 nội bộ của flowvpnrelay (0 trước khi Start).</summary>
    public int RelaySocksPort { get; private set; }

    /// <summary>Tên adapter TUN đang dùng (null trước khi Start xong). Dùng cho chẩn đoán.</summary>
    public string? TunInterfaceName { get; private set; }

    /// <summary>URL relay đang dùng cho phiên hiện tại.</summary>
    public string? RelayUrlInUse { get; private set; }

    public string WorkingDirectory => _workingDirectory;

    /// <summary>Đường dẫn file cấu hình của phiên hiện tại (để chẩn đoán/verify-relay.ps1 dùng lại).</summary>
    public string RelayConfigPath => Path.Combine(_workingDirectory, "flowvpnrelay.json");

    /// <summary>
    /// Dựng tunnel: cấp cổng trống → ghi cấu hình (transport + TUN) → chạy relay và CHỜ TUNREADY →
    /// đặt DNS lên adapter TUN. Ném <see cref="TunnelTransportException"/> khi thiếu binary, khi TUN
    /// không dựng được (<c>TUNFAIL</c>) hoặc khi hết hạn chờ; trong mọi trường hợp lỗi, tiến trình
    /// con đã chạy đều bị dọn sạch trước khi ném.
    /// </summary>
    public async Task StartAsync(string server, string relayUrl, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(server);
        ArgumentException.ThrowIfNullOrWhiteSpace(relayUrl);
        cancellationToken.ThrowIfCancellationRequested();

        await StopAsync().ConfigureAwait(false);
        _stopping = false;
        SetLastError(null);

        var relayExe = Path.Combine(_assetDirectory, HysteriaRelayDefaults.RelayExeName);
        RequireBinary(relayExe);

        // Máy bật Smart App Control có thể chặn cả binary CHƯA KÝ của mình (đã đo: bản app tự build
        // bị chặn 6 lần). Phát hiện SỚM để không tốn thời gian bắt tay WebSocket rồi mới chết và báo
        // đúng nguyên nhân. Kết quả được ghi nhớ nên các lần kết nối sau thoát ra tức thì.
        if (ApplicationControlGuard.ProbeBlocked(relayExe))
        {
            throw new TunnelTransportException(
                ApplicationControlGuard.UserMessage(Path.GetFileName(relayExe)));
        }

        // Cổng cấp động: hard-code sẽ đụng khi máy khách đã có tiến trình khác giữ cổng đó.
        RelaySocksPort = SingBoxConfigBuilder.AllocateFreePort();
        RelayUrlInUse = relayUrl;

        Directory.CreateDirectory(_workingDirectory);

        // Bypass Trung Quốc: danh sách dải IP TQ đi THẲNG, không vào tunnel. Thiếu nó thì app TQ
        // (WeChat/Alipay/Taobao…) thấy IP nước ngoài và cắt kết nối — đúng lỗi khách báo 22/09/2026.
        // Best-effort: không lấy được danh sách thì TUN vẫn lên full-tunnel, KHÔNG chặn kết nối.
        var chinaCidrs = await TryLoadChinaBypassCidrsAsync(cancellationToken).ConfigureAwait(false);

        File.WriteAllText(
            RelayConfigPath,
            SingBoxConfigBuilder.BuildRelayConfig(
                server,
                relayUrl,
                RelaySocksPort,
                chinaCidrs: chinaCidrs));

        _log.Info(
            $"relay: đã ghi cấu hình ({RelayConfigPath}) — server={server} relay={relayUrl} " +
            $"socks=127.0.0.1:{RelaySocksPort} tun={HysteriaRelayDefaults.TunName} " +
            $"bypass={(chinaCidrs is { Count: > 0 } ? chinaCidrs.Count + " dải TQ" : "KHÔNG có")}");

        SetState(HysteriaRelayState.Starting);
        try
        {
            TunInterfaceName = await StartRelayAsync(relayExe, RelayConfigPath).ConfigureAwait(false);

            // DNS đặt SAU khi TUN đã tồn tại: chưa có adapter thì netsh không có gì để trỏ vào.
            await ApplyTunDnsAsync(TunInterfaceName, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            await StopAsync().ConfigureAwait(false);
            throw;
        }

        SetState(HysteriaRelayState.Running);
        _log.Info(
            $"relay: đường hysteria2-over-WS đã lên — relay={relayUrl} " +
            $"(tun={TunInterfaceName}, socks=127.0.0.1:{RelaySocksPort})");
    }

    /// <summary>
    /// Nạp danh sách dải IP Trung Quốc (<c>cn.txt</c> + <c>cn6.txt</c>) để nhúng vào cấu hình relay.
    ///
    /// Trả null khi không lấy được gì: khi đó TUN vẫn lên full-tunnel, chỉ mất phần bypass. Bypass là
    /// tính năng phụ — tuyệt đối không được phép biến lỗi mạng thành lỗi kết nối (bài học "connecting
    /// mãi" của 1.0.4).
    /// </summary>
    private async Task<IReadOnlyList<string>?> TryLoadChinaBypassCidrsAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            var cidrs = await ChinaBypass
                .LoadAllAsync(http, _workingDirectory, ChinaBypass.DefaultCacheTtl, cancellationToken)
                .ConfigureAwait(false);

            if (cidrs.Count == 0)
            {
                _log.Warn("china-bypass (relay): không có danh sách CIDR Trung Quốc — tunnel lên KHÔNG kèm bypass.");
                return null;
            }

            _log.Info($"china-bypass (relay): nhúng {cidrs.Count} dải CIDR Trung Quốc đi thẳng vào cấu hình TUN");
            return cidrs;
        }
        catch (Exception ex)
        {
            _log.Warn($"china-bypass (relay): bỏ qua do lỗi — {ex.Message}");
            return null;
        }
    }

    /// <summary>Kết quả chờ mốc TUNREADY.</summary>
    private readonly record struct RelayReady(string InterfaceName);

    /// <summary>
    /// Dừng và dọn sạch. Gọi được nhiều lần, không ném khi tiến trình đã chết. Kill tiến trình là
    /// cách gỡ TUN: adapter wintun mất khi tiến trình giữ nó thoát, và Windows tự bỏ route trỏ vào
    /// adapter đã mất.
    /// </summary>
    public async Task StopAsync()
    {
        _stopping = true;
        try
        {
            await KillAsync(TakeProcess(), HysteriaRelayDefaults.RelayExeName, 5_000).ConfigureAwait(false);
        }
        finally
        {
            RelaySocksPort = 0;
            TunInterfaceName = null;
            RelayUrlInUse = null;
            SetState(HysteriaRelayState.Stopped);
        }
    }

    // MARK: - chạy tiến trình con

    private async Task<string> StartRelayAsync(string relayExe, string configPath)
    {
        var (_, ready) = Launch(relayExe, $"-c \"{configPath}\"");

        var done = await Task.WhenAny(ready.Task, Task.Delay(TimeSpan.FromSeconds(ReadyTimeoutSeconds)))
            .ConfigureAwait(false);
        if (done != ready.Task)
        {
            throw new TunnelTransportException(
                $"{HysteriaRelayDefaults.RelayExeName} không báo {HysteriaRelayDefaults.TunReadyMarker.Trim()} " +
                $"trong {ReadyTimeoutSeconds}s (relay WebSocket/Cloudflare không bắt tay được).");
        }

        // await (không dùng .Result): .Result bọc lỗi thật vào AggregateException và làm thông báo
        // cho khách biến thành "One or more errors occurred" — mất luôn lý do TUNFAIL.
        var result = await ready.Task.ConfigureAwait(false);
        return result.InterfaceName;
    }

    /// <summary>
    /// Đặt DNS lên adapter TUN bằng netsh — cùng lệnh mà đường WireGuard đang dùng
    /// (<see cref="WireGuardWindowsCommands.SetDns"/>). Không đặt được thì GHI WARN rồi đi tiếp:
    /// tunnel vẫn chở được theo IP, chỉ mất phần phân giải tên qua tunnel — chặn kết nối ở đây sẽ
    /// biến một lỗi phụ thành "không vào được mạng".
    /// </summary>
    private async Task ApplyTunDnsAsync(string interfaceName, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(interfaceName);

        var servers = HysteriaRelayDefaults.TunDnsServers;
        for (var i = 0; i < servers.Count; i++)
        {
            var command = i == 0
                ? WireGuardWindowsCommands.SetDns(interfaceName, servers[i])
                : WireGuardWindowsCommands.AddDns(interfaceName, servers[i], i + 1);
            var ok = await RunNetshAsync(command, cancellationToken).ConfigureAwait(false);
            if (!ok && i == 0)
            {
                _log.Warn(
                    $"relay: đặt DNS {servers[i]} lên '{interfaceName}' thất bại — " +
                    "truy vấn tên có thể vẫn đi ra resolver của mạng khách.");
                return;
            }
        }

        _log.Info($"relay: đã đặt DNS lên '{interfaceName}': {string.Join(", ", servers)}");
    }

    private async Task<bool> RunNetshAsync(WindowsCommand command, CancellationToken cancellationToken)
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = command.FileName,
                Arguments = command.Arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });

            if (process is null)
            {
                return false;
            }

            // Đọc stream SONG SONG với lúc chờ: đọc sau khi WaitForExit có thể treo nếu tiến trình
            // ghi đầy buffer ống (bài học chung của Process với 2 stream được redirect).
            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            try
            {
                await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch (Exception)
                {
                    // chỉ là dọn tiến trình netsh
                }

                return false;
            }

            if (process.ExitCode == 0)
            {
                return true;
            }

            var stderr = await stderrTask.ConfigureAwait(false);
            var stdout = await stdoutTask.ConfigureAwait(false);
            _log.Warn(
                $"relay: netsh exit {process.ExitCode} cho '{command.Arguments}': " +
                $"{FirstLine(stderr.Length > 0 ? stderr : stdout)}");
            return false;
        }
        catch (Exception ex)
        {
            _log.Warn($"relay: chạy netsh lỗi (bỏ qua): {ex.Message}");
            return false;
        }
    }

    private static string FirstLine(string text)
    {
        var trimmed = text.Trim();
        var index = trimmed.IndexOfAny(new[] { '\r', '\n' });
        return index < 0 ? trimmed : trimmed[..index];
    }

    /// <summary>
    /// Chạy tiến trình con ẩn cửa sổ, drain stdout/stderr vào logger. <c>ready</c> được đặt khi stderr
    /// thấy dòng TUNREADY (kèm tên adapter); đặt exception khi thấy TUNFAIL hoặc khi stream kết thúc
    /// mà chưa thấy mốc nào (tiến trình chết trước khi tunnel lên).
    /// </summary>
    private (Process Process, TaskCompletionSource<RelayReady> Ready) Launch(string exe, string arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = arguments,
            WorkingDirectory = _workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        var name = Path.GetFileName(exe);
        process.Exited += (_, _) => OnChildExited(process, name);

        try
        {
            process.Start();
        }
        catch (Exception ex) when (ApplicationControlGuard.IsBlocked(ex))
        {
            // Windows (Smart App Control / WDAC) chặn binary chưa ký: ghi nhớ để lần sau khỏi thử
            // và báo đúng bản chất thay vì "không chạy được <tên file>".
            ApplicationControlGuard.MarkBlocked(name);
            throw new TunnelTransportException(ApplicationControlGuard.UserMessage(name), ex);
        }
        catch (Exception ex)
        {
            throw new TunnelTransportException($"Không chạy được {name}: {ex.Message}", ex);
        }

        lock (_lock)
        {
            _relayProcess = process;
        }

        var ready = new TaskCompletionSource<RelayReady>(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = Task.Run(() => DrainAsync(process.StandardOutput, $"{name}[stdout]"));
        _ = Task.Run(() => ReadStderrAsync(process.StandardError, $"{name}[stderr]", ready));
        return (process, ready);
    }

    private async Task ReadStderrAsync(StreamReader reader, string tag, TaskCompletionSource<RelayReady> ready)
    {
        try
        {
            while (await reader.ReadLineAsync().ConfigureAwait(false) is { } line)
            {
                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                _log.Info($"{tag}: {line}");
                if (line.Contains(HysteriaRelayDefaults.TunReadyMarker, StringComparison.Ordinal))
                {
                    ready.TrySetResult(new RelayReady(ParseTunName(line)));
                }
                else if (line.Contains(HysteriaRelayDefaults.TunFailMarker, StringComparison.Ordinal))
                {
                    // Lý do thật nằm sau marker — đưa nguyên vào thông báo để log khách đọc được.
                    var reason = line[(line.IndexOf(HysteriaRelayDefaults.TunFailMarker, StringComparison.Ordinal) +
                                       HysteriaRelayDefaults.TunFailMarker.Length)..].Trim();
                    ready.TrySetException(new TunnelTransportException(
                        $"Không dựng được TUN của {HysteriaRelayDefaults.RelayExeName}: {reason}"));
                }
            }
        }
        catch (Exception)
        {
            // Tiến trình đã đóng stream.
        }
        finally
        {
            // Không thấy TUNREADY mà stream đã hết = tiến trình chết trước khi tunnel lên.
            ready.TrySetException(new TunnelTransportException(
                $"{HysteriaRelayDefaults.RelayExeName} đã thoát trước khi dựng xong TUN."));
        }
    }

    /// <summary>Bóc <c>if=&lt;tên&gt;</c> khỏi dòng TUNREADY; thiếu thì dùng tên mặc định.</summary>
    private static string ParseTunName(string line)
    {
        foreach (var token in line.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (token.StartsWith("if=", StringComparison.Ordinal) && token.Length > 3)
            {
                return token[3..];
            }
        }

        return HysteriaRelayDefaults.TunName;
    }

    private async Task DrainAsync(StreamReader reader, string tag)
    {
        try
        {
            while (await reader.ReadLineAsync().ConfigureAwait(false) is { } line)
            {
                if (!string.IsNullOrWhiteSpace(line))
                {
                    _log.Info($"{tag}: {line}");
                }
            }
        }
        catch (Exception)
        {
            // Tiến trình đã đóng stream.
        }
    }

    /// <summary>
    /// Tiến trình con vừa thoát. Ta chủ động dừng thì bỏ qua; chết bất ngờ thì báo lỗi NGAY (giữ TUN
    /// trỏ vào đường chết là giữ cảnh mất internet cho cả máy).
    /// </summary>
    private void OnChildExited(Process process, string name)
    {
        if (_stopping)
        {
            return;
        }

        _stopping = true;

        var message = $"{name} đã thoát bất ngờ{DescribeExit(process)} — tunnel relay không còn hoạt động.";
        _log.Error($"relay: {message}");

        KillSync(TakeProcess(), HysteriaRelayDefaults.RelayExeName, 0);

        SetLastError(message);
        SetState(HysteriaRelayState.Faulted);
        Faulted?.Invoke(this, message);
    }

    private void OnProcessExit(object? sender, EventArgs e)
    {
        // App đang thoát: không còn thời gian chờ, kill để HĐH thu hồi adapter TUN.
        _stopping = true;
        KillSync(TakeProcess(), HysteriaRelayDefaults.RelayExeName, 0);
    }

    // MARK: - dọn tiến trình

    private Process? TakeProcess()
    {
        lock (_lock)
        {
            var process = _relayProcess;
            _relayProcess = null;
            return process;
        }
    }

    private async Task KillAsync(Process? process, string name, int waitForExitMs)
    {
        if (process is null)
        {
            return;
        }

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                _log.Info($"relay: đã kill {name}");
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"relay: kill {name} lỗi (bỏ qua): {ex.Message}");
        }
        finally
        {
            try
            {
                using var cts = new CancellationTokenSource(Math.Max(waitForExitMs, 1));
                await process.WaitForExitAsync(cts.Token).ConfigureAwait(false);
            }
            catch (Exception)
            {
                // Hết hạn chờ: tiến trình đã bị kill, không giữ app lại vì nó.
            }

            process.Dispose();
        }
    }

    private void KillSync(Process? process, string name, int waitForExitMs)
    {
        if (process is null)
        {
            return;
        }

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                _log.Info($"relay: đã kill {name}");
            }

            if (waitForExitMs > 0)
            {
                process.WaitForExit(waitForExitMs);
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"relay: kill {name} lỗi (bỏ qua): {ex.Message}");
        }
        finally
        {
            process.Dispose();
        }
    }

    // MARK: - tiện ích

    private static void RequireBinary(string path)
    {
        if (File.Exists(path))
        {
            return;
        }

        var name = Path.GetFileName(path);
        throw new TunnelTransportException(
            $"Thiếu {name} trong '{Path.GetDirectoryName(path)}'. " +
            "Chạy: bash windows/assets/fetch-assets.sh rồi publish lại " +
            "(xem windows/assets/THIRD_PARTY.md).");
    }

    private static string DescribeExit(Process process)
    {
        try
        {
            return process.HasExited ? $" (exit code {process.ExitCode})" : string.Empty;
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }

    private void SetState(HysteriaRelayState state)
    {
        bool changed;
        lock (_lock)
        {
            changed = _state != state;
            _state = state;
        }

        if (changed)
        {
            StateChanged?.Invoke(this, state);
        }
    }

    private void SetLastError(string? message)
    {
        lock (_lock)
        {
            _lastError = message;
        }
    }

    public void Dispose()
    {
        AppDomain.CurrentDomain.ProcessExit -= OnProcessExit;
        _stopping = true;
        KillSync(TakeProcess(), HysteriaRelayDefaults.RelayExeName, 0);
    }
}
