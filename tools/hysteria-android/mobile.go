// Package mobile is the gomobile entry point used by the Android app
// (com.privatevpn.app). It runs the hysteria2 client on a TUN fd handed over by
// the app's VpnService and, crucially, uses TRANSPORT SOCKETS CREATED IN JAVA so
// they can be protect()ed from the VPN tunnel (otherwise the tunnel's own
// packets loop back into the dead tunnel — the classic "connected but no
// internet" bug).
package mobile

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/netip"
	"os"
	"sync"
	"time"

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
		mu.Unlock()
		_ = c.Close()
		return fmt.Errorf("hysteria client already running")
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

// Serve starts forwarding the (already connected) client through the Android
// VpnService TUN fd. It BLOCKS until the tunnel stops (Stop() or an error).
// Establish the VpnService only AFTER Connect() succeeded.
func Serve(fd int, mtu int, tunIpv4, tunIpv6 string) error {
	mu.Lock()
	c := active
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
func Stop() {
	mu.Lock()
	defer mu.Unlock()
	stopped = true
	if stopCh != nil {
		close(stopCh)
		stopCh = nil
	}
}
