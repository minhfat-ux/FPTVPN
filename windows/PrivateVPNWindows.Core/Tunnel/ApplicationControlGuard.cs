using System.ComponentModel;
using System.Diagnostics;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Phát hiện và GHI NHỚ việc Windows chặn binary bằng Application Control.
///
/// Vì sao cần: máy khách bật <b>Smart App Control</b> ở chế độ "Verified and Reputable" dùng
/// policy WDAC <c>VerifiedAndReputableDesktop</c> — policy này đòi signing level 2, nên binary
/// chưa ký mà Microsoft chưa có "uy tín" sẽ bị chặn khi khởi chạy. Đo thật trên máy test
/// (19/09): <c>sing-box.exe</c> bị chặn (event CodeIntegrity 3033/3077/3118, status 0xc0e90002,
/// "did not meet the Enterprise signing level requirements") trong khi <c>flowvpnrelay.exe</c>
/// của mình, <c>wireguard-go.exe</c> và MỌI DLL chưa ký vẫn chạy/nạp bình thường.
///
/// <b>Đã xử lý triệt để ở 1.4.7 (13/10/2026).</b> Khách phàn nàn app Windows "báo sing-box.exe đang
/// phải có chữ ký". Vì ta KHÔNG kiểm soát được chữ ký của binary bên thứ ba, cách duy nhất đúng là
/// BỎ nó: phần TUN + định tuyến + bypass TQ được đưa vào chính <c>flowvpnrelay.exe</c> (hysteria v2
/// vốn có sẵn client TUN — xem <c>tools/hysteria-relay/tun.go</c>), nên app Windows không còn chạy
/// binary bên thứ ba nào. Guard này giữ lại làm lưới an toàn cho chính binary của mình (đã đo:
/// bản <c>PrivateVPNWindows.App.exe</c> tự build cũng từng bị chặn 6 lần) và để báo đúng nguyên nhân
/// thay vì "không chạy được &lt;tên file&gt;".
/// </summary>
public static class ApplicationControlGuard
{
    /// <summary>Chuỗi Windows trả về khi Application Control chặn (tiếng Anh, mọi locale).</summary>
    public const string BlockMarker = "Application Control policy has blocked";

    /// <summary>Mã lỗi Win32 của "bị chính sách chặn" (ERROR_ACCESS_DISABLED_BY_POLICY).</summary>
    private const int ErrorAccessDisabledByPolicy = 1260;

    private static string? _blockedBinary;

    /// <summary>Binary đầu tiên bị Application Control chặn (null nếu chưa gặp).</summary>
    public static string? BlockedBinary => Volatile.Read(ref _blockedBinary);

    /// <summary>True khi đã biết đường relay không dùng được vì bị Application Control chặn.</summary>
    public static bool RelayBlocked => Volatile.Read(ref _blockedBinary) is not null;

    /// <summary>Ngoại lệ này (hoặc ngoại lệ bên trong) có phải do Application Control chặn không.</summary>
    public static bool IsBlocked(Exception? exception)
    {
        for (var ex = exception; ex is not null; ex = ex.InnerException)
        {
            if (ex is Win32Exception win32 &&
                (win32.NativeErrorCode == ErrorAccessDisabledByPolicy ||
                 win32.Message.Contains(BlockMarker, StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            if (ex.Message.Contains(BlockMarker, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Ghi nhớ binary bị chặn để các lần kết nối sau không thử lại nữa.</summary>
    public static void MarkBlocked(string binary)
    {
        if (string.IsNullOrWhiteSpace(binary))
        {
            return;
        }

        Interlocked.CompareExchange(ref _blockedBinary, binary, null);
    }

    /// <summary>Xoá ghi nhớ (dùng cho test).</summary>
    public static void Reset() => Volatile.Write(ref _blockedBinary, null);

    /// <summary>
    /// Chạy thử binary một lần (<c>version</c>) để biết TRƯỚC khi người dùng bấm Kết nối.
    /// Trả true nếu bị chặn (đã ghi nhớ). Không ném: mọi lỗi khác coi như không chặn.
    /// </summary>
    public static bool ProbeBlocked(string exePath)
    {
        if (RelayBlocked)
        {
            return true;
        }

        if (!File.Exists(exePath))
        {
            return false;
        }

        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = "version",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });

            if (process is null)
            {
                return false;
            }

            if (!process.WaitForExit(4000))
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch (Exception)
                {
                    // Bỏ qua: chỉ là dọn tiến trình thử.
                }
            }

            return false;
        }
        catch (Exception ex) when (IsBlocked(ex))
        {
            MarkBlocked(Path.GetFileName(exePath));
            return true;
        }
        catch (Exception)
        {
            // Lỗi khác (thiếu quyền, binary hỏng…) — không kết luận là bị chặn.
            return false;
        }
    }

    /// <summary>
    /// Thông báo cho người dùng (tiếng Việt, nói rõ đang chạy đường nào).
    ///
    /// Cố ý KHÔNG nói tên binary bên thứ ba và KHÔNG nói "cần ký số": khách báo 13/10/2026 đọc câu
    /// cũ ("sing-box.exe … cần bản binary đã ký số") rồi tưởng app hỏng. Từ 1.4.7 không còn phụ thuộc
    /// binary bên thứ ba, nên ở đây chỉ còn nói ĐÚNG việc khách cần biết: app vẫn vào mạng được, đi
    /// đường WireGuard, và cách tự xử nếu muốn dùng đường relay.
    /// </summary>
    public static string UserMessage(string? binary = null)
    {
        var name = binary ?? BlockedBinary ?? HysteriaRelayDefaults.RelayExeName;
        return $"Windows (Smart App Control) đang chặn {name}. " +
               "App vẫn kết nối bình thường bằng đường WireGuard. " +
               "Nếu muốn dùng đường dự phòng qua WebSocket, hãy tắt Smart App Control trong " +
               "Windows Security → App & browser control, hoặc liên hệ hỗ trợ.";
    }
}
