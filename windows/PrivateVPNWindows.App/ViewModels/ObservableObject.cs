using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace VpnFlow.App.ViewModels;

/// <summary>
/// Lớp cơ sở MVVM tối giản (INotifyPropertyChanged).
///
/// Vì sao không dùng CommunityToolkit.Mvvm: môi trường build offline, gói này không có
/// trong cache NuGet cục bộ (.tools/nuget) nên thêm PackageReference sẽ làm hỏng restore.
/// Tự viết vài chục dòng ở đây rẻ hơn rủi ro đó, và không thêm dependency (AGENTS.md §1).
/// </summary>
public abstract class ObservableObject : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));

    protected bool SetProperty<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        OnPropertyChanged(propertyName);
        return true;
    }
}
