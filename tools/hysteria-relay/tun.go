// TUN cho flowvpnrelay — KHÔNG tự viết tầng TUN, dùng lại client TUN có sẵn của
// hysteria (app/internal/tun, bọc apernet/sing-tun → wintun.dll).
//
// Vì sao phải đưa TUN vào CHÍNH binary này: trước 1.4.7 app Windows ghép
// flowvpnrelay.exe với sing-box.exe để dựng TUN + định tuyến + DNS. sing-box.exe là
// binary bên thứ ba CHƯA KÝ nên máy khách bật Smart App Control bị WDAC chặn thẳng
// (CodeIntegrity 3033/3077/3118, Win32 4551 "Application Control policy has
// blocked") ⇒ chết cả đường hầm. Ta không kiểm soát được chữ ký của binary ngoài,
// còn flowvpnrelay.exe do chính mình build thì chạy bình thường trên đúng máy đó.
//
// Hợp đồng với app C# (windows/.../Tunnel/HysteriaRelayTunnel.cs) — hai dòng stderr
// ASCII, mỗi dòng một mốc, đều qua logf (đã có tiền tố "[flowvpnrelay] "):
//
//   - "TUNREADY if=<tên> mtu=<mtu> route=<yes|no>": CHỈ in sau khi interface đã có
//     thật trong HĐH (app lấy đúng tên này để đặt DNS lên adapter đó).
//   - "TUNFAIL <lý do ascii ngắn>": in trước khi trả lỗi, để app rơi đường khác ngay
//     thay vì chờ hết hạn của nó.
//
// File này được tools/hysteria-relay/build.sh copy vào <checkout>/app/flowvpnrelay/tun.go
// (cùng package main với main.go = runner.go).
package main

import (
	"fmt"
	"net"
	"net/netip"
	"os"
	"runtime"
	"strings"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/apernet/hysteria/app/v2/internal/tun"
	"github.com/apernet/hysteria/core/v2/client"
)

const (
	// Tên adapter mặc định — trùng HysteriaRelayDefaults.TunName phía C#.
	tunDefaultName = "flowvpntun"
	// MTU/address mặc định lấy ĐÚNG mặc định của hysteria (clientTUN trong
	// app/cmd/client.go) vì đó là cấu hình upstream đã chạy thật trên Windows.
	tunDefaultMTU  = 1500
	tunDefaultIPv4 = "100.100.100.101/30"

	// Hạn chờ interface xuất hiện trong HĐH. App C# cho tổng ngân sách 30s (12s bắt
	// tay transport + 15s ở đây) — xem HysteriaRelayTunnel.ReadyTimeoutSeconds.
	tunReadyTimeout = 15 * time.Second
	tunReadyPoll    = 200 * time.Millisecond

	// Timeout UDP/TCP của system stack, giây — mặc định của hysteria khi không khai.
	tunUDPTimeoutSec = 300

	// Độ dài tối đa của lý do trong dòng TUNFAIL (một dòng, app đọc hết phần sau marker).
	tunFailReasonMax = 160
)

// tunConfig = khối "tun" (TUỲ CHỌN) trong config JSON của flowvpnrelay.
// Không khai "tun" ⇒ không dựng TUN, hành vi y hệt bản cũ (chỉ SOCKS5).
//
// Schema CỐ Ý phẳng (ipv4/ipv6 ngay trong "tun"), KHÁC YAML của CLI hysteria (ở đó
// là address.ipv4/address.ipv6): nguồn sự thật của hợp đồng này là
// windows/.../SingBoxConfigBuilder.BuildTun — file đó ghi phẳng.
type tunConfig struct {
	Name string `json:"name"`
	MTU  uint32 `json:"mtu"`
	IPv4 string `json:"ipv4"`
	// IPv6 rỗng = KHÔNG gán địa chỉ IPv6 (KHÁC mặc định của CLI hysteria, vốn tự điền
	// một prefix IPv6). Mạng khách phổ biến ở TQ không có IPv6: gán vào chỉ tạo thêm
	// đường lỗi mà không chở được gì. upstream cũng tự bỏ IPv6 khi HĐH không hỗ trợ.
	IPv6 string `json:"ipv6"`
	// Route LUÔN có tác dụng khi khối "tun" xuất hiện (không phải con trỏ): app C#
	// luôn ghi khối này, và "không khai" phải hành xử y như "khai rỗng" — tức
	// full-tunnel. Xem buildTUN để biết vì sao auto-route luôn bật.
	Route tunRouteConfig `json:"route"`
}

// tunRouteConfig = khối "route" bên trong "tun". Ngữ nghĩa theo đúng hysteria
// (clientTUN): danh sách RỖNG = mặc định/TOÀN BỘ (0.0.0.0/0 và ::/0), còn
// …Exclude mới là danh sách TRỪ RA khỏi dải đó (bypass TQ đi thẳng).
type tunRouteConfig struct {
	Strict bool `json:"strict"`
	// ipv4/ipv6 rỗng = auto-route toàn bộ — xác nhận bằng
	// sing-tun Options.BuildAutoRouteRanges (tun_rules.go): chỉ khi
	// len(Inet4RouteAddress) == 0 thì mới dùng 0.0.0.0/0.
	IPv4        []string `json:"ipv4"`
	IPv6        []string `json:"ipv6"`
	IPv4Exclude []string `json:"ipv4Exclude"`
	IPv6Exclude []string `json:"ipv6Exclude"`
}

// startTUN dựng TUN rồi CHỈ trả về khi TUN chết — vòng ngoài ở main() sẽ dựng lại
// (đúng hành vi cũ với transport). Mọi lỗi đều đi kèm một dòng TUNFAIL.
//
// dc != nil ⇒ bộ chia DNS (dns.go) được bind TRƯỚC khi in TUNREADY, để TUNREADY vẫn
// mang đúng nghĩa "mọi thứ app cần đã sẵn sàng": app đặt DNS của adapter TUN ngay sau
// dòng đó, nên nếu in sớm hơn thì có khoảng trống DNS ngay sau khi nối.
func startTUN(hy client.Client, tc tunConfig, dc *dnsConfig) error {
	srv, name, mtu, err := buildTUN(hy, tc)
	if err != nil {
		return failTUN(err)
	}

	logf("tun: đang dựng if=%s mtu=%d ipv4=%s ipv6=%v autoRoute=%v strict=%v excl4=%d excl6=%d",
		name, mtu, srv.Inet4Address, srv.Inet6Address, srv.AutoRoute, srv.StructRoute,
		len(srv.Inet4RouteExcludeAddress), len(srv.Inet6RouteExcludeAddress))

	// Serve() tự tạo interface rồi mới chạy stack nên nó CHẶN tới lúc TUN chết.
	done := make(chan error, 1)
	go func() { done <- srv.Serve() }()

	// Dải TQ cho bộ chia DNS là ĐÚNG bộ dải TUN vừa nhận (…Exclude, tức phần đi THẲNG):
	// nhờ vậy "bản ghi A nằm trong dải TQ" ở dns.go và "route đi thẳng" ở đây không lệch.
	prefixes := make([]netip.Prefix, 0, len(srv.Inet4RouteExcludeAddress)+len(srv.Inet6RouteExcludeAddress))
	prefixes = append(prefixes, srv.Inet4RouteExcludeAddress...)
	prefixes = append(prefixes, srv.Inet6RouteExcludeAddress...)

	// Thử bind bộ chia DNS NGAY: nếu dns.listen là địa chỉ đã có trên máy (loopback,
	// LAN…) thì nó lên trước cả TUN. Còn nếu listen là địa chỉ CỦA CHÍNH TUN (đúng ca
	// app C# dùng) thì lúc này HĐH chưa có địa chỉ đó ⇒ bind lỗi, thử lại sau khi
	// interface xuất hiện (trong vòng dưới).
	dnsErr := startDNSRelay(dc, prefixes)
	dnsReady := dnsErr == nil

	// Chờ interface có THẬT trong HĐH rồi mới báo TUNREADY (app cần đúng tên adapter
	// để đặt DNS lên nó), không đoán bằng sleep.
	//
	// Bộ chia DNS phải bind xong mới được in TUNREADY: app đặt DNS của adapter TUN
	// ngay sau dòng đó, nên TUNREADY phải mang đúng nghĩa "mọi thứ app cần đã sẵn sàng".
	deadline := time.Now().Add(tunReadyTimeout)
	ifaceUp := false
	for {
		// Kiểm goroutine trước: thiếu quyền admin thì Serve() trả lỗi gần như tức thì,
		// phải báo TUNFAIL NGAY chứ không bắt app chờ đủ 15s.
		select {
		case serr := <-done:
			return failTUN(tunServeStopped(serr, name))
		default:
		}

		if !ifaceUp {
			if _, ierr := net.InterfaceByName(name); ierr == nil {
				ifaceUp = true
			}
		}
		// Interface đã có mà bộ chia DNS chưa bind được (listen = địa chỉ của chính TUN,
		// mà địa chỉ có thể được gán SAU khi adapter xuất hiện) ⇒ thử lại mỗi vòng, tới
		// hết hạn mới bỏ. Không báo lỗi ngay ở lần thử đầu: đó là đua bình thường của
		// lúc dựng adapter, không phải lỗi cấu hình.
		if ifaceUp && !dnsReady {
			dnsErr = startDNSRelay(dc, prefixes)
			dnsReady = dnsErr == nil
		}

		if ifaceUp && dnsReady {
			logf("TUNREADY if=%s mtu=%d route=%s", name, mtu, yesNo(srv.AutoRoute))
			break
		}

		if time.Now().After(deadline) {
			if ifaceUp && !dnsReady {
				// TUN đã lên nhưng DNS không bind được ⇒ app sẽ không có DNS: coi như
				// hỏng cả đường hầm, in DNSFAIL rồi để vòng ngoài dựng lại.
				return failDNS(dnsErr)
			}
			return failTUN(fmt.Errorf("hết %s mà interface %q chưa xuất hiện", tunReadyTimeout, name))
		}
		time.Sleep(tunReadyPoll)
	}

	// TUN đã lên: chờ tới khi nó chết rồi trả lỗi để vòng ngoài dựng lại. Chỉ in
	// TUNFAIL khi TUN ĐANG CHẠY mà chết — lúc này app C# đã coi tunnel là Faulted,
	// thêm một dòng lý do giúp log khách biết vì sao mất mạng.
	serr := <-done

	// ĐÓNG bộ chia DNS theo TUN: socket đang bind vào địa chỉ CỦA TUN, mà địa chỉ đó
	// biến mất khi TUN chết. Giữ lại thì vòng sau (TUN dựng lại) bộ chia vẫn "tưởng"
	// mình đã sẵn sàng, socket không còn nhận gói ⇒ DNS CÂM mà không ai phát hiện.
	// Đóng ở đây để vòng sau bind lại từ đầu.
	closeDNSRelay()

	return failTUN(tunServeStopped(serr, name))
}

// tunServeStopped chuẩn hoá kết quả của Serve(): nil cũng phải thành lỗi, vì trả nil
// sẽ khiến vòng ngoài ở main() thoát tiến trình trong khi app còn đang chờ.
func tunServeStopped(serr error, name string) error {
	if serr != nil {
		return serr
	}
	return fmt.Errorf("tun.Server.Serve() đã dừng (if=%s)", name)
}

// buildTUN dựng tun.Server từ khối cấu hình. Tách riêng để phần đọc/kiểm tra cấu
// hình trả lỗi rõ ràng TRƯỚC khi chạm vào thiết bị (lỗi cấu hình không nên đội lốt
// lỗi hệ điều hành).
func buildTUN(hy client.Client, tc tunConfig) (*tun.Server, string, uint32, error) {
	// Chỉ ba nền tảng build.sh dựng ra; chặn sớm để không dựng TUN nửa vời.
	switch runtime.GOOS {
	case "windows", "darwin", "linux":
	default:
		return nil, "", 0, fmt.Errorf("TUN không hỗ trợ trên %s", runtime.GOOS)
	}

	name := strings.TrimSpace(tc.Name)
	if name == "" {
		name = tunDefaultName
	}
	mtu := tc.MTU
	if mtu == 0 {
		mtu = tunDefaultMTU
	}
	ipv4 := strings.TrimSpace(tc.IPv4)
	if ipv4 == "" {
		ipv4 = tunDefaultIPv4
	}
	prefix4, err := netip.ParsePrefix(ipv4)
	if err != nil {
		return nil, "", 0, fmt.Errorf("tun.ipv4=%q: %w", ipv4, err)
	}
	if !prefix4.Addr().Is4() {
		return nil, "", 0, fmt.Errorf("tun.ipv4=%q: không phải địa chỉ IPv4", ipv4)
	}

	// Rỗng ⇒ để nguyên nil: sing-tun chỉ thêm route IPv6 khi len(Inet6Address) > 0
	// (BuildAutoRouteRanges), nên máy không có IPv6 sẽ không sinh route ::/0 nào.
	var inet6 []netip.Prefix
	if v6 := strings.TrimSpace(tc.IPv6); v6 != "" {
		prefix6, err := netip.ParsePrefix(v6)
		if err != nil {
			return nil, "", 0, fmt.Errorf("tun.ipv6=%q: %w", v6, err)
		}
		if !prefix6.Addr().Is6() || prefix6.Addr().Is4In6() {
			return nil, "", 0, fmt.Errorf("tun.ipv6=%q: không phải địa chỉ IPv6", v6)
		}
		inet6 = []netip.Prefix{prefix6}
	}

	route4, err := parseTUNPrefixes("tun.route.ipv4", tc.Route.IPv4)
	if err != nil {
		return nil, "", 0, err
	}
	route6, err := parseTUNPrefixes("tun.route.ipv6", tc.Route.IPv6)
	if err != nil {
		return nil, "", 0, err
	}
	excl4, err := parseTUNPrefixes("tun.route.ipv4Exclude", tc.Route.IPv4Exclude)
	if err != nil {
		return nil, "", 0, err
	}
	excl6, err := parseTUNPrefixes("tun.route.ipv6Exclude", tc.Route.IPv6Exclude)
	if err != nil {
		return nil, "", 0, err
	}

	// AutoRoute LUÔN bật khi có khối "tun": app C# gọi đây là "toàn bộ lưu lượng đi
	// qua TUN" (HysteriaRelayTunnel: TUNREADY mới là mốc tunnel dùng được, vì có TUN
	// mà không có route thì máy vẫn chưa đi qua đâu). Đây là điểm CỐ Ý khác CLI
	// hysteria — ở đó "route" không khai thì AutoRoute = false; ở đây không khai
	// "route" phải tương đương khai rỗng, tức full-tunnel.
	//
	// StructRoute (strict) để nguyên theo app khai: strict=false chia 0.0.0.0/1 +
	// 128.0.0.0/1 và KHÔNG xoá default route của adapter vật lý, nên tiến trình chết
	// giữa chừng cũng không làm mất mạng cả máy.
	return &tun.Server{
		HyClient:                 hy,
		EventLogger:              tunEventLogger{},
		Logger:                   newTUNLogger(),
		IfName:                   name,
		MTU:                      mtu,
		Timeout:                  tunUDPTimeoutSec,
		Inet4Address:             []netip.Prefix{prefix4},
		Inet6Address:             inet6,
		AutoRoute:                true,
		StructRoute:              tc.Route.Strict,
		Inet4RouteAddress:        route4,
		Inet6RouteAddress:        route6,
		Inet4RouteExcludeAddress: excl4,
		Inet6RouteExcludeAddress: excl6,
	}, name, mtu, nil
}

// parseTUNPrefixes đọc danh sách route. Không có "/" thì coi là MỘT host (prefix đủ
// 32/128 bit) — đúng cách hysteria làm trong clientTUN, để "1.0.1.0/24" và
// "223.5.5.5" cùng dùng được.
func parseTUNPrefixes(field string, ss []string) ([]netip.Prefix, error) {
	if len(ss) == 0 {
		return nil, nil
	}
	prefixes := make([]netip.Prefix, 0, len(ss))
	for i, s := range ss {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if strings.Contains(s, "/") {
			p, err := netip.ParsePrefix(s)
			if err != nil {
				return nil, fmt.Errorf("%s[%d]=%q: %w", field, i, s, err)
			}
			prefixes = append(prefixes, p)
			continue
		}
		a, err := netip.ParseAddr(s)
		if err != nil {
			return nil, fmt.Errorf("%s[%d]=%q: %w", field, i, s, err)
		}
		prefixes = append(prefixes, netip.PrefixFrom(a, a.BitLen()))
	}
	return prefixes, nil
}

// failTUN in dòng TUNFAIL rồi trả lại chính lỗi đó để tầng trên vừa log vừa dựng lại.
// KHÔNG bao giờ panic: mọi thất bại của TUN phải là (lỗi trả về + một dòng TUNFAIL),
// như vậy app C# rơi đường khác ngay và log khách đọc được lý do thật.
func failTUN(err error) error {
	logf("TUNFAIL %s", tunFailReason(err))
	return err
}

// tunFailReason làm sạch lý do lỗi thành MỘT dòng ASCII ngắn: thông điệp lỗi của
// Windows có thể theo locale (ký tự ngoài ASCII) hoặc nhiều dòng, mà app C# lấy
// nguyên phần sau marker tới hết dòng để hiển thị/log.
func tunFailReason(err error) string {
	if err == nil {
		return "unknown"
	}
	b := make([]byte, 0, 64)
	for _, r := range err.Error() {
		if r > 0x7f {
			// Ký tự ngoài ASCII (thông điệp hệ điều hành theo locale) — bỏ, không
			// thay bằng '?' để giữ lý do đọc được.
			continue
		}
		if r == '\r' || r == '\n' || r == '\t' {
			r = ' '
		}
		b = append(b, byte(r))
	}
	out := strings.Join(strings.Fields(string(b)), " ")
	if out == "" {
		out = "unknown"
	}
	if len(out) > tunFailReasonMax {
		out = out[:tunFailReasonMax]
	}
	return out
}

func yesNo(v bool) string {
	if v {
		return "yes"
	}
	return "no"
}

// --- logger cho tun.Server ---------------------------------------------------

// newTUNLogger: logger tối thiểu cho tun.Server (và cho sing-tun ở bên trong).
//
// Vì sao chỉ từ mức Warn: sing-tun gọi logger ở RẤT nhiều chỗ nội bộ (cấu hình
// interface, vòng đọc gói, theo dõi đổi mạng). Để Info trở lên thì stderr bị đổ liên
// tục trong lúc chở gói — vừa ồn cho log khách, vừa chậm đường truyền. Mức Warn vẫn
// giữ được đúng hai thứ cần thấy: cảnh báo "HĐH không hỗ trợ IPv6" của Serve() và
// lỗi thật của system stack.
func newTUNLogger() *zap.Logger {
	encCfg := zap.NewProductionEncoderConfig()
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	return zap.New(zapcore.NewCore(
		zapcore.NewConsoleEncoder(encCfg),
		zapcore.Lock(os.Stderr),
		zap.WarnLevel,
	))
}

// tunEventLogger rỗng — CÙNG lý do với noopSocksLogger của SOCKS5 (xem runner.go):
// log từng kết nối TCP/UDP nghĩa là hàng nghìn dòng mỗi giây khi tải lớn, trong khi
// app C# không đọc dòng nào trong số đó. Cần số liệu thì đo bằng -bench.
type tunEventLogger struct{}

func (tunEventLogger) TCPRequest(string, string)      {}
func (tunEventLogger) TCPError(string, string, error) {}
func (tunEventLogger) UDPRequest(string)              {}
func (tunEventLogger) UDPError(string, error)         {}
