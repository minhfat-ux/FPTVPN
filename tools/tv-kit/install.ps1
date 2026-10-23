# Cài bộ FPT Tubeflow lên TV Xiaomi qua ADB (Windows PowerShell).
#   .\install.ps1 -TvIp 192.168.100.104 -Gateway 192.168.100.5:18081
param(
  [Parameter(Mandatory=$true)][string]$TvIp,
  [string]$Gateway = "192.168.100.5:18081"
)
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$d = "-s", "$TvIp`:5555"

Write-Host "== ket noi $TvIp"
adb connect "$TvIp`:5555" | Out-Null
Start-Sleep -Seconds 2

Write-Host "== go SmartTube goc neu co"
adb @d uninstall org.smarttube.stable 2>$null | Out-Null

Write-Host "== cai 4 APK"
foreach ($apk in @("TVFlowHome-2.8.apk","VPNFlowGuard-1.6.apk","VPNFlow-TV-1.4.5.apk","FPTTubeflow-2.2.apk")) {
  adb @d install -r -d (Join-Path $here "apk\$apk")
}

Write-Host "== cap quyen"
adb @d shell pm grant com.tvflow.launcher android.permission.WRITE_SECURE_SETTINGS 2>$null
adb @d shell pm grant com.privatevpn.app.guard android.permission.WRITE_SECURE_SETTINGS 2>$null
adb @d shell appops set com.tvflow.launcher SYSTEM_ALERT_WINDOW allow 2>$null
adb @d shell appops set com.tvflow.launcher GET_USAGE_STATS allow 2>$null
adb @d shell settings put secure enabled_accessibility_services com.tvflow.launcher/com.tvflow.launcher.HomeWatcherService 2>$null
adb @d shell settings put secure accessibility_enabled 1 2>$null

Write-Host "== dat proxy $Gateway"
adb @d shell settings put global http_proxy $Gateway

Write-Host "== khoi dong"
adb @d shell am start -n com.tvflow.launcher/.MainActivity 2>$null | Out-Null
adb @d shell am broadcast --user 0 -a com.privatevpn.app.guard.TICK -n com.privatevpn.app.guard/.GuardReceiver 2>$null | Out-Null
Start-Sleep -Seconds 3
adb @d shell monkey -p org.smarttube.stable -c android.intent.category.LAUNCHER 1 2>$null | Out-Null

Write-Host "== kiem tra"
adb @d shell "dumpsys package org.smarttube.stable | grep -m1 versionName"
adb @d shell "settings get global http_proxy"
Write-Host "Xong."
