using System.Diagnostics;

namespace VpnFlow.Core.Tunnel;

/// <summary>Trạng thái của cặp tiến trình con (flowvpnrelay + sing-box).</summary>
public enum HysteriaRelayState
{
    Stopped,
    Starting,
    Running,

    /// <summary>Một tiến trình con chết bất ngờ khi đang chạy — tầng trên quyết định kết nối lại.</summary>
    Faulted,
}

/// <summary>
/// Bộ điều khiển đường "hysteria2 bọc trong WebSocket" trên Windows: chạy HAI tiến trình con
/// cạnh app rồi ghép chúng lại thành một tunnel full-TUN.
///
///  1. <c>flowvpnrelay.exe -c relay.json</c> — hysteria2 client có transport WebSocket
///     (<c>/relay/vn*hy</c> sau Cloudflare). Nó mở SOCKS5 nội bộ ở <c>127.0.0.1:&lt;cổng&gt;</c>
///     (có cả UDP) và in ra stderr dòng chứa <c>READY </c> khi đã bắt tay xong.
///  2. <c>sing-box.exe run -c sing-box.json</c> — TUN + auto_route + DNS, outbound trỏ vào
///     SOCKS5 của bước 1. Chỉ chạy SAU khi thấy READY, vì sing-box bật auto_route ngay khi
///     khởi động: lên trước mà relay chưa sẵn sàng là cả máy mất mạng.
///
/// Thứ tự dọn có chủ ý, ngược thứ tự dựng: kill sing-box TRƯỚC (để nó gỡ TUN + route) rồi mới
/// kill relay — làm ngược lại sẽ để lại route full-tunnel trỏ vào đường đã chết.
///
/// KHÔNG tự kết nối lại: tiến trình con chết bất ngờ thì báo qua <see cref="Faulted"/>; việc
/// thử lại thuộc về <c>VpnConnectionService</c> (vòng lặp vô hạn ở tầng này sẽ che mất lỗi).
/// </summary>
public sealed class HysteriaRelayTunnel : IDisposable
{
    /// <summary>Hạn chờ dòng READY của flowvpnrelay (bắt tay WS + TLS + QUIC qua 2 chặng).</summary>
    public const int ReadyTimeoutSeconds = 15;

    /// <summary>Thời gian cho sing-box gỡ TUN/route trước khi bị kill cứng.</summary>
    private const int SingBoxExitGraceMs = 5_000;

    private readonly string _assetDirectory;
    private readonly string _workingDirectory;
    private readonly ITunnelLogger _log;
    private readonly object _lock = new();

    private Process? _relayProcess;
    private Process? _singBoxProcess;

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

    /// <summary>Cổng clash_api của sing-box (dùng để chẩn đoán; 0 trước khi Start).</summary>
    public int ClashApiPort { get; private set; }

    /// <summary>URL relay đang dùng cho phiên hiện tại.</summary>
    public string? RelayUrlInUse { get; private set; }

    public string WorkingDirectory => _workingDirectory;

    /// <summary>Đường dẫn file cấu hình của phiên hiện tại (để chẩn đoán/verify-relay.ps1 dùng lại).</summary>
    public string RelayConfigPath => Path.Combine(_workingDirectory, "flowvpnrelay.json");

    public string SingBoxConfigPath => Path.Combine(_workingDirectory, "sing-box.json");

    public string SingBoxLogPath => Path.Combine(_workingDirectory, "sing-box.log");

    /// <summary>
    /// Dựng tunnel: cấp cổng trống → ghi 2 file cấu hình → chạy relay và CHỜ READY → chạy sing-box.
    /// Ném <see cref="TunnelTransportException"/> khi thiếu binary hoặc relay không lên; trong mọi
    /// trường hợp lỗi, tiến trình con đã chạy đều bị dọn sạch trước khi ném.
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
        var singBoxExe = Path.Combine(_assetDirectory, HysteriaRelayDefaults.SingBoxExeName);
        RequireBinary(relayExe);
        RequireBinary(singBoxExe);

        // Cổng cấp động: hard-code sẽ đụng khi máy khách đã có tiến trình khác giữ cổng đó.
        var ports = SingBoxConfigBuilder.AllocateFreePorts(2);
        RelaySocksPort = ports[0];
        ClashApiPort = ports[1];
        RelayUrlInUse = relayUrl;

        Directory.CreateDirectory(_workingDirectory);
        File.WriteAllText(
            RelayConfigPath,
            SingBoxConfigBuilder.BuildRelayConfig(server, relayUrl, RelaySocksPort));
        File.WriteAllText(
            SingBoxConfigPath,
            SingBoxConfigBuilder.BuildSingBoxConfig(RelaySocksPort, SingBoxLogPath, ClashApiPort));

        _log.Info(
            $"relay: đã ghi cấu hình ({RelayConfigPath}) — server={server} relay={relayUrl} " +
            $"socks=127.0.0.1:{RelaySocksPort} clash=127.0.0.1:{ClashApiPort}");

        SetState(HysteriaRelayState.Starting);
        try
        {
            await StartRelayAsync(relayExe, RelayConfigPath).ConfigureAwait(false);
            StartSingBox(singBoxExe, SingBoxConfigPath);
        }
        catch
        {
            await StopAsync().ConfigureAwait(false);
            throw;
        }

        SetState(HysteriaRelayState.Running);
        _log.Info(
            $"relay: đường hysteria2-over-WS đã lên — relay={relayUrl} (socks=127.0.0.1:{RelaySocksPort})");
    }

    /// <summary>
    /// Dừng và dọn sạch. Kill sing-box trước (gỡ TUN/route) rồi mới kill relay. Gọi được nhiều
    /// lần, không ném khi tiến trình đã chết.
    /// </summary>
    public async Task StopAsync()
    {
        _stopping = true;
        try
        {
            await KillAsync(TakeProcess(singBox: true), HysteriaRelayDefaults.SingBoxExeName, SingBoxExitGraceMs)
                .ConfigureAwait(false);
            await KillAsync(TakeProcess(singBox: false), HysteriaRelayDefaults.RelayExeName, 0)
                .ConfigureAwait(false);
        }
        finally
        {
            RelaySocksPort = 0;
            ClashApiPort = 0;
            RelayUrlInUse = null;
            SetState(HysteriaRelayState.Stopped);
        }
    }

    // MARK: - chạy tiến trình con

    private async Task StartRelayAsync(string relayExe, string configPath)
    {
        var (process, ready) = Launch(relayExe, $"-c \"{configPath}\"", isSingBox: false);

        var done = await Task.WhenAny(ready.Task, Task.Delay(TimeSpan.FromSeconds(ReadyTimeoutSeconds)))
            .ConfigureAwait(false);
        if (done != ready.Task)
        {
            throw new TunnelTransportException(
                $"{HysteriaRelayDefaults.RelayExeName} không báo READY trong {ReadyTimeoutSeconds}s " +
                "(relay WebSocket/Cloudflare không bắt tay được).");
        }

        if (!ready.Task.Result)
        {
            throw new TunnelTransportException(
                $"{HysteriaRelayDefaults.RelayExeName} đã thoát trước khi mở SOCKS5{DescribeExit(process)}.");
        }
    }

    private void StartSingBox(string singBoxExe, string configPath)
        => Launch(singBoxExe, $"run -c \"{configPath}\"", isSingBox: true);

    /// <summary>
    /// Chạy một tiến trình con ẩn cửa sổ, drain stdout/stderr vào logger. <c>ready</c> được đặt
    /// khi stderr thấy dòng READY; đặt false khi stream kết thúc mà chưa thấy (tiến trình chết).
    /// </summary>
    private (Process Process, TaskCompletionSource<bool> Ready) Launch(string exe, string arguments, bool isSingBox)
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
        catch (Exception ex)
        {
            throw new TunnelTransportException($"Không chạy được {name}: {ex.Message}", ex);
        }

        lock (_lock)
        {
            if (isSingBox)
            {
                _singBoxProcess = process;
            }
            else
            {
                _relayProcess = process;
            }
        }

        var ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = Task.Run(() => DrainAsync(process.StandardOutput, $"{name}[stdout]"));
        _ = Task.Run(() => ReadStderrAsync(process.StandardError, $"{name}[stderr]", ready));
        return (process, ready);
    }

    private async Task ReadStderrAsync(StreamReader reader, string tag, TaskCompletionSource<bool> ready)
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
                if (line.Contains(HysteriaRelayDefaults.ReadyMarker, StringComparison.Ordinal))
                {
                    ready.TrySetResult(true);
                }
            }
        }
        catch (Exception)
        {
            // Tiến trình đã đóng stream.
        }
        finally
        {
            // Không thấy READY mà stream đã hết = tiến trình chết trước khi tunnel lên.
            ready.TrySetResult(false);
        }
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
    /// Một tiến trình con vừa thoát. Ta chủ động dừng thì bỏ qua; chết bất ngờ thì dọn phần còn
    /// lại NGAY (giữ route trỏ vào đường chết là giữ cảnh mất internet cho cả máy) rồi báo lỗi.
    /// </summary>
    private void OnChildExited(Process process, string name)
    {
        if (_stopping)
        {
            return;
        }

        // Bật cờ TRƯỚC khi kill tiến trình còn lại: Exited của nó cũng sẽ chạy vào đây.
        _stopping = true;

        var message = $"{name} đã thoát bất ngờ{DescribeExit(process)} — tunnel relay không còn hoạt động.";
        _log.Error($"relay: {message}");

        var singBox = TakeProcess(singBox: true);
        KillSync(singBox, HysteriaRelayDefaults.SingBoxExeName, SingBoxExitGraceMs);
        KillSync(TakeProcess(singBox: false), HysteriaRelayDefaults.RelayExeName, 0);

        SetLastError(message);
        SetState(HysteriaRelayState.Faulted);
        Faulted?.Invoke(this, message);
    }

    private void OnProcessExit(object? sender, EventArgs e)
    {
        // App đang thoát: không còn thời gian chờ, nhưng vẫn phải đúng thứ tự sing-box → relay.
        _stopping = true;
        KillSync(TakeProcess(singBox: true), HysteriaRelayDefaults.SingBoxExeName, SingBoxExitGraceMs);
        KillSync(TakeProcess(singBox: false), HysteriaRelayDefaults.RelayExeName, 0);
    }

    // MARK: - dọn tiến trình

    private Process? TakeProcess(bool singBox)
    {
        lock (_lock)
        {
            var process = singBox ? _singBoxProcess : _relayProcess;
            if (singBox)
            {
                _singBoxProcess = null;
            }
            else
            {
                _relayProcess = null;
            }

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
        KillSync(TakeProcess(singBox: true), HysteriaRelayDefaults.SingBoxExeName, SingBoxExitGraceMs);
        KillSync(TakeProcess(singBox: false), HysteriaRelayDefaults.RelayExeName, 0);
    }
}
