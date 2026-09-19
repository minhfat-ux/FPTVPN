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
/// "did not meet the Enterprise signing level requirements"), trong khi <c>flowvpnrelay.exe</c>
/// của mình, <c>wireguard-go.exe</c> và MỌI DLL chưa ký vẫn chạy/nạp bình thường.
///
/// Hệ quả với sản phẩm: đường "hysteria2-over-WS" (cần sing-box dựng TUN) <b>không lên được</b>
/// trên các máy đó — mà đây lại đúng là đường sống khi mạng chặn IP node. App vẫn có fallback
/// WireGuard nên khách không mất mạng, nhưng phải BÁO RÕ thay vì im lặng thử lại mỗi lần kết nối
/// (mỗi lần tốn cả chục giây).
///
/// Cách xử lý thật (không cần khách bật/tắt gì): bỏ phụ thuộc binary bên thứ ba — đưa phần TUN
/// vào chính binary/DLL của mình (xem <c>tools/hysteria-relay</c>), hoặc ký số các binary phát hành.
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

    /// <summary>Thông báo cho người dùng (tiếng Việt, nói rõ đang chạy đường nào).</summary>
    public static string UserMessage(string? binary = null)
    {
        var name = binary ?? BlockedBinary ?? HysteriaRelayDefaults.SingBoxExeName;
        return $"Windows đang chặn {name} bằng Application Control (Smart App Control). " +
               "Đường hysteria2-over-WebSocket không dùng được trên máy này; app sẽ đi đường WireGuard. " +
               "Muốn dùng đường relay, cần bản binary đã ký số (đang xử lý).";
    }
}
