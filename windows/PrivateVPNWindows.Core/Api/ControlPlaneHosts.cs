using System.Net.NetworkInformation;

namespace VpnFlow.Core.Api;

/// <summary>
/// Chọn host control-plane đang dùng được, dùng chung cho request API và URL web (trang mua).
///
/// Thứ tự: host chính ([ControlApiDefaults.BaseUrl]) trước, rồi host dự phòng theo TÊN
/// (chống chặn SNI), rồi host dự phòng ghim IP — xem <see cref="ControlApiHosts.FallbackBaseUrls"/>.
///
/// "Sticky": host vừa trả lời được được nhớ lại (<see cref="Remember"/>) để các request sau đi
/// thẳng, không phải chờ hết timeout của host chính mỗi lần. Khi mạng đổi
/// (<see cref="OnNetworkChanged"/>) quên đi để thử lại host chính — ở mạng mới host chính có
/// thể đã vào được. TTL <see cref="PreferredTtl"/> là lưới an toàn khi không có sự kiện mạng.
/// </summary>
public sealed class ControlPlaneHosts : IDisposable
{
    private static readonly TimeSpan PreferredTtl = TimeSpan.FromMinutes(10);

    private readonly List<string> _ordered;
    private string? _preferred;
    private DateTimeOffset _preferredExpiresAt;
    private bool _watchingNetwork;

    public ControlPlaneHosts(string primaryBaseUrl, IEnumerable<string>? fallbackBaseUrls = null)
    {
        if (string.IsNullOrWhiteSpace(primaryBaseUrl))
            throw new ArgumentException("primaryBaseUrl là bắt buộc.", nameof(primaryBaseUrl));

        PrimaryBaseUrl = primaryBaseUrl.TrimEnd('/');
        var fallbacks = (fallbackBaseUrls ?? ControlApiHosts.FallbackBaseUrls)
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Select(url => url.TrimEnd('/'));
        _ordered = new[] { PrimaryBaseUrl }
            .Concat(fallbacks)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        WatchNetworkChanges();
    }

    /// <summary>Host chính (không có dấu "/" cuối).</summary>
    public string PrimaryBaseUrl { get; }

    /// <summary>Toàn bộ host theo thứ tự ưu tiên; host chính luôn đứng đầu.</summary>
    public IReadOnlyList<string> OrderedBaseUrls => _ordered;

    /// <summary>Host đang dùng được; mặc định là host chính.</summary>
    public string ActiveBaseUrl => Preferred ?? PrimaryBaseUrl;

    /// <summary>URL trang mua dựng theo host đang dùng được.</summary>
    public string BuyUrl => WebBaseFor(ActiveBaseUrl) + "/buy";

    /// <summary>Thứ tự thử cho request hiện tại: host đang nhớ (sticky) lên đầu.</summary>
    public IReadOnlyList<string> Candidates()
    {
        var remembered = Preferred;
        if (remembered is null) return _ordered;
        return new List<string> { remembered }
            .Concat(_ordered.Where(url => !url.Equals(remembered, StringComparison.OrdinalIgnoreCase)))
            .ToList();
    }

    /// <summary>Nhớ host vừa trả lời được.</summary>
    public void Remember(string baseUrl)
    {
        _preferred = baseUrl.TrimEnd('/');
        _preferredExpiresAt = DateTimeOffset.UtcNow + PreferredTtl;
    }

    /// <summary>Mạng đổi (mất/đổi Wi-Fi) -> quên host đang nhớ để thử lại host chính.</summary>
    public void OnNetworkChanged() => Forget();

    /// <summary>Quên host đang nhớ.</summary>
    public void Forget()
    {
        _preferred = null;
        _preferredExpiresAt = default;
    }

    private string? Preferred =>
        _preferred is not null && DateTimeOffset.UtcNow < _preferredExpiresAt ? _preferred : null;

    private static string WebBaseFor(string apiBase) =>
        ControlApiDefaults.WebBaseByApiBase.TryGetValue(apiBase, out var web)
            ? web
            : ControlApiDefaults.WebUrl;

    private void WatchNetworkChanges()
    {
        try
        {
            NetworkChange.NetworkAddressChanged += HandleNetworkAddressChanged;
            _watchingNetwork = true;
        }
        catch (Exception)
        {
            // Nền tảng không hỗ trợ NetworkChange: bỏ qua; TTL vẫn lo việc dò lại host chính.
        }
    }

    private void HandleNetworkAddressChanged(object? sender, EventArgs e) => OnNetworkChanged();

    public void Dispose()
    {
        if (!_watchingNetwork) return;
        try
        {
            NetworkChange.NetworkAddressChanged -= HandleNetworkAddressChanged;
        }
        catch (Exception)
        {
            // Bỏ qua: hủy đăng ký thất bại không làm hỏng luồng thoát.
        }

        _watchingNetwork = false;
    }
}
