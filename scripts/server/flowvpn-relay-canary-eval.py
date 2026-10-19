#!/usr/bin/env python3
"""Bộ ĐÁNH GIÁ của `flowvpn-relay-canary`: từ hai mẫu `/healthz` liên tiếp của relay, kết luận
relay có đang **đứt MỘT CHIỀU** hay không.

Tách khỏi phần bash để **test được** (`--selftest`), vì đây là chỗ quyết định restart một dịch vụ
production: sai một chiều là restart oan (đá khách ra khỏi tunnel) hoặc bỏ lọt (khách mất mạng 20 s).

Đầu vào : $1 thư mục chứa `<unit>.json` (mẫu HIỆN TẠI, mỗi relay một tệp)
          $2 thư mục trạng thái (chứa `<unit>.sample` = mẫu TRƯỚC)
          $3 ngưỡng byte chiều LÊN tối thiểu trong cửa sổ
          $4 ngưỡng % chiều VỀ so với chiều LÊN để coi là "bất đối xứng"
Đầu ra  : mỗi dòng TSV `unit<TAB>verdict<TAB>din<TAB>dout<TAB>active<TAB>detail`
Verdict : OK | IDLE | ONE_WAY | SUSPECT | SKIP | FIRST

LUẬT (đã đo thật 20/10/2026):
  - `active == 0` ⇒ IDLE: không có khách thì không phán gì.
  - Bộ đếm TỤT ⇒ SKIP: relay vừa restart, delta âm là rác.
  - `din < ngưỡng` ⇒ IDLE: khách đang rảnh, không đủ dữ kiện (lưu lượng streaming bất đối xứng,
    phía lên chỉ ~30–60 KB/phút nên ngưỡng phải nhỏ).
  - `din >= ngưỡng` và `dout == 0` ⇒ **ONE_WAY**: máy vẫn gửi lên mà chiều về đúng bằng 0. Kể cả
    khi rảnh, QUIC vẫn có ACK/keepalive về ⇒ 0 byte là dấu hiệu rất mạnh.
  - `din >= ngưỡng`, `dout > 0` nhưng `< pct` ⇒ SUSPECT: chỉ ghi log, KHÔNG restart (có thể khách
    đang upload — bất đối xứng hợp lệ).
"""
import json
import os
import sys


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def verdicts(tmp, state_dir, min_up, down_pct):
    rows = []
    for name in sorted(os.listdir(tmp)):
        if not name.endswith(".json"):
            continue
        unit = name[:-5]
        cur = load(os.path.join(tmp, name))
        prev_path = os.path.join(state_dir, unit + ".sample")
        if not isinstance(cur, dict) or "__missing" in cur:
            reason = (cur or {}).get("__missing", "doc khong hop le")
            rows.append((unit, "SKIP", 0, 0, 0, reason))
            continue
        prev = load(prev_path)
        try:
            with open(prev_path, "w", encoding="utf-8") as f:
                json.dump(cur, f)
        except Exception:
            pass
        active = int(cur.get("active") or 0)
        if prev is None:
            rows.append((unit, "FIRST", 0, 0, active, "chua co moc truoc"))
            continue
        din = int(cur.get("bytesIn") or 0) - int(prev.get("bytesIn") or 0)
        dout = int(cur.get("bytesOut") or 0) - int(prev.get("bytesOut") or 0)
        ddrop = int(cur.get("dropped") or 0) - int(prev.get("dropped") or 0)
        if din < 0 or dout < 0:
            rows.append((unit, "SKIP", din, dout, active, "bo dem tut (relay vua restart)"))
            continue
        if active <= 0:
            rows.append((unit, "IDLE", din, dout, active, "khong co client"))
            continue
        if din < min_up:
            rows.append((unit, "IDLE", din, dout, active, f"chieu len qua it ({din}B)"))
            continue
        if dout == 0:
            rows.append((unit, "ONE_WAY", din, dout, active, f"ve=0 dropped+{ddrop}"))
            continue
        ratio = dout * 100.0 / din
        if dout * 100 < din * down_pct:
            rows.append((unit, "SUSPECT", din, dout, active,
                         f"down/up={ratio:.2f}% dropped+{ddrop}"))
        else:
            rows.append((unit, "OK", din, dout, active, f"down/up={ratio:.2f}%"))
    return rows


def selftest():
    import shutil
    import tempfile

    base = tempfile.mkdtemp(prefix="canary-eval-")
    tmp = os.path.join(base, "tmp")
    state = os.path.join(base, "state")
    os.makedirs(tmp)
    os.makedirs(state)

    def put(unit, active, din_total, dout_total, prev_in=0, prev_out=0):
        """Ghi mẫu TRƯỚC (nếu có) và mẫu HIỆN TẠI."""
        if prev_in or prev_out:
            with open(os.path.join(state, unit + ".sample"), "w", encoding="utf-8") as f:
                json.dump({"active": active, "bytesIn": prev_in, "bytesOut": prev_out,
                           "dropped": 0}, f)
        with open(os.path.join(tmp, unit + ".json"), "w", encoding="utf-8") as f:
            json.dump({"active": active, "bytesIn": din_total, "bytesOut": dout_total,
                       "dropped": 0}, f)

    fails = 0

    total = 0

    def check(got, want, label):
        nonlocal fails, total
        total += 1
        ok = got == want
        print(("  PASS  " if ok else "  FAIL  ") + label + f" (got {got}, want {want})")
        if not ok:
            fails += 1

    # 1) Ca THẬT: khách còn kết nối, gửi lên đều, chiều về đúng 0 ⇒ ONE_WAY.
    put("oneway", 2, 200_000, 5_000, prev_in=100_000, prev_out=5_000)
    # 2) Bình thường: chiều về nhiều hơn chiều lên (streaming) ⇒ OK.
    put("okay", 4, 60_000, 240_000, prev_in=20_000, prev_out=180_000)
    # 3) Khách rảnh: vài trăm byte mỗi chiều ⇒ IDLE (không phán).
    put("idle", 5, 1_900, 400, prev_in=1_000, prev_out=200)
    # 4) Không có khách (bộ đếm đứng yên) ⇒ IDLE.
    put("noclient", 0, 10_000, 90_000, prev_in=10_000, prev_out=90_000)
    # 5) Upload hợp lệ: lên rất nhiều, về ít nhưng KHÁC 0 ⇒ SUSPECT (không restart).
    put("upload", 1, 10_000_000, 20_001, prev_in=0, prev_out=1)
    # 6) Relay vừa restart: bộ đếm tụt ⇒ SKIP.
    put("reset", 3, 1_000, 900, prev_in=9_000_000, prev_out=8_000_000)

    rows = verdicts(tmp, state, 2048, 1.0)
    got = {r[0]: r[1] for r in rows}
    check(got.get("oneway"), "ONE_WAY", "ve=0 khi con client ⇒ MOT CHIEU (se restart)")
    check(got.get("okay"), "OK", "streaming down>up ⇒ OK")
    check(got.get("idle"), "IDLE", "luu luong rai rac ⇒ IDLE (khong bao oan)")
    check(got.get("noclient"), "IDLE", "khong co client ⇒ IDLE")
    check(got.get("upload"), "SUSPECT", "upload bat doi xung nhe ⇒ chi canh bao")
    check(got.get("reset"), "SKIP", "bo dem tut ⇒ SKIP")

    # 7) Mẫu ĐẦU TIÊN (chưa có mốc) ⇒ FIRST, và phải LƯU mốc cho lần sau.
    shutil.rmtree(tmp)
    os.makedirs(tmp)
    put("fresh", 2, 50_000, 80_000)
    rows2 = verdicts(tmp, state, 2048, 1.0)
    check(rows2[0][1], "FIRST", "lan dau chua co moc ⇒ FIRST")
    check(os.path.exists(os.path.join(state, "fresh.sample")), True, "da luu moc cho lan sau")

    shutil.rmtree(base)
    print(f"\nKET QUA: {'DAT' if fails == 0 else 'KHONG DAT'} ({total - fails}/{total} PASS)")
    return 1 if fails else 0


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        sys.exit(selftest())
    if len(sys.argv) < 5:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    tmp, state_dir, min_up, down_pct = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
    for row in verdicts(tmp, state_dir, min_up, down_pct):
        print("\t".join(str(x) for x in row))


if __name__ == "__main__":
    main()
