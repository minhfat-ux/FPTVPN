// http-socks-bridge — HTTP proxy (CONNECT + plain) chuyển tiếp sang SOCKS5.
//
// Dùng cho đường "proxy mode" của VPNFlow khi TUN không khả dụng: hệ điều hành
// (Android TV, Windows WinINet/WinHTTP) chỉ hiểu HTTP proxy, còn flowvpnrelay lại
// mở SOCKS5. Cầu này nối hai đầu, không phụ thuộc thư viện ngoài.
//
//	http-socks-bridge -listen 127.0.0.1:18081 -socks 127.0.0.1:1081
//
// Đã dùng thật: Xiaomi TV (Android 14, không CONFIG_TUN) → FPT Play phát được qua
// relay hysteria2 /relay/vn2hy (22/10/2026).
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

type bridge struct {
	socks  string
	dialTO time.Duration
	routes routeFlag
}

// routeFlag là danh sách "suffix=socksAddress".
type routeFlag []route

type route struct {
	suffix string
	socks  string
}

func (f *routeFlag) String() string {
	out := ""
	for _, r := range *f {
		if out != "" {
			out += ","
		}
		out += r.suffix + "=" + r.socks
	}
	return out
}

func (f *routeFlag) Set(v string) error {
	i := strings.LastIndex(v, "=")
	if i <= 0 || i == len(v)-1 {
		return fmt.Errorf("route phải dạng .domain=host:port: %q", v)
	}
	*f = append(*f, route{suffix: strings.ToLower(strings.TrimSpace(v[:i])), socks: strings.TrimSpace(v[i+1:])})
	return nil
}

// upstream chọn SOCKS5 theo hậu tố tên miền; mặc định là b.socks.
func (b *bridge) upstream(hostport string) string {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.ToLower(host)
	for _, r := range b.routes {
		if strings.HasSuffix(host, r.suffix) || host == strings.TrimPrefix(r.suffix, ".") {
			return r.socks
		}
	}
	return b.socks
}

// dialSocks5 mở kết nối TCP tới addr xuyên qua SOCKS5 (RFC 1928, không auth).
func (b *bridge) dialSocks5(proxySocks, addr string) (net.Conn, error) {
	c, err := net.DialTimeout("tcp", proxySocks, b.dialTO)
	if err != nil {
		return nil, err
	}
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		c.Close()
		return nil, err
	}

	if _, err = c.Write([]byte{5, 1, 0}); err != nil {
		c.Close()
		return nil, err
	}
	buf := make([]byte, 2)
	if _, err = io.ReadFull(c, buf); err != nil {
		c.Close()
		return nil, err
	}
	if buf[0] != 5 || buf[1] != 0 {
		c.Close()
		return nil, fmt.Errorf("socks5: method rejected")
	}

	req := []byte{5, 1, 0}
	if ip := net.ParseIP(host); ip != nil {
		if ip4 := ip.To4(); ip4 != nil {
			req = append(req, 1)
			req = append(req, ip4...)
		} else {
			req = append(req, 4)
			req = append(req, ip.To16()...)
		}
	} else {
		if len(host) > 255 {
			c.Close()
			return nil, fmt.Errorf("socks5: host quá dài")
		}
		req = append(req, 3, byte(len(host)))
		req = append(req, host...)
	}
	var port int
	if _, err = fmt.Sscanf(portStr, "%d", &port); err != nil {
		c.Close()
		return nil, fmt.Errorf("socks5: port không hợp lệ: %w", err)
	}
	req = append(req, byte(port>>8), byte(port&0xff))
	if _, err = c.Write(req); err != nil {
		c.Close()
		return nil, err
	}

	// Reply theo RFC 1928: VER REP RSV ATYP BND.ADDR BND.PORT
	hdr := make([]byte, 4)
	if _, err = io.ReadFull(c, hdr); err != nil {
		c.Close()
		return nil, err
	}
	if hdr[0] != 5 {
		c.Close()
		return nil, fmt.Errorf("socks5: version lạ %d", hdr[0])
	}
	if hdr[1] != 0 {
		c.Close()
		return nil, fmt.Errorf("socks5: connect failed code=%d", hdr[1])
	}
	var skip int
	switch hdr[3] {
	case 1:
		skip = 4
	case 4:
		skip = 16
	case 3:
		l := make([]byte, 1)
		if _, err = io.ReadFull(c, l); err != nil {
			c.Close()
			return nil, err
		}
		skip = int(l[0])
	default:
		c.Close()
		return nil, fmt.Errorf("socks5: atyp lạ %d", hdr[3])
	}
	if _, err = io.ReadFull(c, make([]byte, skip+2)); err != nil {
		c.Close()
		return nil, err
	}
	return c, nil
}

func (b *bridge) handler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		upstream := b.upstream(r.Host)
		log.Printf("CONNECT %s via %s", r.Host, upstream)
		up, err := b.dialSocks5(upstream, r.Host)
		if err != nil {
			log.Printf("CONNECT %s: %v", r.Host, err)
			http.Error(w, "tunnel failed", http.StatusBadGateway)
			return
		}
		hj, ok := w.(http.Hijacker)
		if !ok {
			up.Close()
			http.Error(w, "no hijack", http.StatusBadGateway)
			return
		}
		conn, _, err := hj.Hijack()
		if err != nil {
			up.Close()
			return
		}
		_, _ = conn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
		go func() { _, _ = io.Copy(up, conn); up.Close() }()
		_, _ = io.Copy(conn, up)
		conn.Close()
		log.Printf("CONNECT %s ok", r.Host)
		return
	}

	host := r.URL.Host
	if host == "" {
		host = r.Host
	}
	// request proxy kieu http://host/path khong co port -> mac dinh 80
	if _, _, err := net.SplitHostPort(host); err != nil {
		host = net.JoinHostPort(host, "80")
	}
	up, err := b.dialSocks5(b.upstream(host), host)
	if err != nil {
		log.Printf("HTTP %s: %v", host, err)
		http.Error(w, "tunnel failed", http.StatusBadGateway)
		return
	}
	defer up.Close()

	r.RequestURI = ""
	if err = r.Write(up); err != nil {
		http.Error(w, "write failed", http.StatusBadGateway)
		return
	}
	resp, err := http.ReadResponse(bufio.NewReader(up), r)
	if err != nil {
		http.Error(w, "read failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func main() {
	listen := flag.String("listen", "127.0.0.1:18081", "địa chỉ HTTP proxy lắng nghe")
	socks := flag.String("socks", "127.0.0.1:1081", "địa chỉ SOCKS5 mặc định của flowvpnrelay")
	to := flag.Duration("dial-timeout", 10*time.Second, "timeout kết nối SOCKS5")
	var routes routeFlag
	flag.Var(&routes, "route", "định tuyến theo hậu tố tên miền, dạng .tv360.vn=127.0.0.1:1083 (lặp lại được)")
	flag.Parse()

	b := &bridge{socks: *socks, dialTO: *to, routes: routes}
	srv := &http.Server{
		Addr:              *listen,
		Handler:           http.HandlerFunc(b.handler),
		ReadHeaderTimeout: 15 * time.Second,
	}
	log.Printf("http-socks-bridge listen=%s socks=%s", *listen, *socks)
	log.Fatal(srv.ListenAndServe())
}
