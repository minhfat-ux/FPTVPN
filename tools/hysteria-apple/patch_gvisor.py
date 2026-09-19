#!/usr/bin/env python3
"""Cho hysteria dùng stack gVisor khi TUN là fd có sẵn (macOS/iOS/Android).

Vì sao: `app/internal/tun/server.go` gọi `tun.NewSystem(...)` — stack `System` của
sing-tun kết thúc TCP bằng cách NAT gói về `inet4Address` trong subnet utun
(`100.100.100.102`) rồi tự đẩy gói trở lại TUN (`stack_system.go:processIPv4TCP`), để
kernel nói chuyện với một listener nằm TRONG chính extension. Trên macOS, utun của
NetworkExtension không chở gói (đo 19/09/2026: `netstat -ibn` cho `ipkts=0 opkts=0`
`oerrs≈+440k`, xem `HysteriaTransport.resolveTunnelFD`) nên vòng đó không khép kín:
log của extension có hàng nghìn gói `TCP 100.100.100.102→100.100.100.101 [SYN]` mà
KHÔNG có gói nào quay về `.102` ⇒ mọi kết nối TCP của máy treo `SYN_SENT`, trong khi
ICMP/UDP (làm hoàn toàn trong userspace) vẫn chạy.

gVisor kết thúc TCP ngay trong userspace (`stack_gvisor.go` của sagernet/sing-tun) nên
không cần kernel/utun chở gói. Việc đưa gVisor vào module sing-tun do
`tools/hysteria-apple/prepare_sing_tun.py` làm; script này chỉ đổi chỗ chọn stack.

Script sửa 2 file trong checkout hysteria (chạy SAU `patch_tun_fd.py`, và sau khi
`build.sh` đã copy `mobile.go`):

  app/internal/tun/server.go   thêm `StopCh`/`RequireGVisor`, chọn `NewGVisor` khi
                               `tun.WithGVisor` (build tag `with_gvisor`), và chờ
                               `StopCh` vì stack gVisor không có `Run()`.
  app/mobile/mobile.go         `StopCh: ch` + `RequireGVisor: true` (bản Apple).

Chạy: patch_gvisor.py [--src <gốc repo hysteria>]   (mặc định $HYSTERIA_SRC hoặc ./)
"""
import argparse
import os
import sys

SERVER_FIELDS_ANCHOR = """	// Android: pre-created TUN fd from VpnService (0 = create the interface by name)
	FileDescriptor int
"""
SERVER_FIELDS_NEW = """	// Android: pre-created TUN fd from VpnService (0 = create the interface by name)
	FileDescriptor int
	// StopCh: stack gVisor không có vòng đọc TUN riêng để chờ (`Run()`), nên `Serve()`
	// bắt đầu stack rồi chờ kênh này (nil = chờ mãi); `mobile.Stop()` đóng nó.
	StopCh chan struct{}
	// RequireGVisor: thiếu gVisor (framework build thiếu tag `with_gvisor`) thì báo LỖI
	// RÕ, không âm thầm quay về stack System — trên macOS System là TCP blackhole.
	RequireGVisor bool
"""

SERVER_STACK_OLD = """	tunStack, err := tun.NewSystem(tun.StackOptions{
		Context:    context.Background(),
		Tun:        tunIf,
		TunOptions: tunOpts,
		UDPTimeout: s.Timeout,
		Handler:    &tunHandler{s},
		Logger: &singLogger{
			tag:       "tun-stack",
			zapLogger: s.Logger,
		},
		ForwarderBindInterface: true,
		InterfaceFinder:        &interfaceFinder{},
	})
	if err != nil {
		return fmt.Errorf("failed to create tun stack: %w", err)
	}
	defer tunStack.Close()
	return tunStack.(tun.StackRunner).Run()
"""

SERVER_STACK_NEW = """	stackOptions := tun.StackOptions{
		Context:    context.Background(),
		Tun:        tunIf,
		TunOptions: tunOpts,
		UDPTimeout: s.Timeout,
		Handler:    &tunHandler{s},
		Logger: &singLogger{
			tag:       "tun-stack",
			zapLogger: s.Logger,
		},
		ForwarderBindInterface: true,
		InterfaceFinder:        &interfaceFinder{},
	}
	if s.RequireGVisor && !tun.WithGVisor {
		return fmt.Errorf("this build has no gVisor (build with -tags with_gvisor): " +
			"the system stack cannot terminate TCP through a NetworkExtension utun")
	}
	// gVisor khi có (build tag `with_gvisor`, xem tools/hysteria-apple/build.sh): TCP kết
	// thúc trong userspace, không cần kernel/utun chở gói. Không có gVisor thì giữ nguyên
	// đường cũ (desktop/Android) — `System`.
	var tunStack tun.Stack
	if tun.WithGVisor {
		tunStack, err = tun.NewGVisor(stackOptions)
	} else {
		tunStack, err = tun.NewSystem(stackOptions)
	}
	if err != nil {
		return fmt.Errorf("failed to create tun stack: %w", err)
	}
	defer tunStack.Close()
	if tun.WithGVisor {
		// Stack gVisor đọc TUN trong goroutine riêng và `Start()` trả về ngay, nên phải
		// chờ người gọi dừng tunnel (mobile.Stop() đóng StopCh) để `Serve()` giữ nguyên
		// ngữ nghĩa cũ: chạy tới khi tunnel dừng.
		if err := tunStack.Start(); err != nil {
			return fmt.Errorf("failed to start tun stack: %w", err)
		}
		<-s.StopCh
		return nil
	}
	return tunStack.(tun.StackRunner).Run()
"""

MOBILE_ANCHORS = [
    (
        """	srv := &tun.Server{
		HyClient:       c,
""",
        """	ch := make(chan struct{})
	srv := &tun.Server{
		HyClient:       c,
""",
    ),
    (
        """		Inet6Address:   inet6,
	}
	ch := make(chan struct{})
	stopCh = ch
""",
        """		Inet6Address:   inet6,
		// gVisor: Serve() bắt đầu stack rồi chờ kênh này; Stop() đóng nó.
		StopCh: ch,
		// Thiếu gVisor thì báo lỗi rõ (xem patch_gvisor.py) thay vì quay về stack System.
		RequireGVisor: true,
	}
	stopCh = ch
""",
    ),
]


def patch(path, pairs, marker):
    if not os.path.exists(path):
        raise SystemExit(f"không thấy {path}")
    text = open(path, "r", encoding="utf-8").read()
    if marker in text:
        print(f"   đã patch rồi: {path}")
        return
    for old, new in pairs:
        if old not in text:
            raise SystemExit(f"anchor không khớp trong {path}:\n{old}")
        if text.count(old) != 1:
            raise SystemExit(f"anchor xuất hiện {text.count(old)} lần trong {path}")
        text = text.replace(old, new, 1)
    open(path, "w", encoding="utf-8").write(text)
    print(f"   patched {path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default=os.environ.get("HYSTERIA_SRC", "."))
    args = parser.parse_args()

    server = os.path.join(args.src, "app/internal/tun/server.go")
    mobile = os.path.join(args.src, "app/mobile/mobile.go")

    patch(
        server,
        [
            (SERVER_FIELDS_ANCHOR, SERVER_FIELDS_NEW),
            (SERVER_STACK_OLD, SERVER_STACK_NEW),
        ],
        "gVisor khi có (build tag `with_gvisor`",
    )
    patch(mobile, MOBILE_ANCHORS, "gVisor: Serve() bắt đầu stack")
    return 0


if __name__ == "__main__":
    sys.exit(main())
