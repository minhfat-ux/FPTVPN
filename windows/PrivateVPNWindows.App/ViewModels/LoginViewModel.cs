using VpnFlow.Core.Api;
using VpnFlow.Core.Auth;

namespace VpnFlow.App.ViewModels;

/// <summary>
/// Đăng nhập bằng mã email: gửi OTP (/v1/auth/email/start) → xác minh
/// (/v1/auth/email/verify) → lưu phiên. Bám LoginViewMac.swift, message tiếng Việt.
/// </summary>
public sealed class LoginViewModel : ObservableObject
{
    private readonly ControlApiClient _api;
    private readonly AuthSessionStore _auth;

    public LoginViewModel(ControlApiClient api, AuthSessionStore auth)
    {
        _api = api ?? throw new ArgumentNullException(nameof(api));
        _auth = auth ?? throw new ArgumentNullException(nameof(auth));

        SendCodeCommand = new AsyncRelayCommand(SendCodeAsync, () => !IsSendingCode && !IsVerifying && IsEmailValid);
        VerifyCommand = new AsyncRelayCommand(VerifyAsync, () => !IsVerifying && !IsSendingCode && IsEmailValid && !string.IsNullOrWhiteSpace(Code));
        OpenBuyCommand = new RelayCommand(() => UrlLauncher.Open(ControlApiDefaults.BuyUrl));
    }

    /// <summary>Bắn khi verify thành công để shell điều hướng sang màn chính.</summary>
    public event Action? SignedIn;

    public AsyncRelayCommand SendCodeCommand { get; }

    public AsyncRelayCommand VerifyCommand { get; }

    public RelayCommand OpenBuyCommand { get; }

    private string _email = string.Empty;

    public string Email
    {
        get => _email;
        set
        {
            if (SetProperty(ref _email, value))
            {
                OnPropertyChanged(nameof(IsEmailValid));
                SendCodeCommand.RaiseCanExecuteChanged();
                VerifyCommand.RaiseCanExecuteChanged();
            }
        }
    }

    private string _code = string.Empty;

    public string Code
    {
        get => _code;
        set
        {
            if (SetProperty(ref _code, value))
            {
                VerifyCommand.RaiseCanExecuteChanged();
            }
        }
    }

    private bool _codeRequested;

    public bool CodeRequested
    {
        get => _codeRequested;
        private set => SetProperty(ref _codeRequested, value);
    }

    private bool _isSendingCode;

    public bool IsSendingCode
    {
        get => _isSendingCode;
        private set
        {
            if (SetProperty(ref _isSendingCode, value))
            {
                SendCodeCommand.RaiseCanExecuteChanged();
                VerifyCommand.RaiseCanExecuteChanged();
            }
        }
    }

    private bool _isVerifying;

    public bool IsVerifying
    {
        get => _isVerifying;
        private set
        {
            if (SetProperty(ref _isVerifying, value))
            {
                SendCodeCommand.RaiseCanExecuteChanged();
                VerifyCommand.RaiseCanExecuteChanged();
            }
        }
    }

    private string? _message;

    public string? Message
    {
        get => _message;
        private set
        {
            if (SetProperty(ref _message, value))
            {
                OnPropertyChanged(nameof(HasMessage));
            }
        }
    }

    public bool HasMessage => !string.IsNullOrWhiteSpace(_message);

    private bool _isMessageError;

    public bool IsMessageError
    {
        get => _isMessageError;
        private set
        {
            if (SetProperty(ref _isMessageError, value))
            {
                OnPropertyChanged(nameof(MessageBrush));
            }
        }
    }

    public Avalonia.Media.IBrush MessageBrush => _isMessageError ? VpnBrushes.Danger : VpnBrushes.Accent;

    private bool IsEmailValid
        => !string.IsNullOrWhiteSpace(_email) && _email.Contains('@') && _email.Contains('.');

    private string TrimmedEmail => _email.Trim();

    private async Task SendCodeAsync()
    {
        if (!IsEmailValid)
        {
            ShowError("Vui lòng nhập địa chỉ email hợp lệ.");
            return;
        }

        IsSendingCode = true;
        Message = null;
        try
        {
            var debugCode = await _api.StartEmailLoginAsync(TrimmedEmail);
            CodeRequested = true;
            if (!string.IsNullOrWhiteSpace(debugCode))
            {
                ShowInfo($"Mã dev: {debugCode}");
            }
            else
            {
                ShowInfo("Mã đăng nhập đã được gửi");
            }
        }
        catch (ApiException ex)
        {
            ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
        }
        finally
        {
            IsSendingCode = false;
        }
    }

    private async Task VerifyAsync()
    {
        if (!IsEmailValid)
        {
            ShowError("Vui lòng nhập địa chỉ email hợp lệ.");
            return;
        }

        IsVerifying = true;
        Message = null;
        try
        {
            var session = await _api.VerifyEmailLoginAsync(TrimmedEmail, Code);
            _auth.Save(session);
            if (_auth.IsSignedIn)
            {
                ShowInfo("Đăng nhập thành công.");
                SignedIn?.Invoke();
            }
            else
            {
                ShowError("Không lưu được phiên đăng nhập. Vui lòng thử lại.");
            }
        }
        catch (ApiException ex)
        {
            ShowError(ex.Message);
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
        }
        finally
        {
            IsVerifying = false;
        }
    }

    private void ShowInfo(string text)
    {
        IsMessageError = false;
        Message = text;
    }

    private void ShowError(string text)
    {
        IsMessageError = true;
        Message = text;
    }
}
