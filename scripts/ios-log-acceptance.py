#!/usr/bin/env python3
"""Cổng nghiệm thu LOG MÁY THẬT cho tunnel iOS (AGENTS.md §7d).

Đọc `relay.log` (lấy bằng `xcrun devicectl device copy from`, xem §7d) và chấm từng
phiên theo bảng 6 ca trong `docs/IOS_TUNNEL_BANDWIDTH_AND_NETWORK_CHANGE.md`.

Vì sao cần script này: hai lỗi thật đã lọt qua mắt người đọc log —
  * build 25→34: nhịp lấy mẫu 1 s và nhịp tim watchdog CHẾT ở +15 s (deadlock `flowLock`)
    mà log vẫn trông "bình thường" vì cầu `packetFlow↔fd` vẫn in nhịp 5 s;
  * build 33: IPA rỗng credential ⇒ `TUNNEL_START_FAILED`.
Cả hai chỉ lộ ra khi ĐẾM theo phiên, nên script đếm thay vì để người đọc.

Dùng:  python3 scripts/ios-log-acceptance.py <relay.log> [--min-seconds 90]
Exit 0 = mọi phiên ĐẠT; exit 1 = có phiên KHÔNG ĐẠT (in rõ lý do).
"""
import datetime
import re
import sys

SAMPLER_GRACE_S = 30      # nhịp 10 s có throttle log; cuối phiên lệch quá mức này = nhịp đã chết
HEARTBEAT_MIN_S = 90      # phiên dài hơn mức này PHẢI có ít nhất 1 dòng nhịp tim (60 s/dòng)
SESSION_MIN_S = 20        # phiên ngắn hơn coi như khởi động lại, không chấm


def ts(line):
    return datetime.datetime.strptime("2026-" + line[:18], "%Y-%m-%d %H:%M:%S.%f")


def sessions(lines):
    idx = [i for i, l in enumerate(lines) if "build: version=" in l]
    out = []
    for k, i in enumerate(idx):
        end = idx[k + 1] if k + 1 < len(idx) else len(lines)
        out.append(lines[i:end])
    return out


def judge(seg):
    m = re.search(r"build=(\d+)", seg[0])
    build = m.group(1) if m else "?"
    t0, t1 = ts(seg[0]), ts(seg[-1])
    dur = (t1 - t0).total_seconds()
    samples = [ts(l) for l in seg if "bw: sample" in l]
    beats = [l for l in seg if "sống-còn: nhịp" in l]
    changes = [l for l in seg if "net đổi giữa phiên" in l]
    rebuilds = [l for l in seg if "đổi mạng ⇒ dựng lại transport" in l]
    rescue = [l for l in seg if "QUYẾT ĐỊNH TỰ GỠ" in l]
    relink = [l for l in seg if "link đã mở lại" in l]
    fails = [l for l in seg if "TUNNEL_START_FAILED" in l or "thiếu khoá" in l]
    drops = [int(x) for x in re.findall(r"droppedNoLink=(\d+)", "\n".join(seg))]
    pend = [int(x) for x in re.findall(r"pendingDropped=(\d+)", "\n".join(seg))]
    closed = [l for l in seg if "wsOpen=false" in l]
    rate = [int(x) for x in re.findall(r"Go→packetFlow \d+ gói/(\d+) B", "\n".join(seg))]
    kbps = 0.0
    if rate and dur > 5:
        kbps = (rate[-1] - rate[0]) * 8 / 1000 / dur

    problems = []
    if dur < SESSION_MIN_S:
        return build, t0, dur, ["(phiên quá ngắn, bỏ qua)"], {}
    if fails:
        problems.append("KHỞI ĐỘNG HỎNG: " + fails[0][20:110])
    if not samples:
        problems.append("KHÔNG có mẫu `bw: sample` nào ⇒ nhịp lấy mẫu chưa từng chạy")
    else:
        silent = (t1 - samples[-1]).total_seconds()
        if silent > SAMPLER_GRACE_S:
            problems.append(
                f"NHỊP LẤY MẪU CHẾT: mẫu cuối ở +{round((samples[-1]-t0).total_seconds())}s "
                f"rồi im {round(silent)}s tới hết phiên ({len(samples)} mẫu) "
                "⇒ thẻ Diagnostics đứng im, KHÔNG ramp, KHÔNG dò được đổi mạng"
            )
    if dur >= HEARTBEAT_MIN_S and not beats:
        problems.append(
            f"WATCHDOG CÂM: 0 nhịp tim trong {round(dur)}s ⇒ nhịp sống-còn không chạy "
            "(nhịp 15 s, 1 dòng/4 nhịp)"
        )
    if closed:
        problems.append(f"WS link ĐÓNG {len(closed)} lần (kiểm tra tự phục hồi)")
    # DẤU HIỆU ĐÔNG CỨNG (ca thật 25/09/2026 09:34, build 35): phiên kết thúc NGAY SAU dòng
    # "tự phục hồi: lần N — chờ Xs rồi dựng lại" mà KHÔNG có dòng "ĐÃ dựng lại transport"/"transport
    # mới đã lên" theo sau ⇒ tiến trình bị kẹt trong đường dựng lại (log câm vĩnh viễn, extension
    # vẫn sống ⇒ khách thấy "Connected mà không có internet" tới khi khởi động lại máy).
    lastAttempt = max((i for i, l in enumerate(seg) if "tự phục hồi: lần" in l), default=-1)
    lastDone = max((i for i, l in enumerate(seg)
                    if "ĐÃ dựng lại transport" in l or "transport mới đã lên" in l), default=-1)
    if lastAttempt > lastDone:
        problems.append(
            "PHIÊN DỪNG GIỮA LÚC DỰNG LẠI TRANSPORT (có 'tự phục hồi: lần … chờ Xs rồi dựng lại' "
            "mà KHÔNG có 'ĐÃ dựng lại transport' theo sau) ⇒ nghi ĐÔNG CỨNG: extension còn sống "
            "nhưng mọi nhịp câm"
        )
    stats = {
        "sample": len(samples),
        "beat": len(beats),
        "change": len(changes),
        "rebuild": len(rebuilds),
        "rescue": len(rescue),
        "relink": len(relink),
        "drop_max": max(drops) if drops else 0,
        "pending_max": max(pend) if pend else 0,
        "kbps": kbps,
    }
    return build, t0, dur, problems, stats


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    lines = open(sys.argv[1], errors="replace").read().splitlines()
    segs = sessions(lines)
    print(f"log: {sys.argv[1]} · {len(lines)} dòng · {len(segs)} phiên\n")
    bad = 0
    for seg in segs:
        build, t0, dur, problems, st = judge(seg)
        head = f"build {build:>3s} · {t0.strftime('%m-%d %H:%M:%S')} · {round(dur):4d}s"
        if problems == ["(phiên quá ngắn, bỏ qua)"]:
            print(f"  {head} · bỏ qua")
            continue
        if problems:
            bad += 1
            print(f"  ❌ {head}")
            for p in problems:
                print(f"       - {p}")
        else:
            print(f"  ✅ {head}")
        if st:
            print(
                f"       mẫu={st['sample']} · nhịp-tim={st['beat']} · đổi-mạng={st['change']} "
                f"(dựng lại {st['rebuild']}) · link-mở-lại={st['relink']} · tự-gỡ={st['rescue']} · "
                f"bỏ={st['drop_max']}/treo={st['pending_max']} · tốc độ tb≈{st['kbps']:.0f} kbps"
            )
    print()
    if bad:
        print(f"KẾT LUẬN: KHÔNG ĐẠT — {bad}/{len(segs)} phiên có lỗi ở trên")
        return 1
    print(f"KẾT LUẬN: ĐẠT — {len(segs)}/{len(segs)} phiên sạch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
