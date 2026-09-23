<#
  §6 — TEST MÁY THẬT cho release Android (bus-282, 1.4.3 / versionCode 29).

  Vì sao có script này: §6 là mục CUỐI của nghiệm thu bus-282 và là mục duy nhất
  không thể làm bằng máy (cần điện thoại thật + VPN thật + speedtest thật).
  Khi điện thoại lên mạng thì chỉ cần chạy ĐÚNG MỘT lệnh, không phải nhớ lại
  chuỗi adb/grep — và bằng chứng được ghi ra file có mốc thời gian.

  Điều kiện: Samsung SM-F9460 (Galaxy Z Fold5) cùng Wi-Fi với máy Windows,
  đã bật Wireless debugging (hoặc cắm USB), màn hình đã mở khoá.

  Ví dụ:
    # 1) Chờ điện thoại lên mạng, cài đè bản release và mở app
    pwsh -File ops\verify-android-section6.ps1 -WaitForDevice -Install -Minutes 30
    # 2) Người bật VPN + chạy speedtest ~60s trên điện thoại, rồi thu bằng chứng
    pwsh -File ops\verify-android-section6.ps1 -Collect -SpeedtestMbps 85

  Không có tham số nào thì chỉ in TRẠNG THÁI thiết bị hiện tại.
#>
[CmdletBinding()]
param(
  [string]$Apk = "$PSScriptRoot\..\_work\bus282-verify\app-modern-release-1.4.3.apk",
  [string]$Serial = "",
  [string]$Package = "com.privatevpn.app",
  [switch]$WaitForDevice,
  [int]$Minutes = 30,
  [switch]$Install,
  [switch]$Collect,
  [switch]$NoLaunch,
  [double]$SpeedtestMbps = 0,
  [string]$OutDir = "$PSScriptRoot\..\_work\bus282-verify",
  [string]$ExpectedModel = "SM-F9460"
)

$ErrorActionPreference = "Stop"

function Find-Adb {
  $candidates = @()
  if ($env:ANDROID_HOME) { $candidates += (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe") }
  if ($env:ANDROID_SDK_ROOT) { $candidates += (Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe") }
  $candidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe")
  $candidates += (Join-Path $env:USERPROFILE "Android\sdk\platform-tools\adb.exe")
  $onPath = Get-Command adb -ErrorAction SilentlyContinue
  if ($onPath) { $candidates += $onPath.Source }
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  throw "Không tìm thấy adb.exe. Đặt ANDROID_HOME hoặc cài platform-tools."
}

$ADB = Find-Adb

function Invoke-Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  # Luôn trả về text; lỗi tạm thời của adb không làm chết script.
  $out = & $ADB @Args 2>&1
  return ($out | Out-String)
}

function Select-Device {
  # Trả về serial của thiết bị đang ở trạng thái "device" (đã authorize).
  $lines = (Invoke-Adb devices) -split "`r?`n"
  foreach ($line in $lines) {
    if ($line -match '^(\S+)\s+device\s*$') {
      if (-not $Serial -or $matches[1] -eq $Serial) { return $matches[1] }
    }
  }
  return $null
}

function Get-MdnsEndpoints {
  # Dò dịch vụ adb qua mDNS — KHÔNG dùng `adb mdns services` vì bản mdns của adb trên
  # Windows trả rỗng dù điện thoại đang quảng bá (đã gặp thật 23/09/2026).
  $helper = Join-Path $PSScriptRoot "lib\mdns-adb.mjs"
  if (-not (Test-Path $helper)) { return @() }
  $out = & node $helper --seconds=4 2>$null
  $eps = @()
  foreach ($line in ($out -split "`r?`n")) {
    if ($line -match '^ENDPOINT\s+(\d+\.\d+\.\d+\.\d+:\d+)\s+(.+)$') {
      $eps += [pscustomobject]@{ Endpoint = $matches[1]; Instance = $matches[2].Trim() }
    }
  }
  return $eps
}

function Get-DeviceRows {
  return ((Invoke-Adb devices -l) -split "`r?`n") | Where-Object { $_ -match '^\S+\s+(device|offline|unauthorized)' }
}

function Show-DeviceState {
  Write-Host "adb        : $ADB"
  $rows = Get-DeviceRows
  if ($rows) { Write-Host "thiết bị   :"; foreach ($r in $rows) { Write-Host "  $r" } } else { Write-Host "thiết bị   : (không có)" }
  $eps = Get-MdnsEndpoints
  if ($eps) { foreach ($e in $eps) { Write-Host "mDNS       : $($e.Endpoint)  $($e.Instance)" } }
  else { Write-Host "mDNS       : (không thấy dịch vụ adb nào)" }
}

function Wait-Device {
  param([int]$LimitMinutes)
  $deadline = (Get-Date).AddMinutes($LimitMinutes)
  Write-Host "⏳ Chờ thiết bị Android (tối đa $LimitMinutes phút)."
  Write-Host "   Trên điện thoại: bật Wireless debugging (Tùy chọn nhà phát triển) + mở khoá màn hình,"
  Write-Host "   hoặc cắm cáp USB. Nếu hiện hộp thoại 'Cho phép gỡ lỗi USB?' thì bấm Cho phép."
  $tried = @{}
  while ((Get-Date) -lt $deadline) {
    $serial = Select-Device
    if ($serial) { Write-Host "✅ Thấy thiết bị: $serial"; return $serial }

    foreach ($row in (Get-DeviceRows)) {
      if ($row -match '^\S+\s+unauthorized') { Write-Host "  ⚠ thiết bị chưa được cho phép — bấm 'Cho phép' trên màn hình điện thoại." }
      if ($row -match '^\S+\s+offline') { Write-Host "  ⚠ thiết bị offline — thử lại sau khi bật lại Wireless debugging." }
    }

    foreach ($e in (Get-MdnsEndpoints)) {
      $ep = $e.Endpoint
      Write-Host "  mDNS thấy $ep ($($e.Instance)) → adb connect"
      Invoke-Adb connect $ep | Out-Null
      Start-Sleep -Seconds 2
      $serial = Select-Device
      if ($serial) { Write-Host "✅ Thấy thiết bị: $serial"; return $serial }
      if (-not $tried.ContainsKey($ep)) { $tried[$ep] = $true }
    }

    $left = [math]::Round(($deadline - (Get-Date)).TotalMinutes, 1)
    Write-Host ("  [{0:HH:mm:ss}] chưa thấy thiết bị ở trạng thái 'device' (còn {1} phút)" -f (Get-Date), $left)
    Start-Sleep -Seconds 12
  }
  return $null
}

function Get-FileSha256 {
  param([string]$Path)
  return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLower()
}

function Get-RemoteLogSize {
  param([string]$SerialArg)
  $p = "/sdcard/Android/data/$Package/files/diagnostics.log"
  $out = (Invoke-Adb -s $SerialArg shell "stat -c %s $p 2>/dev/null || echo 0").Trim()
  $n = 0
  if ([int64]::TryParse(($out -split "`r?`n")[0], [ref]$n)) { return $n }
  return 0
}

$OutDirFull = [System.IO.Path]::GetFullPath($OutDir)
if (-not (Test-Path $OutDirFull)) { New-Item -ItemType Directory -Path $OutDirFull -Force | Out-Null }
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logFile = Join-Path $OutDirFull "section6-$stamp.log"

function Write-Evidence {
  param([string]$Text, [switch]$NoEcho)
  if (-not $NoEcho) { Write-Host $Text }
  $Text | Out-File -FilePath $logFile -Append -Encoding utf8
}

Write-Evidence "=== §6 TEST MÁY THẬT — Android $Package (bus-282) — $stamp ==="
Write-Evidence "máy: $env:COMPUTERNAME | adb: $ADB"
Write-Host ""
Show-DeviceState

$deviceSerial = Select-Device

if ($WaitForDevice -and -not $deviceSerial) {
  $deviceSerial = Wait-Device -LimitMinutes $Minutes
}

if (-not $deviceSerial) {
  Write-Evidence "❌ KHÔNG có thiết bị ở trạng thái 'device' (adb devices rỗng / unauthorized / offline)."
  Write-Evidence "→ §6 CHƯA chạy được. Cần NGƯỜI: bật điện thoại $ExpectedModel cùng Wi-Fi với máy Windows,"
  Write-Evidence "  bật Wireless debugging (Tùy chọn nhà phát triển), mở khoá màn hình, rồi chạy lại script này."
  Write-Host ""
  Write-Host "bằng chứng: $logFile"
  exit 2
}

Write-Evidence "serial: $deviceSerial"

$model = ((Invoke-Adb -s $deviceSerial shell getprop ro.product.model) -replace "`r?`n", " ").Trim()
$android = ((Invoke-Adb -s $deviceSerial shell getprop ro.build.version.release) -replace "`r?`n", " ").Trim()
$buildId = ((Invoke-Adb -s $deviceSerial shell getprop ro.build.display.id) -replace "`r?`n", " ").Trim()
Write-Evidence "model=$model android=$android build=$buildId"
if ($ExpectedModel -and $model -ne $ExpectedModel) {
  Write-Evidence "⚠ model KHÁC chuẩn nghiệm thu ($ExpectedModel) — vẫn chạy nhưng phải ghi rõ trong biên bản."
}

$logBefore = Get-RemoteLogSize -SerialArg $deviceSerial
Write-Evidence "diagnostics.log trước khi test: $logBefore byte (chỉ lấy phần log MỚI làm bằng chứng)"

if ($Install) {
  if (-not (Test-Path $Apk)) { throw "Không thấy APK: $Apk" }
  $sha = Get-FileSha256 -Path $Apk
  $size = (Get-Item $Apk).Length
  Write-Evidence "APK: $([System.IO.Path]::GetFileName($Apk)) | $size byte | sha256 $sha"
  Write-Evidence "cmd: adb -s $deviceSerial install -r -d <apk>"
  $installOut = Invoke-Adb -s $deviceSerial install -r -d $Apk
  Write-Evidence $installOut.Trim()
  if ($installOut -notmatch "Success") {
    Write-Evidence "❌ cài đặt KHÔNG thành công — dừng (§6 chỉ có nghĩa khi cài được bản release lên máy thật)."
    Write-Host "bằng chứng: $logFile"
    exit 3
  }
  $verOut = (Invoke-Adb -s $deviceSerial shell "dumpsys package $Package | grep -E 'versionCode|versionName' | head -4").Trim()
  Write-Evidence "bản đang cài trên máy:"; Write-Evidence $verOut

  # Cấp sẵn quyền VPN để bớt một lần bấm tay (không thay thế việc người bật VPN).
  Invoke-Adb -s $deviceSerial shell "appops set $Package ACTIVATE_VPN allow" | Out-Null

  if (-not $NoLaunch) {
    Invoke-Adb -s $deviceSerial shell "monkey -p $Package -c android.intent.category.LAUNCHER 1" | Out-Null
    Write-Evidence "đã mở app: monkey -p $Package -c android.intent.category.LAUNCHER 1"
  }
}

if ($Collect) {
  Write-Host ""
  Write-Host "→ Trên điện thoại: bật VPN (chờ 'tunnel: UP'), rồi chạy speedtest ~60s."
  Write-Host "→ Xong thì quay lại đây, script sẽ thu log MỚI và đối chiếu tiêu chí §6."
  Read-Host "Enter để thu bằng chứng" | Out-Null

  $path = "/sdcard/Android/data/$Package/files/diagnostics.log"
  $skip = $logBefore + 1
  Write-Evidence ""
  Write-Evidence "--- log MỚI từ byte $skip ---"
  $tail = Invoke-Adb -s $deviceSerial shell "tail -c +$skip $path"
  $lines = $tail -split "`r?`n"

  $filtered = $lines | Where-Object { $_ -match "sampler nguồn byte|bw: sample|chon-duong|tunnel:|vpn: establish" }
  foreach ($l in ($filtered | Select-Object -Last 40)) { Write-Evidence $l -NoEcho }

  Write-Evidence ""
  Write-Evidence "--- đối chiếu tiêu chí §6 ---"
  $sampleCount = ($lines | Where-Object { $_ -match "bw: sample observed=" }).Count
  $uidSampler = ($lines | Where-Object { $_ -match "sampler nguồn byte" -and $_ -match "TrafficStats theo UID" }).Count
  $tunnelUp = ($lines | Where-Object { $_ -match "tunnel: UP \(hy-udp" }).Count
  $observed = @()
  foreach ($l in $lines) {
    if ($l -match "bw: sample observed=([0-9.]+)") { $observed += [double]$matches[1] }
  }
  $obsMax = 0; if ($observed.Count -gt 0) { $obsMax = ($observed | Measure-Object -Maximum).Maximum }

  Write-Evidence ("sampler nguồn byte = TrafficStats theo UID : {0} dòng {1}" -f $uidSampler, $(if ($uidSampler -ge 1) { "ĐẠT" } else { "CHƯA ĐẠT" }))
  Write-Evidence ("tunnel: UP (hy-udp…)                        : {0} dòng {1}" -f $tunnelUp, $(if ($tunnelUp -ge 1) { "ĐẠT" } else { "CHƯA ĐẠT" }))
  Write-Evidence ("bw: sample observed=                        : {0} dòng (cần >=20) {1}" -f $sampleCount, $(if ($sampleCount -ge 20) { "ĐẠT" } else { "CHƯA ĐẠT" }))
  Write-Evidence ("observed lớn nhất                           : {0} kbps" -f $obsMax)
  if ($SpeedtestMbps -gt 0) {
    $expected = $SpeedtestMbps * 1000
    $ratio = 0; if ($expected -gt 0) { $ratio = [math]::Round($obsMax / $expected, 3) }
    Write-Evidence ("speedtest người đọc trên máy                : {0} Mbps → observed/expected = {1}" -f $SpeedtestMbps, $ratio)
    if ($ratio -ge 0.5) { Write-Evidence "observed CÙNG BẬC speedtest → ĐẠT" } else { Write-Evidence "observed LỆCH BẬC so với speedtest → CHƯA ĐẠT (nghi vấn còn ~5 kbps)" }
  } else {
    Write-Evidence "chưa truyền -SpeedtestMbps <số> nên không đối chiếu được bậc tốc độ."
  }
  $logcat = Invoke-Adb -s $deviceSerial shell "logcat -d -t 400 | grep -E 'tunnel:|bw: sample|TrafficStats' | tail -20"
  Write-Evidence ""
  Write-Evidence "--- logcat (400 dòng cuối, lọc) ---"
  Write-Evidence $logcat.Trim()
}

Write-Host ""
Write-Host "bằng chứng: $logFile"
Write-Host "mẫu lệnh đối chiếu tay:"
Write-Host "  & '$ADB' -s $deviceSerial shell `"grep -E 'sampler nguồn byte|bw: sample|chon-duong|tunnel: UP' /sdcard/Android/data/$Package/files/diagnostics.log | tail -20`""
