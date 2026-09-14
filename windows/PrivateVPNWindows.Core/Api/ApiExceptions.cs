namespace VpnFlow.Core.Api;

// Bám sát `ControlAPIClient.ClientError` — iOS/PrivateVPN/Services/ControlAPIClient.swift:320-344.
//
// LƯU Ý (xung đột brief ↔ code, đã ghi trong báo cáo): message hiển thị cho người dùng
// theo yêu cầu của brief là TIẾNG VIỆT, còn bản Swift hiện tại viết tiếng Anh. Ở đây giữ
// đúng tập lỗi và ngữ nghĩa của Swift, chỉ dịch phần chữ hiển thị sang tiếng Việt.

/// <summary>Lỗi gốc của tầng API; mọi lỗi cụ thể đều kế thừa từ đây.</summary>
public class ApiException : Exception
{
    public ApiException(string message) : base(message) { }
    public ApiException(string message, Exception? innerException) : base(message, innerException) { }
}

/// <summary>Coordinator trả về dữ liệu không hợp lệ. Tương ứng `.badResponse` (Swift:331).</summary>
public sealed class ApiBadResponseException : ApiException
{
    public ApiBadResponseException()
        : base("Máy chủ điều khiển trả về dữ liệu không hợp lệ. Vui lòng thử lại.") { }

    public ApiBadResponseException(string message) : base(message) { }
}

/// <summary>
/// Coordinator trả lỗi HTTP có message. Tương ứng `.server(String)` (Swift:332).
/// `ServerMessage` là message gốc từ server (có thể tiếng Anh) để lớp trên phân loại
/// (ví dụ dò chuỗi "revoked" / "name" như VPNManagerMac.swift:197-231).
/// </summary>
public sealed class ApiServerException : ApiException
{
    public string ServerMessage { get; }

    public ApiServerException(string serverMessage)
        : base(serverMessage)
    {
        ServerMessage = serverMessage;
    }
}

/// <summary>
/// Không tới được coordinator (không có phản hồi: IP bị chặn, DNS hỏng, mất route).
/// Tương ứng `.transport(endpoint, Error)` (Swift:333).
/// </summary>
public sealed class ApiTransportException : ApiException
{
    public string Endpoint { get; }

    public ApiTransportException(string endpoint, Exception? innerException)
        : base($"Không thể kết nối tới máy chủ VPNFlow khi gọi {endpoint}. Vui lòng thử lại.", innerException)
    {
        Endpoint = endpoint;
    }
}

/// <summary>Chưa đăng nhập. Tương ứng `.missingSession` (Swift:334).</summary>
public sealed class MissingSessionException : ApiException
{
    public MissingSessionException() : base("Vui lòng đăng nhập trước khi kết nối.") { }
}

/// <summary>
/// Tài khoản đã dùng tối đa số thiết bị. Mang message của coordinator và danh sách
/// thiết bị để UI mời "đăng xuất thiết bị cũ" thay vì báo lỗi chung chung.
/// Tương ứng `.deviceLimit(message, devices)` (Swift:328) + index.js:4424-4435.
/// </summary>
public sealed class DeviceLimitException : ApiException
{
    public IReadOnlyList<CoordinatorDevice> Devices { get; }
    public int? MaxDevices { get; }
    public string? ServerMessage { get; }

    public DeviceLimitException(string? message, IReadOnlyList<CoordinatorDevice>? devices, int? maxDevices)
        : base(message ?? DefaultMessage(maxDevices))
    {
        Devices = devices ?? Array.Empty<CoordinatorDevice>();
        MaxDevices = maxDevices;
        ServerMessage = message;
    }

    private static string DefaultMessage(int? maxDevices)
        => $"Bạn đã dùng VPNFlow trên tối đa {maxDevices ?? 3} thiết bị. " +
           "Hãy đăng xuất bớt thiết bị bên dưới để tiếp tục.";
}
