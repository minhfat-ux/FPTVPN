// Package wsrelay chở datagram của hysteria2 (QUIC) xuyên qua một WebSocket.
//
// Vì sao cần: mạng ở TQ — và cả mạng khách sạn đang test — chặn IP của node, chỉ
// Cloudflare đi qua được. Bản CLI chính thức của hysteria chỉ có transport UDP
// (`transport.type: udp`) và udphop, nên không nối được vào relay WebSocket mà
// Android đang dùng (`/relay/vn*hy` trên node-2 → `wsrelay.js`). Gói này bọc
// WebSocket thành `net.PacketConn` để đưa vào `client.Config.ConnFactory`.
//
// Giao thức đúng bằng giao thức đang chạy thật: **mỗi binary message = 1 datagram**
// (android/.../vpn/WSRelayBridge.kt:34 và relay phía server không thêm framing nào).
package wsrelay

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// DialTimeout mặc định cho bắt tay WS (Cloudflare + TLS + upgrade).
const DialTimeout = 10 * time.Second

// PacketConn là net.PacketConn trên một WebSocket đã bắt tay xong.
type PacketConn struct {
	conn *websocket.Conn

	readCh chan []byte
	closed chan struct{}

	closeOnce sync.Once
	errMu     sync.Mutex
	err       error

	writeMu sync.Mutex

	deadlineMu    sync.Mutex
	readDeadline  time.Time
	writeDeadline time.Time

	localAddr  net.Addr
	remoteAddr net.Addr
}

// Dial mở WebSocket tới rawURL. hostHeader rỗng thì lấy Host của URL — cần đúng
// SNI/Host mà Cloudflare định tuyến (api.meetflowai.site).
func Dial(rawURL, hostHeader string, dialTimeout time.Duration) (*PacketConn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("wsrelay: parse %q: %w", rawURL, err)
	}
	if hostHeader == "" {
		hostHeader = u.Host
	}
	if dialTimeout <= 0 {
		dialTimeout = DialTimeout
	}
	hdr := http.Header{}
	hdr.Set("Host", hostHeader)
	d := websocket.Dialer{
		HandshakeTimeout:  dialTimeout,
		ReadBufferSize:    1 << 20,
		WriteBufferSize:   1 << 20,
		EnableCompression: false,
	}
	conn, resp, err := d.Dial(rawURL, hdr)
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("wsrelay: dial %s: %w (http %s)", rawURL, err, resp.Status)
		}
		return nil, fmt.Errorf("wsrelay: dial %s: %w", rawURL, err)
	}
	// QUIC datagram ≤ ~1500 byte, nhưng đường relay có thể gộp/không gộp — để rộng.
	conn.SetReadLimit(1 << 20)
	pc := &PacketConn{
		conn:       conn,
		readCh:     make(chan []byte, 1024),
		closed:     make(chan struct{}),
		localAddr:  conn.LocalAddr(),
		remoteAddr: conn.RemoteAddr(),
	}
	go pc.readLoop()
	go pc.pingLoop()
	return pc, nil
}

func (p *PacketConn) readLoop() {
	for {
		_, data, err := p.conn.ReadMessage()
		if err != nil {
			p.closeWithErr(err)
			return
		}
		if len(data) == 0 {
			continue
		}
		buf := make([]byte, len(data))
		copy(buf, data)
		select {
		case p.readCh <- buf:
		case <-p.closed:
			return
		}
		// Hàng đợi đầy thì CHỜ (backpressure) thay vì bỏ gói: bỏ gói làm mất datagram
		// QUIC giữa chừng => throughput tụt + dao động mạnh (đúng triệu chứng loss cao
		// đo được trên Mac 19/09). Chờ ở đây khiến phía server relay chịu backpressure
		// qua chính kết nối WS thay vì client tự vứt dữ liệu.
	}
}

// pingLoop giữ đường WS sống khi tunnel im lặng (Cloudflare cắt WS idle ~100s).
func (p *PacketConn) pingLoop() {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-p.closed:
			return
		case <-t.C:
			_ = p.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
		}
	}
}

func (p *PacketConn) closeWithErr(err error) {
	p.closeOnce.Do(func() {
		p.errMu.Lock()
		p.err = err
		p.errMu.Unlock()
		close(p.closed)
		_ = p.conn.Close()
	})
}

func (p *PacketConn) ReadFrom(b []byte) (int, net.Addr, error) {
	p.deadlineMu.Lock()
	deadline := p.readDeadline
	p.deadlineMu.Unlock()

	var timer *time.Timer
	var timeout <-chan time.Time
	if !deadline.IsZero() {
		d := time.Until(deadline)
		if d <= 0 {
			return 0, nil, os.ErrDeadlineExceeded
		}
		timer = time.NewTimer(d)
		defer timer.Stop()
		timeout = timer.C
	}
	select {
	case data := <-p.readCh:
		n := copy(b, data)
		return n, p.remoteAddr, nil
	case <-p.closed:
		p.errMu.Lock()
		err := p.err
		p.errMu.Unlock()
		if err == nil {
			err = net.ErrClosed
		}
		return 0, nil, err
	case <-timeout:
		return 0, nil, os.ErrDeadlineExceeded
	}
}

func (p *PacketConn) WriteTo(b []byte, _ net.Addr) (int, error) {
	select {
	case <-p.closed:
		return 0, net.ErrClosed
	default:
	}
	p.deadlineMu.Lock()
	deadline := p.writeDeadline
	p.deadlineMu.Unlock()
	if err := p.conn.SetWriteDeadline(deadline); err != nil {
		return 0, err
	}
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if err := p.conn.WriteMessage(websocket.BinaryMessage, b); err != nil {
		return 0, err
	}
	return len(b), nil
}

func (p *PacketConn) Close() error {
	p.closeWithErr(net.ErrClosed)
	return nil
}

func (p *PacketConn) LocalAddr() net.Addr  { return p.localAddr }
func (p *PacketConn) RemoteAddr() net.Addr { return p.remoteAddr }

func (p *PacketConn) SetDeadline(t time.Time) error {
	if err := p.SetReadDeadline(t); err != nil {
		return err
	}
	return p.SetWriteDeadline(t)
}

func (p *PacketConn) SetReadDeadline(t time.Time) error {
	p.deadlineMu.Lock()
	p.readDeadline = t
	p.deadlineMu.Unlock()
	return nil
}

func (p *PacketConn) SetWriteDeadline(t time.Time) error {
	p.deadlineMu.Lock()
	p.writeDeadline = t
	p.deadlineMu.Unlock()
	return nil
}

// ErrClosed trả về khi PacketConn đã đóng vì lỗi (khác net.ErrClosed khi đóng chủ động).
var ErrClosed = errors.New("wsrelay: closed")
