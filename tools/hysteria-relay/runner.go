// flowvpnrelay — hysteria2 client cho VPNFlow trên desktop.
//
// Khác bản CLI chính thức của hysteria ở ĐÚNG một điểm: transport. Bản chính thức
// chỉ có UDP/udphop nên không nối được vào relay WebSocket sau Cloudflare
// (`/relay/vn*hy`) — đường duy nhất còn đi được khi IP node bị chặn (đo trên mạng
// hiện tại: TCP tới 103.173.155.50/165.101.114.162 timeout, còn
// api.meetflowai.site:443 mở). Runner này lấy ConnFactory từ internal/wsrelay nên
// dùng được đúng relay đó, rồi mở SOCKS5 (TCP+UDP) tại chỗ để phần còn lại của
// client (sing-box lo TUN/định tuyến, hoặc app tự cắm) dùng lại.
//
// Bản này được biên dịch bằng tools/hysteria-relay/build.sh: nó được copy vào
// app/flowvpnrelay/main.go của checkout hysteria (tag app/v2.12.2) để import được
// package `internal/...` của chính module đó.
package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/apernet/hysteria/core/v2/client"
	"github.com/apernet/hysteria/extras/v2/obfs"

	"github.com/apernet/hysteria/app/v2/internal/socks5"
	"github.com/apernet/hysteria/app/v2/internal/wsrelay"
)

type transportConfig struct {
	// "wsrelay" = QUIC qua WebSocket sau Cloudflare; "udp" = UDP trực tiếp (mặc định).
	Type string `json:"type"`
	URL  string `json:"url"`
	Host string `json:"host"`
}

type socksConfig struct {
	Listen string `json:"listen"`
}

type config struct {
	Server   string          `json:"server"`
	Password string          `json:"password"`
	Obfs     string          `json:"obfs"`
	SNI      string          `json:"sni"`
	Insecure *bool           `json:"insecure"`
	UpKbps   int             `json:"upKbps"`
	DownKbps int             `json:"downKbps"`
	Transport transportConfig `json:"transport"`
	Socks5   socksConfig     `json:"socks5"`
	// DialTimeout giây cho một lần dựng transport (WS + QUIC handshake).
	DialTimeoutSec int `json:"dialTimeoutSec"`
}

func logf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[flowvpnrelay] "+format+"\n", args...)
}

func main() {
	cfgPath := flag.String("c", "", "đường dẫn file cấu hình JSON")
	benchURL := flag.String("bench", "", "đo băng thông: tải URL này qua tunnel rồi thoát")
	benchSec := flag.Int("bench-seconds", 15, "số giây tối đa cho một lần đo")
	flag.Parse()

	if *cfgPath == "" {
		logf("thiếu -c <config.json>")
		os.Exit(2)
	}
	raw, err := os.ReadFile(*cfgPath)
	if err != nil {
		logf("đọc cấu hình: %v", err)
		os.Exit(2)
	}
	cfg := &config{}
	if err := json.Unmarshal(raw, cfg); err != nil {
		logf("phân tích cấu hình: %v", err)
		os.Exit(2)
	}
	if cfg.Transport.Type == "" {
		cfg.Transport.Type = "udp"
	}
	if cfg.DialTimeoutSec <= 0 {
		cfg.DialTimeoutSec = 12
	}

	if *benchURL != "" {
		if err := runBench(cfg, *benchURL, time.Duration(*benchSec)*time.Second); err != nil {
			logf("bench lỗi: %v", err)
			os.Exit(1)
		}
		return
	}

	// Vòng ngoài: transport chết (WS bị cắt, mạng đổi) thì dựng lại, không thoát —
	// đúng hành vi runTunnel() của Android (HysteriaVpnService.kt:146-345).
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	for {
		done := make(chan error, 1)
		go func() { done <- serve(cfg) }()
		select {
		case s := <-sig:
			logf("nhận %s — thoát", s)
			return
		case err := <-done:
			if err == nil {
				return
			}
			logf("transport chết: %v — dựng lại sau 1s", err)
			time.Sleep(time.Second)
		}
	}
}

// serve dựng hysteria client rồi mở SOCKS5. Trả về khi transport chết.
func serve(cfg *config) error {
	hy, err := newClient(cfg)
	if err != nil {
		return err
	}
	defer func() {
		// Đóng client có thể treo (xem runBench) — đóng ở goroutine riêng.
		go func() { _ = hy.Close() }()
	}()

	listen := cfg.Socks5.Listen
	if listen == "" {
		listen = "127.0.0.1:1081"
	}
	l, err := net.Listen("tcp", listen)
	if err != nil {
		return fmt.Errorf("socks5 listen %s: %w", listen, err)
	}
	defer l.Close()
	// Dòng này là hợp đồng với app gọi nó (.NET/launcher): tunnel ĐÃ lên.
	logf("READY transport=%s server=%s socks5=%s", cfg.Transport.Type, cfg.Server, listen)

	s := &socks5.Server{HyClient: hy, EventLogger: noopSocksLogger{}}
	return s.Serve(l)
}

// newClient trả về client ĐÃ bắt tay xong với server (NewClient tự connect).
func newClient(cfg *config) (client.Client, error) {
	if cfg.Server == "" {
		return nil, errors.New("thiếu server")
	}
	serverAddr, err := resolveServerAddr(cfg.Server)
	if err != nil {
		return nil, err
	}
	sni := cfg.SNI
	if sni == "" {
		host, _, _ := splitHostPort(cfg.Server)
		sni = host
	}
	insecure := true
	if cfg.Insecure != nil {
		insecure = *cfg.Insecure
	}
	hyCfg := &client.Config{
		ServerAddr: serverAddr,
		Auth:       cfg.Password,
		TLSConfig: client.TLSConfig{
			ServerName:         sni,
			InsecureSkipVerify: insecure,
		},
	}
	// Brutal CC bám đúng số client khai (server đã bật ignoreClientBandwidth nên số
	// này chỉ còn tác dụng điều tiết phía client — khai sai vẫn tự bóp mình).
	if cfg.UpKbps > 0 || cfg.DownKbps > 0 {
		hyCfg.BandwidthConfig = client.BandwidthConfig{
			MaxTx: uint64(cfg.UpKbps) * 1000 / 8,
			MaxRx: uint64(cfg.DownKbps) * 1000 / 8,
		}
	}

	switch strings.ToLower(cfg.Transport.Type) {
	case "udp", "direct", "":
		if cfg.Obfs != "" {
			hyCfg.ConnFactory = &salamanderFactory{psk: []byte(cfg.Obfs)}
		}
	case "wsrelay", "ws", "wss":
		if cfg.Transport.URL == "" {
			return nil, errors.New("transport wsrelay cần url")
		}
		hyCfg.ConnFactory = &wsFactory{
			url:     cfg.Transport.URL,
			host:    cfg.Transport.Host,
			obfsPsk: []byte(cfg.Obfs),
			timeout: time.Duration(cfg.DialTimeoutSec) * time.Second,
		}
	default:
		return nil, fmt.Errorf("transport không hỗ trợ: %q", cfg.Transport.Type)
	}

	t0 := time.Now()
	hy, info, err := client.NewClient(hyCfg)
	if err != nil {
		return nil, fmt.Errorf("bắt tay thất bại sau %s: %w", time.Since(t0).Round(time.Millisecond), err)
	}
	logf("đã nối %s qua %s trong %s (tx=%d udp=%v ech=%v)",
		cfg.Server, cfg.Transport.Type, time.Since(t0).Round(time.Millisecond), info.Tx, info.UDPEnabled, info.ECHAccepted)
	return hy, nil
}

// resolveServerAddr: địa chỉ này chỉ là DANH TÍNH (SNI + định tuyến QUIC). Với
// transport wsrelay, gói thật đi qua WebSocket nên IP ở đây không cần tới được.
func resolveServerAddr(server string) (net.Addr, error) {
	host, portStr, err := splitHostPort(server)
	if err != nil {
		return nil, err
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, fmt.Errorf("cổng không hợp lệ %q: %w", portStr, err)
	}
	if ip := net.ParseIP(host); ip != nil {
		return &net.UDPAddr{IP: ip, Port: port}, nil
	}
	return net.ResolveUDPAddr("udp", net.JoinHostPort(host, portStr))
}

func splitHostPort(server string) (host, port string, err error) {
	h, p, err := net.SplitHostPort(server)
	if err != nil {
		return server, "443", nil
	}
	return h, p, nil
}

// --- ConnFactory cho từng transport -----------------------------------------

type fixedConnFactory struct{ pc net.PacketConn }

func (f *fixedConnFactory) New(net.Addr) (net.PacketConn, error) { return f.pc, nil }

type wsFactory struct {
	url     string
	host    string
	obfsPsk []byte
	timeout time.Duration
}

func (f *wsFactory) New(net.Addr) (net.PacketConn, error) {
	pc, err := wsrelay.Dial(f.url, f.host, f.timeout)
	if err != nil {
		return nil, err
	}
	if len(f.obfsPsk) == 0 {
		return pc, nil
	}
	wrapped, err := obfs.WrapPacketConnSalamander(pc, f.obfsPsk)
	if err != nil {
		_ = pc.Close()
		return nil, fmt.Errorf("obfs salamander: %w", err)
	}
	return wrapped, nil
}

type salamanderFactory struct{ psk []byte }

func (f *salamanderFactory) New(net.Addr) (net.PacketConn, error) {
	conn, err := net.ListenUDP("udp", nil)
	if err != nil {
		return nil, err
	}
	wrapped, err := obfs.WrapPacketConnSalamander(conn, f.psk)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	return wrapped, nil
}

// --- đo băng thông ----------------------------------------------------------

// runBench tải benchURL qua tunnel và in ra MB/s thật. Dùng cho việc "khoanh vùng"
// từng transport: cùng một URL, cùng một máy, chỉ khác transport.
func runBench(cfg *config, benchURL string, limit time.Duration) error {
	hy, err := newClient(cfg)
	if err != nil {
		return err
	}
	defer hy.Close()

	tr := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			// hy.TCP() không nhận context: nếu host đích không tới được thì nó treo
			// mãi và ctx của lần đo không cắt được (đo được: treo >5 phút).
			type dialResult struct {
				conn net.Conn
				err  error
			}
			ch := make(chan dialResult, 1)
			go func() {
				c, err := hy.TCP(addr)
				ch <- dialResult{c, err}
			}()
			select {
			case r := <-ch:
				return r.conn, r.err
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		},
		TLSClientConfig:   &tls.Config{InsecureSkipVerify: true},
		ForceAttemptHTTP2: false,
		DisableCompression: true,
	}
	httpClient := &http.Client{Transport: tr}

	ctx, cancel := context.WithTimeout(context.Background(), limit)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, benchURL, nil)
	if err != nil {
		return err
	}
	// CF (speed.cloudflare.com) trả 403 cho UA mặc định của Go — dùng UA trình duyệt
	// để số đo so được với curl ở cùng một URL.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
	req.Header.Set("Accept", "*/*")

	t0 := time.Now()
	resp, err := httpClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			logf("bench: hết %s trước khi nhận byte nào", limit)
			return nil
		}
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// In ra để biết 403 đến từ đâu (Cloudflare WAF vs server đích).
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		logf("bench: HTTP %d, server=%q, body=%q", resp.StatusCode, resp.Header.Get("Server"), strings.TrimSpace(string(snippet)))
		return nil
	}
	var n atomic.Int64
	buf := make([]byte, 256<<10)
	for {
		k, rerr := resp.Body.Read(buf)
		if k > 0 {
			n.Add(int64(k))
		}
		if rerr != nil {
			break
		}
		if ctx.Err() != nil {
			break
		}
	}
	elapsed := time.Since(t0).Seconds()
	bytesRead := n.Load()
	mbs := float64(bytesRead) / elapsed / 1e6
	mbps := mbs * 8
	logf("BENCH http=%d bytes=%d thoi_gian=%.2fs => %.2f MB/s (%.1f Mbps)", resp.StatusCode, bytesRead, elapsed, mbs, mbps)
	// client.Close() có thể chờ QUIC đóng hẳn (đo được: treo vô hạn khi transport là
	// WS relay) — đo xong là thoát ngay, không để tiến trình treo.
	os.Exit(0)
	return nil
}

// --- EventLogger rỗng cho socks5 (không log từng kết nối: ồn và chậm) --------

type noopSocksLogger struct{}

func (noopSocksLogger) TCPRequest(net.Addr, string)             {}
func (noopSocksLogger) TCPError(net.Addr, string, error)        {}
func (noopSocksLogger) UDPRequest(net.Addr)                     {}
func (noopSocksLogger) UDPError(net.Addr, error)                {}

var _ = io.Discard
