<#
.SYNOPSIS
  Kiểm tra A7 phần IPv6 trên Windows: dải IP Trung Quốc phải đi THẲNG qua NIC vật lý,
  phần IPv6 còn lại vẫn bị chặn (không rò IP thật ra ngoài).

.DESCRIPTION
  Vì sao cần script riêng: máy KHÔNG có IPv6 thì app **bỏ qua** phần bypass IPv6 (đúng thiết kế,
  xem TryGetPhysicalGatewayV6Async) nên không thể kiểm chứng bằng máy đó. Script này dùng ĐÚNG
  cách app làm (cùng danh sách /dl/routes/cn6.txt, cùng luật chọn NIC vật lý, cùng New-NetRoute)
  để chứng minh trên máy CÓ IPv6.

  ĐIỀU KIỆN: máy có IPv6 ra Internet + chạy PowerShell **bằng quyền Administrator** (thêm/xoá route).
  Script tự dọn sạch mọi route nó thêm, kể cả khi lỗi.

.PARAMETER ListUrl
  URL danh sách CIDR IPv6 (mặc định bản production).

.PARAMETER LocalPath
  Dùng file có sẵn thay vì tải mạng (ví dụ docs\routes\cn6.txt trong repo).

.OUTPUTS
  Exit 0 = ĐẠT · 1 = KHÔNG ĐẠT · 2 = thiếu quyền Administrator · 3 = máy không có IPv6 (bỏ qua, không phải lỗi)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\check-china-bypass-ipv6.ps1
#>
[CmdletBinding()]
param(
    [string]$ListUrl = "https://meetflowai.site/dl/routes/cn6.txt",
    [string]$LocalPath
)

$ErrorActionPreference = 'Continue'

function Write-Step($text) { Write-Host "== $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "   [DAT] $text" -ForegroundColor Green }
function Write-Bad($text) { Write-Host "   [LOI] $text" -ForegroundColor Red }
function Write-Info($text) { Write-Host "   $text" }

# Đích KHÔNG thuộc Trung Quốc, dùng để kiểm phần còn lại vẫn bị chặn.
$NonCnDestination = '2606:4700::1111'
$addedRoutes = New-Object System.Collections.Generic.List[string]

# --- 0. Quyền Administrator -------------------------------------------------
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Bad "Phải chạy bằng quyền Administrator (thêm/xoá route IPv6 cần quyền này)."
    exit 2
}

try {
    # --- 1. Máy có IPv6 ra Internet không ------------------------------------
    Write-Step "1. Tìm gateway IPv6 của NIC vật lý"
    $script = "(Get-NetRoute -DestinationPrefix '::/0' -ErrorAction SilentlyContinue | " +
        "Sort-Object RouteMetric | ForEach-Object { " +
        "$a = Get-NetAdapter -InterfaceIndex `$_.ifIndex -ErrorAction SilentlyContinue; " +
        "if (`$a -and `$a.Status -eq 'Up' -and `$a.InterfaceDescription -notmatch 'clash|mihomo|wintun|tap|wireguard|sing-box|tailscale|zerotier|proxy|vpnflow') " +
        "{ `"`$(`$_.NextHop)|`$(`$a.Name)`" } } | Select-Object -First 1)"
    $physical = (& powershell -NoProfile -NonInteractive -Command $script | Out-String).Trim()

    if ([string]::IsNullOrWhiteSpace($physical) -or $physical -notmatch '\|') {
        Write-Info "Máy không có default route IPv6 (::/0) ⇒ app sẽ BỎ QUA bypass IPv6 và IPv6 vẫn bị chặn."
        Write-Info "Đây là hành vi ĐÚNG trên máy không có IPv6 — không phải lỗi."
        exit 3
    }

    $parts = $physical.Split('|')
    $gateway = $parts[0].Trim()
    $interfaceName = $parts[1].Trim()
    $zoneIndex = $gateway.IndexOf('%')
    if ($zoneIndex -gt 0) { $gateway = $gateway.Substring(0, $zoneIndex) }
    Write-Ok "NIC vật lý: $interfaceName · gateway IPv6: $gateway"

    $nextHopArgument = ''
    if ($gateway -ne '::') { $nextHopArgument = "-NextHop '$gateway' " }

    # --- 2. Lấy danh sách CIDR IPv6 ------------------------------------------
    Write-Step "2. Lấy danh sách CIDR IPv6 Trung Quốc"
    if ($LocalPath) {
        if (-not (Test-Path $LocalPath)) { Write-Bad "Không thấy file: $LocalPath"; exit 1 }
        $text = Get-Content -LiteralPath $LocalPath -Raw -Encoding UTF8
        Write-Ok "Đọc file local: $LocalPath"
    }
    else {
        try {
            $text = (Invoke-WebRequest -Uri $ListUrl -UseBasicParsing -TimeoutSec 30).Content
            Write-Ok "Tải được: $ListUrl"
        }
        catch {
            Write-Bad "Không tải được $ListUrl — $($_.Exception.Message)"
            exit 1
        }
    }

    $cidrs = @()
    foreach ($line in ($text -split "`n")) {
        $clean = $line.Trim()
        if ($clean.Length -eq 0) { continue }
        if ($clean.StartsWith('#') -or $clean.StartsWith(';')) { continue }
        if ($clean -match '^([0-9a-fA-F:]+)/(\d{1,3})$') { $cidrs += $clean }
    }
    if ($cidrs.Count -eq 0) { Write-Bad "Danh sách rỗng hoặc sai định dạng."; exit 1 }
    Write-Ok "$($cidrs.Count) prefix IPv6 hợp lệ"

    # --- 3. Thêm route (đúng cách app làm) ------------------------------------
    Write-Step "3. Thêm route bypass (giống app: một tiến trình, New-NetRoute)"
    $tempFile = Join-Path $env:TEMP ("cn6-check-" + [guid]::NewGuid().ToString('N') + ".txt")
    Set-Content -LiteralPath $tempFile -Value $cidrs -Encoding ASCII

    $addScript =
        "`$ErrorActionPreference='SilentlyContinue'; `$n=0; " +
        "foreach (`$c in Get-Content '$tempFile') { " +
        "New-NetRoute -DestinationPrefix `$c -InterfaceAlias '$interfaceName' $nextHopArgument-PolicyStore ActiveStore | Out-Null; `$n++ }; " +
        "`$n"
    $added = (& powershell -NoProfile -NonInteractive -Command $addScript | Out-String).Trim()
    Write-Info "Đã gọi thêm cho $added dòng"

    # Đếm route THẬT SỰ có mặt (không tin số lệnh đã gọi).
    foreach ($cidr in $cidrs) { $addedRoutes.Add($cidr) }
    $present = 0
    foreach ($cidr in $cidrs) {
        if (Get-NetRoute -DestinationPrefix $cidr -InterfaceAlias $interfaceName -ErrorAction SilentlyContinue) { $present++ }
    }
    if ($present -eq 0) {
        Write-Bad "Không thêm được route IPv6 nào (0/$($cidrs.Count) có mặt)."
        exit 1
    }
    Write-Ok "Route có mặt thật: $present/$($cidrs.Count)"

    # --- 4. Kiểm luật chọn đường --------------------------------------------
    Write-Step "4. Kiểm luật chọn đường (prefix dài nhất thắng)"
    $cnDestination = $cidrs[0].Split('/')[0]

    $cnRoute = Find-NetRoute -RemoteIPAddress $cnDestination -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cnRoute -and $cnRoute.InterfaceAlias -eq $interfaceName) {
        Write-Ok "Đích TQ $cnDestination đi THẲNG qua $interfaceName (đúng)"
    }
    else {
        $alias = if ($cnRoute) { $cnRoute.InterfaceAlias } else { 'không xác định' }
        Write-Bad "Đích TQ $cnDestination KHÔNG đi qua NIC vật lý (đang qua: $alias)"
        exit 1
    }

    # Phần IPv6 còn lại: chỉ kiểm được khi VPN đang bật (có route chặn ::/1 hoặc 8000::/1).
    $blockRoutes = Get-NetRoute -ErrorAction SilentlyContinue |
        Where-Object { $_.DestinationPrefix -eq '::/1' -or $_.DestinationPrefix -eq '8000::/1' }
    if ($blockRoutes) {
        $otherRoute = Find-NetRoute -RemoteIPAddress $NonCnDestination -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($otherRoute -and $otherRoute.InterfaceAlias -eq $interfaceName) {
            Write-Bad "Đích KHÔNG thuộc TQ ($NonCnDestination) lại đi thẳng ra NIC vật lý ⇒ RÒ IP THẬT."
            exit 1
        }
        $alias = if ($otherRoute) { $otherRoute.InterfaceAlias } else { 'không xác định' }
        Write-Ok "Đích ngoài TQ $NonCnDestination KHÔNG đi thẳng (đang qua: $alias) — không rò IP thật"
    }
    else {
        Write-Info "CHƯA kiểm được phần 'còn lại bị chặn': chưa thấy route chặn ::/1 + 8000::/1."
        Write-Info "Muốn kiểm đủ: BẬT VPN rồi chạy lại script này."
    }

    Write-Host ""
    Write-Host "KET QUA: DAT (A7 IPv6 phía Windows)" -ForegroundColor Green
    exit 0
}
finally {
    # --- 5. Luôn dọn sạch -----------------------------------------------------
    if ($addedRoutes.Count -gt 0) {
        Write-Step "5. Dọn route đã thêm"
        $removeScript =
            "`$ErrorActionPreference='SilentlyContinue'; " +
            "foreach (`$c in Get-Content '$tempFile') { " +
            "Remove-NetRoute -DestinationPrefix `$c -InterfaceAlias '$interfaceName' $nextHopArgument-Confirm:`$false | Out-Null }; " +
            "'done'"
        & powershell -NoProfile -NonInteractive -Command $removeScript | Out-Null

        $left = 0
        foreach ($cidr in $addedRoutes) {
            if (Get-NetRoute -DestinationPrefix $cidr -InterfaceAlias $interfaceName -ErrorAction SilentlyContinue) { $left++ }
        }
        if ($left -eq 0) { Write-Ok "Đã dọn sạch (0 route còn lại)" } else { Write-Bad "CÒN SÓT $left route — dọn tay!" }
    }

    if ($tempFile -and (Test-Path $tempFile)) { Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue }
}
