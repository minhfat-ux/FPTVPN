#!/usr/bin/env python3
"""Soát cách control-plane đang đếm "thiết bị đã đăng ký" (bus #584, T-20260929-03).

Chạy trên node-2 (đọc /root/flowvpn-cp/data). Chỉ ĐỌC, không sửa dữ liệu.
Dùng: python3 device-count-audit.py [DATA_DIR]
"""
import json
import collections
import sys

DATA = sys.argv[1] if len(sys.argv) > 1 else "/root/flowvpn-cp/data"


def load(name, default):
    try:
        with open(f"{DATA}/{name}", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:  # noqa: BLE001
        print(f"  ! không đọc được {name}: {exc}")
        return default


devices = load("devices.json", [])
auth = load("auth.json", {})
ios = load("ios-devices.json", {})

print("=" * 72)
print(f"DATA = {DATA}")
print("=" * 72)

users = auth.get("users", []) or []
revoked_users = {u["id"] for u in users if u.get("revokedAt")}
email_by_id = {u["id"]: u.get("email") for u in users}

print(f"\n[1] devices.json — {len(devices)} BẢN GHI thô")
print(f"    distinct id          : {len({d.get('id') for d in devices})}")
print(f"    distinct publicKey   : {len({d.get('publicKey') for d in devices})}")
print(f"    distinct deviceName  : {len({d.get('deviceName') for d in devices})}")
print(f"    có userId (real)     : {sum(1 for d in devices if d.get('userId'))}")
print(f"    KHÔNG có userId      : {sum(1 for d in devices if not d.get('userId'))}")
print(f"    active               : {sum(1 for d in devices if d.get('active'))}")
print(f"    revoked (active=False): {sum(1 for d in devices if not d.get('active'))}")
print(f"    userId trỏ user đã revoke: {sum(1 for d in devices if d.get('userId') in revoked_users)}")
print(f"    theo platform        : {dict(collections.Counter(d.get('platform') for d in devices))}")

print("\n    chi tiết:")
for i, d in enumerate(devices):
    uid = d.get("userId") or "-"
    print(
        f"      {i:2d} {str(d.get('id'))[:8]} {str(d.get('deviceName'))[:22]:22s}"
        f" {str(d.get('platform')):8s} user={str(uid)[:8]:8s}"
        f" ({email_by_id.get(uid, '?') or '-'})"
        f" active={str(bool(d.get('active'))):5s}"
        f" created={d.get('createdAt')}"
    )

# Trùng lặp "cùng một máy" theo (userId, deviceName) và trạng thái active.
print("\n[2] Trùng lặp theo (userId, deviceName) — dấu hiệu một máy đăng ký lại")
groups = collections.defaultdict(list)
for d in devices:
    groups[(d.get("userId"), d.get("deviceName"))].append(d)
dups = {k: v for k, v in groups.items() if len(v) > 1}
for (uid, name), rows in sorted(dups.items(), key=lambda kv: -len(kv[1])):
    states = [("active" if r.get("active") else "revoked") for r in rows]
    print(f"    {str(name):22s} user={str(uid)[:8]} n={len(rows)} states={states}")
if not dups:
    print("    (không có)")

# Cùng publicKey xuất hiện nhiều lần.
pk = collections.Counter(d.get("publicKey") for d in devices)
pk_dups = {k: v for k, v in pk.items() if v > 1}
print(f"\n[3] publicKey xuất hiện >1 lần: {len(pk_dups)}")
for k, v in pk_dups.items():
    print(f"    {str(k)[:24]}… × {v}")

# Con số control panel đang hiển thị (đúng như GET /v1/admin/stats).
print("\n[4] Con số dashboard ĐANG hiển thị (theo code hiện tại)")
real = [d for d in devices if d.get("userId")]
print(f"    totals.devices      = devices có userId          = {len(real)}")
print(f"    totals.test_devices = devices KHÔNG có userId    = {len(devices) - len(real)}")
print(f"    totals.active_devices (trong real)               = {sum(1 for d in real if d.get('active'))}")
print(f"    totals.revoked_devices (trong real)              = {sum(1 for d in real if not d.get('active'))}")

# ios-devices.json — danh sách UDID khách gửi qua hồ sơ.
ios_devs = ios.get("devices", []) if isinstance(ios, dict) else []
print(f"\n[5] ios-devices.json — {len(ios_devs)} bản ghi UDID")
print(f"    distinct udid  : {len({d.get('udid') for d in ios_devs})}")
print(f"    built          : {sum(1 for d in ios_devs if d.get('built'))}")
print(f"    built=True kể cả đã gỡ/hết hạn: xem cột built")
for d in ios_devs:
    print(
        f"      udid={str(d.get('udid')):26s} model={str(d.get('model'))[:24]:24s}"
        f" built={str(bool(d.get('built'))):5s} registeredAt={d.get('registeredAt')}"
    )

# Tài khoản thật & thiết bị theo từng account.
print(f"\n[6] users thật: {len(users)} (revoked {len(revoked_users)})")
by_user = collections.Counter(d.get("userId") for d in real)
for uid, n in by_user.most_common():
    active = sum(1 for d in devices if d.get("userId") == uid and d.get("active"))
    print(f"    {str(email_by_id.get(uid, uid))[:34]:34s} tổng={n} active={active}")
