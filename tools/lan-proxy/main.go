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

func main() {
	listen := flag.String("listen", "0.0.0.0:18081", "địa chỉ lắng nghe, ví dụ 0.0.0.0:18081")
	flag.StringVar(&upstream, "upstream", "", "socks5://host:port để chuyển tiếp qua SOCKS5 (rỗng = dial thẳng)")
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
var lastGood atomic.Value // string
var rrNext uint64

func dial(hostPort string) (net.Conn, error) {
	if upstream == "" {
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
	start := int((atomic.AddUint64(&rrNext, 1) - 1) % uint64(len(list)))
	var firstErr error
	for i := 0; i < len(list); i++ {
		addr := list[(start+i)%len(list)]
		c, err := socks5Dial(addr, hostPort)
		if err == nil {
			lastGood.Store(addr)
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
