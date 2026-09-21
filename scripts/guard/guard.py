#!/usr/bin/env python3
"""flowvpn-guard — agent tự động trên server (node-2).

Nhiệm vụ (chủ dự án chốt 21/09/2026):
  1. Phát hiện KHÁCH MỚI ĐĂNG KÝ nhưng CHƯA TẢI hoặc CHƯA CHẠY ĐƯỢC:
       - `never_installed`: đã có tài khoản + gói, nhưng CHƯA có device nào ⇒ app chưa từng chạy.
       - `never_connected`: app đã đăng ký device nhưng `lastSeenAt` rỗng ⇒ chưa từng lên mạng.
     Khách đã từng kết nối thì KHÔNG bao giờ bị gửi (tránh spam).
  2. Tự gửi email hướng dẫn cài KÈM ĐÚNG NỀN TẢNG + ĐÚNG PHIÊN BẢN đang phát (đọc từ app_config.db).
  3. Phát hiện LỖI THEO MẪU (nhiều khách cùng nền tảng bị tắc trong cửa sổ thời gian) → tạo TASK
     giao cho agent phụ trách (mac/windows/server) + alert Telegram, và CHỜ chủ dự án approve.
  4. Task chỉ được thực thi sau khi approve (`/approve <id>` trên Telegram). Sau khi fix + publish,
     guard verify lại bề mặt công khai rồi báo khách bị ảnh hưởng.

Chạy:
  guard.py --dry-run            # chỉ in ra sẽ làm gì, KHÔNG gửi mail / không ghi state
  guard.py --once               # chạy 1 vòng thật
  guard.py --status             # trạng thái + task đang chờ
  guard.py --loop               # vòng lặp (systemd dùng cái này)
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

DATA = "/root/flowvpn-cp/data"
STATE_DIR = os.environ.get("GUARD_STATE_DIR", "/var/lib/flowvpn-guard")
# Task ghi vao BOARD CHUNG cua cac agent, để `flowvpn-coord task list` (mọi máy) đọc được.
TASKS_DIR = os.environ.get("GUARD_TASKS_DIR", "/var/lib/flowvpn-coord/tasks")
STATE_FILE = f"{STATE_DIR}/state.json"
AUDIT_FILE = f"{STATE_DIR}/audit.jsonl"
ENV_FILE = "/etc/flowvpn-guard.env"
CP_ENV_DIR = "/etc/systemd/system/flowvpn-cp.service.d"
TG_ENV_FILE = "/etc/flowvpn-tg-bot.env"

# --- chính sách (đổi qua /etc/flowvpn-guard.env) -------------------------------------------
NEW_WINDOW_H = float(os.environ.get("GUARD_NEW_WINDOW_H", 72))      # chỉ quan tâm khách đăng ký trong X giờ
GRACE_MIN = float(os.environ.get("GUARD_GRACE_MIN", 20))            # chờ khách tự làm xong đã
CONNECT_GRACE_MIN = float(os.environ.get("GUARD_CONNECT_GRACE_MIN", 45))
COOLDOWN_H = float(os.environ.get("GUARD_COOLDOWN_H", 48))          # 1 email / khách / giai đoạn / X giờ
MAX_MAILS_PER_USER = int(os.environ.get("GUARD_MAX_MAILS_PER_USER", 3))
QUIET_FROM, QUIET_TO = int(os.environ.get("GUARD_QUIET_FROM", 23)), int(os.environ.get("GUARD_QUIET_TO", 7))
ESCALATE_N = int(os.environ.get("GUARD_ESCALATE_N", 3))             # X khách cùng nền tảng bị tắc → tạo task
ESCALATE_WINDOW_H = float(os.environ.get("GUARD_ESCALATE_WINDOW_H", 24))
POLL_SEC = int(os.environ.get("GUARD_POLL_SEC", 300))
# Chế độ TEST: gửi MỌI email hướng dẫn về địa chỉ này thay vì khách thật (không làm phiền khách).
MAIL_TO_OVERRIDE = os.environ.get("GUARD_MAIL_TO_OVERRIDE", "").strip()

VN_TZ = timezone(timedelta(hours=7))
SKIP_EMAILS = {"test@example.com", "review@meetflowai.site", "support@meetflowai.site",
               "no-reply@meetflowai.site", "minhnb2@me.com", "minhnb2@fpt.com"}
PLATFORM_LABEL = {"ios": "iPhone/iPad", "android": "Android", "macos": "macOS", "windows": "Windows"}


def log(msg: str) -> None:
    print(f"[{datetime.now(VN_TZ).strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def load_env() -> dict:
    """Ghép env của flowvpn-guard + drop-in control-plane (Resend/ALERT_EMAIL) + bot Telegram."""
    env = {}
    for path in (CP_ENV_DIR, ):
        if os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                if name.endswith(".conf"):
                    env.update(parse_env_file(os.path.join(path, name)))
    for path in (TG_ENV_FILE, ENV_FILE):
        if os.path.exists(path):
            env.update(parse_env_file(path))
    env.update({k: v for k, v in os.environ.items() if k.startswith(("GUARD_", "RESEND", "TELEGRAM", "ALERT"))})
    return env


def parse_env_file(path: str) -> dict:
    out = {}
    try:
        for line in open(path, encoding="utf-8", errors="replace"):
            line = line.strip()
            if line.startswith("Environment="):
                line = line[len("Environment="):]
            elif line.startswith("#") or "=" not in line:
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip().strip('"')] = v.strip().strip('"')
    except OSError:
        pass
    return out


# --- dữ liệu thật ---------------------------------------------------------------------------
def read_versions() -> dict:
    """Phiên bản đang phát cho từng nền tảng (nguồn: app_config.db của control-plane)."""
    db = f"{DATA}/app-config.db"
    cfg = {}
    try:
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        cfg = {k: v for k, v in con.execute("select key, value from app_config")}
        con.close()
    except sqlite3.Error as exc:
        log(f"WARN không đọc được app_config.db: {exc}")
    return {
        "ios": {"version": cfg.get("latest_ios_version") or "1.4.0", "build": cfg.get("ios_ipa_build") or ""},
        "android": {"version": cfg.get("android_latest_version") or "1.4.0", "build": ""},
        "macos": {"version": cfg.get("latest_mac_version") or "1.4.0", "build": ""},
        "windows": {"version": cfg.get("windows_latest_version") or "1.4.1", "build": ""},
    }


def load_json(path: str, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return default


def load_state() -> dict:
    return load_json(STATE_FILE, {"users": {}, "tasks": {}})


def save_state(state: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = f"{STATE_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE_FILE)


def audit(entry: dict) -> None:
    os.makedirs(STATE_DIR, exist_ok=True)
    entry = {"ts": datetime.now(timezone.utc).isoformat(timespec="seconds"), **entry}
    with open(AUDIT_FILE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def parse_iso(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def gather_customers() -> dict:
    """Gộp auth.json + devices.json thành hồ sơ từng khách (email → thông tin + device)."""
    auth = load_json(f"{DATA}/auth.json", {}) or {}
    devices = load_json(f"{DATA}/devices.json", []) or []
    if isinstance(devices, dict):
        devices = list(devices.values())
    subs = auth.get("subscriptions") or {}
    if isinstance(subs, dict):
        subs = list(subs.values())
    sub_by_user = {str(s.get("userId")): s for s in subs if isinstance(s, dict)}

    out: dict[str, dict] = {}
    for user in auth.get("users", []):
        if not isinstance(user, dict):
            continue
        email = str(user.get("email", "")).lower()
        uid = str(user.get("id"))
        if not email or email in SKIP_EMAILS or user.get("revokedAt"):
            continue
        sub = sub_by_user.get(uid) or {}
        out[email] = {
            "userId": uid, "email": email, "lang": user.get("lang") or "vi",
            "createdAt": user.get("createdAt"),
            "expiresAt": sub.get("expiresAt") or sub.get("currentPeriodEnd"),
            "devices": [],
        }
    for dev in devices:
        if not isinstance(dev, dict) or not dev.get("userId"):
            continue
        uid = str(dev["userId"])
        for profile in out.values():
            if profile["userId"] == uid:
                profile["devices"].append({
                    "platform": str(dev.get("platform") or ""),
                    "deviceName": str(dev.get("deviceName") or ""),
                    "createdAt": dev.get("createdAt"),
                    "lastSeenAt": dev.get("lastSeenAt"),
                    "active": dev.get("active"),
                })
                break
    return out


def active_subscription(profile: dict) -> bool:
    """Có gói còn hạn? Không có ngày hết hạn ⇒ coi như còn (trial/đang xử lý)."""
    exp = parse_iso(profile.get("expiresAt"))
    if exp is None:
        return bool(profile.get("devices")) or bool(profile.get("expiresAt"))
    return exp > datetime.now(timezone.utc)


def classify(profile: dict, now: datetime) -> tuple[str, str, str]:
    """Trả (stage, platform_hint, lý do). stage: ok | too_new | never_installed | never_connected | unknown."""
    created = parse_iso(profile.get("createdAt"))
    if created and (now - created) < timedelta(minutes=GRACE_MIN):
        return "too_new", "", f"mới đăng ký {int((now - created).total_seconds() // 60)} phút"
    if created and (now - created) > timedelta(hours=NEW_WINDOW_H):
        return "too_old", "", f"đăng ký đã {int((now - created).total_seconds() // 3600)} giờ"
    if not active_subscription(profile):
        return "no_sub", "", "chưa có gói còn hạn"
    devices = profile.get("devices") or []
    if not devices:
        return "never_installed", "", "có tài khoản + gói nhưng CHƯA có device nào (app chưa từng chạy)"
    seen = [d for d in devices if d.get("lastSeenAt")]
    if not seen:
        oldest = min((parse_iso(d.get("createdAt")) for d in devices if parse_iso(d.get("createdAt"))),
                     default=None)
        if oldest and (now - oldest) < timedelta(minutes=CONNECT_GRACE_MIN):
            return "too_new", "", "vừa đăng ký device, đang trong thời gian chờ"
        plat = devices[0].get("platform") or ""
        return "never_connected", plat, f"đã đăng ký device trên {PLATFORM_LABEL.get(plat, plat or '?')} nhưng chưa từng kết nối"
    return "ok", "", "đã từng kết nối"


def quiet_now(now: datetime) -> bool:
    hour = now.astimezone(VN_TZ).hour
    return hour >= QUIET_FROM or hour < QUIET_TO


# --- email ---------------------------------------------------------------------------------
def guides(versions: dict) -> dict:
    ios_v = f"{versions['ios']['version']}"
    if versions["ios"].get("build"):
        ios_v += f" ({versions['ios']['build']})"
    return {
        "ios": ("https://t1.meetflowai.site/install/ios", f"VPNFlow {ios_v}"),
        "android": ("https://t1.meetflowai.site/v1/downloads/android", f"VPNFlow {versions['android']['version']} (APK)"),
        "macos": ("https://t1.meetflowai.site/v1/downloads/mac", f"VPNFlow {versions['macos']['version']} (.dmg)"),
        "windows": ("https://t1.meetflowai.site/dl/VPNFlow-Setup-latest.exe", f"VPNFlow {versions['windows']['version']} (.exe)"),
    }


def steps(stage: str, platform: str, versions: dict) -> list[tuple[str, str]]:
    """Các bước cài/kết nối theo nền tảng + phiên bản đang phát. (tên nền tảng, HTML)."""
    g = guides(versions)
    ios_url, ios_ver = g["ios"]
    and_url, and_ver = g["android"]
    mac_url, mac_ver = g["macos"]
    win_url, win_ver = g["windows"]
    out = []
    if platform in ("", "ios"):
        out.append(("iPhone / iPad", f"""
    <li>Mở <b>Safari trên chính máy đó</b> (không dùng Chrome/WeChat) → <a href="{ios_url}">{ios_url}</a></li>
    <li>Bấm <b>Đăng ký thiết bị</b> → máy báo “Hồ sơ đã tải về” → vào <b>Cài đặt → Cài hồ sơ đã tải → Cài</b>.</li>
    <li>Đợi trang báo bản <b>{ios_ver}</b> đã sẵn sàng → bấm <b>Cài đặt VPNFlow</b>.</li>
    <li>Sau khi cài: <b>Cài đặt → Cài đặt chung → VPN &amp; Quản lý thiết bị</b> → bấm <b>VPNFlow AdHoc App</b> → <b>Tin cậy</b>.</li>
    <li>Mở app → đăng nhập email đã mua → <b>Allow</b> khi máy hỏi cấu hình VPN → <b>Connect</b>.</li>
    <li><b>Bản {ios_ver} của shop KHÔNG cần Developer Mode</b> — nếu máy đòi, tức là đang mở bản nội bộ cũ: xoá app rồi cài lại theo link trên.</li>"""))
    if platform in ("", "android"):
        out.append(("Android", f"""
    <li>Tải <b>{and_ver}</b>: <a href="{and_url}">{and_url}</a> (mở bằng Chrome, đừng mở trong WeChat).</li>
    <li>Bật <b>Cho phép cài từ nguồn không xác định</b> cho trình duyệt → mở file → <b>Cài đặt</b>.</li>
    <li>Nếu đang có bản cũ: <b>gỡ bản cũ trước</b> rồi cài lại.</li>
    <li>Mở app → đăng nhập email đã mua → bấm <b>Connect</b>, đợi 10–20 giây ở lần đầu.</li>
    <li>Nếu tải bị đứt giữa đường: bấm tải lại — máy chủ hỗ trợ tải tiếp (không phải tải lại từ đầu).</li>"""))
    if platform in ("", "macos"):
        out.append(("macOS", f"""
    <li>Tải <b>{mac_ver}</b>: <a href="{mac_url}">{mac_url}</a> (đã ký + notarize).</li>
    <li>Mở file .dmg → kéo <b>VPNFlow</b> vào <b>Applications</b>.</li>
    <li>Nếu macOS vẫn cảnh báo: mở <b>Terminal</b> chạy <code>xattr -dr com.apple.quarantine /Applications/VPNFlow.app</code> rồi mở lại app.</li>
    <li>Đăng nhập email đã mua → <b>Allow</b> khi macOS hỏi cấu hình VPN → <b>Connect</b>.</li>"""))
    if platform in ("", "windows"):
        out.append(("Windows", f"""
    <li>Tải <b>{win_ver}</b>: <a href="{win_url}">{win_url}</a>.</li>
    <li>Cài đặt → mở VPNFlow → đăng nhập email đã mua → <b>Connect</b>.</li>
    <li>Nếu Windows Defender hỏi: chọn <b>More info → Run anyway</b> (bản cài đã ký).</li>"""))
    return out


def troubleshoot(platform: str) -> list[str]:
    common = [
        "Trong app, đổi <b>Transport</b> (Hysteria ⇄ WS/TCP) rồi bấm Connect lại — mạng ở Trung Quốc/4G thường cần đường khác.",
        "Tắt VPN/tường lửa khác đang chạy trên máy, rồi thử lại với Wi-Fi và 4G.",
        "Chụp <b>ảnh màn hình thông báo lỗi</b> + cho biết <b>model máy &amp; phiên bản hệ điều hành</b> rồi trả lời email này — chúng tôi xem log theo đúng mã máy của anh/chị.",
    ]
    if platform == "ios":
        return ["Kiểm tra lại <b>Cài đặt → Cài đặt chung → VPN &amp; Quản lý thiết bị</b> đã <b>Tin cậy</b> hồ sơ chưa (chưa tin cậy thì app không chạy được).",
                "Vào <b>Cài đặt → VPN</b>: nếu có cấu hình VPNFlow cũ bị lỗi, xoá rồi mở app bấm <b>Allow</b> lại.",
                *common]
    if platform == "macos":
        return ["Vào <b>System Settings → Privacy &amp; Security</b>: nếu có mục chặn VPNFlow thì bấm <b>Allow</b>.",
                "Vào <b>System Settings → Network → VPN</b>: xoá cấu hình VPNFlow cũ (nếu có) rồi mở app bấm <b>Allow</b> lại.",
                *common]
    if platform == "android":
        return ["Vào <b>Cài đặt → Ứng dụng → VPNFlow → Quyền</b>, cấp quyền và bật lại kết nối VPN.",
                "Tắt chế độ tiết kiệm pin cho VPNFlow (một số máy Xiaomi/Huawei tự ngắt VPN).",
                *common]
    if platform == "windows":
        return ["Mở VPNFlow bằng <b>Run as administrator</b> (cần quyền tạo adapter mạng).",
                "Nếu báo thiếu <b>WinTun/TAP</b>: chạy lại bộ cài và chọn sửa (Repair).",
                *common]
    return common


def build_html(profile: dict, stage: str, platform: str, versions: dict) -> str:
    g = guides(versions)
    vers_line = " · ".join(f"{PLATFORM_LABEL[p]}: <b>{g[p][1].replace('VPNFlow ', '')}</b>"
                           for p in ("ios", "android", "macos", "windows"))
    blocks = steps(stage, platform, versions)
    steps_html = "".join(
        f'<h3 style="margin:16px 0 6px">{name}</h3><ol style="margin:0 0 10px 20px">{"".join([""])}{body}</ol>'
        for name, body in blocks)
    if stage == "never_connected":
        intro = ("Hệ thống ghi nhận app VPNFlow <b>đã được cài và đăng nhập</b> trên máy của Quý khách "
                 "nhưng <b>chưa kết nối được lần nào</b>. Quý khách <b>không cần cài lại</b> — làm theo các bước sau:")
        extra = "".join(f"<li>{x}</li>" for x in troubleshoot(platform))
    else:
        intro = ("Hệ thống ghi nhận Quý khách <b>đã tạo tài khoản nhưng chưa cài được app</b>. "
                 "Dưới đây là hướng dẫn theo đúng nền tảng và phiên bản mới nhất của shop:")
        extra = "".join(f"<li>{x}</li>" for x in troubleshoot(platform))
    return f"""<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#12202f;max-width:640px">
  <h2 style="color:#0d7a4a;margin:0 0 10px">VPNFlow — hướng dẫn cài &amp; kết nối</h2>
  <p>Kính gửi Quý khách ({profile['email']}),</p>
  <p>{intro}</p>
  <p style="font-size:13px;color:#5a6a7a">Phiên bản đang phát: {vers_line}</p>
  {steps_html}
  <h3 style="margin:16px 0 6px">Nếu vẫn chưa được</h3>
  <ol style="margin:0 0 10px 20px">{extra}</ol>
  <p>Mọi bước vướng, Quý khách chỉ cần <b>trả lời email này</b> — chúng tôi phản hồi trực tiếp.
  Hỗ trợ: <a href="mailto:support@meetflowai.site">support@meetflowai.site</a>.</p>
  <hr style="border:none;border-top:1px solid #e3e8ee;margin:18px 0">
  <p style="font-size:12.5px;color:#5a6a7a">English / 中文: reply to this email and we will send the same steps
  in English or 中文 — support@meetflowai.site.</p>
</div>"""


def send_mail(env: dict, to: str, subject: str, html: str) -> tuple[bool, str | None]:
    key = env.get("RESEND_API_KEY")
    if not key:
        return False, "thiếu RESEND_API_KEY"
    payload = json.dumps({"from": "VPNFlow <support@meetflowai.site>", "to": [to],
                          "subject": subject, "html": html}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=payload, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json",
        "Accept": "application/json", "User-Agent": "VPNFlow-Guard/1.0 (+https://meetflowai.site)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            rid = json.loads(res.read().decode()).get("id")
            return bool(rid), rid
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}: {exc.read().decode()[:140]}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:140]


def telegram(env: dict, text: str) -> bool:
    token, chat = env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return False
    body = json.dumps({"chat_id": chat, "text": text, "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return bool(json.loads(res.read().decode()).get("ok"))
    except Exception as exc:  # noqa: BLE001
        log(f"WARN telegram: {exc}")
        return False


# --- task cho agent khác --------------------------------------------------------------------
def owner_for(platform: str, stage: str) -> str:
    if platform in ("windows", "win32"):
        return "windows"
    if platform in ("macos", "mac"):
        return "mac"
    if platform in ("ios", "android"):
        return "mac" if stage == "never_connected" else "mac"
    return "server"


def create_task(state: dict, env: dict, kind: str, platform: str, profiles: list[dict],
                evidence: dict, dry: bool) -> dict | None:
    """Tạo task + alert Telegram (chờ /approve). Trả task hoặc None nếu đã có task tương tự đang mở."""
    open_kinds = {(t.get("kind"), t.get("platform")) for t in state.get("tasks", {}).values()
                  if t.get("status") in ("pending_approval", "approved", "in_progress")}
    if (kind, platform) in open_kinds:
        log(f"task ({kind}/{platform}) đã mở → bỏ qua")
        return None
    task_id = f"G{int(time.time())}"
    task = {
        "id": task_id, "kind": kind, "platform": platform,
        "owner": owner_for(platform, kind),
        "status": "pending_approval",
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "customers": [{"email": p["email"], "userId": p["userId"], "createdAt": p.get("createdAt"),
                       "devices": len(p.get("devices") or [])} for p in profiles],
        "evidence": {**evidence, "versionsAtCreation": evidence.get("versions") or {}},
        "requested_action": evidence.get("requested_action", "điều tra + sửa nguyên nhân gốc, rồi publish bản mới"),
    }
    if dry:
        log(f"[dry] sẽ tạo task {json.dumps(task, ensure_ascii=False)[:200]}")
        return task
    os.makedirs(TASKS_DIR, exist_ok=True)
    with open(f"{TASKS_DIR}/{task_id}.json", "w", encoding="utf-8") as fh:
        json.dump(task, fh, ensure_ascii=False, indent=1)
    state.setdefault("tasks", {})[task_id] = task
    audit({"event": "task_created", "task": task_id, "kind": kind, "platform": platform,
           "customers": [p["email"] for p in profiles]})
    n = len(profiles)
    telegram(env, (f"🛠 <b>Cần anh approve để sửa</b>\n"
                   f"Task <code>{task_id}</code> · {kind} · nền tảng <b>{PLATFORM_LABEL.get(platform, platform or 'không rõ')}</b>\n"
                   f"{n} khách bị ảnh hưởng: {', '.join(p['email'] for p in profiles[:4])}"
                   f"{' …' if n > 4 else ''}\n"
                   f"Bằng chứng: {evidence.get('summary', '-')}\n"
                   f"→ Trả lời <code>/approve {task_id}</code> để em bắt đầu sửa, hoặc "
                   f"<code>/reject {task_id} lý do</code>."))
    return task


# --- vòng chạy ------------------------------------------------------------------------------
def run_once(dry: bool = False, explain: bool = False) -> dict:
    env = load_env()
    versions = read_versions()
    state = load_state()
    now = datetime.now(timezone.utc)
    customers = gather_customers()
    stats = {"checked": 0, "mailed": 0, "skipped": 0, "tasks": 0, "details": []}
    stuck_by_group: dict[tuple[str, str], list[dict]] = {}

    for email, profile in sorted(customers.items()):
        stats["checked"] += 1
        stage, platform, why = classify(profile, now)
        if explain:
            log(f"   · {email:30} {stage:16} {platform or '-':8} {why}")
        if stage in ("ok", "too_new", "too_old", "no_sub"):
            stats["skipped"] += 1
            continue
        rec = state.setdefault("users", {}).setdefault(email, {})
        stage_rec = rec.setdefault(stage, {"mails": 0, "lastAt": None})
        last = parse_iso(stage_rec.get("lastAt"))
        if stage_rec["mails"] >= MAX_MAILS_PER_USER:
            stats["skipped"] += 1
            stats["details"].append(f"{email}: đã gửi {stage_rec['mails']} lần → dừng")
            continue
        if last and (now - last) < timedelta(hours=COOLDOWN_H):
            stats["skipped"] += 1
            continue
        if quiet_now(now):
            stats["skipped"] += 1
            stats["details"].append(f"{email}: đang giờ yên tĩnh → để vòng sau")
            continue

        subject = ("VPNFlow — hướng dẫn cài đặt & kết nối / install & connect guide"
                   if stage == "never_connected" else
                   "VPNFlow — hướng dẫn cài đặt / install guide / 安装指南")
        html = build_html(profile, stage, platform, versions)
        if dry:
            ok, info = True, "[dry]"
        elif MAIL_TO_OVERRIDE:
            ok, info = send_mail(env, MAIL_TO_OVERRIDE, f"[TEST → {email}] {subject}", html)
        else:
            ok, info = send_mail(env, email, subject, html)
        if ok:
            stats["mailed"] += 1
            stats["details"].append(f"{email}: gửi hướng dẫn ({stage}, {platform or 'mọi nền tảng'}) → {info}")
            if not dry:
                stage_rec["mails"] += 1
                stage_rec["lastAt"] = now.isoformat(timespec="seconds")
                stage_rec["lastPlatform"] = platform
                audit({"event": "guide_mailed", "email": email, "stage": stage,
                       "platform": platform, "reason": why, "resend_id": info})
                stuck_by_group.setdefault((stage, platform), []).append(profile)
        else:
            stats["details"].append(f"{email}: LỖI gửi mail → {info}")
            audit({"event": "guide_mail_failed", "email": email, "error": str(info)})

    # phát hiện lỗi theo mẫu → task cho agent phụ trách (chờ approve)
    for (stage, platform), profiles in stuck_by_group.items():
        recent = [p for p in profiles
                  if (parse_iso(p.get("createdAt")) or now) > now - timedelta(hours=ESCALATE_WINDOW_H)]
        if len(recent) < ESCALATE_N:
            continue
        ev = {"summary": f"{len(recent)} khách mới ({PLATFORM_LABEL.get(platform, platform or 'không rõ')}) "
                         f"rơi vào trạng thái {stage} trong {ESCALATE_WINDOW_H:.0f}h",
              "stage": stage, "platform": platform,
              "customers": [p["email"] for p in recent],
              "sample_userIds": [p["userId"] for p in recent[:5]],
              "requested_action": ("kiểm tra bản phát hành hiện tại cho nền tảng này (link tải, chữ ký/notarize, "
                                   "bước cài) và sửa nguyên nhân gốc; publish bản mới nếu cần")}
        ev["versions"] = versions
        if create_task(state, env, "customers_stuck", platform, recent, ev, dry):
            stats["tasks"] += 1

    # Báo chủ dự án 1 tin mỗi vòng khi có gửi hướng dẫn (không spam từng khách).
    if stats["mailed"] and not dry:
        who = [d.split(":")[0] for d in stats["details"] if "gửi hướng dẫn" in d]
        telegram(env, f"📨 Guard đã gửi hướng dẫn cài cho {stats['mailed']} khách mới chưa cài/chưa chạy được:\n"
                      + "\n".join(f"· {w}" for w in who[:8])
                      + ("\n…" if len(who) > 8 else ""))

    follow_finished_tasks(state, env, versions, customers, now, stats, dry)

    if not dry:
        save_state(state)
    return stats


def follow_finished_tasks(state: dict, env: dict, versions: dict, customers: dict,
                          now: datetime, stats: dict, dry: bool) -> None:
    """Theo dõi task đã approve: (a) báo Telegram khi chủ dự án vừa approve,
    (b) khi bản mới đã publish → đóng task + mời khách bị ảnh hưởng cập nhật."""
    for tid, task in list((state.get("tasks") or {}).items()):
        live = load_json(f"{TASKS_DIR}/{tid}.json", {}) or {}
        live_status = live.get("status") or task.get("status")
        if live_status != task.get("status"):
            task["status"] = live_status
            if live_status == "approved":
                audit({"event": "task_approved", "task": tid, "by": live.get("approvedBy")})
                telegram(env, f"✅ Anh đã approve task <code>{tid}</code> — em theo dõi tới khi có bản mới.")
            elif live_status == "rejected":
                audit({"event": "task_rejected", "task": tid, "reason": live.get("rejectReason")})
        if task.get("status") in ("rejected", "done") or task.get("publishedNotified"):
            continue
        before = (task.get("evidence") or {}).get("versionsAtCreation") or {}
        changed = [p for p in ("ios", "android", "macos", "windows")
                   if before.get(p, {}).get("version") != versions[p].get("version")
                   or before.get(p, {}).get("build") != versions[p].get("build")]
        if not changed:
            continue
        task["publishedNotified"] = True
        task["publishedAt"] = now.isoformat(timespec="seconds")
        task["publishedPlatforms"] = changed
        audit({"event": "task_published", "task": tid, "platforms": changed})
        if dry:
            continue
        telegram(env, (f"🚀 Task <code>{tid}</code>: đã có bản mới cho "
                       f"{', '.join(PLATFORM_LABEL.get(p, p) for p in changed)} "
                       f"({', '.join(versions[p]['version'] for p in changed)}).\n"
                       f"Em mời lại {len(task.get('customers') or [])} khách bị ảnh hưởng cập nhật."))
        mailed = 0
        for cust in task.get("customers") or []:
            profile = customers.get(str(cust.get("email", "")).lower())
            if not profile:
                continue
            stage, platform, _ = classify(profile, now)
            if stage == "ok":
                continue
            ok, info = send_mail(env, profile["email"],
                                 "VPNFlow — bản mới đã sửa lỗi cài/kết nối, mời cập nhật",
                                 build_html(profile, stage, platform or (task.get("platform") or ""), versions))
            if ok:
                mailed += 1
                audit({"event": "fix_notice_mailed", "email": profile["email"], "task": tid, "resend_id": info})
        task["status"] = "done"
        task["doneAt"] = now.isoformat(timespec="seconds")
        task["doneNote"] = f"bản mới {', '.join(versions[p]['version'] for p in changed)}; đã mời {mailed} khách"
        if not dry:
            try:
                with open(f"{TASKS_DIR}/{tid}.json", "w", encoding="utf-8") as fh:
                    json.dump(task, fh, ensure_ascii=False, indent=1)
            except OSError as exc:
                log(f"WARN không ghi được task {tid}: {exc}")
            telegram(env, f"✅ Đóng task <code>{tid}</code>: {task['doneNote']}")
        stats["publishedNotices"] = stats.get("publishedNotices", 0) + mailed


def main() -> int:
    args = sys.argv[1:]
    if "--status" in args:
        state = load_state()
        print(json.dumps(state, ensure_ascii=False, indent=1)[:4000])
        return 0
    dry = "--dry-run" in args
    if "--loop" in args:
        log(f"flowvpn-guard bắt đầu (poll {POLL_SEC}s, dry={dry})")
        while True:
            try:
                stats = run_once(dry)
                log(f"vòng xong: {stats['checked']} khách · {stats['mailed']} mail · "
                    f"{stats['tasks']} task · {stats['skipped']} bỏ qua")
                for line in stats["details"]:
                    log(f"   {line}")
            except Exception as exc:  # noqa: BLE001
                log(f"LỖI vòng chạy: {type(exc).__name__}: {exc}")
            time.sleep(POLL_SEC)
    stats = run_once(dry, explain="--explain" in args)
    log(f"xong: {json.dumps(stats, ensure_ascii=False)[:1500]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
