// Package mobile is the gomobile entry point used by the Android app
// (com.privatevpn.app). It runs the hysteria2 client on a TUN fd handed over by
// the app's VpnService and, crucially, uses TRANSPORT SOCKETS CREATED IN JAVA so
// they can be protect()ed from the VPN tunnel (otherwise the tunnel's own
// packets loop back into the dead tunnel — the classic "connected but no
// internet" bug).
package mobile

import (
	"bufio"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/apernet/hysteria/app/v2/internal/socks5"
	"github.com/apernet/hysteria/app/v2/internal/tun"
	"github.com/apernet/hysteria/core/v2/client"
	"github.com/apernet/hysteria/extras/v2/obfs"
)

var (
	mu        sync.Mutex
	stopCh    chan struct{}
	active    client.Client
	activeSrv *tun.Server
	stopped   bool
	// slots: các tunnel mở SONG SONG (chế độ N tunnel — port từ iOS 167ba9d, 20/10/2026).
	// N=1 ⇒ chỉ dùng `active` như cũ (hành vi y hệt bản đang phát); N>1 ⇒ `Serve()` gộp
	// `active` + `slots` thành một `multiClient`, chia LUỒNG theo vòng tròn.
	slots map[int]client.Client
)

// ---------------------------------------------------------------------------
// transport sockets
// ---------------------------------------------------------------------------

// salamanderConnFactory dials a direct UDP socket (used only when the caller
// passes no socket fd, e.g. desktop/testing).
type salamanderConnFactory struct {
	psk []byte
}

func (f *salamanderConnFactory) New(net.Addr) (net.PacketConn, error) {
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

// fixedConnFactory always returns the same pre-made connection (the Java socket).
type fixedConnFactory struct {
	pc net.PacketConn
}

func (f *fixedConnFactory) New(net.Addr) (net.PacketConn, error) {
	return f.pc, nil
}

// tcpPacketConn adapts a connected TCP stream (the relay) to net.PacketConn with
// 16-bit big-endian length framing — the same framing the server-side relay
// (wgrelay.js) speaks.
type tcpPacketConn struct {
	conn   net.Conn
	mu     sync.Mutex
	remote net.Addr
	closed bool
}

func (p *tcpPacketConn) ReadFrom(b []byte) (int, net.Addr, error) {
	var hdr [2]byte
	if _, err := io.ReadFull(p.conn, hdr[:]); err != nil {
		return 0, nil, err
	}
	n := int(binary.BigEndian.Uint16(hdr[:]))
	if n > len(b) {
		return 0, nil, fmt.Errorf("frame too large: %d", n)
	}
	if _, err := io.ReadFull(p.conn, b[:n]); err != nil {
		return 0, nil, err
	}
	return n, p.remote, nil
}

func (p *tcpPacketConn) WriteTo(b []byte, _ net.Addr) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return 0, net.ErrClosed
	}
	var hdr [2]byte
	binary.BigEndian.PutUint16(hdr[:], uint16(len(b)))
	if _, err := p.conn.Write(hdr[:]); err != nil {
		return 0, err
	}
	return p.conn.Write(b)
}

func (p *tcpPacketConn) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return nil
	}
	p.closed = true
	return p.conn.Close()
}

func (p *tcpPacketConn) LocalAddr() net.Addr                { return p.conn.LocalAddr() }
func (p *tcpPacketConn) SetDeadline(t time.Time) error      { return p.conn.SetDeadline(t) }
func (p *tcpPacketConn) SetReadDeadline(t time.Time) error  { return p.conn.SetReadDeadline(t) }
func (p *tcpPacketConn) SetWriteDeadline(t time.Time) error { return p.conn.SetWriteDeadline(t) }

// wrapProvidedSocket turns a Java-created (and VPN-protected) socket fd into a
// net.PacketConn. net.FileConn/FilePacketConn dup the fd, so the os.File copy is
// closed right away.
func wrapProvidedSocket(fd int, isTCP bool, server net.Addr) (net.PacketConn, error) {
	f := os.NewFile(uintptr(fd), "vpn-sock")
	if isTCP {
		c, err := net.FileConn(f)
		if err != nil {
			f.Close()
			return nil, err
		}
		_ = f.Close()
		return &tcpPacketConn{conn: c, remote: server}, nil
	}
	pc, err := net.FilePacketConn(f)
	if err != nil {
		f.Close()
		return nil, err
	}
	_ = f.Close()
	return pc, nil
}

// ---------------------------------------------------------------------------

// Connect dials the hysteria2 server over the provided socket. It runs BEFORE
// the VpnService tunnel is established, so a failing attempt never blackholes
// the device's own internet.
//
//	host      - server IP/hostname (TLS SNI + identity)
//	port      - server UDP port (identity; the socket is already connected)
//	password  - hysteria2 auth password
//	obfsPass  - salamander obfuscation password ("" = none)
//	sockFd    - Java socket fd (>0) or 0 to let Go open a direct UDP socket
//	sockTcp   - true when sockFd is a connected TCP socket (relay framing)
//	upKbps    - upload bandwidth for Brutal CC (0 = use the standard CC)
//	downKbps  - download bandwidth for Brutal CC (0 = use the standard CC)
func Connect(host string, port int, password, obfsPass string, sockFd int, sockTcp bool, upKbps, downKbps int) error {
	serverAddr := &net.UDPAddr{IP: net.ParseIP(host), Port: port}
	cfg := &client.Config{
		ServerAddr: serverAddr,
		Auth:       password,
		TLSConfig: client.TLSConfig{
			ServerName:         host,
			InsecureSkipVerify: true, // self-signed cert for now
		},
	}

	// Brutal congestion control: the single biggest win on lossy/high-RTT links
	// (China mobile). The server honours the client's bandwidth unless it sets
	// ignoreClientBandwidth.
	if upKbps > 0 || downKbps > 0 {
		cfg.BandwidthConfig = client.BandwidthConfig{
			MaxTx: uint64(upKbps) * 1000 / 8,
			MaxRx: uint64(downKbps) * 1000 / 8,
		}
	}

	if sockFd > 0 {
		base, err := wrapProvidedSocket(sockFd, sockTcp, serverAddr)
		if err != nil {
			return fmt.Errorf("socket fd %d: %w", sockFd, err)
		}
		if obfsPass != "" {
			wrapped, err := obfs.WrapPacketConnSalamander(base, []byte(obfsPass))
			if err != nil {
				_ = base.Close()
				return err
			}
			cfg.ConnFactory = &fixedConnFactory{pc: wrapped}
		} else {
			cfg.ConnFactory = &fixedConnFactory{pc: base}
		}
	} else if obfsPass != "" {
		cfg.ConnFactory = &salamanderConnFactory{psk: []byte(obfsPass)}
	}

	c, _, err := client.NewClient(cfg)
	if err != nil {
		return fmt.Errorf("new client: %w", err)
	}

	// Clear any stop flag left by a previous cycle so a Stop() arriving while we
	// are connecting below is detectable.
	mu.Lock()
	stopped = false
	mu.Unlock()

	mu.Lock()
	if active != nil {
		// (vá 30/09/2026) Bản cũ TRẢ LỖI ở đây. Hệ quả: chỉ cần một client cũ còn sót
		// (xem `Stop()`) là MỌI lần Connect sau đều hỏng ⇒ mọi cửa relay chết ⇒ khách
		// mất mạng. Nay TỰ DỌN client cũ rồi đi tiếp — biến lỗi vĩnh viễn thành tự cứu.
		stale := active
		active = nil
		activeSrv = nil
		mu.Unlock()
		_ = stale.Close()
		fmt.Fprintln(os.Stderr, "Connect: đã dọn client cũ còn sót trước khi nối cửa mới")
		mu.Lock()
	}
	if stopped {
		mu.Unlock()
		_ = c.Close()
		return fmt.Errorf("stop requested during connect")
	}
	active = c
	mu.Unlock()
	return nil
}

// ---------------------------------------------------------------------------
// N tunnel song song (hút băng thông) — port từ iOS 167ba9d, 20/10/2026
// ---------------------------------------------------------------------------
//
// VÌ SAO: trên mạng dùng chung (tòa nhà), đường bị giới hạn theo TỪNG KẾT NỐI —
// đo thật 19/10/2026: 1 luồng 4–12 Mbps, 8 luồng 72–81 Mbps (lặp 3 lần). App chỉ
// mở MỘT tunnel nên trần thực tế ~10–12 Mbps; nâng số khai không vượt được trần đó.
//
// CÁCH LÀM: `tun.Server` chỉ nhận MỘT `client.Client` và gọi `TCP(addr)`/`UDP()`
// một lần cho MỖI LUỒNG mới, nên chỉ cần một client BỌC N client: mỗi luồng mới
// được chia cho một tunnel theo vòng tròn. Các gói của CÙNG một luồng vẫn đi đúng
// một tunnel ⇒ KHÔNG đảo thứ tự (chia theo gói sẽ làm TCP bên trong sụp).
//
// BẤT BIẾN: mọi tunnel phải cùng MỘT exit node (F3) — khác node là IP khách đổi
// giữa phiên, hỏng đăng nhập/thanh toán.
type multiClient struct {
	clients []client.Client
	next    uint32
}

func (m *multiClient) pick() client.Client {
	// round-robin: chia đều các luồng mới; AddUint32 để nhiều goroutine gọi an toàn.
	i := atomic.AddUint32(&m.next, 1)
	return m.clients[int(i)%len(m.clients)]
}

func (m *multiClient) TCP(addr string) (net.Conn, error) { return m.pick().TCP(addr) }

func (m *multiClient) UDP() (client.HyUDPConn, error) { return m.pick().UDP() }

func (m *multiClient) Close() error {
	var first error
	for _, c := range m.clients {
		if err := c.Close(); err != nil && first == nil {
			first = err
		}
	}
	return first
}

// ConnectSlot mở THÊM một tunnel ở vị trí `slot` (0-based), giữ các tunnel khác.
// Chế độ N tunnel: gọi cho slot 0..N-1 rồi gọi MỘT `Serve()`; `Serve()` gộp tất cả.
func ConnectSlot(slot int, host string, port int, password, obfsPass string, sockFd int, sockTcp bool, upKbps, downKbps int) error {
	if err := Connect(host, port, password, obfsPass, sockFd, sockTcp, upKbps, downKbps); err != nil {
		return err
	}
	mu.Lock()
	c := active
	active = nil
	activeSrv = nil
	if c == nil {
		// Stop() chen ngang giữa Connect() và chỗ này (active đã bị dọn) ⇒ TUYỆT ĐỐI không
		// ghi nil vào slots: `Serve()` sẽ đưa nil vào `multiClient` và panic ở `pick()`.
		mu.Unlock()
		return fmt.Errorf("stop requested during connect slot %d", slot)
	}
	if slots == nil {
		slots = map[int]client.Client{}
	}
	old := slots[slot]
	slots[slot] = c
	mu.Unlock()
	if old != nil {
		_ = old.Close()
	}
	return nil
}

// SlotCount trả số tunnel PHỤ đang mở (0 = chế độ một tunnel như cũ). Để app ghi log
// nghiệm thu: N yêu cầu so với N thực mở được — mở tunnel phụ là best-effort.
func SlotCount() int {
	mu.Lock()
	defer mu.Unlock()
	return len(slots)
}

// Serve starts forwarding the (already connected) client through the Android
// VpnService TUN fd. It BLOCKS until the tunnel stops (Stop() or an error).
// Establish the VpnService only AFTER Connect() succeeded.
func Serve(fd int, mtu int, tunIpv4, tunIpv6 string) error {
	mu.Lock()
	c := active
	// N>1: gộp các tunnel thành MỘT client để `tun.Server` chia luồng cho chúng.
	// N=1: dùng đúng client cũ ⇒ hành vi y hệt trước đây (không regress).
	// LƯU Ý: phải gộp CẢ tunnel CHÍNH (`active`) LẪN các tunnel phụ (`slots`).
	// Bản iOS đầu tiên chỉ lấy `slots` khi len(slots) > 1 ⇒ với N=4 (1 chính + 3 phụ)
	// thì multiClient chỉ chứa 3 phụ và **mất tunnel chính** (lỗi thật 19/10/2026).
	if len(slots) > 0 {
		list := make([]client.Client, 0, len(slots)+1)
		if c != nil {
			list = append(list, c)
		}
		for _, v := range slots {
			list = append(list, v)
		}
		if len(list) > 0 {
			// 1 tunnel phụ mà KHÔNG có `active` (app gọi ConnectSlot cho cả slot 0) vẫn phải
			// chạy được: bản iOS đầu tiên để `c` nil ở ca này ⇒ Serve() trả "hysteria not
			// connected" dù đã có tunnel. Vá luôn ở đây.
			if len(list) == 1 {
				c = list[0]
			} else {
				c = &multiClient{clients: list}
			}
		}
	}
	if c == nil {
		mu.Unlock()
		return fmt.Errorf("hysteria not connected")
	}
	if mtu == 0 {
		mtu = 1500
	}
	if tunIpv4 == "" {
		tunIpv4 = "100.100.100.101/30"
	}
	prefix4, err := netip.ParsePrefix(tunIpv4)
	if err != nil {
		mu.Unlock()
		return fmt.Errorf("bad ipv4 %q: %w", tunIpv4, err)
	}
	var inet6 []netip.Prefix
	if tunIpv6 != "" {
		p6, err := netip.ParsePrefix(tunIpv6)
		if err != nil {
			mu.Unlock()
			return fmt.Errorf("bad ipv6 %q: %w", tunIpv6, err)
		}
		inet6 = []netip.Prefix{p6}
	}
	srv := &tun.Server{
		HyClient:       c,
		IfName:         "hy0",
		MTU:            uint32(mtu),
		Timeout:        60, // UDP NAT timeout (s); 0 panics sing-tun NewTicker
		FileDescriptor: fd,
		Inet4Address:   []netip.Prefix{prefix4},
		Inet6Address:   inet6,
	}
	ch := make(chan struct{})
	stopCh = ch
	activeSrv = srv
	mu.Unlock()

	done := make(chan error, 1)
	go func() {
		done <- srv.Serve()
	}()

	select {
	case err := <-done:
		mu.Lock()
		active = nil
		activeSrv = nil
		mu.Unlock()
		if err != nil {
			return fmt.Errorf("tun serve: %w", err)
		}
		return nil
	case <-ch:
		// Stop() called: close the client so Serve() can wind down; the caller
		// closes the TUN fd afterwards.
		_ = c.Close()
		mu.Lock()
		active = nil
		activeSrv = nil
		mu.Unlock()
		return nil
	}
}

// Stop requests the tunnel to shut down. Safe from any thread; it does not wait
// for Serve()/Connect() to return.
//
// Vì sao phải giải phóng `active` NGAY tại đây (vá 30/09/2026 — lỗi build 58):
// bản cũ chỉ đặt `stopped` + đóng `stopCh`, còn `active = nil` nằm tận BÊN TRONG
// đường unwind của `Serve()`. Nếu `Connect()` đã thành công mà `Serve()` không bao
// giờ chạy hoặc không unwind (phiên bị dừng giữa đường), `active` kẹt VĨNH VIỄN ⇒
// mọi lần `Connect()` sau đều trả "hysteria client already running" ⇒ MỌI cửa relay
// đều hỏng, tunnel không có transport — mà network settings đã áp ⇒ khách MẤT MẠNG.
// Ca thật: iPhone build 58 có 1.231 dòng lỗi này, phiên restart mỗi ~30 giây.
func Stop() {
	mu.Lock()
	stopped = true
	stale := active
	hadServe := stopCh != nil
	active = nil
	activeSrv = nil
	staleSlots := slots
	slots = nil
	if stopCh != nil {
		close(stopCh)
		stopCh = nil
	}
	mu.Unlock()
	// Chỉ tự đóng client khi KHÔNG có `Serve()` nào đang chạy để đóng hộ — tránh
	// gọi Close() hai lần trên cùng một client (đường `<-ch` của Serve cũng đóng).
	if stale != nil && !hadServe {
		_ = stale.Close()
	}
	// N tunnel: đóng mọi tunnel phụ còn lại. Khi `Serve()` đang chạy thì `multiClient.Close()`
	// bên trên đã đóng hết; gọi Close lần hai là vô hại với hysteria nhưng vẫn bỏ qua khi
	// hadServe để giữ đúng hành vi cũ.
	if !hadServe {
		for _, c := range staleSlots {
			if c != nil {
				_ = c.Close()
			}
		}
	}
}

// ---------------------------------------------------------------------------
// CHẾ ĐỘ SOCKS5 — cho thiết bị KHÔNG có TUN
// ---------------------------------------------------------------------------
//
// Vì sao cần: một số Android TV dùng kernel KHÔNG build TUN (`# CONFIG_TUN is not set`, thiếu
// /dev/tun) — đo trên MiTV-AFZP0 (Android 14, OS3.0.8.0.UFZAATV): system_server trả
// `VpnJni: Cannot allocate TUN: Bad file descriptor` ⇒ VpnService không tạo được giao diện ⇒
// tunnel KHÔNG BAO GIỜ lên, dù app đổi phiên bản nào.
//
// Cách chữa: vẫn dùng ĐÚNG tunnel hysteria của mình, chỉ đổi "cửa ra": mở SOCKS5 nội bộ ở
// 127.0.0.1 rồi trỏ proxy hệ thống của máy vào đó. Không cần TUN, không cần root.
// (Giới hạn: chỉ app tôn trọng proxy hệ thống mới đi qua — FPT Play/SmartTube/trình duyệt có;
//  Netflix tự mở socket nên KHÔNG đi qua.)

type noopSocksLogger struct{}

func (noopSocksLogger) TCPRequest(addr net.Addr, reqAddr string)          {}
func (noopSocksLogger) TCPError(addr net.Addr, reqAddr string, err error) {}
func (noopSocksLogger) UDPRequest(addr net.Addr)                          {}
func (noopSocksLogger) UDPError(addr net.Addr, err error)                 {}

// ServeSocks mở SOCKS5 tại `listen` (ví dụ "127.0.0.1:1081") trên các tunnel đã Connect.
// CHẶN cho tới khi Stop() được gọi (hoặc listener lỗi) — đúng hợp đồng của Serve().
func ServeSocks(listen string) error {
	mu.Lock()
	c := active
	if len(slots) > 0 {
		list := make([]client.Client, 0, len(slots)+1)
		if c != nil {
			list = append(list, c)
		}
		for _, v := range slots {
			list = append(list, v)
		}
		switch len(list) {
		case 0:
			// không có gì: để nil-check bên dưới bắt
		case 1:
			c = list[0]
		default:
			c = &multiClient{clients: list}
		}
	}
	if c == nil {
		mu.Unlock()
		return fmt.Errorf("hysteria not connected")
	}
	ch := make(chan struct{})
	stopCh = ch
	mu.Unlock()

	l, err := net.Listen("tcp", listen)
	if err != nil {
		return fmt.Errorf("socks listen %s: %w", listen, err)
	}
	srv := &socks5.Server{HyClient: c, EventLogger: noopSocksLogger{}}
	go func() {
		<-ch
		_ = l.Close()
		_ = c.Close()
	}()
	err = srv.Serve(l)
	mu.Lock()
	active = nil
	activeSrv = nil
	mu.Unlock()
	if err != nil && !errors.Is(err, net.ErrClosed) {
		return fmt.Errorf("socks serve: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// HTTP CONNECT PROXY — đúng thứ Android dùng khi đặt "proxy hệ thống"
// ---------------------------------------------------------------------------
//
// Vì sao phải có: proxy hệ thống của Android là **HTTP proxy** — app gửi
// `CONNECT host:443 HTTP/1.1` rồi nói HTTP/HTTPS trong đường hầm đó. Bản SOCKS5 ở trên KHÔNG
// phục vụ được kiểu này (lỗi thật 20/10: FPT Play báo lỗi kết nối khi đăng nhập). Ở đây mở đúng
// giao thức HTTP: CONNECT (dùng cho HTTPS) và chuyển tiếp request thường (HTTP).

func handleHTTPProxyConn(c client.Client, conn net.Conn) {
	defer conn.Close()
	br := bufio.NewReader(conn)
	// VÒNG KEEP-ALIVE (vá 20/10/2026): một kết nối proxy phục vụ NHIỀU request liên tiếp.
	// Trước đây hàm chỉ đọc đúng MỘT request rồi đóng ⇒ app dùng keep-alive (FPT Play: POST
	// license rồi request kế tiếp trên cùng kết nối) bị đóng giữa chừng ⇒ "sự cố kết nối RD_002".
	for {
		req, err := http.ReadRequest(br)
		if err != nil {
			return
		}
		host := req.Host
		if host == "" && req.URL != nil {
			host = req.URL.Host
		}
		if req.Method == http.MethodConnect {
			if !strings.Contains(host, ":") {
				host += ":443"
			}
			up, err := c.TCP(host)
			if err != nil {
				_, _ = conn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
				return
			}
			defer up.Close()
			if _, err := conn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
				return
			}
			done := make(chan struct{}, 1)
			go func() {
				// br có thể còn byte đã đọc sẵn (TLS ClientHello) => phải chuyển tiếp từ br
				_, _ = io.Copy(up, br)
				done <- struct{}{}
			}()
			_, _ = io.Copy(conn, up)
			<-done
			return
		}

		// HTTP thường: đổi sang origin-form rồi chuyển tiếp, GIỮ keep-alive.
		if !strings.Contains(host, ":") {
			host += ":80"
		}
		up, err := c.TCP(host)
		if err != nil {
			_, _ = conn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
			return
		}
		req.Header.Del("Proxy-Connection")
		req.RequestURI = ""
		if req.URL != nil {
			req.URL.Scheme = ""
			req.URL.Host = ""
		}
		// QUAN TRỌNG: không ép req.Close và không io.Copy tới EOF — phải đọc ĐÚNG phần thân
		// theo Content-Length/chunked của TỪNG response rồi trả về client, nếu không các request
		// sau trên cùng kết nối sẽ bị nuốt mất.
		if err := req.Write(up); err != nil {
			_ = up.Close()
			return
		}
		upBr := bufio.NewReader(up)
		resp, err := http.ReadResponse(upBr, req)
		if err != nil {
			_ = up.Close()
			return
		}
		closeAfter := resp.Close || req.Close
		resp.Header.Del("Proxy-Connection")
		resp.Close = closeAfter
		if err := resp.Write(conn); err != nil {
			_ = resp.Body.Close()
			_ = up.Close()
			return
		}
		_ = resp.Body.Close()
		_ = up.Close()
		if closeAfter {
			return
		}
	}
}

// ServeHTTPProxy mở HTTP proxy (CONNECT + GET) tại `listen`, CHẶN tới khi Stop().
func ServeHTTPProxy(listen string) error {
	mu.Lock()
	c := active
	if len(slots) > 0 {
		list := make([]client.Client, 0, len(slots)+1)
		if c != nil {
			list = append(list, c)
		}
		for _, v := range slots {
			list = append(list, v)
		}
		switch len(list) {
		case 0:
		case 1:
			c = list[0]
		default:
			c = &multiClient{clients: list}
		}
	}
	if c == nil {
		mu.Unlock()
		return fmt.Errorf("hysteria not connected")
	}
	ch := make(chan struct{})
	stopCh = ch
	mu.Unlock()

	l, err := net.Listen("tcp", listen)
	if err != nil {
		return fmt.Errorf("http proxy listen %s: %w", listen, err)
	}
	go func() {
		<-ch
		_ = l.Close()
		_ = c.Close()
	}()
	for {
		conn, err := l.Accept()
		if err != nil {
			break
		}
		go handleHTTPProxyConn(c, conn)
	}
	mu.Lock()
	active = nil
	activeSrv = nil
	mu.Unlock()
	return nil
}
