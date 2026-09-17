using System.Diagnostics;
using System.Runtime.InteropServices;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Bản Windows của <see cref="IWireGuardDriver"/>: điều khiển tunnel qua
/// <c>wireguard.exe</c> đóng sẵn của bản WireGuard for Windows.
///
/// Vì sao dùng wireguard.exe thay vì tự viết data plane: repo có RULE-CODE-002
/// (docs/DEVELOPMENT.md:64) — không tự viết lại WireGuard. wireguard.exe lo cả
/// adapter wintun, route, DNS và service, đúng mô hình "official WireGuard tunnel
/// service integration" mà prompt Windows yêu cầu
/// (docs/FLOWVPN_ANDROID_WINDOWS_PROMPT.md:251-254).
///
/// Lưu ý: các lệnh dưới đây CHỈ chạy được trên Windows (cần quyền admin cho
/// /installtunnelservice và /uninstalltunnelservice). Trên macOS build được nhưng
/// gọi Install/Uninstall sẽ ném PlatformNotSupportedException.
/// </summary>
public sealed class WireGuardWindowsDriver : IWireGuardDriver
{
    private const string ExeName = "wireguard.exe";
    private const string ServicePrefix = "WireGuardTunnel$";

    public bool IsSupported => RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

    /// <summary>
    /// Dò wireguard.exe theo thứ tự: %ProgramFiles%\WireGuard, %ProgramFiles(x86)%\WireGuard,
    /// rồi tới PATH. Không hard-code ổ đĩa/máy cụ thể — chỉ dùng biến môi trường chuẩn.
    /// </summary>
    public string? ResolveExecutable()
    {
        var candidates = new List<string>();

        var programFiles = Environment.GetEnvironmentVariable("ProgramFiles");
        if (!string.IsNullOrWhiteSpace(programFiles))
        {
            candidates.Add(Path.Combine(programFiles, "WireGuard", ExeName));
        }

        var programFilesX86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)");
        if (!string.IsNullOrWhiteSpace(programFilesX86))
        {
            candidates.Add(Path.Combine(programFilesX86, "WireGuard", ExeName));
        }

        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
                     .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            candidates.Add(Path.Combine(dir.Trim(), ExeName));
        }

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    public async Task InstallAsync(string tunnelName, string confPath, CancellationToken cancellationToken = default)
    {
        EnsureSupported();
        ArgumentException.ThrowIfNullOrWhiteSpace(tunnelName);
        ArgumentException.ThrowIfNullOrWhiteSpace(confPath);

        // wireguard.exe đặt tên service theo tên file .conf; lệch tên thì
        // /uninstalltunnelservice <name> về sau sẽ không tìm thấy service.
        var confName = Path.GetFileNameWithoutExtension(confPath);
        if (!string.Equals(confName, tunnelName, StringComparison.OrdinalIgnoreCase))
        {
            throw new WireGuardDriverException(
                $"Conf file must be named '{tunnelName}.conf' (got '{Path.GetFileName(confPath)}').");
        }

        await RunAsync($"/installtunnelservice \"{confPath}\"", cancellationToken).ConfigureAwait(false);
    }

    public async Task UninstallAsync(string tunnelName, CancellationToken cancellationToken = default)
    {
        EnsureSupported();
        ArgumentException.ThrowIfNullOrWhiteSpace(tunnelName);
        await RunAsync($"/uninstalltunnelservice {tunnelName}", cancellationToken).ConfigureAwait(false);
    }

    public async Task<WireGuardTunnelState> GetStateAsync(string tunnelName, CancellationToken cancellationToken = default)
    {
        if (!IsSupported || string.IsNullOrWhiteSpace(tunnelName))
        {
            return WireGuardTunnelState.Unknown;
        }

        // Dùng sc.exe (có sẵn trên Windows) thay vì System.ServiceProcess.ServiceController
        // vì project net8.0 thuần không tham chiếu assembly Windows-only đó, và brief
        // cấm thêm dependency.
        var (exitCode, stdout, _) = await RunProcessAsync(
            "sc.exe",
            $"query \"{ServicePrefix}{tunnelName}\"",
            cancellationToken).ConfigureAwait(false);

        if (exitCode != 0)
        {
            return WireGuardTunnelState.NotInstalled;
        }

        return stdout.Contains("RUNNING", StringComparison.OrdinalIgnoreCase)
            ? WireGuardTunnelState.Running
            : WireGuardTunnelState.Stopped;
    }

    /// <summary>
    /// Dò <c>wg.exe</c> — công cụ đi kèm WireGuard for Windows, đọc runtime của tunnel service qua
    /// UAPI. Dò cạnh wireguard.exe trước (cùng thư mục cài), rồi tới PATH; không hard-code ổ đĩa.
    /// </summary>
    public string? ResolveWgExecutable()
    {
        const string wgExeName = "wg.exe";

        var wireguard = ResolveExecutable();
        var installDirectory = wireguard is null ? null : Path.GetDirectoryName(wireguard);
        if (!string.IsNullOrWhiteSpace(installDirectory))
        {
            var sibling = Path.Combine(installDirectory, wgExeName);
            if (File.Exists(sibling))
            {
                return sibling;
            }
        }

        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
                     .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(dir.Trim(), wgExeName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    /// <summary>
    /// Đọc runtime tunnel do wireguard.exe quản lý bằng <c>wg.exe show &lt;name&gt; dump</c>.
    /// Không có wg.exe (hoặc lệnh lỗi) thì trả Unknown: driver ngoài không có kênh UAPI nào khác,
    /// và "không đọc được" không được hoá thành "tunnel chết".
    /// </summary>
    public async Task<WireGuardRuntimeStats> GetRuntimeStatsAsync(
        string tunnelName,
        CancellationToken cancellationToken = default)
    {
        if (!IsSupported || string.IsNullOrWhiteSpace(tunnelName))
        {
            return WireGuardRuntimeStats.Unknown;
        }

        var wg = ResolveWgExecutable();
        if (wg is null)
        {
            return WireGuardRuntimeStats.Unknown;
        }

        var (exitCode, stdout, _) = await RunProcessAsync(
            wg,
            $"show \"{tunnelName}\" dump",
            cancellationToken).ConfigureAwait(false);

        return exitCode == 0 ? WireGuardUapi.ParseWgShowDump(stdout) : WireGuardRuntimeStats.Unknown;
    }

    private async Task RunAsync(string arguments, CancellationToken cancellationToken)
    {
        var exe = ResolveExecutable()
            ?? throw new WireGuardDriverException(
                "wireguard.exe not found. Install WireGuard for Windows first.");

        var (exitCode, stdout, stderr) = await RunProcessAsync(exe, arguments, cancellationToken).ConfigureAwait(false);
        if (exitCode != 0)
        {
            var detail = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
            throw new WireGuardDriverException(
                $"wireguard.exe {arguments} exited with code {exitCode}: {detail.Trim()}");
        }
    }

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
            throw new WireGuardDriverException($"Cannot start '{fileName}': {ex.Message}", ex);
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
                "WireGuardWindowsDriver can only install tunnels on Windows.");
        }
    }
}
