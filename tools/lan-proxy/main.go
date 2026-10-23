// lan-proxy — HTTP proxy trên LAN cho thiết bị KHÔNG có TUN (TV MiTV-AFZP0).
//
// TV này thiếu CONFIG_TUN nên không chạy được VPN client. Cách duy nhất để traffic của TV đi
// qua đường hầm trên PC là để TV dùng **proxy hệ thống** trỏ vào PC trong LAN.
//
// Hai chế độ ra:
//
//	-upstream socks5://127.0.0.1:1080  → chuyển tiếp qua SOCKS5 (hysteria qua cầu WS trên PC).
//	(không đặt -upstream)              → dial thẳng theo routing của máy.
//
// Giao thức: HTTP proxy chuẩn — CONNECT cho HTTPS, GET/POST thường, GIỮ keep-alive (FPT Play dùng
// nhiều request trên một kết nối; đóng sớm ⇒ RD_002).
package main

import (
	"bufio"
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

var upstream string

// ───────── chia luồng theo hậu tố tên miền (port từ `tools/http-socks-bridge` của Mac) ─────────
//
// Vì sao cần: FPT Play và TV360 cần HAI exit node khác nhau (FPT bị chặn ở node3, TV360 thì cần
// node3). Trước đây mỗi proxy chỉ có một đường nên không thể chạy cả hai. Mac đã làm cơ chế này
// trong http-socks-bridge (commit c4452d83, `-route .tv360.vn=...`); bản này port sang lan-proxy để
// đường Windows cũng dùng được, TV không phải phụ thuộc máy Mac.
//
// Dùng:  -route ".tv360.vn=socks5://127.0.0.1:1103"  (lặp lại được nhiều lần)
// Không khớp hậu tố nào ⇒ dùng danh sách -upstream như cũ.
type routeRule struct {
	suffix   string
	upstream string
}

type routeList []routeRule

func (l *routeList) String() string {
	parts := make([]string, 0, len(*l))
	for _, r := range *l {
		parts = append(parts, r.suffix+"="+r.upstream)
	}
	return strings.Join(parts, ",")
}

func (l *routeList) Set(v string) error {
	i := strings.Index(v, "=")
	if i <= 0 {
		return fmt.Errorf("route phải dạng .domain=socks5://host:port: %q", v)
	}
	suffix := strings.ToLower(strings.TrimSpace(v[:i]))
	up := strings.TrimSpace(v[i+1:])
	up = strings.TrimPrefix(strings.TrimPrefix(up, "socks5://"), "tcp://")
	if suffix == "" || up == "" {
		return fmt.Errorf("route thiếu hậu tố hoặc upstream: %q", v)
	}
	*l = append(*l, routeRule{suffix: suffix, upstream: up})
	return nil
}

var routes routeList

// ───────── danh sách đi THẲNG (không qua tunnel) ─────────
//
// Vì sao cần: TV Xiaomi tự kiểm tra mạng bằng `miwifi.com` (và vài domain Xiaomi khác). Qua exit
// Việt Nam thì CONNECT tới các domain đó bị từ chối (code 4) ⇒ Android kết luận "không có internet"
// ⇒ TV báo mất mạng dù mọi traffic khác vẫn đi được (sự cố thật 22/10/2026, log đầy
// `CONNECT miwifi.com:443 FAIL socks5: CONNECT bị từ chối`).
// Những domain này KHÔNG cần IP Việt Nam, cho đi thẳng bằng mạng của toà nhà.
type directList []string

func (d *directList) String() string { return strings.Join(*d, ",") }

func (d *directList) Set(v string) error {
	s := strings.ToLower(strings.TrimSpace(v))
	if s == "" {
		return fmt.Errorf("direct cần một hậu tố tên miền, ví dụ .miwifi.com")
	}
	*d = append(*d, s)
	return nil
}

var directSuffixes directList

// -verbose: ghi mỗi kết nối CONNECT (domain nào, đi đường nào) — dùng để biết TV gọi gì khi phát.
var verbose bool

func vlog(format string, args ...any) {
	if verbose {
		log.Printf(format, args...)
	}
}

func isDirect(hostPort string) bool {
	host := hostPort
	if h, _, err := net.SplitHostPort(hostPort); err == nil {
		host = h
	}
	host = strings.ToLower(host)
	for _, s := range directSuffixes {
		bare := strings.TrimPrefix(s, ".")
		if strings.HasSuffix(host, s) || host == bare {
			return true
		}
	}
	return false
}

// routeUpstream trả về upstream riêng cho host (khớp hậu tố DÀI NHẤT), rỗng nếu không có quy tắc.
func routeUpstream(hostPort string) string {
	host := hostPort
	if h, _, err := net.SplitHostPort(hostPort); err == nil {
		host = h
	}
	host = strings.ToLower(host)
	best := ""
	bestLen := 0
	for _, r := range routes {
		bare := strings.TrimPrefix(r.suffix, ".")
		if (strings.HasSuffix(host, r.suffix) || host == bare) && len(r.suffix) > bestLen {
			best, bestLen = r.upstream, len(r.suffix)
		}
	}
	return best
}

func main() {
	listen := flag.String("listen", "0.0.0.0:18081", "địa chỉ lắng nghe, ví dụ 0.0.0.0:18081")
	flag.StringVar(&upstream, "upstream", "", "socks5://host:port để chuyển tiếp qua SOCKS5 (rỗng = dial thẳng)")
	flag.Var(&routes, "route", "chia luồng theo hậu tố tên miền: .tv360.vn=socks5://127.0.0.1:1103 (lặp lại được)")
	flag.BoolVar(&verbose, "verbose", false, "log mọi CONNECT (domain + đường đi)")
	flag.Var(&directSuffixes, "direct", "hậu tố đi THẲNG không qua tunnel (TV tự kiểm mạng): .miwifi.com (lặp lại được)")
	flag.Parse()

	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatalf("listen %s: %v", *listen, err)
	}
	if upstream != "" {
		log.Printf("lan-proxy: nghe %s · chuyển tiếp qua %s", *listen, upstream)
	} else {
		log.Printf("lan-proxy: nghe %s · dial thẳng theo routing của máy", *listen)
	}
	for _, r := range routes {
		log.Printf("lan-proxy: chia luồng %s -> %s", r.suffix, r.upstream)
	}
	startDiscovery(proxyPortOf(*listen))
	for _, s := range directSuffixes {
		log.Printf("lan-proxy: đi THẲNG (không qua tunnel) %s", s)
	}
	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("accept: %v", err)
			continue
		}
		go handle(conn)
	}
}

var connSeq int64

// dial ra ngoài: qua SOCKS5 nếu có -upstream, ngược lại dial TCP thường.
//
// Nhiều upstream (cách nhau dấu phẩy) thì CHIA TẢI round-robin: kết nối thứ i bắt đầu từ
// upstream i%N, hỏng thì thử tiếp các cái sau. Lý do: mỗi relay WS qua Cloudflare bị cap
// riêng ~1,4 Mbps (đo 22/10/2026: 1 luồng 1,43 Mbps, 3 luồng CÙNG một relay vẫn 1,4 Mbps
// tổng), nhưng 3 relay khác nhau song song thì cộng dồn ~3 Mbps. Trước đây dùng lastGood
// (chỉ failover) nên mọi kết nối dồn vào một relay và không bao giờ vượt được cái cap đó.
//
// Từ 22/10/2026 đổi sang "ƯU TIÊN ĐẦU DANH SÁCH, tự thử lại": khi UDP trực tiếp mở lại (đo được
// 8,9 Mbps so với 0,1–0,6 Mbps của cầu WS), chia đều round-robin sẽ làm 2/3 số kết nối rơi vào
// đường chậm. Nay: dùng upstream đầu tiên còn sống; nó chết thì tụt xuống các cái sau; mỗi 30 s
// thử lại cái đầu để quay về đường nhanh ngay khi nó sống lại.
var current atomic.Value   // string: upstream đang dùng
var rrNext uint64          // bộ đếm round-robin khi upstream đầu chết
var primaryDeadUntil int64 // unix nano: trước mốc này thì chia đều các upstream còn lại
var lastPrimaryTry int64   // unix nano, lần cuối thử upstream đầu

const primaryRetryInterval = 30 * time.Second

func dial(hostPort string) (net.Conn, error) {
	// Domain "nội bộ thiết bị" (Xiaomi tự kiểm mạng) đi thẳng: qua tunnel VN là bị từ chối.
	if isDirect(hostPort) {
		return net.DialTimeout("tcp", hostPort, 8*time.Second)
	}
	// Quy tắc theo tên miền được ưu tiên: ví dụ `.tv360.vn` nên đi node3. Nhưng nếu node của route
	// chết thì PHẢI fallback sang danh sách mặc định (case 21/22 của QA) — thà nhầm node còn hơn để
	// TV mất mạng; trước đây `return nil, err` làm cả TV360 lẫn FPT chết cứng.
	if routed := routeUpstream(hostPort); routed != "" {
		c, err := socks5Dial(routed, hostPort)
		if err == nil {
			vlog("routed %s -> %s", hostPort, routed)
			return c, nil
		}
		log.Printf("route %s -> %s lỗi (%v) -> fallback danh sách mặc định", hostPort, routed, err)
	}
	if upstream == "" {
		vlog("direct %s", hostPort)
		return net.DialTimeout("tcp", hostPort, 10*time.Second)
	}
	var list []string
	for _, u := range strings.Split(upstream, ",") {
		addr := strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(u), "socks5://"), "tcp://")
		if addr != "" {
			list = append(list, addr)
		}
	}
	if len(list) == 0 {
		return nil, fmt.Errorf("không có upstream nào dùng được")
	}
	// 1) Đến hạn thì thử lại upstream ĐẦU (đường nhanh nhất: UDP trực tiếp khi mở được).
	if time.Since(time.Unix(0, atomic.LoadInt64(&lastPrimaryTry))) > primaryRetryInterval {
		atomic.StoreInt64(&lastPrimaryTry, time.Now().UnixNano())
		if c, err := socks5Dial(list[0], hostPort); err == nil {
			current.Store(list[0])
			atomic.StoreInt64(&primaryDeadUntil, 0)
			return c, nil
		}
		// Đầu danh sách chết (ví dụ UDP bị chặn): đánh dấu 60 s để các kết nối sau CHIA ĐỀU phần còn
		// lại — nhiều node WS cộng dồn ~1,7 Mbps, dính một node thì chỉ ~0,6 Mbps (đo 23/10/2026).
		atomic.StoreInt64(&primaryDeadUntil, time.Now().Add(60*time.Second).UnixNano())
	}
	if time.Now().UnixNano() < atomic.LoadInt64(&primaryDeadUntil) {
		// 2) Chia đều round-robin qua TẤT CẢ upstream còn lại.
		//
		// KHÔNG dùng `current` (sticky) ở đây: đã đo 23/10/2026 — vào thẳng 3 node song song được
		// 1,57 Mbps nhưng qua proxy chỉ 0,31 Mbps, vì mọi kết nối sau đều dính vào node đầu tiên
		// thành công nên các node còn lại không được dùng. Muốn cộng dồn thì mỗi kết nối phải đi
		// một node khác nhau.
		start := int((atomic.AddUint64(&rrNext, 1) - 1) % uint64(len(list)))
		var firstErr error
		for i := 0; i < len(list); i++ {
			addr := list[(start+i)%len(list)]
			c, err := socks5Dial(addr, hostPort)
			if err == nil {
				current.Store(addr)
				return c, nil
			}
			if firstErr == nil {
				firstErr = err
			}
		}
		return nil, firstErr
	}
	// 3) Bình thường: dùng tiếp upstream đang chạy được (giữ kết nối ổn định, không nhảy loạn).
	if v := current.Load(); v != nil {
		if c, err := socks5Dial(v.(string), hostPort); err == nil {
			return c, nil
		}
		current = atomic.Value{}
	}
	// 3) Tụt xuống các upstream còn lại theo thứ tự.
	var firstErr error
	for _, addr := range list {
		c, err := socks5Dial(addr, hostPort)
		if err == nil {
			current.Store(addr)
			return c, nil
		}
		if firstErr == nil {
			firstErr = err
		}
	}
	return nil, firstErr
}

func socks5Dial(proxyAddr, hostPort string) (net.Conn, error) {
	c, err := net.DialTimeout("tcp", proxyAddr, 10*time.Second)
	if err != nil {
		return nil, err
	}
	host, portStr, err := net.SplitHostPort(hostPort)
	if err != nil {
		_ = c.Close()
		return nil, err
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		_ = c.Close()
		return nil, err
	}
	// greeting: v5, 1 method, no-auth
	if _, err = c.Write([]byte{5, 1, 0}); err != nil {
		_ = c.Close()
		return nil, err
	}
	rep := make([]byte, 2)
	if _, err = io.ReadFull(c, rep); err != nil {
		_ = c.Close()
		return nil, err
	}
	if rep[0] != 5 || rep[1] != 0 {
		_ = c.Close()
		return nil, fmt.Errorf("socks5: phương thức không được chấp nhận (%v)", rep)
	}
	// request: v5, CONNECT, rsv, ATYP
	req := []byte{5, 1, 0}
	if ip := net.ParseIP(host); ip != nil && ip.To4() != nil {
		req = append(req, 1)
		req = append(req, ip.To4()...)
	} else {
		if len(host) > 255 {
			_ = c.Close()
			return nil, fmt.Errorf("socks5: host quá dài")
		}
		req = append(req, 3, byte(len(host)))
		req = append(req, []byte(host)...)
	}
	portBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(portBytes, uint16(port))
	req = append(req, portBytes...)
	if _, err = c.Write(req); err != nil {
		_ = c.Close()
		return nil, err
	}
	head := make([]byte, 4)
	if _, err = io.ReadFull(c, head); err != nil {
		_ = c.Close()
		return nil, err
	}
	if head[1] != 0 {
		_ = c.Close()
		return nil, fmt.Errorf("socks5: CONNECT bị từ chối (code %d)", head[1])
	}
	var skip int
	switch head[3] {
	case 1:
		skip = 4
	case 3:
		one := make([]byte, 1)
		if _, err = io.ReadFull(c, one); err != nil {
			_ = c.Close()
			return nil, err
		}
		skip = int(one[0])
	case 4:
		skip = 16
	}
	if skip > 0 {
		if _, err = io.ReadFull(c, make([]byte, skip+2)); err != nil {
			_ = c.Close()
			return nil, err
		}
	}
	return c, nil
}

func handle(conn net.Conn) {
	id := atomic.AddInt64(&connSeq, 1)
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Minute))
	br := bufio.NewReader(conn)
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
			up, err := dial(host)
			if err != nil {
				log.Printf("#%d CONNECT %s FAIL %v", id, host, err)
				_, _ = conn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
				return
			}
			defer up.Close()
			if _, err := conn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
				return
			}
			done := make(chan struct{}, 1)
			go func() {
				_, _ = io.Copy(up, br)
				done <- struct{}{}
			}()
			_, _ = io.Copy(conn, up)
			<-done
			return
		}

		if !strings.Contains(host, ":") {
			host += ":80"
		}
		up, err := dial(host)
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

// ───────── tự dò gateway (app không cần biết IP tĩnh) ─────────
//
// Vì sao: DHCP của toà nhà đổi IP máy (22→23/10/2026: laptop từ 192.168.100.11 thành .5, Mac thành .3),
// nên mọi địa chỉ hard-code trong app/TV đều chết. App phát UDP broadcast "FLOWVPNGW?" tới cổng
// [discoveryPort]; gateway trả "FLOWVPNGW1 <cổng proxy>" để app biết IP thật của gateway.
const discoveryPort = 18099

func startDiscovery(proxyPort int) {
	go func() {
		addr, err := net.ResolveUDPAddr("udp4", fmt.Sprintf(":%d", discoveryPort))
		if err != nil {
			log.Printf("discovery: %v", err)
			return
		}
		conn, err := net.ListenUDP("udp4", addr)
		if err != nil {
			log.Printf("discovery: không mở được UDP %d: %v", discoveryPort, err)
			return
		}
		log.Printf("discovery: nghe UDP %d (trả lời FLOWVPNGW? -> cổng %d)", discoveryPort, proxyPort)
		buf := make([]byte, 128)
		for {
			n, from, err := conn.ReadFromUDP(buf)
			if err != nil {
				continue
			}
			if strings.HasPrefix(strings.TrimSpace(string(buf[:n])), "FLOWVPNGW?") {
				msg := fmt.Sprintf("FLOWVPNGW1 %d", proxyPort)
				_, _ = conn.WriteToUDP([]byte(msg), from)
			}
		}
	}()
}

// proxyPortOf lấy số cổng từ chuỗi "0.0.0.0:18081".
func proxyPortOf(listen string) int {
	if _, p, err := net.SplitHostPort(listen); err == nil {
		if n, err := strconv.Atoi(p); err == nil {
			return n
		}
	}
	return 18081
}
