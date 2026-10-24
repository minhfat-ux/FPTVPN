#!/usr/bin/env bash
# Cài bộ FPT Tubeflow lên TV Xiaomi qua ADB.
#   bash install.sh <TV_IP> [GATEWAY_HOST:PORT]
# Ví dụ: bash install.sh 192.168.100.104 192.168.100.5:18081
set -euo pipefail
TV="${1:?cần IP TV, ví dụ 192.168.100.104}"
GW="${2:-192.168.100.5:18081}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ADB="${ADB:-adb}"
A="$ADB -s $TV:5555"

echo "== kết nối $TV"
$ADB connect "$TV:5555" >/dev/null 2>&1 || true
sleep 2
$A shell true

echo "== gỡ SmartTube gốc nếu có (khác chữ ký)"
$A uninstall org.smarttube.stable 2>/dev/null || true

echo "== cài 4 APK"
$A install -r -d "${KIT_APK:-/Volumes/BIWIN/XiaoMiLauncher}/TVFlowHome-3.4.apk"
$A install -r -d "${KIT_APK:-/Volumes/BIWIN/XiaoMiLauncher}/VPNFlowGuard-1.9.apk"
$A install -r -d "${KIT_APK:-/Volumes/BIWIN/XiaoMiLauncher}/VPNFlow-TV-1.4.5.apk"
$A install -r -d "${KIT_APK:-/Volumes/BIWIN/XiaoMiLauncher}/FPTTubeflow-2.2.apk"

echo "== cấp quyền + bật home guard"
$A shell pm grant com.tvflow.launcher android.permission.WRITE_SECURE_SETTINGS 2>/dev/null || true
$A shell pm grant com.privatevpn.app.guard android.permission.WRITE_SECURE_SETTINGS 2>/dev/null || true
$A shell appops set com.tvflow.launcher SYSTEM_ALERT_WINDOW allow 2>/dev/null || true
$A shell appops set com.tvflow.launcher GET_USAGE_STATS allow 2>/dev/null || true
$A shell settings put secure enabled_accessibility_services com.tvflow.launcher/com.tvflow.launcher.HomeWatcherService 2>/dev/null || true
$A shell settings put secure accessibility_enabled 1 2>/dev/null || true

echo "== đặt proxy gateway $GW"
$A shell settings put global http_proxy "$GW"

echo "== khởi động"
$A shell am start -n com.tvflow.launcher/.MainActivity >/dev/null 2>&1 || true
$A shell am broadcast --user 0 -a com.privatevpn.app.guard.TICK -n com.privatevpn.app.guard/.GuardReceiver >/dev/null 2>&1 || true
sleep 3
$A shell monkey -p org.smarttube.stable -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

echo "== kiểm tra"
$A shell 'echo -n "Tubeflow: "; dumpsys package org.smarttube.stable | grep -m1 versionName'
$A shell 'echo -n "Launcher: "; dumpsys package com.tvflow.launcher | grep -m1 versionName'
$A shell 'echo -n "Guard:    "; dumpsys package com.privatevpn.app.guard | grep -m1 versionName'
$A shell 'echo -n "Proxy:    "; settings get global http_proxy'
echo "Xong. Nếu video không lên: kiểm tra gateway còn sống (Settings của VPNFlow hoặc app guard)."
