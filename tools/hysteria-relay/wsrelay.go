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
	"strings"
	"sync"
	"sync/atomic"
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
// dialWS bắt tay MỘT WebSocket. Tách ra để cả bản một link (Dial) và bản nhiều link
// (DialMulti) dùng đúng một đường bắt tay — hai bản không thể lệch hành vi TLS/Host.
func dialWS(rawURL, hostHeader string, dialTimeout time.Duration) (*websocket.Conn, error) {
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
	return conn, nil
}

// Dial mở một WebSocket tới rawURL. hostHeader rỗng thì lấy Host của URL — cần đúng
// SNI/Host mà Cloudflare định tuyến (api.meetflowai.site).
func Dial(rawURL, hostHeader string, dialTimeout time.Duration) (*PacketConn, error) {
	conn, err := dialWS(rawURL, hostHeader, dialTimeout)
	if err != nil {
		return nil, err
	}
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

// --- Multipath: nhiều WebSocket song song cho cùng một relay ----------------
//
// Vì sao: chặng Cloudflare↔node bị bóp THEO TỪNG KẾT NỐI (đo 19/09/2026: 1 luồng
// 2,1–2,8 MB/s, 4 luồng tổng 7,24 MB/s). Một PacketConn = một WebSocket = một luồng
// TCP qua CF, nên tunnel bị chặn ở trần 1 luồng. MultiConn mở N WebSocket tới CÙNG
// relay rồi rải datagram ra N link, và gộp datagram nhận được từ MỌI link về một
// hàng đợi đọc duy nhất (vẫn đúng hợp đồng net.PacketConn ⇒ hysteria không cần biết).
//
// Đánh đổi phải đo: rải gói ra nhiều link ⇒ gói tới đích KHÔNG còn đúng thứ tự gửi.
// QUIC coi đó là mất gói (ngưỡng reorder mặc định ~3 gói) và gửi lại. Vì vậy có
// nhiều chính sách chọn link (LinkMode) để đo xem cái nào chịu được đảo gói.

// LinkMode là chính sách chọn link cho mỗi datagram.
type LinkMode string

const (
	// ModeRoundRobin: gói thứ i đi link i%N — rải đều nhất, đảo gói nhiều nhất.
	ModeRoundRobin LinkMode = "roundrobin"
	// ModeSizeHash: gói NHỎ (ACK/khung điều khiển QUIC) luôn đi link 0, gói lớn
	// (dữ liệu) rải vòng trên các link còn lại. ACK đi một đường ⇒ đường ACK không
	// bị đảo; đổi lại link 0 chở thêm phần ACK của mọi luồng.
	ModeSizeHash LinkMode = "sizehash"
	// ModeBurst: gửi liên tiếp `burst` gói trên một link rồi mới đổi — chỉ đảo gói ở
	// ranh giới cụm, ít đảo hơn round-robin.
	ModeBurst LinkMode = "burst"
)

// SmallPacketMax: ngưỡng "gói nhỏ" cho ModeSizeHash. QUIC ACK ~30–60 byte, gói dữ
// liệu ~1200–1400 byte; 200 byte nằm giữa hai nhóm nên tách được hai loại.
const SmallPacketMax = 200

// MultiConfig cấu hình cho MultiConn.
type MultiConfig struct {
	URL         string
	HostHeader  string
	DialTimeout time.Duration
	// Links là số WebSocket mở song song (1 = hành vi một link cũ).
	Links int
	Mode  LinkMode
	// Burst là số gói liên tiếp trên một link ở ModeBurst.
	Burst int
	// StatsLogSec > 0: log đếm gói/byte từng link mỗi N giây.
	StatsLogSec int
	// ReviveTries là số lần thử mở lại một link chết trong một lượt (0 = 6).
	ReviveTries int
}

// LinkStat là số đếm của một link, dùng cho log/báo cáo A/B.
type LinkStat struct {
	Index     int
	Alive     bool
	TxPackets int64
	TxBytes   int64
	RxPackets int64
	RxBytes   int64
	LastErr   string
}

// multiLink là một WebSocket trong nhóm. conn được giữ trong atomic.Pointer để
// Close() đóng được conn đang bận ghi mà không phải chờ writeMu (nếu chờ, một lần
// ghi bị treo sẽ làm Close() treo theo — đúng lỗi "đóng không sạch").
type multiLink struct {
	idx       int
	writeMu   sync.Mutex
	conn      atomic.Pointer[websocket.Conn]
	alive     atomic.Bool
	reviving  atomic.Bool
	txPackets atomic.Int64
	txBytes   atomic.Int64
	rxPackets atomic.Int64
	rxBytes   atomic.Int64
	errMu     sync.Mutex
	lastErr   string
}

func (l *multiLink) setErr(err error) {
	l.errMu.Lock()
	if err != nil {
		l.lastErr = err.Error()
	}
	l.errMu.Unlock()
}

func (l *multiLink) lastErrString() string {
	l.errMu.Lock()
	defer l.errMu.Unlock()
	return l.lastErr
}

// isAlive: có conn đang dùng được (không tính link đang được mở lại).
func (l *multiLink) isAlive() bool { return l.alive.Load() }

// write gửi một datagram trên link này. Trả lỗi thì người gọi đánh dấu link chết.
func (l *multiLink) write(b []byte, deadline time.Time) error {
	conn := l.conn.Load()
	if conn == nil {
		return ErrNoLiveLink
	}
	l.writeMu.Lock()
	defer l.writeMu.Unlock()
	if err := conn.SetWriteDeadline(deadline); err != nil {
		return err
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, b); err != nil {
		return err
	}
	l.txPackets.Add(1)
	l.txBytes.Add(int64(len(b)))
	return nil
}

// MultiConn là net.PacketConn trên N WebSocket song song.
type MultiConn struct {
	cfg   MultiConfig
	links []*multiLink

	readCh chan []byte
	closed chan struct{}

	closeOnce sync.Once
	errMu     sync.Mutex
	err       error

	rr       atomic.Uint64
	burstMu  sync.Mutex
	burstIdx int
	burstLen int

	stateMu sync.Mutex

	deadlineMu    sync.Mutex
	readDeadline  time.Time
	writeDeadline time.Time

	localAddr  net.Addr
	remoteAddr net.Addr
}

var _ net.PacketConn = (*MultiConn)(nil)

// ErrNoLiveLink trả về khi mọi link đều chết tại thời điểm gửi.
var ErrNoLiveLink = errors.New("wsrelay: không còn link sống")

// ErrAllLinksDead trả về khi PacketConn bị đóng vì tất cả link chết và mở lại thất bại.
var ErrAllLinksDead = errors.New("wsrelay: tất cả link đều chết")

func wslogf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "[wsrelay] "+format+"\n", args...)
}

// DialMulti mở Links WebSocket tới cùng một relay. Chỉ cần MỘT link mở được là
// PacketConn chạy; link nào lỗi lúc đầu thì được thử lại nền (không chặn tunnel).
func DialMulti(cfg MultiConfig) (*MultiConn, error) {
	if cfg.Links <= 0 {
		cfg.Links = 1
	}
	if cfg.Mode == "" {
		cfg.Mode = ModeRoundRobin
	}
	if cfg.Burst <= 0 {
		cfg.Burst = 8
	}
	if cfg.DialTimeout <= 0 {
		cfg.DialTimeout = DialTimeout
	}
	if cfg.ReviveTries <= 0 {
		cfg.ReviveTries = 6
	}
	mc := &MultiConn{
		cfg:      cfg,
		readCh:   make(chan []byte, 1024*cfg.Links),
		closed:   make(chan struct{}),
		burstIdx: cfg.Links - 1,
	}
	for i := 0; i < cfg.Links; i++ {
		mc.links = append(mc.links, &multiLink{idx: i})
	}
	// Mở song song cho nhanh (mỗi lần bắt tay CF+TLS ~0,3–2s).
	type res struct {
		idx  int
		conn *websocket.Conn
		err  error
	}
	ch := make(chan res, cfg.Links)
	for i := 0; i < cfg.Links; i++ {
		go func(i int) {
			conn, err := dialWS(cfg.URL, cfg.HostHeader, cfg.DialTimeout)
			ch <- res{idx: i, conn: conn, err: err}
		}(i)
	}
	var firstErr error
	for i := 0; i < cfg.Links; i++ {
		r := <-ch
		if r.err != nil {
			wslogf("link %d: mở thất bại: %v", r.idx, r.err)
			mc.links[r.idx].setErr(r.err)
			if firstErr == nil {
				firstErr = r.err
			}
			continue
		}
		mc.install(r.idx, r.conn)
	}
	if !mc.anyAlive() {
		return nil, fmt.Errorf("wsrelay: không mở được link nào trong %d link: %w", cfg.Links, firstErr)
	}
	// Link mở lỗi lúc đầu: thử lại nền ngay, không chặn.
	for _, l := range mc.links {
		if !l.isAlive() {
			mc.startRevive(l)
		}
	}
	go mc.maintainLoop()
	if cfg.StatsLogSec > 0 {
		go mc.statsLoop()
	}
	wslogf("multipath: %d/%d link sống (mode=%s burst=%d)", mc.aliveCount(), len(mc.links), cfg.Mode, cfg.Burst)
	return mc, nil
}

// install gắn một conn mới vào link và chạy hai vòng đọc/ping của conn đó.
func (mc *MultiConn) install(idx int, conn *websocket.Conn) {
	l := mc.links[idx]
	l.conn.Store(conn)
	l.alive.Store(true)
	if mc.remoteAddr == nil {
		mc.localAddr = conn.LocalAddr()
		mc.remoteAddr = conn.RemoteAddr()
	}
	go mc.linkReadLoop(l, conn)
	go mc.linkPingLoop(l, conn)
}

func (mc *MultiConn) linkReadLoop(l *multiLink, conn *websocket.Conn) {
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			mc.onLinkDown(l, conn, err)
			return
		}
		if len(data) == 0 {
			continue
		}
		buf := make([]byte, len(data))
		copy(buf, data)
		l.rxPackets.Add(1)
		l.rxBytes.Add(int64(len(buf)))
		// Giống bản một link: hàng đợi đầy thì CHỜ (backpressure) thay vì bỏ gói.
		select {
		case mc.readCh <- buf:
		case <-mc.closed:
			return
		}
	}
}

// linkPingLoop giữ WS sống khi tunnel im lặng (Cloudflare cắt WS idle ~100s).
func (mc *MultiConn) linkPingLoop(l *multiLink, conn *websocket.Conn) {
	t := time.NewTicker(20 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-mc.closed:
			return
		case <-t.C:
			// conn của thế hệ cũ (đã bị thay) thì thoát, tránh ping vào conn chết.
			if l.conn.Load() != conn {
				return
			}
			_ = conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
		}
	}
}

// onLinkDown xử lý một link chết: KHÔNG đóng PacketConn, chỉ bỏ link đó rồi mở lại.
// Đây là điểm khác biệt cốt lõi so với bản một link (link chết ⇒ cả tunnel dựng lại).
func (mc *MultiConn) onLinkDown(l *multiLink, conn *websocket.Conn, err error) {
	select {
	case <-mc.closed:
		return
	default:
	}
	// conn này đã bị thay bởi thế hệ mới ⇒ sự kiện của thế hệ cũ, bỏ qua.
	if l.conn.Load() != conn {
		return
	}
	l.conn.Store(nil)
	l.alive.Store(false)
	l.setErr(err)
	wslogf("link %d: chết (%v) — còn %d/%d link sống", l.idx, err, mc.aliveCount(), len(mc.links))
	_ = conn.Close()
	// Mở lại NGAY (không chờ maintainLoop 15s): đường relay sau Cloudflare hay bị
	// reset từng kết nối, chờ 15s là mất 15s băng thông.
	mc.startRevive(l)
	mc.syncState()
}

// startRevive đánh dấu link "đang được mở lại" RỒI mới chạy nền. Việc đánh dấu phải
// xong trước khi hàm này trả về: syncState() gọi ngay sau đó thấy "còn người đang mở
// lại" nên không đóng oan cả PacketConn khi mọi link vừa chết cùng lúc.
func (mc *MultiConn) startRevive(l *multiLink) {
	if !l.reviving.CompareAndSwap(false, true) {
		return
	}
	go mc.revive(l)
}

// revive mở lại một link đã chết (chạy nền, có backoff). Giả định reviving đã = true.
func (mc *MultiConn) revive(l *multiLink) {
	defer func() {
		l.reviving.Store(false)
		mc.syncState()
	}()
	backoff := 250 * time.Millisecond
	for try := 1; try <= mc.cfg.ReviveTries; try++ {
		select {
		case <-mc.closed:
			return
		case <-time.After(backoff):
		}
		conn, err := dialWS(mc.cfg.URL, mc.cfg.HostHeader, mc.cfg.DialTimeout)
		if err != nil {
			l.setErr(err)
			wslogf("link %d: mở lại thất bại (%d/%d): %v", l.idx, try, mc.cfg.ReviveTries, err)
			if backoff < 4*time.Second {
				backoff *= 2
			}
			continue
		}
		mc.install(l.idx, conn)
		wslogf("link %d: đã mở lại sau %d lần (còn %d/%d link sống)", l.idx, try, mc.aliveCount(), len(mc.links))
		return
	}
	wslogf("link %d: bỏ lượt mở lại này (lỗi cuối: %s)", l.idx, l.lastErrString())
}

// maintainLoop định kỳ thử lại các link đã bỏ (link chết lâu vẫn tự hồi).
func (mc *MultiConn) maintainLoop() {
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-mc.closed:
			return
		case <-t.C:
			for _, l := range mc.links {
				if l.isAlive() || l.reviving.Load() {
					continue
				}
				mc.startRevive(l)
			}
		}
	}
}

func (mc *MultiConn) statsLoop() {
	t := time.NewTicker(time.Duration(mc.cfg.StatsLogSec) * time.Second)
	defer t.Stop()
	for {
		select {
		case <-mc.closed:
			return
		case <-t.C:
			wslogf("multipath: %s", mc.StatsText())
		}
	}
}

// aliveCount/anyReviving/anyAlive đọc trạng thái link.
func (mc *MultiConn) aliveCount() int {
	n := 0
	for _, l := range mc.links {
		if l.isAlive() {
			n++
		}
	}
	return n
}

func (mc *MultiConn) anyAlive() bool { return mc.aliveCount() > 0 }

// AnyAlive cho biết còn link nào sống không (dùng cho log/test bên ngoài).
func (mc *MultiConn) AnyAlive() bool { return mc.aliveCount() > 0 }

func (mc *MultiConn) anyReviving() bool {
	for _, l := range mc.links {
		if l.reviving.Load() {
			return true
		}
	}
	return false
}

// syncState đóng PacketConn khi KHÔNG còn link sống và cũng không còn ai đang mở lại.
// Nhờ vậy tầng trên (runner) biết transport chết hẳn để dựng lại, thay vì treo im.
func (mc *MultiConn) syncState() {
	select {
	case <-mc.closed:
		return
	default:
	}
	mc.stateMu.Lock()
	defer mc.stateMu.Unlock()
	if mc.anyAlive() || mc.anyReviving() {
		return
	}
	mc.closeWithErr(ErrAllLinksDead)
}

// pick chọn link cho datagram b (theo Mode).
func (mc *MultiConn) pick(b []byte) *multiLink {
	switch mc.cfg.Mode {
	case ModeSizeHash:
		if len(b) <= SmallPacketMax {
			if l := mc.links[0]; l.isAlive() {
				return l
			}
		}
		return mc.pickRR(1)
	case ModeBurst:
		return mc.pickBurst()
	default:
		return mc.pickRR(0)
	}
}

// pickRR rải vòng, bắt đầu từ link start (bỏ qua link chết).
func (mc *MultiConn) pickRR(start int) *multiLink {
	n := len(mc.links)
	if n == 0 {
		return nil
	}
	k := int(mc.rr.Add(1) - 1)
	for i := 0; i < n; i++ {
		l := mc.links[(start+k+i)%n]
		if l.isAlive() {
			return l
		}
	}
	return nil
}

// pickBurst giữ một link cho Burst gói liên tiếp rồi mới đổi link.
func (mc *MultiConn) pickBurst() *multiLink {
	mc.burstMu.Lock()
	defer mc.burstMu.Unlock()
	n := len(mc.links)
	if n == 0 {
		return nil
	}
	if mc.burstLen > 0 && mc.links[mc.burstIdx].isAlive() {
		mc.burstLen--
		return mc.links[mc.burstIdx]
	}
	for i := 1; i <= n; i++ {
		l := mc.links[(mc.burstIdx+i)%n]
		if l.isAlive() {
			mc.burstIdx = l.idx
			mc.burstLen = mc.cfg.Burst - 1
			return l
		}
	}
	return nil
}

func (mc *MultiConn) WriteTo(b []byte, _ net.Addr) (int, error) {
	select {
	case <-mc.closed:
		return 0, net.ErrClosed
	default:
	}
	mc.deadlineMu.Lock()
	deadline := mc.writeDeadline
	mc.deadlineMu.Unlock()

	// Thử tối đa 2 link: link được chọn chết giữa chừng thì gửi qua link khác.
	// Gói chưa gửi được nên KHÔNG có nguy cơ trùng lặp.
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		l := mc.pick(b)
		if l == nil {
			if lastErr != nil {
				return 0, lastErr
			}
			return 0, ErrNoLiveLink
		}
		err := l.write(b, deadline)
		if err == nil {
			return len(b), nil
		}
		lastErr = err
		mc.onLinkDown(l, l.conn.Load(), err)
		if l.conn.Load() == nil {
			// onLinkDown đã xử lý; thử link kế ở vòng sau.
			continue
		}
	}
	if lastErr == nil {
		lastErr = ErrNoLiveLink
	}
	return 0, lastErr
}

func (mc *MultiConn) ReadFrom(b []byte) (int, net.Addr, error) {
	mc.deadlineMu.Lock()
	deadline := mc.readDeadline
	mc.deadlineMu.Unlock()

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
	for {
		select {
		case data := <-mc.readCh:
			// Gói đến từ link nào cũng như nhau với QUIC: gộp chung một hàng đợi.
			if len(data) == 0 {
				continue
			}
			n := copy(b, data)
			return n, mc.remoteAddr, nil
		case <-mc.closed:
			mc.errMu.Lock()
			err := mc.err
			mc.errMu.Unlock()
			if err == nil {
				err = net.ErrClosed
			}
			return 0, nil, err
		case <-timeout:
			return 0, nil, os.ErrDeadlineExceeded
		}
	}
}

func (mc *MultiConn) closeWithErr(err error) {
	mc.closeOnce.Do(func() {
		mc.errMu.Lock()
		mc.err = err
		mc.errMu.Unlock()
		close(mc.closed)
		// Đóng từng conn KHÔNG qua writeMu: một lần ghi đang treo (write không
		// deadline) sẽ chặn Close nếu phải chờ mutex — Close phải luôn sạch.
		for _, l := range mc.links {
			l.alive.Store(false)
			if conn := l.conn.Swap(nil); conn != nil {
				_ = conn.Close()
			}
		}
	})
}

func (mc *MultiConn) Close() error {
	mc.closeWithErr(net.ErrClosed)
	return nil
}

func (mc *MultiConn) LocalAddr() net.Addr  { return mc.localAddr }
func (mc *MultiConn) RemoteAddr() net.Addr { return mc.remoteAddr }

func (mc *MultiConn) SetDeadline(t time.Time) error {
	if err := mc.SetReadDeadline(t); err != nil {
		return err
	}
	return mc.SetWriteDeadline(t)
}

func (mc *MultiConn) SetReadDeadline(t time.Time) error {
	mc.deadlineMu.Lock()
	mc.readDeadline = t
	mc.deadlineMu.Unlock()
	return nil
}

func (mc *MultiConn) SetWriteDeadline(t time.Time) error {
	mc.deadlineMu.Lock()
	mc.writeDeadline = t
	mc.deadlineMu.Unlock()
	return nil
}

// Stats trả số đếm từng link (dùng cho báo cáo A/B).
func (mc *MultiConn) Stats() []LinkStat {
	out := make([]LinkStat, 0, len(mc.links))
	for _, l := range mc.links {
		out = append(out, LinkStat{
			Index:     l.idx,
			Alive:     l.isAlive(),
			TxPackets: l.txPackets.Load(),
			TxBytes:   l.txBytes.Load(),
			RxPackets: l.rxPackets.Load(),
			RxBytes:   l.rxBytes.Load(),
			LastErr:   l.lastErrString(),
		})
	}
	return out
}

// StatsText là một dòng gọn để log: link nào chở bao nhiêu gói/byte.
func (mc *MultiConn) StatsText() string {
	var sb strings.Builder
	for _, s := range mc.Stats() {
		fmt.Fprintf(&sb, "link%d[%s] tx=%dpkt/%dB rx=%dpkt/%dB",
			s.Index, aliveWord(s.Alive), s.TxPackets, s.TxBytes, s.RxPackets, s.RxBytes)
		if s.LastErr != "" {
			fmt.Fprintf(&sb, " err=%q", s.LastErr)
		}
		if s.Index != len(mc.links)-1 {
			sb.WriteString(" | ")
		}
	}
	return sb.String()
}

func aliveWord(alive bool) string {
	if alive {
		return "sống"
	}
	return "chết"
}
