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
/// Kiến trúc (từ 1.4.8): MỘT tiến trình — <c>flowvpnrelay.exe</c> (hysteria2-over-WS) tự dựng
/// luôn TUN + auto_route + bypass TQ, không cần <c>sing-box.exe</c> nữa.
///
/// Vì sao bỏ sing-box (khách báo 13/10/2026: "sing-box.exe đang phải có chữ ký"): sing-box là
/// binary bên thứ ba CHƯA KÝ, mà máy khách bật <b>Smart App Control</b> thì WDAC chặn mọi binary
/// chưa ký/chưa có "uy tín" — đo thật trên máy harness: CodeIntegrity 3033/3077/3118, Win32 4551
/// ("Application Control policy has blocked"). Ta KHÔNG kiểm soát được chữ ký của binary bên thứ
/// ba, còn binary của chính mình thì chạy bình thường trên đúng máy đó ⇒ cách triệt để là bỏ hẳn
/// phụ thuộc đó. Hysteria v2 vốn đã có sẵn client TUN (<c>app/internal/tun</c>, dùng
/// <c>apernet/sing-tun</c> → <c>wintun.dll</c> mà app đã ship sẵn cho đường WireGuard), nên phần
/// TUN được đưa vào chính binary của mình — xem <c>tools/hysteria-relay/tun.go</c>.
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

    /// <summary>
    /// Tên adapter TUN do <c>flowvpnrelay.exe</c> tự tạo. Dùng đúng tên này ở cả hai phía:
    /// Go tạo interface (khối <c>tun</c> trong cấu hình JSON) và C# đặt DNS lên adapter đó.
    /// </summary>
    public const string TunName = "flowvpntun";

    /// <summary>
    /// Address của TUN — lấy ĐÚNG mặc định của hysteria (<c>clientTUN</c> trong app/cmd/client.go,
    /// <c>100.100.100.101/30</c>) vì đó là cấu hình upstream đã chạy thật trên Windows. Dải này
    /// nằm trong CGNAT (100.64.0.0/10) nên không đụng LAN khách, cũng không đụng 172.1x mà Docker
    /// hay dùng.
    /// </summary>
    public const string TunAddress = "100.100.100.101/30";

    /// <summary>MTU của TUN (trùng mặc định hysteria; datagram qua QUIC/WS ≤ ~1500 nên lọt).</summary>
    public const int TunMtu = 1500;

    /// <summary>
    /// DNS đặt LÊN adapter TUN: chính địa chỉ của TUN, nơi <c>flowvpnrelay.exe</c> mở bộ chia DNS
    /// (xem <c>tools/hysteria-relay/dns.go</c>).
    ///
    /// Vì sao KHÔNG đặt thẳng một resolver công cộng — đo thật 19/10/2026 trên mạng TQ:
    ///  · đặt <c>1.1.1.1</c> (đi trong tunnel nên không bị nhiễm độc) thì tên miền TQ nhận **IP CDN
    ///    nước ngoài** (www.baidu.com → 103.235.47.188, www.taobao.com → 43.109.163.153…); các IP
    ///    đó KHÔNG nằm trong dải TQ nên lại bị đẩy vào tunnel — **15/23 tên miền TQ lớn** bị vậy và
    ///    <c>https://www.baidu.com</c> mất **26.217 ms** thay vì 116 ms;
    ///  · đặt resolver nội địa (223.5.5.5 / 114.114.114.114 / 119.29.29.29) thì **bị GFW nhiễm độc**
    ///    (www.google.com → 185.45.5.35, www.youtube.com → 104.244.42.197) — đúng lỗi của 1.4.6.
    ///
    /// Nên bộ chia DNS phía Go tự quyết từng truy vấn: hỏi resolver nội địa trước, chỉ nhận khi MỌI
    /// bản ghi A/AAAA trả về nằm trong dải TQ (khi đó route đi thẳng mới khớp); còn lại hỏi resolver
    /// công cộng qua tunnel. Nhờ vậy không cần danh sách tên miền nào để bảo trì.
    /// </summary>
    public const string TunDnsServer = "100.100.100.101";

    /// <summary>Cổng của bộ chia DNS trong flowvpnrelay (cổng DNS chuẩn).</summary>
    public const int TunDnsPort = 53;

    /// <summary>Resolver nội địa TQ — bộ chia DNS hỏi TRƯỚC cho bản ghi A/AAAA.</summary>
    public const string ChinaDnsUpstream = "223.5.5.5";

    /// <summary>Resolver công cộng — đi TRONG tunnel nên không bị GFW nhiễm độc.</summary>
    public const string RemoteDnsUpstream = "1.1.1.1";

    /// <summary>Dòng flowvpnrelay.exe in ra stderr khi SOCKS5 đã mở — hợp đồng "tunnel đã lên".</summary>
    public const string ReadyMarker = "READY ";

    /// <summary>
    /// Dòng flowvpnrelay.exe in ra stderr SAU KHI adapter TUN đã tồn tại và được cấu hình. Đây mới
    /// là mốc "tunnel dùng được": có TUN mới có route full-tunnel.
    /// </summary>
    public const string TunReadyMarker = "TUNREADY ";

    /// <summary>Dòng báo TUN không dựng được — app rơi đường khác NGAY, không chờ hết ngân sách.</summary>
    public const string TunFailMarker = "TUNFAIL ";

    /// <summary>
    /// Dòng báo bộ chia DNS không bind được (địa chỉ/cổng bận). Xử lý Y NHƯ <see cref="TunFailMarker"/>:
    /// TUN lên mà không có DNS thì máy không phân giải được tên, tức là cũng hỏng — phải rơi đường
    /// khác ngay thay vì chờ hết <c>ReadyTimeoutSeconds</c> rồi mới báo lỗi mơ hồ.
    /// </summary>
    public const string DnsFailMarker = "DNSFAIL ";
}
