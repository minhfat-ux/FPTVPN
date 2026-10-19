<#
.SYNOPSIS
  Kiểm tra CÔ LẬP đường "hysteria2 bọc trong WebSocket" trên máy Windows, TRƯỚC khi mở app:
  tự dựng file cấu hình relay (có khối `tun`), chạy ĐÚNG MỘT tiến trình flowvpnrelay.exe,
  chờ dòng TUNREADY trên stderr, rồi kiểm THẬT (adapter TUN + địa chỉ, route full-tunnel,
  bypass TQ bằng Find-NetRoute, IP ra ngoài, DNS trong tunnel, HTTP 200 cho google + baidu),
  cuối cùng DỌN SẠCH tiến trình, route/TUN còn sót và in kết luận PASS/FAIL.

.DESCRIPTION
  Vì sao cần script riêng: khi app báo "không kết nối được", không phân biệt được lỗi ở
  relay (WS/Cloudflare), ở hysteria (auth/obfs), hay ở TUN/định tuyến/bypass. Từ 1.4.8 cả ba
  phần đó nằm trong CÙNG MỘT binary (flowvpnrelay.exe), nên script chạy đúng binary + đúng
  cấu hình mà windows/PrivateVPNWindows.Core/Tunnel/SingBoxConfigBuilder.cs
  (BuildRelayConfig) sinh ra — kết quả ở đây là kết luận về chính đường đó.

  KHÔNG còn sing-box.exe (bỏ từ 1.4.8): máy khách bật Smart App Control chặn binary bên thứ ba
  chưa ký (CodeIntegrity 3033/3077/3118, Win32 4551). Xem windows/assets/THIRD_PARTY.md §4.

  Cấu hình dưới đây CHÉP theo SingBoxConfigBuilder.BuildRelayConfig/BuildTun (cùng khoá, cùng
  giá trị mặc định). Nếu sửa builder thì sửa cả đây — hai chỗ phải khớp.

  -ConfigOnly KHÔNG cần quyền Administrator: chỉ sinh cấu hình + kiểm TĨNH (JSON hợp lệ, khối
  tun đúng name/ipv4/mtu, route.ipv4/ipv6 rỗng, có dải TQ trong ipv4Exclude, và ipv4Exclude
  không lẫn IPv6 — ngược lại cũng vậy) rồi thoát.
  Chế độ đầy đủ CẦN Administrator (dựng TUN + sửa bảng route của máy).

.PARAMETER Password
  HY_PASSWORD của hysteria (bắt buộc ở chế độ đầy đủ). KHÔNG hard-code trong file này: lấy từ
  android/app/src/main/java/com/privatevpn/app/Config.kt (hằng HY_PASSWORD) — file đó đã ghi rõ
  giá trị này nằm trong APK phát hành nên coi như công khai. Bản Windows dùng cùng giá trị ở
  windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayDefaults.cs.

.PARAMETER Obfs
  HY_OBFS của hysteria (bắt buộc ở chế độ đầy đủ). Lấy cùng chỗ với -Password.

.PARAMETER LocalCidrs
  Dùng file CIDR TQ có sẵn thay vì tải CDN (ví dụ docs\routes\cn-cidrs.txt — đã gộp IPv4 + IPv6).
  Cần khi máy không ra được CDN.

.EXAMPLE
  # Không cần admin: chỉ sinh cấu hình + kiểm tĩnh.
  powershell -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 -ConfigOnly -KeepFiles

.EXAMPLE
  # Kiểm tra thật (cần admin), trên bộ publish đúng thứ khách sẽ chạy:
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

  # Chi sinh cau hinh + kiem TINH roi thoat: KHONG dung TUN/route nen KHONG can quyen
  # Administrator va KHONG can -Password/-Obfs.
  [switch]$ConfigOnly,

  # Dung file CIDR co san thay vi tai CDN (vi du docs\routes\cn-cidrs.txt - da gop ca IPv4 + IPv6).
  [string[]]$LocalCidrs = @()
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Hằng số PHẢI khớp windows/PrivateVPNWindows.Core/Tunnel/HysteriaRelayDefaults.cs
# (nguồn sự thật là C#; PowerShell không đọc được file đó nên chép tay — sửa một chỗ thì sửa cả hai).
$TunAdapterName = "flowvpntun"                 # HysteriaRelayDefaults.TunName
$TunAddressCidr = "100.100.100.101/30"         # HysteriaRelayDefaults.TunAddress
$TunAddress = "100.100.100.101"                # địa chỉ trần (không prefix) để soi Get-NetIPAddress
$TunMtu = 1500                                 # HysteriaRelayDefaults.TunMtu
$TunDnsServer = "100.100.100.101"              # HysteriaRelayDefaults.TunDnsServer (bộ chia DNS của flowvpnrelay)
$TunDnsPort = 53                               # HysteriaRelayDefaults.TunDnsPort
$ChinaDnsUpstream = "223.5.5.5"                # HysteriaRelayDefaults.ChinaDnsUpstream
$RemoteDnsUpstream = "1.1.1.1"                 # HysteriaRelayDefaults.RemoteDnsUpstream
$TunReadyMarker = "TUNREADY "                  # HysteriaRelayDefaults.TunReadyMarker
$TunFailMarker = "TUNFAIL "                    # HysteriaRelayDefaults.TunFailMarker
$ReadyMarker = "READY "                        # HysteriaRelayDefaults.ReadyMarker (SOCKS5 đã mở)
$DialTimeoutSec = 12                           # HysteriaRelayDefaults.DialTimeoutSec
# ---------------------------------------------------------------------------

# Địa chỉ TQ đã biết, dùng cho phép kiểm bypass: route tới chúng KHÔNG được trỏ vào TUN.
# 223.5.5.5 = AliDNS · 114.114.114.114 = 114DNS · 180.101.50.242 = www.baidu.com
$ChinaProbeIps = @("223.5.5.5", "114.114.114.114", "180.101.50.242")

# Chữ ký GFW nhiễm độc DNS (lỗi khách thật): www.youtube.com trả về IP Facebook này.
$PoisonedYoutubeIp = "69.171.235.22"

$script:stepNo = 0
$script:failed = $false
$script:conclusionPrinted = $false
$script:checks = New-Object System.Collections.ArrayList
$script:relayProcess = $null
$script:workDir = $null
$script:relayOutLog = $null
$script:relayErrLog = $null
$script:relayCfg = $null

function Step([string]$message) {
  $script:stepNo++
  Write-Host ("==> [{0}] {1}" -f $script:stepNo, $message) -ForegroundColor Cyan
}

function Note([string]$message) {
  Write-Host "    $message"
}

# Ghi nhận một phép kiểm THẬT. Không bao giờ bỏ qua im lặng: mọi phép kiểm không chạy được
# đều phải đi qua Add-Check với $false + lý do, hoặc được in rõ là "thông tin".
function Add-Check([string]$name, [bool]$ok, [string]$detail) {
  [void]$script:checks.Add([pscustomobject]@{ Name = $name; Ok = $ok; Detail = $detail })
  $mark = "KHONG DAT"; $color = "Red"
  if ($ok) { $mark = "DAT"; $color = "Green" }
  Write-Host ("    [{0}] {1} — {2}" -f $mark, $name, $detail) -ForegroundColor $color
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object -TypeName Security.Principal.WindowsPrincipal -ArgumentList @($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Ghi file KHÔNG BOM: `Set-Content -Encoding UTF8` của Windows PowerShell 5.1 thêm BOM, mà
# json.Unmarshal của Go (flowvpnrelay.exe) từ chối BOM.
function Write-JsonFile([string]$path, [string]$content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
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

# Cấp một cổng TCP trống cho SOCKS5 nội bộ (cấu hình relay luôn khai socks5.listen như app).
function Get-FreePort {
  $listener = New-Object -TypeName System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

# Cắt lý do sau dòng TUNFAIL (app C# cũng lấy nguyên phần sau marker tới hết dòng).
function Get-TunFailReason([string]$text) {
  $line = ($text -split "`n" | Where-Object { $_ -match [regex]::Escape($TunFailMarker) } | Select-Object -Last 1)
  if (-not $line) { return "" }
  $idx = $line.IndexOf($TunFailMarker)
  if ($idx -lt 0) { return $line.Trim() }
  return $line.Substring($idx + $TunFailMarker.Length).Trim()
}

# Chờ ĐÚNG dòng TUNREADY (KHÔNG phải READY: READY chỉ nghĩa SOCKS5 đã mở, TUNREADY mới là
# mốc tunnel dùng được). Trả về @{ Ok; Tunned; Fail; Ready; Reason }.
function Wait-ForTunReady([System.Diagnostics.Process]$process, [string]$logPath, [int]$timeoutSec) {
  $result = @{ Ok = $false; Fail = $false; Ready = $false; Reason = "" }
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    $text = Read-SharedText $logPath
    if ($text) {
      if ($text.Contains($script:ReadyMarker)) { $result.Ready = $true }
      if ($text.Contains($script:TunFailMarker)) {
        $result.Fail = $true
        $result.Reason = Get-TunFailReason $text
        return $result
      }
      if ($text.Contains($script:TunReadyMarker)) {
        $result.Ok = $true
        return $result
      }
    }
    if ($process.HasExited) {
      $result.Reason = "tiến trình đã thoát (exit code $($process.ExitCode)) trước khi có $($script:TunReadyMarker)"
      return $result
    }
    Start-Sleep -Milliseconds 200
  }
  $result.Reason = "hết $timeoutSec s mà chưa thấy dòng '$($script:TunReadyMarker)' trên stderr"
  return $result
}

function Get-TunAdapter {
  return @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $script:TunAdapterName })
}

# Route auto của TUN: strict=false ⇒ 0.0.0.0/1 + 128.0.0.0/1; vẫn chấp nhận 0.0.0.0/0.
function Test-FullTunnelRoutes([int]$tunIfIndex) {
  $prefixes = @(Get-NetRoute -InterfaceIndex $tunIfIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    ForEach-Object { $_.DestinationPrefix })
  $ok = ($prefixes -contains "0.0.0.0/0") -or
        (($prefixes -contains "0.0.0.0/1") -and ($prefixes -contains "128.0.0.0/1"))
  return @{ Ok = $ok; Prefixes = $prefixes }
}

# Dọn route/TUN còn sót sau khi flowvpnrelay bị kill cứng — để máy không trỏ ra ngoài qua đường chết.
function Remove-RelayLeftovers {
  $removed = 0
  $adapters = @(Get-TunAdapter)
  if ($adapters.Count -eq 0) {
    Note "không còn adapter '$TunAdapterName' (đúng như mong đợi sau khi kill tiến trình)"
    try {
      $routes = @(Get-NetRoute -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.NextHop -like "100.100.100.*" -or $_.DestinationPrefix -like "100.100.100.*" })
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

    # Route auto của TUN (0.0.0.0/0 hoặc cặp 0.0.0.0/1 + 128.0.0.0/1) trỏ vào interface đã BIẾN MẤT
    # là route chết: /1 cụ thể hơn /0 nên nó chặn cả internet. Chỉ xoá khi interface không còn tồn tại.
    try {
      $liveIf = @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | ForEach-Object { $_.ifIndex })
      $dangling = @(Get-NetRoute -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { ($_.DestinationPrefix -in @("0.0.0.0/0", "0.0.0.0/1", "128.0.0.0/1")) -and ($liveIf -notcontains $_.InterfaceIndex) })
      foreach ($route in $dangling) {
        try {
          Remove-NetRoute -DestinationPrefix $route.DestinationPrefix -NextHop $route.NextHop `
            -InterfaceIndex $route.InterfaceIndex -Confirm:$false -ErrorAction Stop
          $removed++
          Note "đã xoá route auto mồ côi: $($route.DestinationPrefix) (ifIndex $($route.InterfaceIndex) không còn tồn tại)"
        } catch {
          Note "xoá route mồ côi $($route.DestinationPrefix) lỗi: $($_.Exception.Message)"
        }
      }
    } catch {
      Note "không đọc được danh sách adapter: $($_.Exception.Message)"
    }
    return $removed
  }

  foreach ($adapter in $adapters) {
    Note "CẢNH BÁO: adapter TUN còn lại '$($adapter.Name)' ($($adapter.Status), ifIndex $($adapter.ifIndex))"
    $left = @(Get-NetRoute -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue)
    if ($left.Count -gt 0) { Note ("  route còn trên adapter đó: " + (($left | ForEach-Object { $_.DestinationPrefix }) -join ", ")) }
    # Cùng thác gỡ adapter mà app dùng: Remove-PnpDevice (module PnpDevice) rồi pnputil.
    try {
      Import-Module PnpDevice -ErrorAction Stop
      $dev = Get-PnpDevice -ErrorAction Stop | Where-Object { $_.FriendlyName -eq $adapter.Name } | Select-Object -First 1
      if ($dev) {
        Remove-PnpDevice -InstanceId $dev.InstanceId -Confirm:$false -ErrorAction Stop
        Note "đã gỡ adapter TUN qua Remove-PnpDevice"
      } else {
        Note "không tìm thấy PnP device cho adapter — để lại cho người kiểm tra"
      }
    } catch {
      Note "gỡ adapter TUN lỗi (bỏ qua): $($_.Exception.Message)"
      Note "  → mở Device Manager / Network Connections để gỡ tay nếu adapter còn."
    }
  }
  return $removed
}

function Test-Http200([string]$url) {
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 5
    return @{ Ok = ($resp.StatusCode -eq 200); Detail = "HTTP $($resp.StatusCode)" }
  } catch {
    return @{ Ok = $false; Detail = "lỗi: $($_.Exception.Message)" }
  }
}

# --- dọn dẹp luôn chạy, kể cả khi lỗi giữa chừng -----------------------------
try {
  # 0) môi trường
  Step "Kiểm tra môi trường"
  if (-not $ConfigOnly -and -not (Test-IsAdmin)) {
    throw "Script cần chạy với quyền Administrator (flowvpnrelay.exe phải tạo TUN + sửa bảng route)."
  }
  if (-not $ConfigOnly -and ([string]::IsNullOrWhiteSpace($Password) -or [string]::IsNullOrWhiteSpace($Obfs))) {
    throw "Thieu -Password/-Obfs (bat buoc khi dung tunnel that). Dung -ConfigOnly neu chi muon kiem cau hinh."
  }
  if ($ConfigOnly) {
    Note "che do -ConfigOnly: chi sinh cau hinh + kiem TINH, KHONG dung TUN/route nen khong can admin."
  } else {
    Note "PowerShell $($PSVersionTable.PSVersion), admin: OK"
  }
  # Invoke-WebRequest/Invoke-RestMethod của PowerShell 5.1 mặc định không bật TLS 1.2.
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

  if ([string]::IsNullOrWhiteSpace($AssetsDir)) {
    $AssetsDir = Join-Path (Split-Path -Parent $PSScriptRoot) "assets"
  }
  $AssetsDir = (Resolve-Path -LiteralPath $AssetsDir).Path
  $relayExe = Join-Path $AssetsDir "flowvpnrelay.exe"
  if (-not (Test-Path -LiteralPath $relayExe)) {
    throw "Thiếu $relayExe — chạy: bash windows\assets\fetch-assets.sh (hoặc trỏ -AssetsDir vào thư mục publish)."
  }
  $hash = (Get-FileHash -LiteralPath $relayExe -Algorithm SHA256).Hash.ToLower()
  Note ("flowvpnrelay.exe  {0} bytes  sha256={1}" -f (Get-Item -LiteralPath $relayExe).Length, $hash)
  Note "(sing-box.exe KHÔNG còn trong sản phẩm — TUN/route/bypass nằm trong chính binary này)"

  # 1) danh sách CIDR Trung Quốc đi THẲNG (nguồn dữ liệu ChinaBypass.LoadAllAsync: cn.txt + cn6.txt)
  Step "Lấy danh sách CIDR Trung Quốc (bypass)"
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
    Add-Check "danh sách CIDR Trung Quốc" $false "KHÔNG lấy được dải nào (CDN không tới được?) — chạy lại với -LocalCidrs <file>; bypass KHÔNG thể kiểm chứng nên DỪNG."
    throw "Không có danh sách CIDR Trung Quốc ⇒ không dựng được cấu hình có bypass để kiểm."
  }
  $v4Exclude = @($chinaCidrs | Where-Object { -not $_.Contains(':') })
  $v6Exclude = @($chinaCidrs | Where-Object { $_.Contains(':') })
  Note ("CIDR Trung Quốc: {0} dải (IPv4 {1} + IPv6 {2})" -f $chinaCidrs.Count, $v4Exclude.Count, $v6Exclude.Count)

  # 2) dựng cấu hình tạm — mirror SingBoxConfigBuilder.BuildRelayConfig/BuildTun
  Step "Dựng file cấu hình relay (có khối tun)"
  $socksPort = Get-FreePort
  $script:workDir = Join-Path $env:TEMP ("vpnflow-verify-relay-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $script:workDir | Out-Null

  $script:relayCfg = Join-Path $script:workDir "flowvpnrelay.json"
  $script:relayErrLog = Join-Path $script:workDir "relay.stderr.log"
  $script:relayOutLog = Join-Path $script:workDir "relay.stdout.log"

  $v4Json = "[" + (($v4Exclude | ForEach-Object { '"' + $_ + '"' }) -join ", ") + "]"
  $v6Json = "[" + (($v6Exclude | ForEach-Object { '"' + $_ + '"' }) -join ", ") + "]"

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
  "dialTimeoutSec": __DIALTIMEOUT__,
  "tun": {
    "name": "__TUNNAME__",
    "mtu": __TUNMTU__,
    "ipv4": "__TUNADDR__",
    "route": {
      "strict": false,
      "ipv4": [],
      "ipv6": [],
      "ipv4Exclude": __V4EXCL__,
      "ipv6Exclude": __V6EXCL__
    }
  },
  "dns": {
    "listen": "__TUNADDR_HOST__:__DNSPORT__",
    "cn": "__CNDNS__:__DNSPORT__",
    "remote": "__REMOTEDNS__:__DNSPORT__",
    "cnSuffixes": ["qq.com", "weixin.qq.com", "tencent.com", "baidu.com", "taobao.com",
                   "tmall.com", "alipay.com", "jd.com", "alibaba.com", "bilibili.com",
                   "douyin.com", "meituan.com", "163.com", "weibo.com", "zhihu.com",
                   "xiaohongshu.com", "ctrip.com", "iqiyi.com", "youku.com", "pinduoduo.com",
                   "aliyun.com", "huawei.com", "cn"]
  }
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
  $relayJson = $relayJson.Replace("__DIALTIMEOUT__", "$DialTimeoutSec")
  $relayJson = $relayJson.Replace("__TUNNAME__", $TunAdapterName)
  $relayJson = $relayJson.Replace("__TUNMTU__", "$TunMtu")
  $relayJson = $relayJson.Replace("__TUNADDR__", $TunAddressCidr)
  $relayJson = $relayJson.Replace("__V4EXCL__", $v4Json)
  $relayJson = $relayJson.Replace("__V6EXCL__", $v6Json)
  $relayJson = $relayJson.Replace("__TUNADDR_HOST__", $TunAddress)
  $relayJson = $relayJson.Replace("__DNSPORT__", "$TunDnsPort")
  $relayJson = $relayJson.Replace("__CNDNS__", $ChinaDnsUpstream)
  $relayJson = $relayJson.Replace("__REMOTEDNS__", $RemoteDnsUpstream)
  Write-JsonFile $script:relayCfg $relayJson

  Note "thư mục tạm: $($script:workDir)"
  Note "cấu hình: $($script:relayCfg) (socks5 127.0.0.1:$socksPort)"

  # 3) KIỂM TĨNH trên chính file cấu hình vừa sinh (chạy được ở CẢ hai chế độ)
  Step "Kiểm tĩnh cấu hình (JSON + khối tun + danh sách bypass)"
  $cfg = $null
  $jsonOk = $true
  $jsonError = ""
  try { $cfg = Get-Content -LiteralPath $script:relayCfg -Raw | ConvertFrom-Json } catch { $jsonOk = $false; $jsonError = $_.Exception.Message }
  Add-Check "JSON hợp lệ" $jsonOk $(if ($jsonOk) { $script:relayCfg } else { "ConvertFrom-Json lỗi: $jsonError" })

  if ($jsonOk) {
    $tun = $cfg.tun
    Add-Check "có khối tun" ($null -ne $tun) "bắt buộc: không có tun ⇒ chỉ mở SOCKS5, không full-tunnel"
    if ($tun) {
      Add-Check "tun.name = $TunAdapterName" ($tun.name -eq $TunAdapterName) "thực tế: '$($tun.name)'"
      Add-Check "tun.ipv4 = $TunAddressCidr" ($tun.ipv4 -eq $TunAddressCidr) "thực tế: '$($tun.ipv4)'"
      Add-Check "tun.mtu = $TunMtu" ($tun.mtu -eq $TunMtu) "thực tế: '$($tun.mtu)'"
      $addrGap = @($tun.route.ipv4).Count
      $addr6Gap = @($tun.route.ipv6).Count
      Add-Check "route.ipv4 RỖNG (= auto-route toàn bộ 0.0.0.0/0)" ($addrGap -eq 0) "số phần tử: $addrGap"
      Add-Check "route.ipv6 RỖNG (= auto-route toàn bộ ::/0)" ($addr6Gap -eq 0) "số phần tử: $addr6Gap"
      Add-Check "route.strict = false" ($tun.route.strict -eq $false) "strict=true làm mất mạng khi tiến trình chết giữa chừng"

      $ex4 = @($tun.route.ipv4Exclude)
      $ex6 = @($tun.route.ipv6Exclude)
      Add-Check "ipv4Exclude có dải TQ (bypass)" ($ex4.Count -gt 0) "số dải IPv4: $($ex4.Count)"
      $bad4 = @($ex4 | Where-Object { $_.Contains(':') })
      Add-Check "ipv4Exclude KHÔNG lẫn IPv6" ($bad4.Count -eq 0) $(if ($bad4.Count -eq 0) { "không có phần tử nào chứa ':'" } else { "phần tử sai: " + (($bad4 | Select-Object -First 3) -join ", ") })
      $bad6 = @($ex6 | Where-Object { -not $_.Contains(':') })
      Add-Check "ipv6Exclude KHÔNG lẫn IPv4" ($bad6.Count -eq 0) $(if ($bad6.Count -eq 0) { "số dải IPv6: $($ex6.Count), tất cả đều có ':'" } else { "phần tử sai: " + (($bad6 | Select-Object -First 3) -join ", ") })

      # Mọi phần tử phải parse được thành CIDR đúng họ địa chỉ (hysteria từ chối cả tunnel nếu sai).
      $invalid = New-Object System.Collections.ArrayList
      foreach ($pair in @(@{ List = $ex4; V4 = $true; Field = "ipv4Exclude" }, @{ List = $ex6; V4 = $false; Field = "ipv6Exclude" })) {
        foreach ($cidr in $pair.List) {
          $parts = $cidr.Split('/')
          if ($parts.Count -ne 2) { [void]$invalid.Add("$($pair.Field): '$cidr' thiếu /prefix"); continue }
          $ip = $null
          if (-not [System.Net.IPAddress]::TryParse($parts[0], [ref]$ip)) { [void]$invalid.Add("$($pair.Field): '$cidr' địa chỉ không hợp lệ"); continue }
          $isV4 = ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork)
          if ($isV4 -ne $pair.V4) { [void]$invalid.Add("$($pair.Field): '$cidr' sai họ địa chỉ"); continue }
          $len = 0
          if (-not [int]::TryParse($parts[1], [ref]$len)) { [void]$invalid.Add("$($pair.Field): '$cidr' prefix không phải số"); continue }
          $max = 32; if (-not $pair.V4) { $max = 128 }
          if ($len -lt 0 -or $len -gt $max) { [void]$invalid.Add("$($pair.Field): '$cidr' prefix ngoài 0..$max") }
        }
      }
      Add-Check "mọi CIDR bypass parse được đúng họ địa chỉ" ($invalid.Count -eq 0) $(if ($invalid.Count -eq 0) { "$($ex4.Count + $ex6.Count) dải đều hợp lệ" } else { ($invalid | Select-Object -First 3) -join " · " })

      $wsOk = ($cfg.transport.type -eq "wsrelay") -and ($cfg.transport.url -eq $RelayUrl)
      Add-Check "transport = wsrelay + đúng relay" $wsOk "type='$($cfg.transport.type)' url='$($cfg.transport.url)'"

      # Khối dns: bộ chia DNS. Thiếu nó thì adapter TUN không có DNS nào ⇒ Windows dùng resolver của
      # mạng khách ⇒ tên miền TQ bị GFW nhiễm độc (đúng lỗi 1.4.6) hoặc chậm (xem mục 8b).
      $dns = $cfg.dns
      Add-Check "có khối dns (bộ chia DNS)" ($null -ne $dns) "bắt buộc: không có dns ⇒ app đặt DNS trỏ vào địa chỉ không có ai nghe"
      if ($null -ne $dns) {
        Add-Check "dns.listen = $($TunDnsServer):53" ($dns.listen -eq "$($TunDnsServer):53") "thực tế: '$($dns.listen)'"
        Add-Check "dns.cn (resolver nội địa) khác rỗng" (-not [string]::IsNullOrWhiteSpace($dns.cn)) "thực tế: '$($dns.cn)'"
        Add-Check "dns.remote (resolver qua tunnel) khác rỗng" (-not [string]::IsNullOrWhiteSpace($dns.remote)) "thực tế: '$($dns.remote)'"
        $suf = @($dns.cnSuffixes)
        Add-Check "dns.cnSuffixes có tên miền TQ" ($suf.Count -gt 0 -and ($suf -contains "qq.com") -and ($suf -contains "cn")) "số mục: $($suf.Count)"
      }
    }
  }

  $staticFailed = @($script:checks | Where-Object { -not $_.Ok })
  if ($ConfigOnly) {
    if ($staticFailed.Count -gt 0) {
      Write-Host "==> KẾT LUẬN (-ConfigOnly): KHÔNG ĐẠT — $($staticFailed.Count) phép kiểm tĩnh thất bại." -ForegroundColor Red
      $script:failed = $true
    } else {
      Write-Host "==> KẾT LUẬN (-ConfigOnly): ĐẠT — $($script:checks.Count) phép kiểm tĩnh PASS, cấu hình dùng được." -ForegroundColor Green
    }
    $script:conclusionPrinted = $true
    return
  }
  if ($staticFailed.Count -gt 0) {
    throw "Cấu hình tĩnh KHÔNG ĐẠT ($($staticFailed.Count) phép kiểm) — dừng trước khi dựng TUN."
  }

  # 4) chạy flowvpnrelay.exe — MỘT tiến trình duy nhất, app cũng chỉ chạy đúng lệnh này
  Step "Chạy flowvpnrelay.exe -c flowvpnrelay.json (tiến trình DUY NHẤT)"
  $script:relayProcess = Start-Process -FilePath $relayExe `
    -ArgumentList ("-c `"{0}`"" -f $script:relayCfg) `
    -WorkingDirectory $AssetsDir -NoNewWindow -PassThru `
    -RedirectStandardOutput $script:relayOutLog -RedirectStandardError $script:relayErrLog
  Note "pid $($script:relayProcess.Id)"

  Step "Chờ dòng TUNREADY (tối đa $ReadyTimeoutSec s; KHÔNG chấp nhận chỉ READY)"
  $wait = Wait-ForTunReady $script:relayProcess $script:relayErrLog $ReadyTimeoutSec
  if (-not $wait.Ok) {
    Note "--- relay stderr ---"
    Note (Read-SharedText $script:relayErrLog)
    if ($wait.Fail) {
      Add-Check "TUNREADY" $false "TUNFAIL: $($wait.Reason)"
      throw "flowvpnrelay.exe báo TUNFAIL: $($wait.Reason)"
    }
    Add-Check "TUNREADY" $false $wait.Reason
    throw "flowvpnrelay.exe không lên được TUN: $($wait.Reason)"
  }
  Add-Check "TUNREADY" $true ("stderr: " + ((Read-SharedText $script:relayErrLog) -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1 | Out-String).Trim())
  if ($wait.Ready) { Note "có cả dòng READY (SOCKS5 đã mở)" } else { Note "CẢNH BÁO: chưa thấy dòng READY (SOCKS5) — chỉ có TUNREADY" }

  Start-Sleep -Seconds $SettleSeconds

  if ($script:relayProcess.HasExited) {
    Note "--- relay stderr ---"
    Note (Read-SharedText $script:relayErrLog)
    throw "flowvpnrelay.exe thoát ngay sau TUNREADY (exit code $($script:relayProcess.ExitCode))."
  }

  # 5) TUN có THẬT trên máy
  Step "Kiểm adapter TUN + địa chỉ + MTU"
  $adapters = @(Get-TunAdapter)
  Add-Check "adapter '$TunAdapterName' tồn tại" ($adapters.Count -gt 0) $(if ($adapters.Count -gt 0) { "ifIndex $($adapters[0].ifIndex), status $($adapters[0].Status), ifType $($adapters[0].InterfaceDescription)" } else { "Get-NetAdapter không thấy adapter này" })
  $tunIfIndex = 0
  if ($adapters.Count -gt 0) {
    $tunIfIndex = $adapters[0].ifIndex
    Add-Check "adapter ở trạng thái Up" ($adapters[0].Status -eq "Up") "Status = $($adapters[0].Status)"
    Add-Check "MTU adapter = $TunMtu" ($adapters[0].MtuSize -eq $TunMtu) "MtuSize = $($adapters[0].MtuSize)"

    $ipAddrs = @(Get-NetIPAddress -InterfaceIndex $tunIfIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue)
    $hit = @($ipAddrs | Where-Object { $_.IPAddress -eq $TunAddress })
    Add-Check "địa chỉ $TunAddress/$($TunAddressCidr.Split('/')[1]) trên adapter" ($hit.Count -gt 0) $(if ($hit.Count -gt 0) { "PrefixLength = $($hit[0].PrefixLength)" } else { "địa chỉ đang có: " + (($ipAddrs | ForEach-Object { "$($_.IPAddress)/$($_.PrefixLength)" }) -join ", ") })
    if ($hit.Count -gt 0) {
      Add-Check "prefix length = $($TunAddressCidr.Split('/')[1])" ($hit[0].PrefixLength -eq [int]$TunAddressCidr.Split('/')[1]) "PrefixLength = $($hit[0].PrefixLength)"
    }

    # 6) route full-tunnel trỏ vào adapter TUN
    Step "Kiểm route full-tunnel trỏ vào adapter TUN"
    $routeResult = Test-FullTunnelRoutes $tunIfIndex
    Add-Check "route 0.0.0.0/0 (hoặc 0.0.0.0/1 + 128.0.0.0/1) qua adapter TUN" $routeResult.Ok ("prefix trên adapter: " + (($routeResult.Prefixes | Sort-Object) -join ", "))

    # 7) bypass TQ: route tới IP Trung Quốc KHÔNG được trỏ vào TUN
    Step "Kiểm bypass Trung Quốc (Find-NetRoute: IP TQ phải đi thẳng, KHÔNG qua TUN)"
    $bypassFail = New-Object System.Collections.ArrayList
    foreach ($cnIp in $ChinaProbeIps) {
      try {
        $fr = @(Find-NetRoute -RemoteIPAddress $cnIp -ErrorAction Stop)
        $picked = $fr | Where-Object { $_.DestinationPrefix } | Select-Object -First 1
        if ($null -eq $picked) {
          [void]$bypassFail.Add("$cnIp : Find-NetRoute không trả về route nào")
          continue
        }
        $ok = ($picked.InterfaceIndex -ne $tunIfIndex)
        Add-Check "route tới $cnIp KHÔNG qua TUN" $ok ("ifIndex=$($picked.InterfaceIndex) nexthop=$($picked.NextHop) prefix=$($picked.DestinationPrefix)")
        if (-not $ok) { [void]$bypassFail.Add($cnIp) }
      } catch {
        # Không được bỏ qua im lặng: coi như KHÔNG kiểm được ⇒ tính là thất bại.
        Add-Check "route tới $cnIp KHÔNG qua TUN" $false "Find-NetRoute lỗi: $($_.Exception.Message)"
        [void]$bypassFail.Add($cnIp)
      }
    }
    if ($bypassFail.Count -eq 0) {
      Note "bypass TQ: các IP TQ đều đi thẳng (outbound của hysteria mới là nơi quyết định — kiểm bằng baidu ở bước HTTP)"
    }
  } else {
    Add-Check "adapter ở trạng thái Up" $false "không có adapter nên KHÔNG kiểm được"
    Add-Check "MTU adapter = $TunMtu" $false "không có adapter nên KHÔNG kiểm được"
    Add-Check "địa chỉ $TunAddress trên adapter" $false "không có adapter nên KHÔNG kiểm được"
    Add-Check "route full-tunnel qua adapter TUN" $false "không có adapter nên KHÔNG kiểm được"
    Add-Check "route tới IP TQ KHÔNG qua TUN" $false "không có adapter nên KHÔNG kiểm được"
  }

  # 8) DNS đặt LÊN adapter TUN (đúng cơ chế app dùng) rồi phân giải qua bộ chia DNS
  Step "Đặt DNS $TunDnsServer lên adapter TUN (netsh, như app) và kiểm bộ chia DNS"
  if ($tunIfIndex -gt 0) {
    & netsh.exe interface ipv4 set dnsservers "name=$TunAdapterName" source=static "address=$TunDnsServer" register=primary validate=no | Out-Null
    $dnsSet = @(Get-DnsClientServerAddress -InterfaceIndex $tunIfIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses
    Add-Check "DNS adapter TUN = $TunDnsServer (bộ chia DNS)" ($dnsSet -contains $TunDnsServer) "đang đặt: $($dnsSet -join ', ')"
  } else {
    Add-Check "DNS adapter TUN = $TunDnsServer (bộ chia DNS)" $false "không có adapter TUN nên KHÔNG đặt/không kiểm được"
  }

  $youtubeIps = @()
  try {
    $dns = @(Resolve-DnsName -Name "www.youtube.com" -Server $TunDnsServer -Type A -ErrorAction Stop)
    $youtubeIps = @($dns | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
    Add-Check "DNS qua tunnel ($TunDnsServer) phân giải www.youtube.com" ($youtubeIps.Count -gt 0) $(if ($youtubeIps.Count -gt 0) { "A: " + ($youtubeIps -join ", ") } else { "không có bản ghi A — truy vấn DNS qua tunnel KHÔNG chạy" })
  } catch {
    Add-Check "DNS qua tunnel ($TunDnsServer) phân giải www.youtube.com" $false "Resolve-DnsName lỗi: $($_.Exception.Message) ⇒ DNS trong tunnel KHÔNG chạy"
  }

  if ($youtubeIps.Count -gt 0) {
    $poisoned = @($youtubeIps | Where-Object { $_ -eq $PoisonedYoutubeIp })
    Add-Check "www.youtube.com KHÔNG bị nhiễm độc ($PoisonedYoutubeIp = IP Facebook)" ($poisoned.Count -eq 0) $(if ($poisoned.Count -eq 0) { "không có $PoisonedYoutubeIp trong kết quả" } else { "KẾT QUẢ NHIỄM ĐỘC: $PoisonedYoutubeIp — DNS đang đi thẳng ra resolver nhà mạng" })

    # IP thật của Google phải đi QUA tunnel; nếu nó bị xếp vào dải TQ (đi thẳng) thì đó là IP TQ/nhiễm độc.
    if ($tunIfIndex -gt 0) {
      $sample = $youtubeIps[0]
      try {
        $fr = @(Find-NetRoute -RemoteIPAddress $sample -ErrorAction Stop)
        $picked = $fr | Where-Object { $_.DestinationPrefix } | Select-Object -First 1
        $ok = ($null -ne $picked) -and ($picked.InterfaceIndex -eq $tunIfIndex)
        Add-Check "IP của youtube ($sample) đi QUA TUN" $ok $(if ($null -eq $picked) { "Find-NetRoute không trả route" } else { "ifIndex=$($picked.InterfaceIndex) nexthop=$($picked.NextHop)" })
      } catch {
        Add-Check "IP của youtube ($sample) đi QUA TUN" $false "Find-NetRoute lỗi: $($_.Exception.Message)"
      }
    }
  }

  # 8b) Bộ chia DNS: tên miền TQ phải nhận IP TQ ⇒ route đi THẲNG, không vào tunnel.
  # Vì sao phép kiểm này quan trọng nhất của mục DNS: đo thật 19/10/2026, nếu đặt resolver công cộng
  # thẳng lên adapter thì www.baidu.com trả 103.235.47.188 (Baidu HK, NGOÀI dải TQ) và bị đẩy vào
  # tunnel — https://www.baidu.com mất 26.217 ms thay vì 116 ms.
  Step "Bộ chia DNS: tên miền TQ phải nhận IP TQ (route đi thẳng)"
  foreach ($cnName in @("www.baidu.com", "www.taobao.com")) {
    try {
      $a = @(Resolve-DnsName -Name $cnName -Server $TunDnsServer -Type A -ErrorAction Stop |
               Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
      if ($a.Count -eq 0) {
        Add-Check "$cnName nhận IP TQ (đi thẳng)" $false "không có bản ghi A"
        continue
      }

      if ($tunIfIndex -gt 0) {
        $picked = @(Find-NetRoute -RemoteIPAddress $a[0] -ErrorAction SilentlyContinue) |
          Where-Object { $_.DestinationPrefix } | Select-Object -First 1
        $ok = ($null -ne $picked) -and ($picked.InterfaceIndex -ne $tunIfIndex)
        Add-Check "$cnName → $($a[0]) đi THẲNG (không qua TUN)" $ok $(if ($null -eq $picked) { "Find-NetRoute không trả route" } else { "ifIndex=$($picked.InterfaceIndex) (TUN=$tunIfIndex)" })
      } else {
        Add-Check "$cnName → $($a[0]) đi THẲNG (không qua TUN)" $false "không có adapter TUN nên KHÔNG kiểm được"
      }
    } catch {
      Add-Check "$cnName nhận IP TQ (đi thẳng)" $false "Resolve-DnsName lỗi: $($_.Exception.Message)"
    }
  }

  # 9) egress: IP ra ngoài phải KHÔNG phải IP Trung Quốc
  Step "Kiểm IP ra ngoài (egress) — không được là IP Trung Quốc"
  $egress = $null
  $egressVia = ""
  try {
    $egress = Invoke-RestMethod -Uri "https://ipinfo.io/json" -TimeoutSec 30
    $egressVia = "ipinfo.io"
  } catch {
    Note "ipinfo.io lỗi ($($_.Exception.Message)) — thử ip-api.com"
    try {
      $egress = Invoke-RestMethod -Uri "http://ip-api.com/json/?fields=status,country,countryCode,query" -TimeoutSec 30
      $egressVia = "ip-api.com"
    } catch {
      $egress = $null
    }
  }
  if ($null -eq $egress) {
    Add-Check "egress trả về IP + quốc gia" $false "cả ipinfo.io và ip-api.com đều lỗi — KHÔNG kiểm được egress (đừng coi là ĐẠT)"
  } else {
    $egressIp = $null; $egressCountry = $null
    $props = @($egress.PSObject.Properties.Name)
    if ($props -contains "query") { $egressIp = $egress.query; $egressCountry = $egress.countryCode }
    elseif ($props -contains "ip") { $egressIp = $egress.ip; $egressCountry = $egress.country }
    if ([string]::IsNullOrWhiteSpace($egressCountry)) {
      Add-Check "egress trả về IP + quốc gia" $false "phản hồi từ $egressVia thiếu trường quốc gia: $($egress | ConvertTo-Json -Compress)"
    } else {
      $ok = ($egressCountry.ToUpperInvariant() -ne "CN")
      Add-Check "IP ra ngoài KHÔNG ở Trung Quốc" $ok "ip=$egressIp country=$egressCountry (nguồn $egressVia)"
    }
  }

  # 10) HTTP 200: google (qua tunnel) + baidu (đi thẳng nhờ bypass)
  Step "Kiểm HTTP 200 cho https://www.google.com (qua tunnel) và https://www.baidu.com (đi thẳng)"
  $g = Test-Http200 "https://www.google.com"
  Add-Check "https://www.google.com trả HTTP 200" $g.Ok $g.Detail
  $b = Test-Http200 "https://www.baidu.com"
  Add-Check "https://www.baidu.com trả HTTP 200" $b.Ok $b.Detail

  # 11) thông lượng (THÔNG TIN — không tính vào PASS/FAIL)
  if ($SpeedBytes -gt 0) {
    Step "Đo thông lượng qua TUN (THÔNG TIN, KHÔNG tính vào PASS/FAIL)"
    $speedUrl = "https://speed.cloudflare.com/__down?bytes=$SpeedBytes"
    try {
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      $resp = Invoke-WebRequest -Uri $speedUrl -UseBasicParsing -TimeoutSec 120
      $sw.Stop()
      $bytes = $resp.RawContentLength
      if ($bytes -le 0) { $bytes = $resp.Content.Length }
      $secs = $sw.Elapsed.TotalSeconds
      if ($secs -le 0) { $secs = 0.001 }
      Note ("tải {0:N0} bytes trong {1:N1} s ⇒ {2:N2} MB/s ({3:N1} Mbps)" -f $bytes, $secs, ($bytes / 1MB / $secs), ($bytes * 8 / 1MB / $secs))
    } catch {
      Note "không đo được thông lượng (bỏ qua, KHÔNG tính là thất bại): $($_.Exception.Message)"
    }
  }
} catch {
  Write-Host "==> LỖI: $($_.Exception.Message)" -ForegroundColor Red
  $script:failed = $true
} finally {
  Step "Dọn dẹp: kill flowvpnrelay.exe rồi gỡ route/TUN còn sót"
  if ($script:relayProcess) {
    try {
      if (-not $script:relayProcess.HasExited) {
        Stop-Process -Id $script:relayProcess.Id -Force -ErrorAction Stop
        Note "đã kill flowvpnrelay.exe (pid $($script:relayProcess.Id))"
      } else {
        Note "flowvpnrelay.exe đã thoát trước đó (exit code $($script:relayProcess.ExitCode))"
      }
    } catch {
      Note "kill flowvpnrelay.exe lỗi (bỏ qua): $($_.Exception.Message)"
    } finally {
      try { $script:relayProcess.WaitForExit(5000) } catch { }
      $script:relayProcess.Dispose()
    }
  }

  Start-Sleep -Seconds 1
  $removed = Remove-RelayLeftovers
  Note "route đã dọn: $removed"

  if ($script:workDir -and (Test-Path -LiteralPath $script:workDir)) {
    if ($KeepFiles) {
      Note "giữ thư mục tạm (-KeepFiles): $($script:workDir)"
    } else {
      Remove-Item -LiteralPath $script:workDir -Recurse -Force -ErrorAction SilentlyContinue
      Note "đã xoá thư mục tạm"
    }
  }

  if ($ConfigOnly) {
    # -ConfigOnly thoát sớm (return) ở đường thành công, còn đường lỗi thì nhảy vào catch:
    # in kết luận ở đây để KHÔNG bao giờ kết thúc mà không có dòng PASS/FAIL.
    if (-not $script:conclusionPrinted) {
      $failedStatic = @($script:checks | Where-Object { -not $_.Ok })
      if ($script:failed -or $failedStatic.Count -gt 0) {
        Write-Host ("==> KẾT LUẬN (-ConfigOnly): KHÔNG ĐẠT — {0}/{1} phép kiểm tĩnh thất bại." -f $failedStatic.Count, $script:checks.Count) -ForegroundColor Red
      } else {
        Write-Host ("==> KẾT LUẬN (-ConfigOnly): ĐẠT — {0} phép kiểm tĩnh PASS." -f $script:checks.Count) -ForegroundColor Green
      }
    }
  } else {
    Step "Tổng kết từng phép kiểm"
    foreach ($check in $script:checks) {
      $mark = "KHONG DAT"; if ($check.Ok) { $mark = "DAT" }
      Note ("[{0}] {1} — {2}" -f $mark, $check.Name, $check.Detail)
    }
    $failedChecks = @($script:checks | Where-Object { -not $_.Ok })
    if ($failedChecks.Count -gt 0) { $script:failed = $true }
    if ($script:failed) {
      if ($script:checks.Count -eq 0) {
        Write-Host "==> KẾT LUẬN: FAIL — script dừng trước khi chạy được phép kiểm nào (xem dòng LỖI ở trên)." -ForegroundColor Red
      } else {
        Write-Host ("==> KẾT LUẬN: FAIL — {0}/{1} phép kiểm KHÔNG ĐẠT." -f $failedChecks.Count, $script:checks.Count) -ForegroundColor Red
      }
    } else {
      Write-Host ("==> KẾT LUẬN: PASS — {0} phép kiểm ĐẠT: TUN + route full-tunnel + bypass TQ + DNS trong tunnel + egress ngoài TQ + google/baidu HTTP 200." -f $script:checks.Count) -ForegroundColor Green
    }
  }

  if ($script:failed) { exit 1 }
}
