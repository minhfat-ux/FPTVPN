#!/usr/bin/env python3
"""Cổng nghiệm thu LOG MÁY THẬT cho tunnel iOS (AGENTS.md §7d).

Đọc `relay.log` (lấy bằng `xcrun devicectl device copy from`, xem §7d) và chấm từng
phiên theo bảng ca trong `docs/IOS_TUNNEL_BANDWIDTH_AND_NETWORK_CHANGE.md`.

Vì sao cần script này: bốn lỗi thật đã lọt qua mắt người đọc log —
  * build 25→34: nhịp lấy mẫu 1 s và nhịp tim watchdog CHẾT ở +15 s (deadlock `flowLock`)
    mà log vẫn trông "bình thường" vì cầu `packetFlow↔fd` vẫn in nhịp 5 s;
  * build 33: IPA rỗng credential ⇒ `TUNNEL_START_FAILED`;
  * 25/09/2026 (máy Mac, 19:42–19:43, relay `vn1hy`): tunnel "Connected" nhưng CHIỀU VỀ ĐÓNG
    BĂNG — `Go→packetFlow` đứng nguyên ở 360729 gói/125.639.055 B trong khi máy vẫn gửi gói
    vào tunnel. Cổng cũ không có tiêu chí nào cho MỘT CHIỀU nên vẫn chấm phiên đó ĐẠT;
  * 25/09/2026 19:09:42 (iPad): extension bị iOS GIẾT vì chạm trần bộ nhớ per-process
    (`JetsamEvent-2026-09-25-190942.ips`: `reason=per-process-limit`, `rpages=3202` ≈ 51 MB).
    Log không có dòng `stopTunnel` nào và cổng cũ không đọc crash report ⇒ cũng chấm ĐẠT.
Cả bốn chỉ lộ ra khi ĐẾM theo phiên, nên script đếm thay vì để người đọc.

Dùng:  python3 scripts/ios-log-acceptance.py <relay.log> [--min-seconds 90]
                                                   [--crash-dir <thư mục .ips>]
`--crash-dir`: thư mục crash report của máy thật (lấy bằng
`xcrun devicectl device copy from --domain-type systemCrashLogs`). Có cờ này thì phiên nào bị
Jetsam/crash của `PrivateVPNPacketTunnel` rơi vào khoảng thời gian của nó sẽ là KHÔNG ĐẠT.
Exit 0 = mọi phiên ĐẠT; exit 1 = có phiên KHÔNG ĐẠT (in rõ lý do).
"""
import datetime
import json
import os
import re
import sys

SAMPLER_GRACE_S = 30      # nhịp 10 s có throttle log; cuối phiên lệch quá mức này = nhịp đã chết
HEARTBEAT_MIN_S = 90      # phiên dài hơn mức này PHẢI có ít nhất 1 dòng nhịp tim (60 s/dòng)
SESSION_MIN_S = 20        # phiên ngắn hơn coi như khởi động lại, không chấm
# MỘT CHIỀU: mỗi dòng `bridge:` là một khoảng 5 s. Cần ONEWAY_WINDOWS khoảng liên tiếp mà máy
# gửi ≥ ONEWAY_MIN_OFFER_PKTS gói nhưng `Go→packetFlow` KHÔNG tăng một gói nào mới kết luận.
ONEWAY_MIN_OFFER_PKTS = 20
ONEWAY_WINDOWS = 3
# Nội suy Swift lộ nguyên văn ra log (ca thật `HysteriaPacketTunnelProvider.swift:3515`).
INTERPOLATION_LEAK = re.compile(r"\\\([A-Za-z_][A-Za-z0-9_]*\)")
BRIDGE_SUMMARY = re.compile(
    r"bridge: packetFlow→Go (\d+) gói/(\d+) B.*?Go→packetFlow (\d+) gói/(\d+) B"
)


def ts(line):
    return datetime.datetime.strptime("2026-" + line[:18], "%Y-%m-%d %H:%M:%S.%f")


def sessions(lines):
    idx = [i for i, l in enumerate(lines) if "build: version=" in l]
    if not idx:
        return []
    out = []
    # Phần đầu file TRƯỚC mốc `build:` đầu tiên vẫn là một phiên (file log bị xoay/cắt nên dòng mốc
    # của phiên đó đã mất) — ca thật: log Mac 25/09/2026, phiên 19:42–19:43 (đứt MỘT CHIỀU) đứng
    # trước mọi mốc `build:` nên cổng cũ BỎ QUA nguyên ca. Phiên này chấm với nhãn build `?`.
    if idx[0] > 0:
        out.append(lines[:idx[0]])
    for k, i in enumerate(idx):
        end = idx[k + 1] if k + 1 < len(idx) else len(lines)
        out.append(lines[i:end])
    return out


def oneway_freeze(seg):
    """Chuỗi khoảng `bridge:` liên tiếp mà CHIỀU VỀ không tăng gói nào dù máy vẫn gửi.

    Dấu hiệu ca thật 25/09/2026 (Mac, relay `vn1hy`): `packetFlow→Go` leo đều trong khi
    `Go→packetFlow` đứng yên tuyệt đối ⇒ node/relay vẫn sống (WS mở, handshake xong, watchdog có
    nhịp) nhưng không chở chiều về ⇒ khách thấy "Connected mà không có mạng".
    Bộ đếm TỤT = cầu/nguồn vừa đổi ⇒ xoá chuỗi, không kết luận (tránh báo oan).
    """
    marks = []
    for line in seg:
        m = BRIDGE_SUMMARY.search(line)
        if m:
            marks.append((ts(line), int(m.group(1)), int(m.group(3))))
    streak, first_offer, hit = 0, 0, None
    for (t_prev, to_prev, from_prev), (t_now, to_now, from_now) in zip(marks, marks[1:]):
        if to_now < to_prev or from_now < from_prev:
            streak = 0
            continue
        if from_now > from_prev:          # chiều về CÓ tăng ⇒ đường còn chở
            streak = 0
            continue
        if to_now - to_prev < ONEWAY_MIN_OFFER_PKTS:
            continue                       # khoảng máy gửi ít (idle) ⇒ không kết luận gì
        if streak == 0:
            first_offer = to_prev
        streak += 1
        if streak >= ONEWAY_WINDOWS:
            hit = {
                "at": t_now,
                "windows": streak,
                "offered": to_now - first_offer,
                "fromGo": from_now,
            }
    return hit


def judge(seg, min_seconds=SESSION_MIN_S):
    m = re.search(r"build=(\d+)", seg[0])
    build = m.group(1) if m else "?"
    t0, t1 = ts(seg[0]), ts(seg[-1])
    dur = (t1 - t0).total_seconds()
    samples = [ts(l) for l in seg if "bw: sample" in l]
    beats = [ts(l) for l in seg if "sống-còn: nhịp" in l]
    changes = [l for l in seg if "net đổi giữa phiên" in l]
    rebuilds = [l for l in seg if "đổi mạng ⇒ dựng lại transport" in l]
    rescue = [l for l in seg if "QUYẾT ĐỊNH TỰ GỠ" in l]
    relink = [l for l in seg if "link đã mở lại" in l]
    fails = [l for l in seg if "TUNNEL_START_FAILED" in l or "thiếu khoá" in l]
    drops = [int(x) for x in re.findall(r"droppedNoLink=(\d+)", "\n".join(seg))]
    pend = [int(x) for x in re.findall(r"pendingDropped=(\d+)", "\n".join(seg))]
    closed = [l for l in seg if "wsOpen=false" in l]
    leaks = [l for l in seg if INTERPOLATION_LEAK.search(l)]
    rate = [int(x) for x in re.findall(r"Go→packetFlow \d+ gói/(\d+) B", "\n".join(seg))]
    kbps = 0.0
    if rate and dur > 5:
        kbps = (rate[-1] - rate[0]) * 8 / 1000 / dur

    problems = []
    if dur < min_seconds:
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
    if dur >= HEARTBEAT_MIN_S:
        # Mỗi lần transport được dựng lại (hoặc watchdog bật lại) thì bộ đếm nhịp tim được ĐẶT LẠI
        # ("bật lại watchdog với mốc mới"), nên nhịp kế tiếp chỉ đến sau ~60 s. Chỉ đòi nhịp tim trong
        # khoảng đã trôi qua KỂ TỪ mốc bật lại gần nhất — nếu không sẽ báo oan đúng ca MỘT CHIỀU
        # 25/09/2026 (phiên 19:42–19:43 dựng lại 2 lần nên chưa tới kỳ in nhịp tim).
        restarts = [
            ts(l) for l in seg
            if "bật lại watchdog với mốc mới" in l
            or "sống-còn: bật SUỐT phiên" in l
            or "ĐÃ dựng lại transport" in l
        ]
        beat_from = max(restarts) if restarts else t0
        window = (t1 - beat_from).total_seconds()
        if window >= HEARTBEAT_MIN_S and not [b for b in beats if b >= beat_from]:
            problems.append(
                f"WATCHDOG CÂM: 0 nhịp tim trong {round(window)}s kể từ mốc bật lại gần nhất "
                "(+{}s của phiên) ⇒ nhịp sống-còn không chạy (nhịp 15 s, 1 dòng/4 nhịp)".format(
                    round((beat_from - t0).total_seconds())
                )
            )
    if closed:
        problems.append(f"WS link ĐÓNG {len(closed)} lần (kiểm tra tự phục hồi)")
    freeze = oneway_freeze(seg)
    if freeze:
        problems.append(
            f"CHIỀU VỀ ĐÓNG BĂNG (một chiều): {freeze['windows']} khoảng liên tiếp (mỗi khoảng "
            f"5 s) máy vẫn gửi {freeze['offered']} gói mà `Go→packetFlow` KHÔNG tăng một gói nào "
            f"(tới {freeze['at'].strftime('%H:%M:%S')}, tổng chiều về đứng ở {freeze['fromGo']} "
            "gói) ⇒ node/relay sống nhưng không chở chiều về — khách thấy 'Connected mà không có "
            "mạng'; PHẢI failover đường (RelayFailoverWatch/advanceRelayCandidate)"
        )
    if leaks:
        problems.append(
            "NỘI SUY CHUỖI LỘ RA LOG: " + leaks[0][19:150].strip()
            + r" ⇒ chuỗi Swift thiếu dấu \ nên log mất thông tin (ca thật "
            "HysteriaPacketTunnelProvider.swift:3515)"
        )
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
        "oneway": freeze["windows"] if freeze else 0,
    }
    return build, t0, dur, problems, stats


def crash_reports(dirpath):
    """Mọi `.ips` nhắc tới `PrivateVPNPacketTunnel`: [(lúc nào, mô tả, tên file)].

    Đọc thẳng phần thân JSON chứ không grep: cần `reason`/`rpages` của Jetsam và `exception`
    của crash report. File không parse được thì vẫn báo (không im lặng bỏ qua).
    """
    out = []
    for root, _dirs, files in os.walk(dirpath):
        for name in sorted(files):
            if not name.endswith(".ips"):
                continue
            path = os.path.join(root, name)
            try:
                raw = open(path, errors="replace").read()
            except OSError:
                continue
            if "PrivateVPNPacketTunnel" not in raw:
                continue
            head, _, body = raw.partition("\n")
            when, info = None, "không đọc được phần thân .ips"
            try:
                when = datetime.datetime.strptime(
                    json.loads(head)["timestamp"][:19], "%Y-%m-%d %H:%M:%S"
                )
            except (ValueError, KeyError, TypeError):
                pass
            try:
                report = json.loads(body)
            except ValueError:
                report = {}
            if report.get("bug_type") == "298" or "JetsamEvent" in name:
                for proc in report.get("processes") or []:
                    if proc.get("name") != "PrivateVPNPacketTunnel":
                        continue
                    if proc.get("reason"):
                        info = (
                            "iOS GIẾT EXTENSION (Jetsam): "
                            f"reason={proc.get('reason')} · rpages={proc.get('rpages')} "
                            f"· fds={proc.get('fds')} ⇒ khách mất mạng giữa phiên, log KHÔNG có "
                            "dòng `stopTunnel`"
                        )
                    else:
                        # Jetsam không ghi `reason` cho tiến trình không phải nạn nhân ⇒ không
                        # được khẳng định là bị giết.
                        info = (
                            "Jetsam có mặt extension (KHÔNG rõ bị giết): "
                            f"rpages={proc.get('rpages')}"
                        )
                    break
            else:
                exc = report.get("exception") or {}
                term = report.get("termination") or {}
                info = (
                    f"EXTENSION CRASH: {exc.get('type')} {exc.get('signal')} "
                    f"· {term.get('indicator')}"
                )
            out.append((when, info, name))
    return out


def parse_args(argv):
    log = None
    min_seconds = SESSION_MIN_S
    crash_dir = None
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--min-seconds":
            i += 1
            min_seconds = float(argv[i])
        elif arg == "--crash-dir":
            i += 1
            crash_dir = argv[i]
        elif arg.startswith("--"):
            raise SystemExit(f"tham so la: {arg}")
        elif log is None:
            log = arg
        else:
            raise SystemExit(f"tham so la: {arg}")
        i += 1
    if not log:
        print(__doc__)
        raise SystemExit(2)
    return log, min_seconds, crash_dir


def main():
    log, min_seconds, crash_dir = parse_args(sys.argv[1:])
    lines = open(log, errors="replace").read().splitlines()
    segs = sessions(lines)
    print(f"log: {log} · {len(lines)} dòng · {len(segs)} phiên\n")
    if not segs:
        print("KẾT LUẬN: KHÔNG ĐẠT — log không có dòng `build: version=` nào (không có phiên)")
        return 1

    # Gắn crash/Jetsam vào ĐÚNG phiên chứa thời điểm đó (phiên kết thúc ở dòng `build:` kế tiếp,
    # nên Jetsam xảy ra sau dòng log cuối của phiên vẫn thuộc phiên ấy — extension bị giết thì
    # không còn gì ghi log nữa).
    starts = [ts(s[0]) for s in segs]
    log_end = ts(lines[-1])
    attached = {k: [] for k in range(len(segs))}
    outside = []
    for when, info, name in (crash_reports(crash_dir) if crash_dir else []):
        owner = None
        if when is not None:
            for k, t0 in enumerate(starts):
                end = starts[k + 1] if k + 1 < len(starts) else log_end
                if t0 <= when < end:
                    owner = k
                    break
        (attached[owner] if owner is not None else outside).append((when, info, name))

    bad = 0
    for k, seg in enumerate(segs):
        build, t0, dur, problems, st = judge(seg, min_seconds)
        head = f"build {build:>3s} · {t0.strftime('%m-%d %H:%M:%S')} · {round(dur):4d}s"
        skipped = problems == ["(phiên quá ngắn, bỏ qua)"]
        for when, info, name in attached[k]:
            if skipped:
                problems = []
                skipped = False
            stamp = when.strftime("%m-%d %H:%M:%S") if when else "?"
            problems.append(f"{info} — {name} (lúc {stamp})")
        if skipped:
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
            oneway = f" · một-chiều={st['oneway']}k" if st["oneway"] else ""
            print(
                f"       mẫu={st['sample']} · nhịp-tim={st['beat']} · đổi-mạng={st['change']} "
                f"(dựng lại {st['rebuild']}) · link-mở-lại={st['relink']} · tự-gỡ={st['rescue']} · "
                f"bỏ={st['drop_max']}/treo={st['pending_max']} · tốc độ tb≈{st['kbps']:.0f} kbps"
                f"{oneway}"
            )

    if outside:
        stamps = [w for w, _i, _n in outside if w]
        span = (
            f"{min(stamps):%Y-%m-%d %H:%M} → {max(stamps):%Y-%m-%d %H:%M}"
            if stamps
            else "không rõ mốc"
        )
        killed = sum(1 for _w, i, _n in outside if i.startswith("iOS GIẾT"))
        print(
            f"  (ngoài khoảng log — KHÔNG tính là lỗi phiên: {len(outside)} crash/Jetsam của "
            f"extension, trong đó {killed} ca iOS giết vì bộ nhớ; {span})"
        )

    print()
    if bad:
        print(f"KẾT LUẬN: KHÔNG ĐẠT — {bad}/{len(segs)} phiên có lỗi ở trên")
        return 1
    print(f"KẾT LUẬN: ĐẠT — {len(segs)}/{len(segs)} phiên sạch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
