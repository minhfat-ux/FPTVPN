// sni-proxy: chuyển tiếp TLS trong suốt cho TV (Mac làm gateway).
//
// pf trên Mac redirect mọi kết nối TCP 443 của TV vào đây; proxy đọc SNI trong
// ClientHello rồi nối tới đích qua socks của relay tương ứng:
//   *.tv360.vn  -> 127.0.0.1:1083 (node-3)
//   còn lại     -> 127.0.0.1:1081 (node-2)
// Nhờ vậy app nào bỏ qua http_proxy (player TV360, ExoPlayer…) cũng bị đưa qua VN.
package main

import (
	"encoding/binary"
	"flag"
	"io"
	"log"
	"net"
	"strings"
	"time"
)

var (
	listen = flag.String("listen", "127.0.0.1:18090", "địa chỉ lắng nghe")
	socksDefault = flag.String("socks", "127.0.0.1:1081", "socks cho mọi host")
	socksTV360   = flag.String("socks-tv360", "127.0.0.1:1083", "socks riêng cho *.tv360.vn")
)

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	flag.Parse()
	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}
	log.Printf("sni-proxy nghe %s (tv360 -> %s, khac -> %s)", *listen, *socksTV360, *socksDefault)
	for {
		c, err := ln.Accept()
		if err != nil {
			log.Printf("accept: %v", err)
			continue
		}
		go handle(c)
	}
}

func handle(client net.Conn) {
	defer client.Close()
	client.SetReadDeadline(time.Now().Add(15 * time.Second))
	head := make([]byte, 4096)
	n, err := io.ReadAtLeast(client, head, 5)
	if err != nil {
		return
	}
	head = head[:n]
	need := clientHelloLen(head)
	if need > n {
		buf := make([]byte, need-n)
		m, err := io.ReadFull(client, buf)
		if err != nil {
			return
		}
		head = append(head, buf[:m]...)
	}
	sni := parseSNI(head)
	if sni == "" {
		log.Printf("khong doc duoc SNI tu %s (len=%d first=% x)", client.RemoteAddr(), len(head), head[:min(16, len(head))])
		return
	}
	socks := *socksDefault
	if strings.HasSuffix(sni, ".tv360.vn") || sni == "tv360.vn" {
		socks = *socksTV360
	}
	up, err := dialSocks(socks, sni, 443)
	if err != nil {
		log.Printf("dial %s (%s) loi: %v", sni, socks, err)
		return
	}
	defer up.Close()
	client.SetReadDeadline(time.Time{})
	if _, err := up.Write(head); err != nil {
		return
	}
	go io.Copy(up, client)
	io.Copy(client, up)
}

// tổng chiều dài bản ghi TLS đầu tiên (header 5 byte)
func clientHelloLen(b []byte) int {
	if len(b) < 5 || b[0] != 0x16 {
		return len(b)
	}
	return 5 + int(binary.BigEndian.Uint16(b[3:5]))
}

// parseSNI lấy server_name trong ClientHello (TLS 1.2/1.3).
func parseSNI(b []byte) string {
	if len(b) < 45 || b[0] != 0x16 {
		return ""
	}
	// bỏ record header (5) + handshake header (4) + version(2) + random(32)
	p := 5 + 4 + 2 + 32
	if p >= len(b) {
		return ""
	}
	// session id
	if p >= len(b) {
		return ""
	}
	sid := int(b[p])
	p += 1 + sid
	if p+2 > len(b) {
		return ""
	}
	// cipher suites: 2 byte độ dài + dữ liệu
	csLen := int(binary.BigEndian.Uint16(b[p : p+2]))
	p += 2 + csLen
	if p >= len(b) {
		return ""
	}
	// compression methods
	comp := int(b[p])
	p += 1 + comp
	if p+2 > len(b) {
		return ""
	}
	extLen := int(binary.BigEndian.Uint16(b[p : p+2]))
	p += 2
	end := p + extLen
	if end > len(b) {
		end = len(b)
	}
	for p+4 <= end {
		typ := binary.BigEndian.Uint16(b[p : p+2])
		l := int(binary.BigEndian.Uint16(b[p+2 : p+4]))
		p += 4
		if p+l > end {
			return ""
		}
		if typ == 0x0000 { // server_name
			q := p + 2 // skip list length
			for q+3 <= p+l {
				nt := b[q]
				nl := int(binary.BigEndian.Uint16(b[q+1 : q+3]))
				q += 3
				if q+nl > p+l {
					return ""
				}
				if nt == 0 {
					return string(b[q : q+nl])
				}
				q += nl
			}
			return ""
		}
		p += l
	}
	return ""
}

// dialSocks nối tới host:port qua SOCKS5 (hostname để exit node tự resolve DNS).
func dialSocks(socksAddr, host string, port int) (net.Conn, error) {
	c, err := net.DialTimeout("tcp", socksAddr, 5*time.Second)
	if err != nil {
		return nil, err
	}
	req := []byte{0x05, 0x01, 0x00}
	if _, err := c.Write(req); err != nil {
		c.Close()
		return nil, err
	}
	resp := make([]byte, 2)
	if _, err := io.ReadFull(c, resp); err != nil || resp[1] != 0x00 {
		c.Close()
		return nil, io.ErrUnexpectedEOF
	}
	buf := []byte{0x05, 0x01, 0x00, 0x03, byte(len(host))}
	buf = append(buf, []byte(host)...)
	buf = append(buf, byte(port>>8), byte(port))
	if _, err := c.Write(buf); err != nil {
		c.Close()
		return nil, err
	}
	rep := make([]byte, 10)
	if _, err := io.ReadFull(c, rep); err != nil || rep[1] != 0x00 {
		c.Close()
		return nil, io.ErrUnexpectedEOF
	}
	return c, nil
}
