<#
.SYNOPSIS
  Kiá»ƒm tra CÃ” Láº¬P Ä‘Æ°á»ng "hysteria2 bá»c trong WebSocket + sing-box" trÃªn mÃ¡y Windows, TRÆ¯á»šC khi
  má»Ÿ app: tá»± dá»±ng 2 file cáº¥u hÃ¬nh, cháº¡y flowvpnrelay.exe + sing-box.exe, chá» READY, Ä‘o bÄƒng thÃ´ng
  qua SOCKS5 báº±ng curl.exe, rá»“i Dá»ŒN Sáº CH cáº£ hai tiáº¿n trÃ¬nh vÃ  route/TUN cÃ²n sÃ³t.

.DESCRIPTION
  VÃ¬ sao cáº§n script riÃªng: khi app bÃ¡o "khÃ´ng káº¿t ná»‘i Ä‘Æ°á»£c", khÃ´ng phÃ¢n biá»‡t Ä‘Æ°á»£c lá»—i á»Ÿ
  relay (WS/Cloudflare), á»Ÿ hysteria (auth/obfs), hay á»Ÿ sing-box (TUN/route). Script nÃ y cháº¡y
  Ä‘Ãºng hai binary mÃ  app sáº½ cháº¡y, vá»›i Ä‘Ãºng cáº¥u hÃ¬nh mÃ 
  windows/PrivateVPNWindows.Core/Tunnel/SingBoxConfigBuilder.cs sinh ra â€” nÃªn káº¿t quáº£ á»Ÿ Ä‘Ã¢y
  lÃ  káº¿t luáº­n vá» chÃ­nh Ä‘Æ°á»ng Ä‘Ã³, khÃ´ng pháº£i má»™t thá»© tÆ°Æ¡ng tá»±.

  Cáº¥u hÃ¬nh dÆ°á»›i Ä‘Ã¢y CHÃ‰P theo SingBoxConfigBuilder (cÃ¹ng khoÃ¡, cÃ¹ng giÃ¡ trá»‹ máº·c Ä‘á»‹nh). Náº¿u sá»­a
  builder thÃ¬ sá»­a cáº£ Ä‘Ã¢y â€” hai chá»— pháº£i khá»›p.

  Script KHÃ”NG cáº§n quyá»n admin Ä‘á»ƒ cháº¡y `sing-box check`, nhÆ°ng Cáº¦N admin Ä‘á»ƒ dá»±ng TUN/route.

.PARAMETER Password
  HY_PASSWORD cá»§a hysteria (báº¯t buá»™c). KHÃ”NG hard-code trong file nÃ y: láº¥y tá»«
  android/app/src/main/java/com/privatevpn/app/Config.kt (háº±ng HY_PASSWORD) â€” file Ä‘Ã³ Ä‘Ã£ ghi rÃµ
  giÃ¡ trá»‹ nÃ y náº±m trong APK phÃ¡t hÃ nh nÃªn coi nhÆ° cÃ´ng khai. Báº£n Windows dÃ¹ng cÃ¹ng giÃ¡ trá»‹ á»Ÿ
  windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayDefaults.cs.

.PARAMETER Obfs
  HY_OBFS cá»§a hysteria (báº¯t buá»™c). Láº¥y cÃ¹ng chá»— vá»›i -Password.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 -Password <HY_PASSWORD> -Obfs <HY_OBFS>

.EXAMPLE
  # Kiá»ƒm tra bá»™ publish thay vÃ¬ windows\assets (Ä‘Ãºng thá»© khÃ¡ch sáº½ cháº¡y):
  powershell -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 `
    -AssetsDir windows\installer\publish -Password <HY_PASSWORD> -Obfs <HY_OBFS>
#>
[CmdletBinding()]
param(
  [string]$AssetsDir = "",

  # Äá»‹a chá»‰ node (danh tÃ­nh QUIC khi Ä‘i qua relay). Máº·c Ä‘á»‹nh = node-2.
  [string]$Server = "165.101.114.162:8443",

  # Relay WebSocket. Máº·c Ä‘á»‹nh = /relay/vn2hy (exit node-2, Ä‘o nhanh hÆ¡n node-1).
  [string]$RelayUrl = "wss://api.meetflowai.site/relay/vn2hy",

  [Parameter(Mandatory = $true)][string]$Password,
  [Parameter(Mandatory = $true)][string]$Obfs,

  [int]$ReadyTimeoutSec = 15,
  [long]$SpeedBytes = 50000000,
  [int]$UpKbps = 0,
  [int]$DownKbps = 0,
  [int]$SettleSeconds = 3,

  # Giá»¯ láº¡i thÆ° má»¥c táº¡m (cáº¥u hÃ¬nh + log) Ä‘á»ƒ cháº©n Ä‘oÃ¡n khi lá»—i.
  [switch]$KeepFiles
)

$ErrorActionPreference = "Stop"

# Äá»‹a chá»‰ TUN mÃ  SingBoxConfigBuilder dÃ¹ng (dÃ¹ng Ä‘á»ƒ nháº­n diá»‡n route cÃ²n sÃ³t).
$TunAddressPrefix = "172.19.0."
$TunAdapterName = "sing-box"

$stepNo = 0
$exitCodes = [ordered]@{}

function Step([string]$message) {
  $script:stepNo++
  Write-Host ("==> [{0}] {1}" -f $script:stepNo, $message) -ForegroundColor Cyan
}

function Note([string]$message) {
  Write-Host "    $message"
}

function Record([string]$name, $code) {
  $script:exitCodes[$name] = $code
  $color = if ("$code" -eq "0") { "Green" } else { "Red" }
  Write-Host ("    exit code {0} = {1}" -f $name, $code) -ForegroundColor $color
}

# Ghi file KHÃ”NG BOM: `Set-Content -Encoding UTF8` cá»§a Windows PowerShell 5.1 thÃªm BOM, mÃ 
# json.Unmarshal cá»§a Go (dÃ¹ng bá»Ÿi cáº£ flowvpnrelay.exe láº«n sing-box.exe) tá»« chá»‘i BOM.
function Write-JsonFile([string]$path, [string]$content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object -TypeName Security.Principal.WindowsPrincipal -ArgumentList @($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Äá»c file log mÃ  tiáº¿n trÃ¬nh khÃ¡c Ä‘ang ghi (Get-Content máº·c Ä‘á»‹nh sáº½ bá»‹ tá»« chá»‘i chia sáº»).
function Read-SharedText([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return "" }
  try {
    $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      $reader = New-Object -TypeName System.IO.StreamReader -ArgumentList @($fs)
      return $reader.ReadToEnd()
    } finally {
      $fs.Dispose()
    }
  } catch {
    return ""
  }
}

# Cáº¥p cá»•ng TCP trá»‘ng: má»Ÿ Ä‘á»“ng thá»i má»i listener rá»“i má»›i Ä‘Ã³ng, Ä‘á»ƒ hai cá»•ng khÃ´ng trÃ¹ng nhau.
function Get-FreePorts([int]$count) {
  $ports = @()
  $listeners = New-Object System.Collections.ArrayList
  try {
    for ($i = 0; $i -lt $count; $i++) {
      $listener = New-Object -TypeName System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, 0)
      $listener.Start()
      [void]$listeners.Add($listener)
      $ports += ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
  } finally {
    foreach ($listener in $listeners) { $listener.Stop() }
  }
  return $ports
}

function Wait-ForMarker([System.Diagnostics.Process]$process, [string]$logPath, [int]$timeoutSec, [string]$marker) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $text = Read-SharedText $logPath
    if ($text -and $text.Contains($marker)) { return $true }
    if ($process.HasExited) { return $false }
    Start-Sleep -Milliseconds 200
  }
  return $false
}

# Giá»¯ Ä‘Ãºng thá»© tá»± dá»n cá»§a app: sing-box TRÆ¯á»šC (Ä‘á»ƒ nÃ³ gá»¡ TUN/route) rá»“i má»›i tá»›i flowvpnrelay.
function Stop-Child([System.Diagnostics.Process]$process, [string]$name) {
  if ($null -eq $process) { return }
  try {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
      Note "Ä‘Ã£ kill $name (pid $($process.Id))"
    } else {
      Note "$name Ä‘Ã£ thoÃ¡t trÆ°á»›c Ä‘Ã³ (exit code $($process.ExitCode))"
    }
  } catch {
    Note "kill $name lá»—i (bá» qua): $($_.Exception.Message)"
  } finally {
    try { $process.WaitForExit(5000) } catch { }
    $process.Dispose()
  }
}

# Route/TUN cÃ²n sÃ³t sau khi sing-box bá»‹ kill cá»©ng â€” dá»n Ä‘á»ƒ mÃ¡y khÃ´ng trá» ra ngoÃ i qua Ä‘Æ°á»ng cháº¿t.
function Remove-RelayLeftovers {
  $removed = 0
  try {
    $routes = @(Get-NetRoute -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.NextHop -like "$TunAddressPrefix*" -or $_.DestinationPrefix -like "$TunAddressPrefix*" })
    foreach ($route in $routes) {
      try {
        Remove-NetRoute -DestinationPrefix $route.DestinationPrefix -NextHop $route.NextHop `
          -InterfaceIndex $route.InterfaceIndex -Confirm:$false -ErrorAction Stop
        $removed++
        Note "Ä‘Ã£ xoÃ¡ route sÃ³t: $($route.DestinationPrefix) -> $($route.NextHop)"
      } catch {
        Note "xoÃ¡ route $($route.DestinationPrefix) lá»—i: $($_.Exception.Message)"
      }
    }
  } catch {
    Note "khÃ´ng Ä‘á»c Ä‘Æ°á»£c báº£ng route: $($_.Exception.Message)"
  }

  try {
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "$TunAdapterName*" })
    foreach ($adapter in $adapters) {
      Note "Cáº¢NH BÃO: adapter TUN cÃ²n láº¡i '$($adapter.Name)' ($($adapter.Status)) â€” má»Ÿ Network Connections Ä‘á»ƒ gá»¡ náº¿u cáº§n."
    }
  } catch { }

  return $removed
}

# --- dá»n dáº¹p luÃ´n cháº¡y, ká»ƒ cáº£ khi lá»—i giá»¯a chá»«ng -----------------------------
$relayProcess = $null
$singBoxProcess = $null
$workDir = $null

try {
  # 0) mÃ´i trÆ°á»ng
  Step "Kiá»ƒm tra mÃ´i trÆ°á»ng"
  if (-not (Test-IsAdmin)) {
    throw "Script cáº§n cháº¡y vá»›i quyá»n Administrator (sing-box pháº£i táº¡o TUN + sá»­a báº£ng route)."
  }
  Note "PowerShell $($PSVersionTable.PSVersion), admin: OK"

  if ([string]::IsNullOrWhiteSpace($AssetsDir)) {
    $AssetsDir = Join-Path (Split-Path -Parent $PSScriptRoot) "assets"
  }
  $AssetsDir = (Resolve-Path -LiteralPath $AssetsDir).Path
  $relayExe = Join-Path $AssetsDir "flowvpnrelay.exe"
  $singBoxExe = Join-Path $AssetsDir "sing-box.exe"
  foreach ($exe in @($relayExe, $singBoxExe)) {
    if (-not (Test-Path -LiteralPath $exe)) {
      throw "Thiáº¿u $exe â€” cháº¡y: bash windows\assets\fetch-assets.sh (hoáº·c trá» -AssetsDir vÃ o thÆ° má»¥c publish)."
    }
    $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLower()
    Note ("{0}  {1} bytes  sha256={2}" -f (Split-Path -Leaf $exe), (Get-Item -LiteralPath $exe).Length, $hash)
  }

  Step "sing-box.exe version (pháº£i lÃ  1.14.1)"
  $sbVersion = (& $singBoxExe version 2>&1 | Out-String).Trim()
  Record "sing-box version" $LASTEXITCODE
  Note $sbVersion
  if ($sbVersion -notmatch "1\.14\.1") {
    Write-Host "    Cáº¢NH BÃO: phiÃªn báº£n khÃ´ng khá»›p 1.14.1 trong THIRD_PARTY.md." -ForegroundColor Yellow
  }

  # 1) cáº¥u hÃ¬nh táº¡m (mirror SingBoxConfigBuilder)
  Step "Dá»±ng 2 file cáº¥u hÃ¬nh táº¡m"
  $ports = Get-FreePorts 2
  $socksPort = $ports[0]
  $clashPort = $ports[1]
  $workDir = Join-Path $env:TEMP ("vpnflow-verify-relay-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $workDir | Out-Null

  $relayCfg = Join-Path $workDir "flowvpnrelay.json"
  $singBoxCfg = Join-Path $workDir "sing-box.json"
  $singBoxAppLog = Join-Path $workDir "sing-box.log"
  $relayErrLog = Join-Path $workDir "relay.stderr.log"
  $relayOutLog = Join-Path $workDir "relay.stdout.log"
  $sbErrLog = Join-Path $workDir "singbox.stderr.log"
  $sbOutLog = Join-Path $workDir "singbox.stdout.log"

  $relayJson = @'
{
  "server": "__SERVER__",
  "password": "__PASSWORD__",
  "obfs": "__OBFS__",
  "insecure": true,
  "upKbps": __UPKBPS__,
  "downKbps": __DOWNKBPS__,
  "transport": {
    "type": "wsrelay",
    "url": "__RELAYURL__",
    "host": "__RELAYHOST__"
  },
  "socks5": {
    "listen": "127.0.0.1:__SOCKSPORT__"
  },
  "dialTimeoutSec": 12
}
'@
  $relayJson = $relayJson.Replace("__SERVER__", $Server)
  $relayJson = $relayJson.Replace("__PASSWORD__", $Password)
  $relayJson = $relayJson.Replace("__OBFS__", $Obfs)
  $relayJson = $relayJson.Replace("__UPKBPS__", "$UpKbps")
  $relayJson = $relayJson.Replace("__DOWNKBPS__", "$DownKbps")
  $relayJson = $relayJson.Replace("__RELAYURL__", $RelayUrl)
  $relayJson = $relayJson.Replace("__RELAYHOST__", ([Uri]$RelayUrl).Host)
  $relayJson = $relayJson.Replace("__SOCKSPORT__", "$socksPort")
  Write-JsonFile $relayCfg $relayJson

  $singBoxJson = @'
{
  "log": { "level": "info", "output": "__LOG__", "timestamp": true },
  "dns": {
    "servers": [ { "type": "udp", "tag": "remote", "server": "1.1.1.1" } ],
    "final": "remote"
  },
  "inbounds": [
    {
      "type": "tun", "tag": "tun-in", "address": [ "172.19.0.1/30" ], "mtu": 1500,
      "auto_route": true, "strict_route": true, "stack": "gvisor"
    }
  ],
  "outbounds": [
    { "type": "socks", "tag": "hyrelay", "server": "127.0.0.1", "server_port": __SOCKSPORT__, "version": "5" },
    { "type": "direct", "tag": "direct" }
  ],
  "route": {
    "rules": [
      { "action": "sniff" },
      { "ip_is_private": true, "outbound": "direct" },
      { "protocol": "dns", "action": "hijack-dns" }
    ],
    "final": "hyrelay",
    "auto_detect_interface": true
  },
  "experimental": { "clash_api": { "external_controller": "127.0.0.1:__CLASHPORT__" } }
}
'@
  $singBoxJson = $singBoxJson.Replace("__LOG__", $singBoxAppLog.Replace("\", "\\"))
  $singBoxJson = $singBoxJson.Replace("__SOCKSPORT__", "$socksPort")
  $singBoxJson = $singBoxJson.Replace("__CLASHPORT__", "$clashPort")
  Write-JsonFile $singBoxCfg $singBoxJson

  Note "thÆ° má»¥c táº¡m: $workDir"
  Note "flowvpnrelay.json -> socks5 127.0.0.1:$socksPort Â· sing-box.json -> clash 127.0.0.1:$clashPort"

  # 2) sing-box check (khÃ´ng cáº§n quyá»n, kiá»ƒm cáº¥u hÃ¬nh trÆ°á»›c khi dá»±ng TUN)
  Step "sing-box check -c sing-box.json (báº¯t lá»—i cáº¥u hÃ¬nh trÆ°á»›c khi dá»±ng TUN)"
  $checkOutput = (& $singBoxExe check -c $singBoxCfg 2>&1 | Out-String).Trim()
  Record "sing-box check" $LASTEXITCODE
  if ($checkOutput) { Note $checkOutput }
  if ($LASTEXITCODE -ne 0) { throw "sing-box check tháº¥t báº¡i â€” cáº¥u hÃ¬nh sai, dá»«ng trÆ°á»›c khi dá»±ng TUN." }

  # 3) flowvpnrelay.exe
  Step "Cháº¡y flowvpnrelay.exe -c flowvpnrelay.json"
  $relayProcess = Start-Process -FilePath $relayExe `
    -ArgumentList ("-c `"{0}`"" -f $relayCfg) `
    -WorkingDirectory $AssetsDir -NoNewWindow -PassThru `
    -RedirectStandardOutput $relayOutLog -RedirectStandardError $relayErrLog
  Note "pid $($relayProcess.Id)"

  Step "Chá» dÃ²ng READY (tá»‘i Ä‘a $ReadyTimeoutSec s)"
  $ready = Wait-ForMarker $relayProcess $relayErrLog $ReadyTimeoutSec "READY "
  if (-not $ready) {
    Note "--- relay stderr ---"
    Note (Read-SharedText $relayErrLog)
    if ($relayProcess.HasExited) {
      Record "flowvpnrelay exit" $relayProcess.ExitCode
      throw "flowvpnrelay.exe thoÃ¡t trÆ°á»›c khi bÃ¡o READY (exit code $($relayProcess.ExitCode))."
    }
    throw "flowvpnrelay.exe khÃ´ng bÃ¡o READY trong $ReadyTimeoutSec s."
  }
  Record "flowvpnrelay READY" 0
  Note ("stderr: " + ((Read-SharedText $relayErrLog) -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 3 | Out-String).Trim())

  # 4) sing-box (chá»‰ sau READY: nÃ³ báº­t auto_route ngay khi khá»Ÿi Ä‘á»™ng)
  Step "Cháº¡y sing-box.exe run -c sing-box.json"
  $singBoxProcess = Start-Process -FilePath $singBoxExe `
    -ArgumentList ("run -c `"{0}`"" -f $singBoxCfg) `
    -WorkingDirectory $workDir -NoNewWindow -PassThru `
    -RedirectStandardOutput $sbOutLog -RedirectStandardError $sbErrLog
  Note "pid $($singBoxProcess.Id)"
  Start-Sleep -Seconds $SettleSeconds

  if ($singBoxProcess.HasExited) {
    Note "--- sing-box stderr ---"
    Note (Read-SharedText $sbErrLog)
    Record "sing-box exit" $singBoxProcess.ExitCode
    throw "sing-box.exe thoÃ¡t ngay sau khi cháº¡y (exit code $($singBoxProcess.ExitCode))."
  }
  Record "sing-box running" 0

  # 5) Ä‘o bÄƒng thÃ´ng qua SOCKS5 ÄÃšNG cá»•ng cá»§a relay (khÃ´ng Ä‘i qua TUN: Ä‘Ã¢y lÃ  phÃ©p Ä‘o
  #    "relay + hysteria cÃ³ chá»Ÿ Ä‘Æ°á»£c dá»¯ liá»‡u khÃ´ng", tÃ¡ch khá»i pháº§n TUN/route).
  Step "Äo bÄƒng thÃ´ng qua SOCKS5 báº±ng curl.exe"
  $speedUrl = "https://speed.cloudflare.com/__down?bytes=$SpeedBytes"
  $curlArgs = @("--socks5-hostname", "127.0.0.1:$socksPort", "-o", "NUL", "-s", "--max-time", "120",
                "-w", "%{speed_download}", $speedUrl)
  Note ("curl.exe " + ($curlArgs -join " "))
  $curlOut = (& curl.exe @curlArgs 2>&1 | Out-String).Trim()
  Record "curl" $LASTEXITCODE

  $bytesPerSec = 0.0
  if ([double]::TryParse($curlOut, [ref]$bytesPerSec)) {
    Note ("tá»‘c Ä‘á»™ táº£i: {0:N2} MB/s ({1:N1} Mbps) cho {2:N0} bytes yÃªu cáº§u" -f `
      ($bytesPerSec / 1MB), ($bytesPerSec * 8 / 1MB), $SpeedBytes)
  } else {
    Note "curl khÃ´ng tráº£ vá» sá»‘ Ä‘o (output: $curlOut)"
  }

  # 6) tá»•ng káº¿t
  Step "Tá»•ng káº¿t exit code tá»«ng bÆ°á»›c"
  foreach ($key in $exitCodes.Keys) { Note ("{0} = {1}" -f $key, $exitCodes[$key]) }
  $ok = ($exitCodes["sing-box version"] -eq 0) -and ($exitCodes["sing-box check"] -eq 0) -and
        ($exitCodes["curl"] -eq 0) -and ($relayProcess -and -not $relayProcess.HasExited)
  if ($ok) {
    Write-Host "==> Káº¾T LUáº¬N: Ä‘Æ°á»ng hysteria2-over-WS + sing-box CHáº Y ÄÆ¯á»¢C trÃªn mÃ¡y nÃ y." -ForegroundColor Green
  } else {
    Write-Host "==> Káº¾T LUáº¬N: Ä‘Æ°á»ng relay cÃ³ bÆ°á»›c tháº¥t báº¡i â€” xem exit code á»Ÿ trÃªn." -ForegroundColor Yellow
  }
} catch {
  Write-Host "==> Lá»–I: $($_.Exception.Message)" -ForegroundColor Red
  $script:failed = $true
} finally {
  Step "Dá»n dáº¹p: kill sing-box TRÆ¯á»šC (gá»¡ TUN/route) rá»“i tá»›i flowvpnrelay"
  Stop-Child $singBoxProcess "sing-box.exe"
  Stop-Child $relayProcess "flowvpnrelay.exe"

  $removed = Remove-RelayLeftovers
  Note "route/TUN Ä‘Ã£ dá»n: $removed route"

  if ($workDir -and (Test-Path -LiteralPath $workDir)) {
    if ($KeepFiles) {
      Note "giá»¯ thÆ° má»¥c táº¡m (-KeepFiles): $workDir"
    } else {
      Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
      Note "Ä‘Ã£ xoÃ¡ thÆ° má»¥c táº¡m"
    }
  }

  if ($script:failed) { exit 1 }
}
