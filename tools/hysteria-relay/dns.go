// Bộ chia DNS (DNS splitter) của flowvpnrelay.
//
// VÌ SAO CẦN: TUN đi THẲNG mọi đích nằm trong dải TQ (tun.route.ipv4Exclude /
// ipv6Exclude) và đẩy phần còn lại vào tunnel. Nếu app đặt thẳng một resolver công
// cộng (1.1.1.1) làm DNS của adapter TUN thì DNS đi TRONG tunnel — tốt, vì GFW không
// nhiễm độc được (đo thật: www.youtube.com ra 142.251.x thật) — nhưng tên miền TQ lại
// nhận IP CDN NƯỚC NGOÀI (www.baidu.com → 103.235.47.188 của Baidu HK, taobao →
// 43.109.163.153); những IP đó KHÔNG nằm trong dải TQ nên bị đẩy vào tunnel: đo thật
// https://www.baidu.com = 26.217 ms qua tunnel so với 116 ms đi thẳng, và 15/23 tên
// miền TQ lớn bị như vậy. Ngược lại đặt resolver nội địa (223.5.5.5 / 114.114.114.114 /
// 119.29.29.29) thì GFW nhiễm độc tên miền nước ngoài (www.google.com → 185.45.5.35,
// www.youtube.com → 104.244.42.197).
//
// Nên mỗi truy vấn được quyết định RIÊNG (xem handle):
//  1. tên khớp "cnSuffixes" (ngữ nghĩa domain_suffix của sing-box) → resolver nội địa,
//     trả nguyên câu trả lời, cho MỌI loại bản ghi;
//  2. còn lại mà là A/AAAA → hỏi resolver nội địa TRƯỚC; chỉ nhận khi RCODE=NOERROR,
//     TC=0, answer có ít nhất một bản ghi A/AAAA và MỌI bản ghi A/AAAA nằm trong dải TQ
//     (ĐÚNG bộ dải TUN đang dùng để chia đường — nên ip_cidr đi-thẳng mới khớp); ngược
//     lại hỏi resolver công cộng;
//  3. mọi loại khác (HTTPS/SVCB/TXT/MX/…) → resolver công cộng.
//
// Quy tắc 2 là chỗ ăn tiền: tên miền TQ nhận đúng IP CDN TQ mà KHÔNG cần danh sách tên
// miền nào để bảo trì, còn tên miền toàn cầu vẫn nhận câu trả lời sạch qua tunnel.
//
// Không binding interface nào: cứ dial thường. Định tuyến đã quyết hết — resolver nội
// địa nằm trong dải trừ của TUN nên đi thẳng, resolver công cộng không nằm trong đó nên
// rơi vào TUN rồi hysteria chở đi.
//
// Mọi lỗi thành SERVFAIL (giữ ID + question) hoặc bị bỏ im nếu không đọc được câu hỏi.
// KHÔNG bao giờ panic: đây là đường sống của mọi truy vấn DNS của khách. KHÔNG log từng
// truy vấn (hàng nghìn câu mỗi phút) — chỉ đúng một dòng lúc khởi động.
//
// File này được tools/hysteria-relay/build.sh copy vào <checkout>/app/flowvpnrelay/dns.go.
package main

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/netip"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/dns/dnsmessage"
)

const (
	// Resolver nội địa TQ — nằm TRONG dải trừ của TUN nên dial thẳng là tới.
	dnsDefaultCNUpstream = "223.5.5.5:53"
	// Resolver công cộng — KHÔNG nằm trong dải trừ nên gói đi vào TUN (qua tunnel).
	dnsDefaultRemoteUpstream = "1.1.1.1:53"

	// Hạn cho MỘT lần hỏi upstream. Resolver của khách tự retry nếu ta trả SERVFAIL.
	dnsUpstreamTimeout = 4 * time.Second
	// Hạn cho một kết nối TCP của DNS (RFC 7766: client HN có thể hỏi nhiều câu một kết
	// nối; đừng để kết nối chết treo mãi).
	dnsTCPIdleTimeout = 8 * time.Second
	// Kích thước tối đa của một message DNS (TCP có tiền tố 2 byte độ dài).
	dnsMaxMsgSize = 64 << 10
	// Độ dài header DNS tối thiểu.
	dnsMinHeader = 12
	// Khi ReadFrom/Accept lỗi tạm thời (địa chỉ của TUN biến mất lúc dựng lại route…)
	// thì ngủ ngắn rồi đọc tiếp, không quay vòng nóng.
	dnsReadErrorBackoff = 50 * time.Millisecond
)

// dnsConfig = khối "dns" (TUỲ CHỌN) trong config JSON của flowvpnrelay.
// Không khai ⇒ không chạy bộ chia DNS, hành vi y hệt trước khi có file này.
// Nguồn sự thật phía app C#: windows/.../SingBoxConfigBuilder.BuildDns.
type dnsConfig struct {
	// Listen = địa chỉ bộ chia nghe, ví dụ "100.100.100.101:53" (chính địa chỉ TUN —
	// app đặt DNS của adapter TUN về đây).
	Listen string `json:"listen"`
	// CN = resolver nội địa TQ, mặc định 223.5.5.5:53.
	CN string `json:"cn"`
	// Remote = resolver công cộng đi trong tunnel, mặc định 1.1.1.1:53.
	Remote string `json:"remote"`
	// CNSuffixes = nhóm tên miền đã biết chắc là TQ (khớp kiểu domain_suffix:
	// bằng đúng tên, hoặc kết thúc bằng "."+suffix; entry ".cn" và "cn" đều như nhau).
	CNSuffixes []string `json:"cnSuffixes"`
}

// dnsServer là bộ chia đã bind xong cả UDP và TCP trên cùng một địa chỉ.
type dnsServer struct {
	udp    net.PacketConn
	tcp    net.Listener
	cn     string
	remote string
	// suffixes: tên miền TQ đã biết (rỗng = không dùng quy tắc 1).
	suffixes *dnsDomainSuffixes
	// cnNets: ĐÚNG bộ dải TQ mà TUN dùng để chia đường (xem startTUN).
	cnNets *dnsPrefixSet
}

// dnsRelay là bộ chia đang chạy của TIẾN TRÌNH. Cố ý giữ lại qua các lần vòng ngoài ở
// main() dựng lại đường hầm: app C# đã trỏ DNS của adapter TUN vào địa chỉ này, đóng
// rồi mở lại chỉ tạo khoảng trống DNS mà không được gì. Bind lỗi thì trả lỗi để vòng
// ngoài dựng lại (đúng hợp đồng với TUNFAIL), và lần sau bind lại từ đầu.
var (
	dnsMu       sync.Mutex
	dnsInstance *dnsServer
)

// startDNSRelay bind bộ chia (UDP + TCP) và chạy nó. dc == nil ⇒ không làm gì.
// Idempotent: gọi lại khi đã chạy thì trả nil ngay.
func startDNSRelay(dc *dnsConfig, prefixes []netip.Prefix) error {
	if dc == nil {
		return nil
	}
	dnsMu.Lock()
	defer dnsMu.Unlock()
	if dnsInstance != nil {
		return nil
	}
	s, err := newDNSServer(*dc, prefixes)
	if err != nil {
		return err
	}
	dnsInstance = s
	go func() {
		serr := s.Serve()
		s.close()
		dnsMu.Lock()
		if dnsInstance == s {
			dnsInstance = nil
		}
		dnsMu.Unlock()
		if serr != nil && !errors.Is(serr, net.ErrClosed) {
			logf("DNSFAIL %s", tunFailReason(serr))
		}
	}()
	// Một dòng duy nhất, ASCII, lúc khởi động — hợp đồng log với app C#/log khách.
	logf("dns: splitter %s cn=%s remote=%s cnSuffixes=%d cnRanges=%d",
		s.listenAddr(), s.cn, s.remote, s.suffixes.len(), s.cnNets.len())
	return nil
}

// closeDNSRelay đóng bộ chia đang chạy (nếu có) để vòng sau bind LẠI TỪ ĐẦU.
//
// Vì sao cần dù khởi tạo là singleton: bộ chia bind vào địa chỉ CỦA TUN; TUN chết thì địa
// chỉ đó biến mất, socket cũ không còn nhận gói, mà cờ "đã sẵn sàng" thì vẫn bật ⇒ DNS
// câm. TUN chết là lúc duy nhất ta đóng, nên không tạo khoảng trống trong phiên đang chạy.
func closeDNSRelay() {
	dnsMu.Lock()
	s := dnsInstance
	dnsInstance = nil
	dnsMu.Unlock()
	if s != nil {
		s.close()
	}
}

// failDNS in DNSFAIL rồi trả lại chính lỗi đó — CÙNG hợp đồng với failTUN: app đọc một
// dòng ASCII ngắn, còn tầng trên dựng lại đường hầm.
func failDNS(err error) error {
	if err == nil {
		err = errors.New("dns relay failed")
	}
	logf("DNSFAIL %s", tunFailReason(err))
	return err
}

// newDNSServer bind UDP và TCP trên cùng địa chỉ rồi trả về bộ chia CHƯA chạy.
// Bind cả TCP là BẮT BUỘC: client DNS của Windows tự chuyển sang TCP khi câu trả lời
// có bit TC (ví dụ zone lớn), thiếu TCP nghĩa là những tên miền đó không phân giải được.
func newDNSServer(dc dnsConfig, prefixes []netip.Prefix) (*dnsServer, error) {
	listen := strings.TrimSpace(dc.Listen)
	if listen == "" {
		return nil, errors.New("dns.listen rỗng")
	}
	cn := strings.TrimSpace(dc.CN)
	if cn == "" {
		cn = dnsDefaultCNUpstream
	}
	remote := strings.TrimSpace(dc.Remote)
	if remote == "" {
		remote = dnsDefaultRemoteUpstream
	}
	uc, err := net.ListenPacket("udp", listen)
	if err != nil {
		return nil, fmt.Errorf("dns udp %s: %w", listen, err)
	}
	tl, err := net.Listen("tcp", listen)
	if err != nil {
		_ = uc.Close()
		return nil, fmt.Errorf("dns tcp %s: %w", listen, err)
	}
	return &dnsServer{
		udp:      uc,
		tcp:      tl,
		cn:       cn,
		remote:   remote,
		suffixes: newDNSDomainSuffixes(dc.CNSuffixes),
		cnNets:   newDNSPrefixSet(prefixes),
	}, nil
}

func (s *dnsServer) listenAddr() string {
	if s.udp != nil {
		return s.udp.LocalAddr().String()
	}
	return ""
}

func (s *dnsServer) close() {
	if s.udp != nil {
		_ = s.udp.Close()
	}
	if s.tcp != nil {
		_ = s.tcp.Close()
	}
}

// Serve chạy cả hai listener và trả về khi MỘT trong hai chết (lúc đó bộ chia coi như
// hỏng: nửa UDP nửa TCP không dùng được).
func (s *dnsServer) Serve() error {
	errc := make(chan error, 2)
	go func() { errc <- s.serveTCP() }()
	go func() { errc <- s.serveUDP() }()
	return <-errc
}

func (s *dnsServer) serveUDP() error {
	buf := make([]byte, dnsMaxMsgSize)
	for {
		n, addr, err := s.udp.ReadFrom(buf)
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			time.Sleep(dnsReadErrorBackoff)
			continue
		}
		if n < dnsMinHeader || n > dnsMaxMsgSize {
			continue
		}
		msg := make([]byte, n)
		copy(msg, buf[:n])
		go func() {
			resp := s.handle(context.Background(), msg)
			if len(resp) == 0 {
				return
			}
			_, _ = s.udp.WriteTo(resp, addr)
		}()
	}
}

func (s *dnsServer) serveTCP() error {
	for {
		c, err := s.tcp.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			time.Sleep(dnsReadErrorBackoff)
			continue
		}
		go s.serveTCPConn(c)
	}
}

// serveTCPConn phục vụ một kết nối TCP: mỗi message có tiền tố 2 byte độ dài
// (RFC 1035 §4.2.2). Đọc nhiều câu trên cùng kết nối như RFC 7766 cho phép.
func (s *dnsServer) serveTCPConn(c net.Conn) {
	defer c.Close()
	var lb [2]byte
	for {
		_ = c.SetReadDeadline(time.Now().Add(dnsTCPIdleTimeout))
		if _, err := io.ReadFull(c, lb[:]); err != nil {
			return
		}
		n := int(binary.BigEndian.Uint16(lb[:]))
		if n < dnsMinHeader || n > dnsMaxMsgSize {
			return
		}
		msg := make([]byte, n)
		if _, err := io.ReadFull(c, msg); err != nil {
			return
		}
		resp := s.handle(context.Background(), msg)
		if len(resp) == 0 || len(resp) > 0xffff {
			return
		}
		out := make([]byte, 2+len(resp))
		binary.BigEndian.PutUint16(out[:2], uint16(len(resp)))
		copy(out[2:], resp)
		_ = c.SetWriteDeadline(time.Now().Add(dnsTCPIdleTimeout))
		if _, err := c.Write(out); err != nil {
			return
		}
	}
}

// handle = toàn bộ chính sách chia DNS. query là message NGUYÊN BẢN của client (giữ
// nguyên ID và question nên câu trả lời của upstream dùng lại được, không phải viết lại).
// Trả nil = bỏ im lặng (message không đọc được); trả SERVFAIL = hỏi upstream thất bại.
func (s *dnsServer) handle(ctx context.Context, query []byte) []byte {
	h, q, err := dnsParseQuery(query)
	if err != nil || h.Response {
		// Không đọc được header/question, hoặc đây là RESPONSE (ta chỉ phục vụ query).
		return nil
	}
	name := dnsNormalizeName(q.Name.String())

	// Quy tắc 1: tên miền TQ đã biết → resolver nội địa, MỌI loại bản ghi.
	if s.suffixes.match(name) {
		resp, err := s.exchange(ctx, s.cn, query)
		if err == nil {
			return resp
		}
		// Resolver nội địa không trả lời (mạng khách chặn/Resolver TQ sự cố): rơi về resolver
		// công cộng. Hỏi qua tunnel thì IP trả về có thể là CDN ngoài TQ (chậm hơn), nhưng CHẬM
		// vẫn hơn HỎNG: trả SERVFAIL là WeChat/thanh toán TQ chết hẳn trong khi mạng vẫn còn.
		resp, rerr := s.exchange(ctx, s.remote, query)
		if rerr != nil {
			return dnsServfail(query)
		}
		return resp
	}

	// Quy tắc 2: A/AAAA → thử resolver nội địa trước, chỉ nhận khi MỌI bản ghi trả về
	// nằm trong dải TQ. Đây là chỗ quyết định "đi thẳng được hay không": IP ngoài dải TQ
	// sẽ bị TUN đẩy vào tunnel, nên nhận nó là tự bắn vào chân (xem đầu file).
	if q.Type == dnsmessage.TypeA || q.Type == dnsmessage.TypeAAAA {
		if resp, err := s.exchange(ctx, s.cn, query); err == nil {
			if ok, cerr := dnsChinaAnswer(resp, s.cnNets); cerr == nil && ok {
				return resp
			}
		}
		resp, err := s.exchange(ctx, s.remote, query)
		if err != nil {
			return dnsServfail(query)
		}
		return resp
	}

	// Quy tắc 3: mọi loại khác (HTTPS/SVCB/TXT/MX/…) → resolver công cộng qua tunnel.
	resp, err := s.exchange(ctx, s.remote, query)
	if err != nil {
		return dnsServfail(query)
	}
	return resp
}

// exchange gửi nguyên message tới addr qua UDP và trả câu trả lời. Dial THƯỜNG (không
// binding interface): định tuyến của HĐO đã quyết gói đi thẳng hay vào TUN.
// exchange hỏi một upstream: UDP trước, THẤT BẠI thì thử lại bằng TCP.
//
// Vì sao cần đường TCP (sự cố máy thật 22/10/2026): resolver "remote" đi XUYÊN tunnel, mà đường
// UDP trong tunnel có mạng chập chờn trong khi TCP vẫn chạy (đo được: TCP tới 1.1.1.1:443 qua relay
// ổn định). Thiếu đường TCP thì một truy vấn DNS hỏng làm CẢ HỆ THỐNG mất phân giải tên, dù tunnel
// vẫn chở dữ liệu tốt.
func (s *dnsServer) exchange(ctx context.Context, addr string, query []byte) ([]byte, error) {
	if resp, err := s.exchangeUDP(ctx, addr, query); err == nil {
		return resp, nil
	}
	return s.exchangeTCP(ctx, addr, query)
}

// exchangeTCP gửi DNS qua TCP (khung 2 byte độ dài) — dùng khi UDP không trả lời.
func (s *dnsServer) exchangeTCP(ctx context.Context, addr string, query []byte) ([]byte, error) {
	if len(query) < dnsMinHeader || len(query) > 0xffff {
		return nil, errors.New("dns query sai do dai")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	d := net.Dialer{Timeout: dnsUpstreamTimeout}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	deadline := time.Now().Add(dnsUpstreamTimeout)
	if dl, ok := ctx.Deadline(); ok && dl.Before(deadline) {
		deadline = dl
	}
	_ = conn.SetDeadline(deadline)

	framed := make([]byte, 2+len(query))
	binary.BigEndian.PutUint16(framed[:2], uint16(len(query)))
	copy(framed[2:], query)
	if _, err := conn.Write(framed); err != nil {
		return nil, err
	}

	var lenBuf [2]byte
	if _, err := io.ReadFull(conn, lenBuf[:]); err != nil {
		return nil, err
	}
	n := int(binary.BigEndian.Uint16(lenBuf[:]))
	if n < dnsMinHeader || n > dnsMaxMsgSize {
		return nil, errors.New("dns tcp: do dai phan hoi vo ly")
	}
	resp := make([]byte, n)
	if _, err := io.ReadFull(conn, resp); err != nil {
		return nil, err
	}
	return resp, nil
}
func (s *dnsServer) exchangeUDP(ctx context.Context, addr string, query []byte) ([]byte, error) {
	if len(query) < dnsMinHeader {
		return nil, errors.New("dns query quá ngắn")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	conn, err := net.DialTimeout("udp", addr, dnsUpstreamTimeout)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	deadline := time.Now().Add(dnsUpstreamTimeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = conn.SetDeadline(deadline)
	if _, err := conn.Write(query); err != nil {
		return nil, err
	}
	wantID := binary.BigEndian.Uint16(query[:2])
	buf := make([]byte, dnsMaxMsgSize)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			return nil, err
		}
		// Bỏ qua message không khớp ID (đừng trả nhầm câu trả lời cho client).
		if n < dnsMinHeader || binary.BigEndian.Uint16(buf[:2]) != wantID {
			continue
		}
		out := make([]byte, n)
		copy(out, buf[:n])
		return out, nil
	}
}

// dnsParseQuery đọc header + question ĐẦU TIÊN của message.
func dnsParseQuery(msg []byte) (dnsmessage.Header, dnsmessage.Question, error) {
	var p dnsmessage.Parser
	h, err := p.Start(msg)
	if err != nil {
		return dnsmessage.Header{}, dnsmessage.Question{}, err
	}
	q, err := p.Question()
	if err != nil {
		return h, dnsmessage.Question{}, err
	}
	return h, q, nil
}

// dnsChinaAnswer = "câu trả lời này dùng được để đi THẲNG không?".
// Nhận khi: RCODE=NOERROR, TC=0, answer có ≥1 bản ghi A/AAAA, và MỌI bản ghi A/AAAA
// trong answer nằm trong dải TQ. Bất kỳ bản ghi nào ngoài dải ⇒ trả false (để caller
// hỏi resolver công cộng), vì IP ngoài dải TQ sẽ bị TUN đẩy vào tunnel.
func dnsChinaAnswer(msg []byte, cn *dnsPrefixSet) (bool, error) {
	var p dnsmessage.Parser
	h, err := p.Start(msg)
	if err != nil {
		return false, err
	}
	if h.RCode != dnsmessage.RCodeSuccess || h.Truncated {
		return false, nil
	}
	if _, err := p.AllQuestions(); err != nil {
		return false, err
	}
	found := false
	for {
		ah, err := p.AnswerHeader()
		if errors.Is(err, dnsmessage.ErrSectionDone) {
			break
		}
		if err != nil {
			return false, err
		}
		switch ah.Type {
		case dnsmessage.TypeA:
			r, err := p.AResource()
			if err != nil {
				return false, err
			}
			if !cn.contains(netip.AddrFrom4(r.A)) {
				return false, nil
			}
			found = true
		case dnsmessage.TypeAAAA:
			r, err := p.AAAAResource()
			if err != nil {
				return false, err
			}
			if !cn.contains(netip.AddrFrom16(r.AAAA)) {
				return false, nil
			}
			found = true
		default:
			// CNAME/HTTPS/TXT… không phải A/AAAA nên không xét; vẫn phải nhảy qua cho
			// đúng con trỏ của parser.
			if err := p.SkipAnswer(); err != nil {
				return false, err
			}
		}
	}
	return found, nil
}

// dnsServfail dựng câu trả lời SERVFAIL giữ nguyên ID + question của query.
// Trả nil nếu query không đọc được (caller bỏ im lặng).
func dnsServfail(query []byte) []byte {
	var p dnsmessage.Parser
	h, err := p.Start(query)
	if err != nil {
		return nil
	}
	q, err := p.Question()
	if err != nil {
		return nil
	}
	b := dnsmessage.NewBuilder(make([]byte, 0, 128), dnsmessage.Header{
		ID:                 h.ID,
		Response:           true,
		OpCode:             h.OpCode,
		RecursionDesired:   h.RecursionDesired,
		RecursionAvailable: true,
		RCode:              dnsmessage.RCodeServerFailure,
	})
	b.EnableCompression()
	if err := b.StartQuestions(); err != nil {
		return nil
	}
	if err := b.Question(q); err != nil {
		return nil
	}
	out, err := b.Finish()
	if err != nil {
		return nil
	}
	return out
}

// dnsNormalizeName: bỏ dấu chấm cuối (tên FQDN của dnsmessage luôn có), bỏ dấu chấm
// ĐẦU (entry ".cn" trong cấu hình), chữ thường.
func dnsNormalizeName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.TrimSuffix(name, ".")
	name = strings.TrimPrefix(name, ".")
	return strings.ToLower(name)
}

// dnsDomainSuffixes khớp tên miền kiểu domain_suffix của sing-box: bằng đúng entry,
// hoặc kết thúc bằng "."+entry (tức là tên miền con của entry).
type dnsDomainSuffixes struct {
	set map[string]struct{}
}

func newDNSDomainSuffixes(entries []string) *dnsDomainSuffixes {
	s := &dnsDomainSuffixes{set: make(map[string]struct{}, len(entries))}
	for _, e := range entries {
		n := dnsNormalizeName(e)
		if n == "" {
			continue
		}
		s.set[n] = struct{}{}
	}
	return s
}

func (s *dnsDomainSuffixes) len() int {
	if s == nil {
		return 0
	}
	return len(s.set)
}

// match đi từ tên đầy đủ lên từng cấp cha: "a.b.qq.com" → "b.qq.com" → "qq.com".
// Không cấp phát gì (chỉ cắt chuỗi con) và tối đa bằng số nhãn của tên.
func (s *dnsDomainSuffixes) match(name string) bool {
	if s == nil || len(s.set) == 0 || name == "" {
		return false
	}
	for {
		if _, ok := s.set[name]; ok {
			return true
		}
		i := strings.IndexByte(name, '.')
		if i < 0 {
			return false
		}
		name = name[i+1:]
	}
}

// dnsIPRange là một dải đóng [from, to].
type dnsIPRange struct {
	from netip.Addr
	to   netip.Addr
}

// dnsPrefixSet là danh sách dải ĐÃ SẮP XẾP để tìm bằng nhị phân — dựng MỘT lần lúc khởi
// động, mỗi truy vấn chỉ tốn log2(N) phép so sánh và không cấp phát gì.
// IPv4 và IPv6 để RIÊNG: trộn hai họ vào một mảng thì thứ tự so sánh của netip vẫn
// đúng, nhưng tách ra thì tìm kiếm rẻ hơn và không phải nghĩ tới địa chỉ v4-mapped.
type dnsPrefixSet struct {
	v4 []dnsIPRange
	v6 []dnsIPRange
}

func newDNSPrefixSet(prefixes []netip.Prefix) *dnsPrefixSet {
	r4 := make([]dnsIPRange, 0, len(prefixes))
	r6 := make([]dnsIPRange, 0, 16)
	for _, p := range prefixes {
		if !p.IsValid() {
			continue
		}
		p = p.Masked()
		r := dnsIPRange{from: p.Addr(), to: dnsLastAddr(p)}
		if r.from.Is4() {
			r4 = append(r4, r)
			continue
		}
		r6 = append(r6, r)
	}
	return &dnsPrefixSet{v4: dnsMergeRanges(r4), v6: dnsMergeRanges(r6)}
}

func (s *dnsPrefixSet) len() int {
	if s == nil {
		return 0
	}
	return len(s.v4) + len(s.v6)
}

// contains = địa chỉ có nằm trong bất kỳ dải nào không.
func (s *dnsPrefixSet) contains(a netip.Addr) bool {
	if s == nil || !a.IsValid() {
		return false
	}
	a = a.Unmap()
	rs := s.v6
	if a.Is4() {
		rs = s.v4
	}
	if len(rs) == 0 {
		return false
	}
	// Phần tử cuối cùng có from <= a; dải đã trộn nên chỉ cần so với "to" của nó.
	i := sort.Search(len(rs), func(i int) bool { return rs[i].from.Compare(a) > 0 }) - 1
	if i < 0 {
		return false
	}
	return a.Compare(rs[i].to) <= 0
}

// dnsMergeRanges sắp xếp theo from rồi gộp các dải chồng/đè nhau — nhờ vậy tìm kiếm
// nhị phân ở trên chỉ cần xét MỘT dải.
func dnsMergeRanges(rs []dnsIPRange) []dnsIPRange {
	if len(rs) < 2 {
		return rs
	}
	sort.Slice(rs, func(i, j int) bool { return rs[i].from.Less(rs[j].from) })
	out := rs[:1]
	for _, r := range rs[1:] {
		last := &out[len(out)-1]
		// Chồng nhau (hoặc liền kề) thì nới "to"; ngược lại mở dải mới.
		if r.from.Compare(last.to) <= 0 || r.from.Compare(last.to.Next()) == 0 {
			if r.to.Compare(last.to) > 0 {
				last.to = r.to
			}
			continue
		}
		out = append(out, r)
	}
	return out
}

// dnsLastAddr = địa chỉ cuối của prefix (địa chỉ broadcast với IPv4).
func dnsLastAddr(p netip.Prefix) netip.Addr {
	a := p.Addr()
	bits := a.BitLen()
	if p.Bits() >= bits {
		return a
	}
	// Bật các bit host cuối cùng.
	b := a.AsSlice()
	for i := p.Bits(); i < bits; i++ {
		b[i/8] |= 1 << (7 - uint(i%8))
	}
	last, ok := netip.AddrFromSlice(b)
	if !ok {
		return a
	}
	return last.Unmap()
}
