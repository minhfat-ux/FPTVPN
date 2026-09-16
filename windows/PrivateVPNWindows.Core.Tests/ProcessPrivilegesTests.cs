using VpnFlow.Core.Tunnel;

namespace VpnFlow.Core.Tests;

/// <summary>
/// Kiểm tra <see cref="ProcessPrivileges"/> — đoạn P/Invoke bật privilege cho wireguard-go.
/// Test chạy được cả trên macOS (không phải Windows thì phải trả rỗng, không ném lỗi) và trên
/// Windows không elevated (không bật được, cũng không được ném).
/// </summary>
public class ProcessPrivilegesTests
{
    [Fact]
    public void EnableForTunnelPipe_KhongNemLoi()
    {
        var enabled = ProcessPrivileges.EnableForTunnelPipe();

        Assert.NotNull(enabled);

        if (!OperatingSystem.IsWindows())
        {
            // Ngoài Windows không có privilege nào để bật.
            Assert.Empty(enabled);
            return;
        }

        // Trên Windows: hoặc bật được, hoặc rỗng (thiếu quyền) — cả hai đều hợp lệ, nhưng
        // tên trả về chỉ được là những privilege đã khai báo.
        Assert.All(enabled, name =>
            Assert.Contains(name, new[] { "SeRestorePrivilege", "SeTakeOwnershipPrivilege" }));
    }

    [Fact]
    public void EnableForTunnelPipe_GoiLaiVanOnDinh()
    {
        var first = ProcessPrivileges.EnableForTunnelPipe();
        var second = ProcessPrivileges.EnableForTunnelPipe();

        Assert.Equal(first.Count, second.Count);
    }
}
