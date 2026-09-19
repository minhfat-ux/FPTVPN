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
	"sync"
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
	// Links = số WebSocket mở SONG SONG tới cùng relay (1 = hành vi cũ, 1 link).
	// Chặng Cloudflare↔node bị bóp theo từng kết nối nên nhiều link mới cộng được
	// băng thông — xem tools/hysteria-relay/README.md §multipath.
	Links int `json:"links"`
	// Mode = chính sách rải gói: "roundrobin" (mặc định) | "sizehash" | "burst".
	Mode string `json:"mode"`
	// Burst = số gói liên tiếp trên một link khi Mode="burst".
	Burst int `json:"burst"`
	// StatsSec > 0: log đếm gói/byte từng link mỗi N giây (để biết link nào chở bao nhiêu).
	StatsSec int `json:"statsSec"`
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
	benchStreams := flag.Int("bench-streams", 1, "số kết nối TCP tải SONG SONG trong một lần đo (đo trần tổng, không chỉ 1 luồng)")
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
		if err := runBench(cfg, *benchURL, time.Duration(*benchSec)*time.Second, *benchStreams); err != nil {
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
	hy, _, err := newClient(cfg)
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
// Factory được trả kèm để chế độ -bench in được số đếm gói/byte từng link.
func newClient(cfg *config) (client.Client, *wsFactory, error) {
	if cfg.Server == "" {
		return nil, nil, errors.New("thiếu server")
	}
	serverAddr, err := resolveServerAddr(cfg.Server)
	if err != nil {
		return nil, nil, err
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

	var wsF *wsFactory
	switch strings.ToLower(cfg.Transport.Type) {
	case "udp", "direct", "":
		if cfg.Obfs != "" {
			hyCfg.ConnFactory = &salamanderFactory{psk: []byte(cfg.Obfs)}
		}
	case "wsrelay", "ws", "wss":
		if cfg.Transport.URL == "" {
			return nil, nil, errors.New("transport wsrelay cần url")
		}
		wsF = &wsFactory{
			url:      cfg.Transport.URL,
			host:     cfg.Transport.Host,
			obfsPsk:  []byte(cfg.Obfs),
			timeout:  time.Duration(cfg.DialTimeoutSec) * time.Second,
			links:    cfg.Transport.Links,
			mode:     cfg.Transport.Mode,
			burst:    cfg.Transport.Burst,
			statsSec: cfg.Transport.StatsSec,
		}
		hyCfg.ConnFactory = wsF
	default:
		return nil, nil, fmt.Errorf("transport không hỗ trợ: %q", cfg.Transport.Type)
	}

	t0 := time.Now()
	hy, info, err := client.NewClient(hyCfg)
	if err != nil {
		return nil, nil, fmt.Errorf("bắt tay thất bại sau %s: %w", time.Since(t0).Round(time.Millisecond), err)
	}
	if cfg.Transport.Links >= 1 {
		logf("multipath: links=%d mode=%s burst=%d statsSec=%d",
			cfg.Transport.Links, effectiveMode(cfg.Transport), cfg.Transport.Burst, cfg.Transport.StatsSec)
	} else {
		logf("wsrelay: đường MỘT kết nối (legacy, links không khai)")
	}
	logf("đã nối %s qua %s trong %s (tx=%d udp=%v ech=%v)",
		cfg.Server, cfg.Transport.Type, time.Since(t0).Round(time.Millisecond), info.Tx, info.UDPEnabled, info.ECHAccepted)
	return hy, wsF, nil
}

// effectiveMode là mode THẬT sẽ dùng (khớp mặc định của wsrelay.DialMulti) — để log
// không nói "roundrobin" khi thực tế chạy mặc định khác.
func effectiveMode(t transportConfig) string {
	if t.Mode != "" {
		return t.Mode
	}
	return string(wsrelay.ModeRoundRobin)
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
	url      string
	host     string
	obfsPsk  []byte
	timeout  time.Duration
	links    int
	mode     string
	burst    int
	statsSec int

	mu   sync.Mutex
	last *wsrelay.MultiConn
}

func (f *wsFactory) New(net.Addr) (net.PacketConn, error) {
	var pc net.PacketConn
	// links>=1: đi qua MultiConn (kể cả links=1 — cùng một đường ống, chỉ khác số WS).
	// links<=0 (không khai): đường MỘT kết nối cũ. Nhờ vậy đo được đối chứng
	// "1 link qua MultiConn" vs "1 link đường cũ" mà không lẫn hai biến.
	if f.links >= 1 {
		mc, err := wsrelay.DialMulti(wsrelay.MultiConfig{
			URL:         f.url,
			HostHeader:  f.host,
			DialTimeout: f.timeout,
			Links:       f.links,
			Mode:        wsrelay.LinkMode(f.mode),
			Burst:       f.burst,
			StatsLogSec: f.statsSec,
		})
		if err != nil {
			return nil, err
		}
		f.mu.Lock()
		f.last = mc
		f.mu.Unlock()
		pc = mc
	} else {
		// links<=1: giữ NGUYÊN đường một link cũ (đây là baseline của phép đo A/B).
		single, err := wsrelay.Dial(f.url, f.host, f.timeout)
		if err != nil {
			return nil, err
		}
		pc = single
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

// statsText in số gói/byte từng link (rỗng nếu chạy 1 link).
func (f *wsFactory) statsText() string {
	if f == nil {
		return ""
	}
	f.mu.Lock()
	mc := f.last
	f.mu.Unlock()
	if mc == nil {
		return ""
	}
	return mc.StatsText()
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
func runBench(cfg *config, benchURL string, limit time.Duration, streams int) error {
	hy, wsF, err := newClient(cfg)
	if err != nil {
		return err
	}
	// KHÔNG `defer hy.Close()`: đường LỖI của bench cũng đi qua defer này, mà Close()
	// có thể treo vô hạn khi transport WS đã đứt (đo được: lượt 429 bị treo tới khi bị
	// kill cứng). Đóng ở goroutine riêng — tiến trình thoát ngay sau khi in số.
	defer func() { go func() { _ = hy.Close() }() }()

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
	// Vì sao đo được N luồng song song: một kết nối TCP đích chỉ là MỘT luồng trên
	// đường quốc tế của node, mà đường đó bị bóp theo TỪNG luồng ⇒ đo 1 luồng không
	// nói được băng thông tunnel chịu được. `-bench-streams N` mở N kết nối cùng lúc
	// và cộng byte ⇒ tách được "trần của chặng WS" khỏi "trần của một luồng đích".
	if streams <= 0 {
		streams = 1
	}
	var total atomic.Int64
	type streamResult struct {
		code  int
		bytes int64
		err   error
	}
	res := make([]streamResult, streams)
	var ttfbMu sync.Mutex
	var ttfb time.Duration
	t0 := time.Now()
	var wg sync.WaitGroup
	for i := 0; i < streams; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r, err := http.NewRequestWithContext(ctx, http.MethodGet, benchURL, nil)
			if err != nil {
				res[i] = streamResult{err: err}
				return
			}
			// CF (speed.cloudflare.com) trả 403 cho UA mặc định của Go — dùng UA trình
			// duyệt để số đo so được với curl ở cùng một URL.
			r.Header.Set("User-Agent", benchUA)
			r.Header.Set("Accept", "*/*")
			resp, err := httpClient.Do(r)
			if err != nil {
				res[i] = streamResult{err: err}
				return
			}
			ttfbMu.Lock()
			if ttfb == 0 {
				ttfb = time.Since(t0)
			}
			ttfbMu.Unlock()
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
				res[i] = streamResult{code: resp.StatusCode, err: fmt.Errorf("HTTP %d server=%q body=%q",
					resp.StatusCode, resp.Header.Get("Server"), strings.TrimSpace(string(snippet)))}
				return
			}
			var got int64
			buf := make([]byte, 256<<10)
			for {
				k, rerr := resp.Body.Read(buf)
				if k > 0 {
					got += int64(k)
					total.Add(int64(k))
				}
				if rerr != nil {
					break
				}
				if ctx.Err() != nil {
					break
				}
			}
			res[i] = streamResult{code: resp.StatusCode, bytes: got}
		}(i)
	}

	// Đo được: `resp.Body.Read` có thể KHÔNG trả về khi transport bị đứt giữa chừng ⇒
	// wg.Wait() treo vô hạn (đã gặp: quá 9 phút dù -bench-seconds 25). Vì vậy: in tiến
	// độ mỗi 2s (để còn số liệu nếu phải cắt) và hết hạn thì LẤY SỐ ĐÃ ĐO rồi thoát.
	progress := make(chan struct{})
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-progress:
				return
			case <-t.C:
				el := time.Since(t0).Seconds()
				b := total.Load()
				logf("bench: tiến độ %.1fs bytes=%d => %.2f MB/s", el, b, float64(b)/el/1e6)
			}
		}
	}()
	waited := make(chan struct{})
	go func() { wg.Wait(); close(waited) }()
	select {
	case <-waited:
	case <-ctx.Done():
		logf("bench: hết %s mà còn luồng chưa đóng — lấy số đã đo được", limit)
		time.Sleep(300 * time.Millisecond)
	}
	close(progress)
	elapsed := time.Since(t0).Seconds()
	bytesRead := total.Load()

	httpCode := 0
	for i, r := range res {
		if r.err != nil {
			logf("bench: luồng %d lỗi: %v", i, r.err)
			continue
		}
		if httpCode == 0 {
			httpCode = r.code
		}
	}
	if bytesRead == 0 {
		if ctx.Err() != nil {
			logf("bench: hết %s trước khi nhận byte nào", limit)
			return nil
		}
		return errors.New("không nhận được byte nào")
	}
	mbs := float64(bytesRead) / elapsed / 1e6
	mbps := mbs * 8
	links := cfg.Transport.Links
	if links <= 0 {
		links = 1
	}
	logf("BENCH links=%d mode=%s streams=%d http=%d ttfb=%s bytes=%d thoi_gian=%.2fs => %.2f MB/s (%.1f Mbps, %.2f MB/s mỗi luồng)",
		links, effectiveMode(cfg.Transport), streams, httpCode, ttfb.Round(time.Millisecond),
		bytesRead, elapsed, mbs, mbps, mbs/float64(streams))
	// Số đếm từng link: trả lời "link nào chở bao nhiêu" — bằng chứng rải gói có tác dụng.
	if st := wsF.statsText(); st != "" {
		logf("BENCH-LINK %s", st)
	}
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

// benchUA: CF (speed.cloudflare.com) trả 403 cho UA mặc định của Go — dùng UA trình
// duyệt để số đo so được với curl ở cùng một URL.
const benchUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
