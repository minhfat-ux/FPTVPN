#!/usr/bin/env python3
"""Cho phép hysteria dùng TUN fd có sẵn của Android VpnService.

Thêm field `FileDescriptor` vào `tun.Server` và truyền nó vào tun.Options của
sing-tun (apernet fork đã có sẵn Options.FileDescriptor).
Chạy từ thư mục gốc của repo hysteria.
"""
import sys

PATH = "app/internal/tun/server.go"
s = open(PATH).read()

if "FileDescriptor int" in s:
    print("already patched")
    sys.exit(0)

old_struct = """	IfName  string
	MTU     uint32
	Timeout int64 // in seconds, also applied to TCP in system stack
"""
new_struct = """	IfName  string
	MTU     uint32
	Timeout int64 // in seconds, also applied to TCP in system stack
	// Android: pre-created TUN fd from VpnService (0 = create the interface by name)
	FileDescriptor int
"""
assert old_struct in s, "Server struct anchor not found"
s = s.replace(old_struct, new_struct, 1)

old_opts = """		MTU:                      s.MTU,
"""
new_opts = """		MTU:                      s.MTU,
		FileDescriptor:           s.FileDescriptor,
"""
assert old_opts in s, "tunOpts anchor not found"
s = s.replace(old_opts, new_opts, 1)

open(PATH, "w").write(s)
print("patched", PATH)
