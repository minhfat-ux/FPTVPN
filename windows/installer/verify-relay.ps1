<#
.SYNOPSIS
  Kiểm tra CÔ LẬP đường "hysteria2 bọc trong WebSocket + sing-box" trên máy Windows, TRƯỚC khi
  mở app: tự dựng 2 file cấu hình, chạy flowvpnrelay.exe + sing-box.exe, chờ READY, đo băng thông
  qua SOCKS5 bằng curl.exe, rồi DỌN SẠCH cả hai tiến trình và route/TUN còn sót.

.DESCRIPTION
  Vì sao cần script riêng: khi app báo "không kết nối được", không phân biệt được lỗi ở
  relay (WS/Cloudflare), ở hysteria (auth/obfs), hay ở sing-box (TUN/route). Script này chạy
  đúng hai binary mà app sẽ chạy, với đúng cấu hình mà
  windows/PrivateVPNWindows.Core/Tunnel/SingBoxConfigBuilder.cs sinh ra — nên kết quả ở đây
  là kết luận về chính đường đó, không phải một thứ tương tự.

  Cấu hình dưới đây CHÉP theo SingBoxConfigBuilder (cùng khoá, cùng giá trị mặc định). Nếu sửa
  builder thì sửa cả đây — hai chỗ phải khớp.

  Script KHÔNG cần quyền admin để chạy `sing-box check`, nhưng CẦN admin để dựng TUN/route.

.PARAMETER Password
  HY_PASSWORD của hysteria (bắt buộc). KHÔNG hard-code trong file này: lấy từ
  android/app/src/main/java/com/privatevpn/app/Config.kt (hằng HY_PASSWORD) — file đó đã ghi rõ
  giá trị này nằm trong APK phát hành nên coi như công khai. Bản Windows dùng cùng giá trị ở
  windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayDefaults.cs.

.PARAMETER Obfs
  HY_OBFS của hysteria (bắt buộc). Lấy cùng chỗ với -Password.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 -Password <HY_PASSWORD> -Obfs <HY_OBFS>

.EXAMPLE
  # Kiểm tra bộ publish thay vì windows\assets (đúng thứ khách sẽ chạy):
  powershell -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 `
    -AssetsDir windows\installer\publish -Password <HY_PASSWORD> -Obfs <HY_OBFS>
#>
[CmdletBinding()]
param(
  [string]$AssetsDir = "",

  # Địa chỉ node (danh tính QUIC khi đi qua relay). Mặc định = node-2.
  [string]$Server = "165.101.114.162:8443",

  # Relay WebSocket. Mặc định = /relay/vn2hy (exit node-2, đo nhanh hơn node-1).
  [string]$RelayUrl = "wss://api.meetflowai.site/relay/vn2hy",

  # Khong bat buoc o che do -ConfigOnly (chi kiem cau hinh, khong dung credential).
  [string]$Password = "",
  [string]$Obfs = "",

  [int]$ReadyTimeoutSec = 15,
  [long]$SpeedBytes = 50000000,
  [int]$UpKbps = 0,
  [int]$DownKbps = 0,
  [int]$SettleSeconds = 3,

  # Giữ lại thư mục tạm (cấu hình + log) để chẩn đoán khi lỗi.
  [switch]$KeepFiles,

  # Chi sinh cau hinh + chay `sing-box check` roi thoat: KHONG dung TUN/route nen KHONG can quyen
  # Administrator va KHONG can -Password/-Obfs. Dung de kiem cau hinh ngay tren may khong phai admin.
  [switch]$ConfigOnly,

  # Dung file CIDR co san thay vi tai CDN (vi du docs\routes\cn-cidrs.txt - da gop ca IPv4 + IPv6).
  # Can khi may khong ra duoc CDN. Bo trong thi tai nhu app.
  [string[]]$LocalCidrs = @()
)

$ErrorActionPreference = "Stop"

# Địa chỉ TUN mà SingBoxConfigBuilder dùng (dùng để nhận diện route còn sót).
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

# Ghi file KHÔNG BOM: `Set-Content -Encoding UTF8` của Windows PowerShell 5.1 thêm BOM, mà
# json.Unmarshal của Go (dùng bởi cả flowvpnrelay.exe lẫn sing-box.exe) từ chối BOM.
function Write-JsonFile([string]$path, [string]$content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object -TypeName Security.Principal.WindowsPrincipal -ArgumentList @($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Đọc file log mà tiến trình khác đang ghi (Get-Content mặc định sẽ bị từ chối chia sẻ).
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

# Cấp cổng TCP trống: mở đồng thời mọi listener rồi mới đóng, để hai cổng không trùng nhau.
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

# Giữ đúng thứ tự dọn của app: sing-box TRƯỚC (để nó gỡ TUN/route) rồi mới tới flowvpnrelay.
function Stop-Child([System.Diagnostics.Process]$process, [string]$name) {
  if ($null -eq $process) { return }
  try {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction Stop
      Note "đã kill $name (pid $($process.Id))"
    } else {
      Note "$name đã thoát trước đó (exit code $($process.ExitCode))"
    }
  } catch {
    Note "kill $name lỗi (bỏ qua): $($_.Exception.Message)"
  } finally {
    try { $process.WaitForExit(5000) } catch { }
    $process.Dispose()
  }
}

# Route/TUN còn sót sau khi sing-box bị kill cứng — dọn để máy không trỏ ra ngoài qua đường chết.
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
        Note "đã xoá route sót: $($route.DestinationPrefix) -> $($route.NextHop)"
      } catch {
        Note "xoá route $($route.DestinationPrefix) lỗi: $($_.Exception.Message)"
      }
    }
  } catch {
    Note "không đọc được bảng route: $($_.Exception.Message)"
  }

  try {
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "$TunAdapterName*" })
    foreach ($adapter in $adapters) {
      Note "CẢNH BÁO: adapter TUN còn lại '$($adapter.Name)' ($($adapter.Status)) — mở Network Connections để gỡ nếu cần."
    }
  } catch { }

  return $removed
}

# --- dọn dẹp luôn chạy, kể cả khi lỗi giữa chừng -----------------------------
$relayProcess = $null
$singBoxProcess = $null
$workDir = $null

try {
  # 0) môi trường
  Step "Kiểm tra môi trường"
  if (-not $ConfigOnly -and -not (Test-IsAdmin)) {
    throw "Script cần chạy với quyền Administrator (sing-box phải tạo TUN + sửa bảng route)."
  }
  if (-not $ConfigOnly -and ([string]::IsNullOrWhiteSpace($Password) -or [string]::IsNullOrWhiteSpace($Obfs))) {
    throw "Thieu -Password/-Obfs (bat buoc khi dung tunnel that). Dung -ConfigOnly neu chi muon kiem cau hinh."
  }
  if ($ConfigOnly) {
    Note "che do -ConfigOnly: chi sinh cau hinh + sing-box check, KHONG dung TUN/route nen khong can admin."
  } else {
    Note "PowerShell $($PSVersionTable.PSVersion), admin: OK"
  }

  if ([string]::IsNullOrWhiteSpace($AssetsDir)) {
    $AssetsDir = Join-Path (Split-Path -Parent $PSScriptRoot) "assets"
  }
  $AssetsDir = (Resolve-Path -LiteralPath $AssetsDir).Path
  $relayExe = Join-Path $AssetsDir "flowvpnrelay.exe"
  $singBoxExe = Join-Path $AssetsDir "sing-box.exe"
  foreach ($exe in @($relayExe, $singBoxExe)) {
    if (-not (Test-Path -LiteralPath $exe)) {
      throw "Thiếu $exe — chạy: bash windows\assets\fetch-assets.sh (hoặc trỏ -AssetsDir vào thư mục publish)."
    }
    $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLower()
    Note ("{0}  {1} bytes  sha256={2}" -f (Split-Path -Leaf $exe), (Get-Item -LiteralPath $exe).Length, $hash)
  }

  Step "sing-box.exe version (phải là 1.14.1)"
  $sbVersion = (& $singBoxExe version 2>&1 | Out-String).Trim()
  Record "sing-box version" $LASTEXITCODE
  Note $sbVersion
  if ($sbVersion -notmatch "1\.14\.1") {
    Write-Host "    CẢNH BÁO: phiên bản không khớp 1.14.1 trong THIRD_PARTY.md." -ForegroundColor Yellow
  }

  # 1) cấu hình tạm (mirror SingBoxConfigBuilder)
  Step "Dựng 2 file cấu hình tạm"
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

  # Danh sach dai IP + ten mien Trung Quoc di THANG: CHEP tu SingBoxConfigBuilder.cs
  # (ChinaServiceDomainSuffixes + ChinaDirectDomainSuffixes). Sua builder thi SUA CA DAY.
  # Vi sao phai co: ban cu thieu ca rule ip_cidr lan rule domain_suffix => script bao "DAT" trong khi
  # app TQ van di qua tunnel (dung ca khach bao 22/09/2026: "bat VPN khong bypass duoc app Trung Quoc").
  $chinaDirectDomains = @('weixin.qq.com', 'wechat.com', 'weixinbridge.com', 'servicewechat.com',
    'qpic.cn', 'gtimg.com', 'gtimg.cn', 'qlogo.cn', 'tencent.com', 'tencent-cloud.com',
    'myqcloud.com', 'qq.com', 'qcloud.com', 'cn')
  $chinaServiceDomains = @('alipay.com', 'alipayobjects.com', 'unionpay.com', 'ccb.com', 'abchina.com',
    'cmbchina.com', 'bankcomm.com', 'psbc.com', 'taobao.com', 'tmall.com', 'alicdn.com', 'alibaba.com',
    'alibabacloud.com', '1688.com', 'jd.com', 'pinduoduo.com', 'yangkeduo.com', 'suning.com',
    'cainiao.com', 'sf-express.com', 'baidu.com', 'bdstatic.com', 'meituan.com', 'dianping.com',
    'ele.me', 'didiglobal.com', 'amap.com', 'autonavi.com', 'bilibili.com', 'hdslb.com', 'douyin.com',
    'bytedance.com', 'ixigua.com', 'kuaishou.com', 'iqiyi.com', 'youku.com', 'weibo.com', 'zhihu.com',
    'xiaohongshu.com', '163.com', 'qunar.com', 'ctrip.com', 'wps.com')

  # CUNG nguon du lieu ma ChinaBypass.LoadAllAsync dung (cn.txt + cn6.txt).
  $chinaCidrs = @()
  if ($LocalCidrs.Count -gt 0) {
    foreach ($file in $LocalCidrs) {
      $path = (Resolve-Path -LiteralPath $file).Path
      Note "dung danh sach CIDR cuc bo: $path"
      $chinaCidrs += @(Get-Content -LiteralPath $path | ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith('#') -and $_ -match '/' })
    }
  } else {
    foreach ($url in @('https://meetflowai.site/dl/routes/cn.txt', 'https://meetflowai.site/dl/routes/cn6.txt')) {
      try {
        $text = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30).Content
        $chinaCidrs += @($text -split "`n" | ForEach-Object { $_.Trim() } |
          Where-Object { $_ -and -not $_.StartsWith('#') -and $_ -match '/' })
      } catch {
        Note "khong tai duoc $url : $($_.Exception.Message)"
      }
    }
  }
  $chinaCidrs = @($chinaCidrs | Select-Object -Unique)

  if ($chinaCidrs.Count -eq 0) {
    Note "CANH BAO: khong co danh sach CIDR Trung Quoc - script chay KHONG kem bypass (giong app khi mat mang)."
    $ipCidrRule = ''
    $dnsCnServer = ''
    $dnsRules = ''
    $defaultResolver = ''
  } else {
    Note "danh sach CIDR Trung Quoc: $($chinaCidrs.Count) dai (cn.txt + cn6.txt)"
    $ipCidrRule = ",`n      { ""ip_cidr"": [" +
      (($chinaCidrs | ForEach-Object { '"' + $_ + '"' }) -join ', ') + "], ""outbound"": ""direct"" }"
    $dnsCnServer = ",`n      { ""type"": ""udp"", ""tag"": ""cn"", ""server"": ""223.5.5.5"" }"
    $dnsRules = "`n      { ""domain_suffix"": [" +
      (($chinaServiceDomains | ForEach-Object { '"' + $_ + '"' }) -join ', ') + "], ""server"": ""cn"" }`n    "
    # BAT BUOC khi co dns.rules/DNS server thu hai: thieu truong nay sing-box 1.14 FATAL ngay.
    $defaultResolver = ",`n    ""default_domain_resolver"": ""remote"""
  }

  $domainSuffixList = (@($chinaDirectDomains + $chinaServiceDomains) |
    ForEach-Object { '"' + $_ + '"' }) -join ', '

  $singBoxJson = @'
{
  "log": { "level": "info", "output": "__LOG__", "timestamp": true },
  "dns": {
    "servers": [ { "type": "udp", "tag": "remote", "server": "1.1.1.1" }__DNSCN__ ],
    "rules": [__DNSRULES__],
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
      { "ip_is_private": true, "outbound": "direct" }__IPCIDR__,
      { "domain_suffix": [__DOMAINS__], "outbound": "direct" },
      { "protocol": "dns", "action": "hijack-dns" }
    ],
    "final": "hyrelay",
    "auto_detect_interface": true__RESOLVER__
  },
  "experimental": { "clash_api": { "external_controller": "127.0.0.1:__CLASHPORT__" } }
}
'@
  $singBoxJson = $singBoxJson.Replace("__LOG__", $singBoxAppLog.Replace("\", "\\"))
  $singBoxJson = $singBoxJson.Replace("__DNSCN__", $dnsCnServer)
  $singBoxJson = $singBoxJson.Replace("__DNSRULES__", $dnsRules)
  $singBoxJson = $singBoxJson.Replace("__IPCIDR__", $ipCidrRule)
  $singBoxJson = $singBoxJson.Replace("__DOMAINS__", $domainSuffixList)
  $singBoxJson = $singBoxJson.Replace("__RESOLVER__", $defaultResolver)
  $singBoxJson = $singBoxJson.Replace("__SOCKSPORT__", "$socksPort")
  $singBoxJson = $singBoxJson.Replace("__CLASHPORT__", "$clashPort")
  Write-JsonFile $singBoxCfg $singBoxJson

  Note "thư mục tạm: $workDir"
  Note "flowvpnrelay.json -> socks5 127.0.0.1:$socksPort · sing-box.json -> clash 127.0.0.1:$clashPort"

  # 2) sing-box check (không cần quyền, kiểm cấu hình trước khi dựng TUN)
  Step "sing-box check -c sing-box.json (bắt lỗi cấu hình trước khi dựng TUN)"
  $checkOutput = (& $singBoxExe check -c $singBoxCfg 2>&1 | Out-String).Trim()
  Record "sing-box check" $LASTEXITCODE
  if ($checkOutput) { Note $checkOutput }
  if ($LASTEXITCODE -ne 0) { throw "sing-box check thất bại — cấu hình sai, dừng trước khi dựng TUN." }

  if ($ConfigOnly) {
    Note "cau hinh HOP LE (sing-box check DAT): $singBoxCfg (them -KeepFiles neu muon giu lai)"
    return
  }

  # 3) flowvpnrelay.exe
  Step "Chạy flowvpnrelay.exe -c flowvpnrelay.json"
  $relayProcess = Start-Process -FilePath $relayExe `
    -ArgumentList ("-c `"{0}`"" -f $relayCfg) `
    -WorkingDirectory $AssetsDir -NoNewWindow -PassThru `
    -RedirectStandardOutput $relayOutLog -RedirectStandardError $relayErrLog
  Note "pid $($relayProcess.Id)"

  Step "Chờ dòng READY (tối đa $ReadyTimeoutSec s)"
  $ready = Wait-ForMarker $relayProcess $relayErrLog $ReadyTimeoutSec "READY "
  if (-not $ready) {
    Note "--- relay stderr ---"
    Note (Read-SharedText $relayErrLog)
    if ($relayProcess.HasExited) {
      Record "flowvpnrelay exit" $relayProcess.ExitCode
      throw "flowvpnrelay.exe thoát trước khi báo READY (exit code $($relayProcess.ExitCode))."
    }
    throw "flowvpnrelay.exe không báo READY trong $ReadyTimeoutSec s."
  }
  Record "flowvpnrelay READY" 0
  Note ("stderr: " + ((Read-SharedText $relayErrLog) -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 3 | Out-String).Trim())

  # 4) sing-box (chỉ sau READY: nó bật auto_route ngay khi khởi động)
  Step "Chạy sing-box.exe run -c sing-box.json"
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
    throw "sing-box.exe thoát ngay sau khi chạy (exit code $($singBoxProcess.ExitCode))."
  }
  Record "sing-box running" 0

  # 4b) KIEM BYPASS TRUNG QUOC — phep kiem QUYET DINH cho loi khach bao 22/09/2026:
  #     "bat VPN khong bypass duoc app Trung Quoc".
  #
  #     Vi sao KHONG the ket luan bang bang route cua Windows: auto_route day TAT CA traffic vao TUN,
  #     con quyet dinh "di thang hay qua node VN" nam BEN TRONG sing-box. Vi vay hoi thang clash_api:
  #     ket noi toi dia chi/dai Trung Quoc phai mang outbound "direct", ket noi khac phai mang "hyrelay".
  #     Neu ca hai deu "hyrelay" => bypass khong chay => app TQ se thay IP nuoc ngoai va cat ket noi.
  if ($chinaCidrs.Count -gt 0) {
    Step "Kiem bypass Trung Quoc qua clash_api (TQ -> direct, con lai -> hyrelay)"
    $probes = @(
      @{ Key = "223.5.5.5";       Kind = "ip";     Ip = "223.5.5.5";       Url = "https://223.5.5.5/";        Label = "dai TQ theo IP (AliDNS)"; Expect = "direct" },
      @{ Key = "114.114.114.114"; Kind = "ip";     Ip = "114.114.114.114"; Url = "http://114.114.114.114/";   Label = "dai TQ theo IP (114DNS)"; Expect = "direct" },
      @{ Key = "www.baidu.com";   Kind = "domain"; Ip = $null;             Url = "https://www.baidu.com/";    Label = "ten mien TQ (baidu)";      Expect = "direct" },
      @{ Key = "1.1.1.1";         Kind = "ip";     Ip = "1.1.1.1";         Url = "https://1.1.1.1/";          Label = "ngoai TQ (Cloudflare)";    Expect = "hyrelay" }
    )

    $bypassOk = $true
    foreach ($probe in $probes) {
      # curl chay NEN: ket noi toi dia chi TQ co the bi treo/chan, nhung trong luc dang thu thi
      # clash_api da ghi nhan => dung de doc outbound da chon. Ket thuc som bang Kill.
      $proc = Start-Process -FilePath "curl.exe" -PassThru -WindowStyle Hidden `
        -ArgumentList @("-s", "-o", "NUL", "-k", "--max-time", "12", $probe.Url)
      $chains = $null
      for ($i = 0; $i -lt 30 -and -not $chains; $i++) {
        Start-Sleep -Milliseconds 300
        try {
          $conns = (Invoke-RestMethod -Uri "http://127.0.0.1:$clashPort/connections" -TimeoutSec 5).connections
        } catch {
          $conns = $null
        }
        if (-not $conns) { continue }
        if ($probe.Kind -eq "ip") {
          $hit = $conns | Where-Object { $_.metadata.destinationIP -eq $probe.Ip } | Select-Object -First 1
        } else {
          $hit = $conns | Where-Object {
            $_.metadata.host -like "*baidu.com*" -or $_.metadata.sniffHost -like "*baidu.com*"
          } | Select-Object -First 1
        }
        if ($hit) { $chains = ($hit.chains -join "/") }
      }
      if ($proc -and -not $proc.HasExited) { try { $proc.Kill() } catch { } }

      if ($chains -and $chains -like "*$($probe.Expect)*") {
        Note ("{0,-30} -> {1} [DAT, mong doi {2}]" -f $probe.Label, $chains, $probe.Expect)
      } else {
        $shown = if ($chains) { $chains } else { "khong bat duoc ket noi" }
        Note ("{0,-30} -> {1} [KHONG DAT, mong doi {2}]" -f $probe.Label, $shown, $probe.Expect)
        $bypassOk = $false
      }
    }

    Record "bypass TQ" $(if ($bypassOk) { 0 } else { 1 })
    if ($bypassOk) {
      Write-Host "==> BYPASS TRUNG QUOC: DAT - app TQ di thang, khong qua node VN." -ForegroundColor Green
    } else {
      Write-Host "==> BYPASS TRUNG QUOC: KHONG DAT - xem tung dong o tren." -ForegroundColor Yellow
    }
  } else {
    Note "bo qua kiem bypass TQ: khong co danh sach CIDR (chay lai voi -LocalCidrs <file>)."
  }

  # 5) đo băng thông qua SOCKS5 ĐÚNG cổng của relay (không đi qua TUN: đây là phép đo
  #    "relay + hysteria có chở được dữ liệu không", tách khỏi phần TUN/route).
  Step "Đo băng thông qua SOCKS5 bằng curl.exe"
  $speedUrl = "https://speed.cloudflare.com/__down?bytes=$SpeedBytes"
  $curlArgs = @("--socks5-hostname", "127.0.0.1:$socksPort", "-o", "NUL", "-s", "--max-time", "120",
                "-w", "%{speed_download}", $speedUrl)
  Note ("curl.exe " + ($curlArgs -join " "))
  $curlOut = (& curl.exe @curlArgs 2>&1 | Out-String).Trim()
  Record "curl" $LASTEXITCODE

  $bytesPerSec = 0.0
  if ([double]::TryParse($curlOut, [ref]$bytesPerSec)) {
    Note ("tốc độ tải: {0:N2} MB/s ({1:N1} Mbps) cho {2:N0} bytes yêu cầu" -f `
      ($bytesPerSec / 1MB), ($bytesPerSec * 8 / 1MB), $SpeedBytes)
  } else {
    Note "curl không trả về số đo (output: $curlOut)"
  }

  # 6) tổng kết
  Step "Tổng kết exit code từng bước"
  foreach ($key in $exitCodes.Keys) { Note ("{0} = {1}" -f $key, $exitCodes[$key]) }
  $ok = ($exitCodes["sing-box version"] -eq 0) -and ($exitCodes["sing-box check"] -eq 0) -and
        ($exitCodes["curl"] -eq 0) -and ($relayProcess -and -not $relayProcess.HasExited)
  if ($ok) {
    Write-Host "==> KẾT LUẬN: đường hysteria2-over-WS + sing-box CHẠY ĐƯỢC trên máy này." -ForegroundColor Green
  } else {
    Write-Host "==> KẾT LUẬN: đường relay có bước thất bại — xem exit code ở trên." -ForegroundColor Yellow
  }
} catch {
  Write-Host "==> LỖI: $($_.Exception.Message)" -ForegroundColor Red
  $script:failed = $true
} finally {
  Step "Dọn dẹp: kill sing-box TRƯỚC (gỡ TUN/route) rồi tới flowvpnrelay"
  Stop-Child $singBoxProcess "sing-box.exe"
  Stop-Child $relayProcess "flowvpnrelay.exe"

  $removed = Remove-RelayLeftovers
  Note "route/TUN đã dọn: $removed route"

  if ($workDir -and (Test-Path -LiteralPath $workDir)) {
    if ($KeepFiles) {
      Note "giữ thư mục tạm (-KeepFiles): $workDir"
    } else {
      Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
      Note "đã xoá thư mục tạm"
    }
  }

  if ($script:failed) { exit 1 }
}
