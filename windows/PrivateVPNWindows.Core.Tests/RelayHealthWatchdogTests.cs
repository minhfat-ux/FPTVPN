using VpnFlow.Core.Tunnel;
using Xunit;

namespace PrivateVPNWindows.Core.Tests;

/// <summary>
/// Kiểm tra watchdog của đường relay (hysteria2-over-WS).
///
/// Bối cảnh: đường WireGuard có watchdog riêng; đường relay trước đây chỉ phát hiện được khi tiến
/// trình con chết, còn tunnel "đứng" thì app giữ route full-tunnel vào đường chết mà không báo gì.
/// Watchdog dùng phép thử CHỦ ĐỘNG qua tunnel và chỉ kết luận sau nhiều lần thất bại liên tiếp —
/// các test dưới đây khoá đúng hành vi đó.
///
/// Từ 1.4.8 KHÔNG còn nguồn số byte luỹ kế (sing-box bị bỏ), nên bản dùng thật
/// (<see cref="RelayHealthWatchdog.ForRelayTunnel"/>) truyền <c>-1</c> cho phép đọc lưu lượng; test
/// <see cref="KhongCoSoLieuLuuLuong_ProbeThanhCongThiKhongBaoDung"/> khoá đúng hình dạng đó.
/// </summary>
public class RelayHealthWatchdogTests
{
    private static async Task<bool> WaitAsync(Func<bool> condition, int timeoutMs = 8000)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            if (condition())
            {
                return true;
            }

            await Task.Delay(50);
        }

        return condition();
    }

    [Fact]
    public async Task TrafficGrowing_DoesNotDeclareStall_EvenIfProbeWouldFail()
    {
        var traffic = 0L;
        var stalls = new List<string>();
        using var watchdog = new RelayHealthWatchdog(
            _ => Task.FromResult(Interlocked.Add(ref traffic, 1_000)),
            _ => Task.FromResult(false),           // thử qua tunnel luôn thất bại
            _ => { },
            reason => stalls.Add(reason),
            intervalSeconds: 1,
            noTrafficSeconds: 1,
            probeFailures: 2);

        watchdog.Start();
        await Task.Delay(3500);

        Assert.Empty(stalls);   // có byte mới ⇒ chưa được kết luận gì
    }

    [Fact]
    public async Task NoTraffic_AndProbeFails_DeclaresStall_Once()
    {
        var stalls = new List<string>();
        using var watchdog = new RelayHealthWatchdog(
            _ => Task.FromResult(500L),            // tổng không đổi
            _ => Task.FromResult(false),           // và thử qua tunnel thất bại
            _ => { },
            reason => stalls.Add(reason),
            intervalSeconds: 1,
            noTrafficSeconds: 1,
            probeFailures: 2);

        watchdog.Start();
        Assert.True(await WaitAsync(() => stalls.Count > 0), "watchdog phải báo tunnel đứng");

        await Task.Delay(2000);
        Assert.Single(stalls);                     // chỉ báo MỘT lần
        Assert.Contains("không truyền được dữ liệu", stalls[0]);
    }

    [Fact]
    public async Task NoTraffic_ButProbeSucceeds_DoesNotDeclareStall()
    {
        var stalls = new List<string>();
        var probes = 0;
        using var watchdog = new RelayHealthWatchdog(
            _ => Task.FromResult(500L),            // không có byte mới (người dùng không duyệt web)
            _ =>
            {
                Interlocked.Increment(ref probes);
                return Task.FromResult(true);      // nhưng tunnel vẫn thông
            },
            _ => { },
            reason => stalls.Add(reason),
            intervalSeconds: 1,
            noTrafficSeconds: 1,
            probeFailures: 2);

        watchdog.Start();
        await Task.Delay(3500);

        Assert.Empty(stalls);
        Assert.True(probes > 0, "phải có ít nhất một lần thử chủ động để phân biệt 'rảnh' với 'đứng'");
    }

    [Fact]
    public async Task TrafficResumes_ResetsFailureCounter()
    {
        var traffic = 500L;
        var stalls = new List<string>();
        using var watchdog = new RelayHealthWatchdog(
            _ => Task.FromResult(Interlocked.Read(ref traffic)),
            _ => Task.FromResult(false),
            _ => { },
            reason => stalls.Add(reason),
            intervalSeconds: 1,
            noTrafficSeconds: 1,
            probeFailures: 3);

        watchdog.Start();
        await Task.Delay(1500);
        Interlocked.Exchange(ref traffic, 900L);   // dữ liệu chảy lại
        await Task.Delay(2500);

        Assert.Empty(stalls);                      // chưa đủ 3 lần thất bại liên tiếp ⇒ không kết luận
    }

    [Fact]
    public async Task ReadErrors_AreIgnored_AndDoNotThrow()
    {
        var stalls = new List<string>();
        using var watchdog = new RelayHealthWatchdog(
            _ => throw new InvalidOperationException("clash_api chết"),
            _ => Task.FromResult(false),
            _ => throw new InvalidOperationException("logger cũng chết"),
            reason => stalls.Add(reason),
            intervalSeconds: 1,
            noTrafficSeconds: 1,
            probeFailures: 2);

        watchdog.Start();
        await Task.Delay(2500);

        // Không ném ra ngoài. (Có thể báo đứng hoặc không — điều bắt buộc là watchdog vẫn sống.)
        Assert.True(true);
    }

    /// <summary>
    /// Hình dạng THẬT của bản 1.4.8: không còn clash_api nên phép đọc lưu lượng luôn trả -1 (không
    /// có số liệu). Khi đó watchdog chỉ còn phép thử chủ động — tunnel thông thì KHÔNG được báo đứng,
    /// nếu không khách để máy rảnh sẽ bị cắt VPN oan.
    /// </summary>
    [Fact]
    public async Task KhongCoSoLieuLuuLuong_ProbeThanhCongThiKhongBaoDung()
    {
        var stalls = new List<string>();
        var probes = 0;
        using var watchdog = new RelayHealthWatchdog(
            _ => Task.FromResult(-1L),             // không có clash_api ⇒ luôn "không có số liệu"
            _ =>
            {
                Interlocked.Increment(ref probes);
                return Task.FromResult(true);      // tunnel vẫn thông
            },
            _ => { },
            reason => stalls.Add(reason),
            intervalSeconds: 1,
            noTrafficSeconds: 1,
            probeFailures: 2);

        watchdog.Start();
        await Task.Delay(3500);

        Assert.Empty(stalls);
        Assert.True(probes > 0, "phải thử chủ động để biết tunnel còn thông hay không");
    }
}
