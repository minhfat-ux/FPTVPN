namespace VpnFlow.Core.Tunnel;

/// <summary>
/// Hằng số dùng chung cho đường "hysteria2 bọc trong WebSocket" trên Windows.
///
/// Vì sao có đường này: mạng khách (TQ/khách sạn) chặn thẳng IP node — đo thật: TCP tới
/// <c>103.173.155.50</c> / <c>165.101.114.162</c> timeout, chỉ <c>api.meetflowai.site:443</c>
/// (Cloudflare) đi được. Hysteria2 tự nó là QUIC/UDP nên không vượt được kiểu chặn đó; bọc
/// mỗi datagram UDP trong một binary message WebSocket qua <c>/relay/vn*hy</c> là đường duy
/// nhất còn đi được (giao thức relay phía server: 1 message = 1 datagram).
///
/// Kiến trúc: <c>flowvpnrelay.exe</c> (hysteria2-over-WS, mở SOCKS5 nội bộ có cả UDP) +
/// <c>sing-box.exe</c> (TUN + định tuyến + DNS, outbound trỏ vào SOCKS5 đó).
/// </summary>
public static class HysteriaRelayDefaults
{
    // SECURITY NOTE — hai giá trị dưới đây CHÉP NGUYÊN từ
    // android/app/src/main/java/com/privatevpn/app/Config.kt (HY_PASSWORD / HY_OBFS), và
    // Config.kt đã ghi rõ chúng nằm trong APK/AAB phát hành nên coi như đã công khai từ trước;
    // chép sang bản Windows không làm lộ thêm gì. Kế hoạch bù lại: chuyển server sang auth
    // theo người dùng (hysteria `userpass`) rồi xoay (rotate) hai giá trị này — xem
    // docs/EXIT_NODE_RUNBOOK.md. KHÔNG thêm secret nào khác vào file này.
    public const string Password = "flowvpn_hysteria_2026";
    public const string Obfs = "FlowVPN-8f3k";

    /// <summary>Cổng Hysteria (QUIC) phía server — mọi node đang dùng chung 8443.</summary>
    public const ushort ServerPort = 8443;

    /// <summary>
    /// Relay mặc định: exit node-2 (<c>/relay/vn2hy</c>). Chọn node-2 vì đo thật trên macOS
    /// nhanh hơn node-1 (16–30 Mbps qua relay).
    /// </summary>
    public const string RelayUrl = "wss://api.meetflowai.site/relay/vn2hy";

    /// <summary>Host dùng làm Host header/SNI của WebSocket (Cloudflare định tuyến theo tên này).</summary>
    public const string RelayHost = "api.meetflowai.site";

    /// <summary>Relay dự phòng (exit node-1) — thử khi relay mặc định không bắt tay được.</summary>
    public static IReadOnlyList<string> FallbackRelayUrls { get; } = new[] { "wss://api.meetflowai.site/relay/vn1hy" };

    // Địa chỉ node: khi đi qua relay, IP ở đây chỉ còn là DANH TÍNH (SNI + định tuyến QUIC) —
    // gói thật đi trong WebSocket nên IP node không cần tới được. Giữ đúng cặp IP mà Android dùng.
    public const string NodeOneAddress = "103.173.155.50";   // node-1
    public const string NodeTwoAddress = "165.101.114.162";  // node-2

    /// <summary>Server mặc định khi node không cấp endpoint dùng được (node-2).</summary>
    public const string DefaultServer = NodeTwoAddress + ":8443";

    /// <summary>Cổng SOCKS5 mặc định của flowvpnrelay.exe (trùng mặc định runner.go).</summary>
    public const int DefaultSocksPort = 1081;

    /// <summary>
    /// Băng thông khai cho hysteria2 (Brutal CC). <b>0 = KHÔNG khai</b> ⇒ hysteria dùng
    /// congestion control thích ứng của nó (BBR) và tự bám theo đường truyền thật.
    ///
    /// Vì sao mặc định 0/0 (đo trên chính máy này, cùng node, cùng thời điểm):
    /// khai báo 30/100 Mbps ⇒ ~45,5 Mbps; để 0/0 (BBR) ⇒ <b>~68,6 Mbps</b>. Số khai là TRẦN
    /// mà Brutal pace theo, nên khai thấp hơn đường truyền là tự bóp mạng — đúng lỗi khách
    /// phàn nàn "vào VPN là chậm". Hai node đều đã bật <c>ignoreClientBandwidth: true</c>,
    /// nên phía server vốn đã không dùng số client khai.
    ///
    /// Muốn dùng Brutal (hữu ích trên link mất gói/nhiều RTT) thì ĐO băng thông thật rồi mới
    /// khai — xem <see cref="HysteriaTransport.WithRelayBandwidth"/> và mục "tối đa tốc độ"
    /// trong Settings; tuyệt đối không hardcode một con số thấp.
    /// </summary>
    public const int UpKbps = 0;
    public const int DownKbps = 0;

    /// <summary>Trần dựng transport (WS + QUIC handshake) của một lần thử, tính bằng giây.</summary>
    public const int DialTimeoutSec = 12;

    /// <summary>Tên binary cạnh app (xem windows/assets/THIRD_PARTY.md).</summary>
    public const string RelayExeName = "flowvpnrelay.exe";
    public const string SingBoxExeName = "sing-box.exe";

    /// <summary>Dòng flowvpnrelay.exe in ra stderr khi SOCKS5 đã mở — hợp đồng "tunnel đã lên".</summary>
    public const string ReadyMarker = "READY ";
}
