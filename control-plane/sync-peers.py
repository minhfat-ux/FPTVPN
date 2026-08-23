#!/usr/bin/env python3
"""Đồng bộ devices (devices.json) lên tất cả WireGuard node.
Chạy định kỳ trên main control plane."""
import json, subprocess

DEVICES = "/root/flowvpn-cp/data/devices.json"
NODES = [
    ("vietnam-1", None),                 # local wg0
    ("vietnam-2", "root@103.6.234.233"), # remote qua SSH
]

def wg(args, target):
    if target:
        cmd = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
               target, " ".join(["wg"] + args)]
    else:
        cmd = ["wg"] + args
    return subprocess.run(cmd, capture_output=True)

def main():
    devices = json.load(open(DEVICES))
    active = [d for d in devices if d.get("active", True)]
    revoked = [d for d in devices if not d.get("active", True)]
    for name, target in NODES:
        ok = fail = 0
        for d in active:
            pk, ip = d.get("publicKey"), d.get("assignedIP")
            if not pk or not ip:
                continue
            r = wg(["set", "wg0", "peer", pk, "allowed-ips", f"{ip}/32"], target)
            if r.returncode == 0:
                ok += 1
            else:
                fail += 1
        for d in revoked:
            pk = d.get("publicKey")
            if not pk:
                continue
            wg(["set", "wg0", "peer", pk, "remove"], target)
        print(f"[{name}] synced {ok} peers, {fail} fail (devices={len(active)}, revoked={len(revoked)})", flush=True)

main()
