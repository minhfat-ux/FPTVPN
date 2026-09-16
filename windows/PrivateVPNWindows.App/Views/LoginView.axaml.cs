using Avalonia.Controls;
using VpnFlow.App.ViewModels;

namespace VpnFlow.App.Views;

/// <summary>
/// Màn đăng nhập email-OTP. Trước đây file này chỉ gọi InitializeComponent nên hai nút
/// "Send Code" / "Verify Code" không có handler — bấm không có gì xảy ra. Nay nối thẳng
/// vào <see cref="LoginViewModel"/> (/v1/auth/email/start → /v1/auth/email/verify).
/// </summary>
public partial class LoginView : UserControl
{
    private readonly LoginViewModel _model;

    /// <summary>Xác minh mã thành công → shell mở màn chính.</summary>
    public event Action? SignedIn;

    public LoginView() : this(AppServices.Shared)
    {
    }

    public LoginView(AppServices services)
    {
        ArgumentNullException.ThrowIfNull(services);

        _model = new LoginViewModel(services.Api, services.Auth);
        InitializeComponent();

        EmailBox.TextChanged += (_, _) => _model.Email = EmailBox.Text ?? string.Empty;
        CodeBox.TextChanged += (_, _) => _model.Code = CodeBox.Text ?? string.Empty;

        SendCodeButton.Click += (_, _) => _model.SendCodeCommand.Execute(null);
        VerifyCodeButton.Click += (_, _) => _model.VerifyCommand.Execute(null);

        _model.PropertyChanged += (_, _) => Refresh();
        _model.SignedIn += () => SignedIn?.Invoke();

        Refresh();
    }

    private void Refresh()
    {
        SendCodeButton.IsEnabled = _model.SendCodeCommand.CanExecute(null);
        VerifyCodeButton.IsEnabled = _model.VerifyCommand.CanExecute(null);
        SendCodeButton.Content = _model.IsSendingCode ? "Sending…" : "Send Code";
        VerifyCodeButton.Content = _model.IsVerifying ? "Verifying…" : "Verify Code";

        MessageText.IsVisible = _model.HasMessage;
        MessageText.Text = _model.Message ?? string.Empty;
        MessageText.Foreground = _model.MessageBrush;
    }
}
