using System.Diagnostics;
using System.IO.Pipes;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Driver WireGuard userspace cho Windows: app TỰ LO tunnel, người dùng KHÔNG phải
/// cài "WireGuard for Windows".
///
/// Cách chạy (giống mô hình Tailscale/WireGuard for Windows):
///  1. Copy <c>wintun.dll</c> + <c>wireguard-go.exe</c> từ thư mục app ra một thư mục
///     làm việc (%PROGRAMDATA%\VPNFlow\wireguard, hoặc temp) — wintun.dll PHẢI nằm
///     cạnh wireguard-go.exe vì module wintun nạp DLL bằng
///     <c>LoadLibraryEx(..., LOAD_LIBRARY_SEARCH_APPLICATION_DIR)</c>.
///  2. Chạy <c>wireguard-go.exe &lt;ifname&gt;</c>. Trên Windows, wireguard-go tạo adapter
///     Wintun qua wintun.dll rồi mở UAPI **named pipe** tại
///     <c>\\.\pipe\ProtectedPrefix\Administrators\WireGuard\&lt;ifname&gt;</c>
///     (xác nhận trong nguồn: <c>ipc/uapi_windows.go</c> của wireguard-go).
///  3. Nạp cấu hình qua UAPI (<see cref="WireGuardUapi.BuildSetConf"/>) — KHÁC file
///     .conf: UAPI nhận khoá hex, nên parse conf rồi đổi base64→hex.
///  4. Cấu hình mạng còn lại (địa chỉ IP, MTU, route chia 0.0.0.0/1+128.0.0.0/1, DNS)
///     bằng netsh/powershell — wireguard-go KHÔNG làm phần này.
///  5. Disconnect: kill process, xoá route, gỡ adapter.
///
/// Chỉ chạy trên Windows. Trên macOS mọi thao tác cài/gỡ ném
/// <see cref="PlatformNotSupportedException"/> để build + smoke-test UI được.
/// </summary>
public sealed class WintunWireGuardDriver : IWireGuardDriver, IDisposable
{
    public const string WintunDllName = WireGuardDriverSelector.WintunDllName;
    public const string WireGuardGoExeName = WireGuardDriverSelector.WireGuardGoExeName;

    /// <summary>Tiền tố pipe UAPI; xem ipc/uapi_windows.go của wireguard-go.</summary>
    public const string UapiPipePrefix = @"ProtectedPrefix\Administrators\WireGuard\";

    private const int UapiStartupTimeoutSeconds = 15;
    private const int UapiConnectTimeoutMs = 2_000;
    private const int KillSettleMs = 500;

    private readonly string _assetDirectory;
    private readonly string _workingDirectory;
    private readonly ITunnelLogger _log;
    private readonly object _lock = new();

    private Process? _process;
    private WireGuardConfig? _activeConfig;
    private EndpointRoute? _endpointRoute;
    private bool _ipv6Blocked;

    /// <summary>Route loại trừ đã thêm cho IP endpoint (để xoá lại lúc ngắt kết nối).</summary>
    private readonly record struct EndpointRoute(string Ip, string Interface, string Gateway);

    public WintunWireGuardDriver(string? assetDirectory = null, string? workingDirectory = null, ITunnelLogger? log = null)
    {
        _assetDirectory = string.IsNullOrWhiteSpace(assetDirectory) ? AppContext.BaseDirectory : assetDirectory;
        _workingDirectory = string.IsNullOrWhiteSpace(workingDirectory) ? DefaultWorkingDirectory() : workingDirectory;
        _log = log ?? NullTunnelLogger.Instance;
    }

    public bool IsSupported => RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    public string AssetDirectory => _assetDirectory;

    public string WorkingDirectory => _workingDirectory;

    /// <summary>Tên pipe UAPI (không kèm <c>\\.\pipe\</c>) cho một interface.</summary>
    public static string UapiPipeNameFor(string tunnelName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tunnelName);
        return UapiPipePrefix + tunnelName;
    }

    /// <summary>Thư mục làm việc mặc định: %PROGRAMDATA%\VPNFlow\wireguard, lùi về temp.</summary>
    public static string DefaultWorkingDirectory()
    {
        var programData = Environment.GetEnvironmentVariable("ProgramData");
        return !string.IsNullOrWhiteSpace(programData)
            ? Path.Combine(programData, "VPNFlow", "wireguard")
            : Path.Combine(Path.GetTempPath(), "VPNFlow", "wireguard");
    }

    /// <summary>Đường dẫn wireguard-go.exe nhúng; null nếu thiếu asset.</summary>
    public string? ResolveExecutable()
    {
        var path = Path.Combine(_assetDirectory, WireGuardGoExeName);
        return File.Exists(path) ? path : null;
    }

    /// <summary>Đường dẫn wintun.dll nhúng; null nếu thiếu asset.</summary>
    public string? ResolveWintunDll()
    {
        var path = Path.Combine(_assetDirectory, WintunDllName);
        return File.Exists(path) ? path : null;
    }

    public async Task InstallAsync(string tunnelName, string confPath, CancellationToken cancellationToken = default)
    {
        EnsureSupported();
        ArgumentException.ThrowIfNullOrWhiteSpace(tunnelName);
        ArgumentException.ThrowIfNullOrWhiteSpace(confPath);

        var exe = ResolveExecutable()
            ?? throw new WireGuardDriverException(
                $"wireguard-go.exe không có trong '{_assetDirectory}'. Chạy windows/assets/fetch-assets.sh.");
        var wintunDll = ResolveWintunDll()
            ?? throw new WireGuardDriverException(
                $"wintun.dll không có trong '{_assetDirectory}'. Chạy windows/assets/fetch-assets.sh.");

        var confText = await File.ReadAllTextAsync(confPath, cancellationToken).ConfigureAwait(false);
        var config = WireGuardConfParser.Parse(confText);
        config.Name = tunnelName;

        // Dọn instance cũ (tiến trình sót sau khi app tắt / route cũ) trước khi tạo mới,
        // nếu không UAPIListen sẽ fail vì pipe đã tồn tại.
        await CleanupAsync(tunnelName, cancellationToken).ConfigureAwait(false);

        Directory.CreateDirectory(_workingDirectory);
        File.Copy(wintunDll, Path.Combine(_workingDirectory, WintunDllName), overwrite: true);
        File.Copy(exe, Path.Combine(_workingDirectory, WireGuardGoExeName), overwrite: true);

        StartProcess(tunnelName);

        try
        {
            await WaitForUapiPipeAsync(tunnelName, cancellationToken).ConfigureAwait(false);
            await SetUapiConfAsync(tunnelName, config, cancellationToken).ConfigureAwait(false);

            lock (_lock)
            {
                _activeConfig = config;
            }

            await ApplyInterfaceConfigurationAsync(tunnelName, config, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            await CleanupAsync(tunnelName, CancellationToken.None).ConfigureAwait(false);
            throw;
        }

        _log.Info($"wintun: tunnel '{tunnelName}' đã lên (userspace wireguard-go + wintun, không cần cài WireGuard).");
    }

    public async Task UninstallAsync(string tunnelName, CancellationToken cancellationToken = default)
    {
        EnsureSupported();
        ArgumentException.ThrowIfNullOrWhiteSpace(tunnelName);
        await CleanupAsync(tunnelName, cancellationToken).ConfigureAwait(false);
    }

    public Task<WireGuardTunnelState> GetStateAsync(string tunnelName, CancellationToken cancellationToken = default)
    {
        if (!IsSupported || string.IsNullOrWhiteSpace(tunnelName))
        {
            return Task.FromResult(WireGuardTunnelState.Unknown);
        }

        Process? process;
        lock (_lock)
        {
            process = _process;
        }

        if (process is { HasExited: false })
        {
            return Task.FromResult(WireGuardTunnelState.Running);
        }

        // Tiến trình cũ còn sót (app từng bị tắt đột ngột) — nhận diện qua pipe UAPI.
        return Task.FromResult(
            UapiPipeExists(tunnelName) ? WireGuardTunnelState.Running : WireGuardTunnelState.NotInstalled);
    }

    // MARK: - UAPI

    private async Task WaitForUapiPipeAsync(string tunnelName, CancellationToken cancellationToken)
    {
        var deadline = DateTime.UtcNow.AddSeconds(UapiStartupTimeoutSeconds);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            ThrowIfProcessExited();

            try
            {
                using var pipe = new NamedPipeClientStream(
                    ".", UapiPipeNameFor(tunnelName), PipeDirection.InOut, PipeOptions.Asynchronous);
                await pipe.ConnectAsync(500, cancellationToken).ConfigureAwait(false);
                return;
            }
            catch (TimeoutException)
            {
                // Pipe chưa mở; thử lại.
            }
            catch (IOException)
            {
                // Pipe chưa tồn tại; thử lại.
            }

            await Task.Delay(200, cancellationToken).ConfigureAwait(false);
        }

        throw new WireGuardDriverException(
            $"UAPI pipe của wireguard-go không mở sau {UapiStartupTimeoutSeconds}s.");
    }

    private async Task SetUapiConfAsync(string tunnelName, WireGuardConfig config, CancellationToken cancellationToken)
    {
        using var pipe = new NamedPipeClientStream(
            ".", UapiPipeNameFor(tunnelName), PipeDirection.InOut, PipeOptions.Asynchronous);
        await pipe.ConnectAsync(UapiConnectTimeoutMs, cancellationToken).ConfigureAwait(false);

        var payload = Encoding.UTF8.GetBytes(WireGuardUapi.BuildSetConf(config));
        await pipe.WriteAsync(payload, cancellationToken).ConfigureAwait(false);
        await pipe.FlushAsync(cancellationToken).ConfigureAwait(false);

        var response = await ReadToEndOfOperationAsync(pipe, cancellationToken).ConfigureAwait(false);
        var errno = WireGuardUapi.ParseErrno(response);
        if (errno is null)
        {
            throw new WireGuardDriverException($"UAPI setconf: phản hồi không hợp lệ ('{response.Trim()}').");
        }
        if (errno != 0)
        {
            throw new WireGuardDriverException($"UAPI setconf thất bại, errno={errno}.");
        }
    }

    private static async Task<string> ReadToEndOfOperationAsync(Stream pipe, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(pipe, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
        var sb = new StringBuilder();
        while (true)
        {
            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
            {
                break;
            }

            sb.Append(line).Append('\n');
            if (line.Length == 0)
            {
                // Dòng trống kết thúc một operation UAPI.
                break;
            }
        }
        return sb.ToString();
    }

    private static bool UapiPipeExists(string tunnelName)
    {
        try
        {
            using var pipe = new NamedPipeClientStream(".", UapiPipeNameFor(tunnelName), PipeDirection.InOut);
            pipe.Connect(200);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    // MARK: - process

    private void StartProcess(string tunnelName)
    {
        // wireguard-go phải mở named pipe UAPI đặt owner SYSTEM; token admin đã elevated
        // vẫn đang TẮT SeRestorePrivilege/SeTakeOwnershipPrivilege nên CreateNamedPipe bị
        // từ chối và tiến trình thoát ngay. Bật trước để con thừa hưởng.
        var enabled = ProcessPrivileges.EnableForTunnelPipe();
        _log.Info(enabled.Count > 0
            ? $"wintun: đã bật privilege {string.Join(", ", enabled)} cho tiến trình tunnel"
            : "wintun: KHÔNG bật được privilege nào (thiếu quyền admin?) — wireguard-go có thể không mở được UAPI pipe");

        var startInfo = new ProcessStartInfo
        {
            FileName = Path.Combine(_workingDirectory, WireGuardGoExeName),
            Arguments = tunnelName,
            WorkingDirectory = _workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
        }
        catch (Exception ex)
        {
            throw new WireGuardDriverException($"Không chạy được wireguard-go.exe: {ex.Message}", ex);
        }

        lock (_lock)
        {
            _process = process;
        }

        _ = Task.Run(() => DrainAsync(process.StandardOutput, "wireguard-go[stdout]"));
        _ = Task.Run(() => DrainAsync(process.StandardError, "wireguard-go[stderr]"));
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
            // Process đã đóng.
        }
    }

    private void ThrowIfProcessExited()
    {
        Process? process;
        lock (_lock)
        {
            process = _process;
        }

        if (process is { HasExited: true })
        {
            throw new WireGuardDriverException(
                $"wireguard-go.exe đã thoát (exit code {process.ExitCode}) trước khi tunnel lên.");
        }
    }

    private void KillTrackedProcess()
    {
        Process? process;
        lock (_lock)
        {
            process = _process;
            _process = null;
        }

        if (process is null)
        {
            return;
        }

        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"wintun: kill wireguard-go lỗi (bỏ qua): {ex.Message}");
        }
        finally
        {
            process.Dispose();
        }
    }

    /// <summary>Kill tiến trình wireguard-go còn sót (không do instance này quản lý).</summary>
    private async Task TryKillStaleProcessAsync()
    {
        await RunBestEffortAsync(new WindowsCommand("taskkill.exe", "/F /IM " + WireGuardGoExeName))
            .ConfigureAwait(false);
    }

    // MARK: - interface configuration

    private async Task ApplyInterfaceConfigurationAsync(
        string tunnelName,
        WireGuardConfig config,
        CancellationToken cancellationToken)
    {
        // PHẢI thêm route loại trừ endpoint TRƯỚC khi gắn route chia default, nếu không gói
        // UDP của chính wireguard-go cũng bị đẩy vào tunnel ⇒ handshake chết, máy mất mạng.
        await AddEndpointExclusionRouteAsync(config, cancellationToken).ConfigureAwait(false);

        foreach (var command in WireGuardWindowsCommands.BuildInterfaceConfiguration(tunnelName, config))
        {
            var (exitCode, stdout, stderr) = await RunProcessAsync(command.FileName, command.Arguments, cancellationToken)
                .ConfigureAwait(false);
            if (exitCode != 0)
            {
                var detail = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
                throw new WireGuardDriverException(
                    $"Cấu hình interface thất bại (exit {exitCode}): {command} — {detail.Trim()}");
            }
        }

        // Tunnel chỉ định tuyến IPv4: chặn IPv6 để IP thật không rò ra ngoài qua IPv6.
        await BlockIpv6Async(tunnelName, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Chặn IPv6 bằng hai nửa default route IPv6 trỏ vào interface tunnel (interface không có
    /// địa chỉ IPv6 nên gói bị đen). Best-effort: máy tắt IPv6 sẵn thì lệnh có thể báo lỗi,
    /// ghi WARN rồi đi tiếp — không được chặn việc kết nối.
    /// </summary>
    private async Task BlockIpv6Async(string tunnelName, CancellationToken cancellationToken)
    {
        var cidrs = new[]
        {
            WireGuardWindowsCommands.Ipv6BlockLowHalf,
            WireGuardWindowsCommands.Ipv6BlockHighHalf,
        };

        var blocked = 0;
        foreach (var cidr in cidrs)
        {
            var added = await AddRouteIdempotentAsync(
                WireGuardWindowsCommands.DeleteIpv6BlockRoute(tunnelName, cidr),
                WireGuardWindowsCommands.AddIpv6BlockRoute(tunnelName, cidr),
                cancellationToken).ConfigureAwait(false);

            if (added)
            {
                blocked++;
            }
        }

        lock (_lock)
        {
            _ipv6Blocked = blocked > 0;
        }

        if (blocked == cidrs.Length)
        {
            _log.Info("wintun: đã chặn IPv6 (::/1 + 8000::/1 qua tunnel) — tránh rò IP thật qua IPv6");
        }
        else if (blocked > 0)
        {
            _log.Warn("wintun: chỉ chặn được một phần IPv6 — vẫn có thể rò IPv6.");
        }
    }

    /// <summary>
    /// Thêm route theo kiểu idempotent: xoá trước (bỏ qua lỗi) rồi thêm.
    ///
    /// Vì sao không thêm thẳng: route có thể còn sót từ phiên trước (app bị tắt đột ngột nên
    /// không kịp dọn) → netsh trả "The object already exists", ta ghi WARN và **không ghi nhận**
    /// route để dọn về sau, thành route mồ côi vĩnh viễn. Xoá trước là cách chắc chắn, không phụ
    /// thuộc ngôn ngữ thông báo của netsh.
    /// </summary>
    private async Task<bool> AddRouteIdempotentAsync(
        WindowsCommand delete,
        WindowsCommand add,
        CancellationToken cancellationToken)
    {
        await RunBestEffortAsync(delete).ConfigureAwait(false);

        var (exitCode, stdout, stderr) = await RunProcessAsync(add.FileName, add.Arguments, cancellationToken)
            .ConfigureAwait(false);
        if (exitCode == 0)
        {
            return true;
        }

        var detail = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
        _log.Warn($"wintun: {add.Arguments} thất bại: {detail.Trim()}");
        return false;
    }

    /// <summary>
    /// Thêm route /32 cho IP endpoint của peer đi qua gateway vật lý, để gói UDP của
    /// wireguard-go tới node không bị route chia default hút vào tunnel.
    /// Best-effort: không đọc được default route thì ghi WARN rồi đi tiếp.
    /// </summary>
    private async Task AddEndpointExclusionRouteAsync(WireGuardConfig config, CancellationToken cancellationToken)
    {
        var endpointIp = ResolveEndpointIp(config);
        if (endpointIp is null)
        {
            _log.Warn("wintun: không xác định được IP endpoint — bỏ qua route loại trừ.");
            return;
        }

        var getRoute = WireGuardWindowsCommands.GetDefaultRoute();
        var (routeExit, routeOut, routeErr) = await RunProcessAsync(getRoute.FileName, getRoute.Arguments, cancellationToken)
            .ConfigureAwait(false);

        var parsed = WireGuardWindowsCommands.ParseDefaultRouteOutput(routeOut);
        if (routeExit != 0 || parsed is null)
        {
            _log.Warn(
                $"wintun: không đọc được default route (exit {routeExit}) — bỏ qua route loại trừ {endpointIp}: " +
                $"{routeErr.Trim()}");
            return;
        }

        var (gateway, @interface) = parsed.Value;
        var added = await AddRouteIdempotentAsync(
            WireGuardWindowsCommands.DeleteEndpointRoute(@interface, gateway, endpointIp),
            WireGuardWindowsCommands.AddEndpointRoute(@interface, gateway, endpointIp),
            cancellationToken).ConfigureAwait(false);

        if (!added)
        {
            return;
        }

        lock (_lock)
        {
            _endpointRoute = new EndpointRoute(endpointIp, @interface, gateway);
        }

        _log.Info($"wintun: đã thêm route loại trừ {endpointIp}/32 qua {gateway} ({@interface})");
    }

    /// <summary>IP endpoint IPv4 của peer đầu tiên; null nếu thiếu hoặc không phân giải được.</summary>
    private static string? ResolveEndpointIp(WireGuardConfig config)
    {
        var endpoint = config.Peers.FirstOrDefault()?.Endpoint;
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            return null;
        }

        var host = endpoint;
        var colon = endpoint.LastIndexOf(':');
        if (colon > 0)
        {
            host = endpoint[..colon];
        }

        host = host.Trim('[', ']');

        if (IPAddress.TryParse(host, out var parsed) && parsed.AddressFamily == AddressFamily.InterNetwork)
        {
            return parsed.ToString();
        }

        try
        {
            return Dns.GetHostAddresses(host)
                .FirstOrDefault(address => address.AddressFamily == AddressFamily.InterNetwork)
                ?.ToString();
        }
        catch (Exception)
        {
            return null;
        }
    }

    // MARK: - cleanup

    private async Task CleanupAsync(string tunnelName, CancellationToken cancellationToken)
    {
        WireGuardConfig? config;
        lock (_lock)
        {
            config = _activeConfig;
            _activeConfig = null;
        }

        var hadTrackedProcess = _process is not null;
        KillTrackedProcess();

        if (!hadTrackedProcess)
        {
            // Có thể còn tiến trình từ lần chạy app trước; chỉ khi đó mới taskkill theo tên
            // (tránh kill nhầm khi instance này chưa từng chạy).
            await TryKillStaleProcessAsync().ConfigureAwait(false);
        }

        // Chờ OS nhả adapter/session trước khi xoá route/interface.
        try
        {
            await Task.Delay(KillSettleMs, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Vẫn cố dọn tiếp.
        }

        var routeDeletes = config is not null
            ? WireGuardWindowsCommands.BuildRouteDeletes(tunnelName, config)
            : BuildDefaultRouteDeletes(tunnelName);

        foreach (var command in routeDeletes)
        {
            await RunBestEffortAsync(command).ConfigureAwait(false);
        }

        // Gỡ route loại trừ endpoint đã thêm lúc kết nối, trả bảng route về như trước.
        EndpointRoute? endpointRoute;
        lock (_lock)
        {
            endpointRoute = _endpointRoute;
            _endpointRoute = null;
        }

        if (endpointRoute is { } route)
        {
            await RunBestEffortAsync(
                WireGuardWindowsCommands.DeleteEndpointRoute(route.Interface, route.Gateway, route.Ip))
                .ConfigureAwait(false);
        }

        // Trả IPv6 về như trước khi kết nối (chỉ khi chính instance này đã chặn).
        bool ipv6Blocked;
        lock (_lock)
        {
            ipv6Blocked = _ipv6Blocked;
            _ipv6Blocked = false;
        }

        if (ipv6Blocked)
        {
            foreach (var command in WireGuardWindowsCommands.BuildIpv6BlockDeletes(tunnelName))
            {
                await RunBestEffortAsync(command).ConfigureAwait(false);
            }

            _log.Info("wintun: đã gỡ chặn IPv6.");
        }

        await RunBestEffortAsync(WireGuardWindowsCommands.RemoveInterface(tunnelName)).ConfigureAwait(false);
        _log.Info($"wintun: đã dọn tunnel '{tunnelName}'.");
    }

    private static IReadOnlyList<WindowsCommand> BuildDefaultRouteDeletes(string tunnelName)
        => new[]
        {
            WireGuardWindowsCommands.DeleteRoute(tunnelName, WireGuardWindowsCommands.DefaultRouteLowHalf),
            WireGuardWindowsCommands.DeleteRoute(tunnelName, WireGuardWindowsCommands.DefaultRouteHighHalf),
        };

    private async Task RunBestEffortAsync(WindowsCommand command)
    {
        try
        {
            var (exitCode, _, stderr) = await RunProcessAsync(command.FileName, command.Arguments, CancellationToken.None)
                .ConfigureAwait(false);
            if (exitCode != 0 && !string.IsNullOrWhiteSpace(stderr))
            {
                _log.Warn($"wintun: {command} trả exit {exitCode} (bỏ qua): {stderr.Trim()}");
            }
        }
        catch (Exception ex)
        {
            _log.Warn($"wintun: {command} lỗi (bỏ qua): {ex.Message}");
        }
    }

    // MARK: - process helper

    private static async Task<(int ExitCode, string StdOut, string StdErr)> RunProcessAsync(
        string fileName,
        string arguments,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
        }
        catch (Exception ex)
        {
            throw new WireGuardDriverException($"Không chạy được '{fileName}': {ex.Message}", ex);
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);

        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        var stdout = await stdoutTask.ConfigureAwait(false);
        var stderr = await stderrTask.ConfigureAwait(false);
        return (process.ExitCode, stdout, stderr);
    }

    private void EnsureSupported()
    {
        if (!IsSupported)
        {
            throw new PlatformNotSupportedException(
                "WintunWireGuardDriver cần chạy trên Windows để chạy tunnel userspace.");
        }
    }

    public void Dispose() => KillTrackedProcess();
}
