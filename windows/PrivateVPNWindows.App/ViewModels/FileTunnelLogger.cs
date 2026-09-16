using System.Text;
using VpnFlow.Core.Tunnel;

namespace VpnFlow.App.ViewModels;

/// <summary>
/// Ghi log tầng tunnel ra <c>%APPDATA%\VPNFlow\vpnflow.log</c>.
///
/// Vì sao cần: app là WinExe (không có console) nên <c>ConsoleTunnelLogger</c> nuốt mất
/// toàn bộ log — lỗi dựng tunnel và lỗi "Call from invalid thread" trước đây không để lại
/// dấu vết nào để chẩn đoán. Ghi nối tiếp, có khoá, tự xoay file khi quá 1 MB.
/// </summary>
public sealed class FileTunnelLogger : ITunnelLogger
{
    private const long MaxBytes = 1_000_000;

    private readonly object _gate = new();
    private readonly string _path;

    public FileTunnelLogger(string? path = null)
    {
        _path = path ?? Path.Combine(AppSettings.SettingsDirectory, "vpnflow.log");
    }

    /// <summary>Đường dẫn file log (để báo cho người dùng khi cần chẩn đoán).</summary>
    public string LogPath => _path;

    public void Info(string message) => Write("INFO ", message);

    public void Warn(string message) => Write("WARN ", message);

    public void Error(string message) => Write("ERROR", message);

    private void Write(string level, string message)
    {
        try
        {
            lock (_gate)
            {
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(_path)!);
                Rotate();

                // FileShare.ReadWrite: hai tiến trình app (vd bản cài + bản publish chạy song song)
                // cùng ghi log vẫn không mất dòng. Dùng File.AppendAllText thì lượt ghi thứ hai ném
                // IOException và bị nuốt — đã gặp thật: log mất hẳn phần khởi động của instance mới.
                using var stream = new FileStream(_path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                using var writer = new StreamWriter(stream, Encoding.UTF8);
                writer.Write($"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}{Environment.NewLine}");
            }
        }
        catch
        {
            // Ghi log không bao giờ được làm chết app.
        }
    }

    private void Rotate()
    {
        var info = new FileInfo(_path);
        if (info.Exists && info.Length >= MaxBytes)
        {
            File.Move(_path, _path + ".1", overwrite: true);
        }
    }
}
