using VpnFlow.Core.Api;

namespace VpnFlow.App.ViewModels;

/// <summary>
/// Cổng ép cập nhật: khi bản đang chạy thấp hơn `minimum_version` của coordinator,
/// app bị chặn và chỉ còn nút tải bản mới (không có đường tắt để dùng tiếp).
/// Tương ứng ForceUpdateViewMac.swift.
/// </summary>
public sealed class ForceUpdateViewModel : ObservableObject
{
    private AppVersionInfo? _info;

    public ForceUpdateViewModel()
    {
        UpdateCommand = new RelayCommand(() => UrlLauncher.Open(DownloadUrl));
    }

    public RelayCommand UpdateCommand { get; }

    private bool _isRequired;

    public bool IsRequired
    {
        get => _isRequired;
        private set => SetProperty(ref _isRequired, value);
    }

    public string RequiredVersionText => string.IsNullOrWhiteSpace(_info?.MinimumVersion)
        ? "Cần phiên bản mới của VPNFlow để tiếp tục."
        : $"Cần phiên bản tối thiểu {_info!.MinimumVersion} để tiếp tục.";

    /// <summary>Link tải bản mới; rỗng thì lùi về trang mua/tải để nút luôn mở được gì đó.</summary>
    public string DownloadUrl
    {
        get
        {
            var raw = _info?.DownloadUrl?.Trim();
            return string.IsNullOrEmpty(raw) ? ControlApiDefaults.BuyUrl : raw;
        }
    }

    public void Update(AppVersionInfo info)
    {
        _info = info ?? throw new ArgumentNullException(nameof(info));
        IsRequired = true;
        OnPropertyChanged(nameof(RequiredVersionText));
        OnPropertyChanged(nameof(DownloadUrl));
    }
}
