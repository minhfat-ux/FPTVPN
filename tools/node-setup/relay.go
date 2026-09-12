// hyrelay — TCP <-> UDP relay used by VPNFlow's China transport.
//
// The Android client dials a TCP port (which restrictive networks allow) and
// frames every datagram with a 2-byte big-endian length prefix; this relay
// unwraps those frames into UDP packets towards the local hysteria listener
// (and wraps replies back). Same protocol as the original wgrelay.js, but with
// no Node.js runtime dependency.
//
//	go build -o bin/hyrelay-linux-amd64 relay.go
//
// Usage:
//
//	hyrelay -listen :8443 -target 127.0.0.1:8443
package main

import (
	"encoding/binary"
	"flag"
	"io"
	"log"
	"net"
	"sync"
	"time"
)

func main() {
	listen := flag.String("listen", ":9445", "TCP listen address")
	target := flag.String("target", "127.0.0.1:8443", "UDP target address")
	flag.Parse()

	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatalf("listen %s: %v", *listen, err)
	}
	log.Printf("hyrelay: TCP %s <-> UDP %s", *listen, *target)

	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Printf("accept: %v", err)
			continue
		}
		go handle(conn, *target)
	}
}

func handle(tcp net.Conn, target string) {
	defer tcp.Close()
	udp, err := net.Dial("udp", target)
	if err != nil {
		log.Printf("udp dial %s: %v", target, err)
		return
	}
	defer udp.Close()

	var wg sync.WaitGroup
	wg.Add(2)

	// TCP -> UDP: read length-prefixed frames and forward each as one datagram.
	go func() {
		defer wg.Done()
		defer udp.Close()
		var hdr [2]byte
		buf := make([]byte, 65535)
		for {
			if _, err := io.ReadFull(tcp, hdr[:]); err != nil {
				return
			}
			n := int(binary.BigEndian.Uint16(hdr[:]))
			if n == 0 || n > len(buf) {
				return
			}
			if _, err := io.ReadFull(tcp, buf[:n]); err != nil {
				return
			}
			if _, err := udp.Write(buf[:n]); err != nil {
				return
			}
		}
	}()

	// UDP -> TCP: wrap each reply datagram in a frame.
	go func() {
		defer wg.Done()
		defer tcp.Close()
		buf := make([]byte, 65535)
		for {
			_ = udp.SetReadDeadline(time.Now().Add(5 * time.Minute))
			n, err := udp.Read(buf)
			if err != nil {
				return
			}
			var hdr [2]byte
			binary.BigEndian.PutUint16(hdr[:], uint16(n))
			if _, err := tcp.Write(hdr[:]); err != nil {
				return
			}
			if _, err := tcp.Write(buf[:n]); err != nil {
				return
			}
		}
	}()

	wg.Wait()
}
