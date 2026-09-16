using System.Runtime.InteropServices;

namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Bật các privilege mà wireguard-go cần để mở named pipe UAPI
/// <c>\\.\pipe\ProtectedPrefix\Administrators\WireGuard\&lt;tên&gt;</c>.
///
/// Vì sao cần: pipe đó được tạo với owner là <c>SYSTEM</c>. Trong token của quản trị viên
/// đã elevated, <c>SeRestorePrivilege</c> và <c>SeTakeOwnershipPrivilege</c> CÓ nhưng đang
/// TẮT, nên <c>CreateNamedPipe</c> trả về "This security ID may not be assigned as the owner
/// of this object" và wireguard-go thoát với exit code 1 — dù adapter Wintun đã tạo xong.
/// Bật sẵn ở tiến trình cha thì tiến trình con thừa hưởng, pipe mở được.
/// </summary>
public static class ProcessPrivileges
{
    private const uint TokenAdjustPrivileges = 0x0020;
    private const uint TokenQuery = 0x0008;
    private const int SePrivilegeEnabled = 0x0002;

    private static readonly string[] Required =
    {
        "SeRestorePrivilege",
        "SeTakeOwnershipPrivilege",
    };

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct TokenPrivileges
    {
        public int Count;
        public long Luid;
        public int Attributes;
    }

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out IntPtr tokenHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool LookupPrivilegeValue(string? systemName, string name, out long luid);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool AdjustTokenPrivileges(
        IntPtr tokenHandle,
        bool disableAllPrivileges,
        ref TokenPrivileges newState,
        int bufferLength,
        IntPtr previousState,
        IntPtr returnLength);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    /// <summary>
    /// Bật các privilege cần thiết cho tiến trình hiện tại. Trả về tên những privilege
    /// bật được (rỗng khi không phải Windows hoặc không đủ quyền). Không bao giờ ném lỗi:
    /// thiếu privilege thì để wireguard-go báo lỗi thật của nó.
    /// </summary>
    public static IReadOnlyList<string> EnableForTunnelPipe()
    {
        var enabled = new List<string>();
        if (!OperatingSystem.IsWindows())
        {
            return enabled;
        }

        if (!OpenProcessToken(GetCurrentProcess(), TokenAdjustPrivileges | TokenQuery, out var token))
        {
            return enabled;
        }

        try
        {
            foreach (var name in Required)
            {
                if (!LookupPrivilegeValue(null, name, out var luid))
                {
                    continue;
                }

                var state = new TokenPrivileges
                {
                    Count = 1,
                    Luid = luid,
                    Attributes = SePrivilegeEnabled,
                };

                // AdjustTokenPrivileges trả true cả khi chỉ bật được một phần, nên phải
                // kiểm tra GetLastWin32Error() == 0 mới chắc chắn thành công.
                var ok = AdjustTokenPrivileges(token, false, ref state, 0, IntPtr.Zero, IntPtr.Zero)
                         && Marshal.GetLastWin32Error() == 0;
                if (ok)
                {
                    enabled.Add(name);
                }
            }
        }
        finally
        {
            CloseHandle(token);
        }

        return enabled;
    }
}
