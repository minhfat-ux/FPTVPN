#!/usr/bin/env python3
"""Đo thông lượng thật của đường tunnel từ log counter của app.

Đọc log của iOS (`Documents/relay.log`) hoặc Android (`diagnostics.log`) và in
thông lượng từng khoảng 15s, kèm trung bình và đỉnh.

Vì sao cần: đọc số counter thô (udpBytes/bytesFromRelay) rất dễ kết luận sai —
"8 MB" không cho biết là 8 MB trong 20 giây hay trong 3 tiếng. Muốn biết đường
có nhanh lên sau khi đổi relay hay không thì phải so hai lần đo cùng cách.

Dùng:
    python3 scripts/measure-relay-throughput.py <log> [--from HH:MM:SS] [--to HH:MM:SS]
"""
import re
import sys

# iOS: "ws-relay: heartbeat udpFrames=.. udpBytes=.. framesFromRelay=.. bytesFromRelay=.."
# Android: cùng tên nhưng có thể ở dòng "probe#N ..."
ROW = re.compile(
    r'(\d\d:\d\d:\d\d)\.\d+.*?(?:ws-relay: heartbeat )?'
    r'udpFrames=(\d+) udpBytes=(\d+) framesFromRelay=(\d+) bytesFromRelay=(\d+)'
)


def load(path, start=None, end=None):
    rows = []
    for line in open(path, encoding="utf-8", errors="replace"):
        m = ROW.search(line)
        if not m:
            continue
        t = m.group(1)
        if start and t < start:
            continue
        if end and t > end:
            continue
        h, mi, s = (int(x) for x in t.split(":"))
        rows.append((h * 3600 + mi * 60 + s, int(m.group(2)), int(m.group(3)),
                     int(m.group(4)), int(m.group(5))))
    return rows


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    path = sys.argv[1]
    start = end = None
    if "--from" in sys.argv:
        start = sys.argv[sys.argv.index("--from") + 1]
    if "--to" in sys.argv:
        end = sys.argv[sys.argv.index("--to") + 1]

    rows = load(path, start, end)
    if len(rows) < 2:
        print(f"không đủ dữ liệu trong {path}")
        return 1

    print(f"{'thời điểm':>9} {'xuống kB/s':>11} {'lên kB/s':>9} {'msg/s xuống':>12}")
    peak = avg_sum = avg_t = 0
    for a, b in zip(rows, rows[1:]):
        dt = b[0] - a[0]
        if dt <= 0:
            continue
        down = (b[4] - a[4]) / dt / 1024
        up = (b[2] - a[2]) / dt / 1024
        msgs = (b[3] - a[3]) / dt
        peak = max(peak, down)
        avg_sum += b[4] - a[4]
        avg_t += dt
        t = f"{b[0] // 3600:02d}:{(b[0] % 3600) // 60:02d}:{b[0] % 60:02d}"
        print(f"{t:>9} {down:11.1f} {up:9.1f} {msgs:12.1f}")

    print()
    print(f"cả khoảng   : xuống {avg_sum / avg_t / 1024:6.1f} kB/s = "
          f"{avg_sum * 8 / avg_t / 1000:5.0f} kbps")
    print(f"đỉnh 1 khoảng: xuống {peak:6.1f} kB/s = {peak * 8:5.0f} kbps")
    print(f"tổng        : xuống {rows[-1][4] / 1048576:.2f} MB / "
          f"lên {rows[-1][2] / 1048576:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
