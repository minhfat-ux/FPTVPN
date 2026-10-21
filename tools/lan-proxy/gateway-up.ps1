# gateway-up.ps1 - BAT TOAN BO "laptop thanh gateway" cho TV khong co TUN (MiTV-AFZP0).
#
# PHAI chay bang Administrator (UAC). Script tu lam het:
#   1. Kiem config + binary gateway
#   2. Chay flowvpnrelay o che do TUN (tao card flowvpntun, route toan bo qua VPS1)
#   3. Cho card tun len, roi bat NAT/ICS tu tun ra card phat Wi-Fi (hotspot)
#   4. Kiem IP thoat bang 1.1.1.1/cdn-cgi/trace (KHONG dung ipify - bi mang toa nha chan)
#   5. In huong dan buoc cuoi tren TV
#
# Dung:
#   powershell -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-up.ps1
#   powershell -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-up.ps1 -Status
#   powershell -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-up.ps1 -Stop
#
# Ghi chu: file viet ASCII-only de tranh loi encoding PowerShell 5.1.

param(
    [switch]$Stop,
    [switch]$Status,
    [string]$TunName = "flowvpntun",
    [int]$Links = 12
)

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$relayExe = Join-Path $repo ".tmp\gateway\flowvpnrelay-windows-amd64.exe"
$cfgTun = Join-Path $repo ".tmp\gateway\pc-gateway-tun.json"
$logFile = Join-Path $repo ".tmp\gateway\gateway-up.log"

function Test-Admin {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Show-ExitIp {
    param([string]$Label = "IP thoat laptop")
    $trace = & curl.exe -s --max-time 15 https://1.1.1.1/cdn-cgi/trace 2>$null
    $ip = ($trace | Where-Object { $_ -like "ip=*" }) -replace "^ip=", ""
    $loc = ($trace | Where-Object { $_ -like "loc=*" }) -replace "^loc=", ""
    if ($ip) { Write-Host ("{0}: {1} (loc={2})" -f $Label, $ip, $loc) -ForegroundColor Green }
    else { Write-Host ("{0}: khong kiem duoc (1.1.1.1/cdn-cgi/trace khong tra loi)" -f $Label) -ForegroundColor Yellow }
}

if ($Status) {
    Write-Host "=== TRANG THAI GATEWAY ===" -ForegroundColor Cyan
    Get-Process flowvpnrelay-windows-amd64, lan-proxy -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize
    Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match "Wintun" } | Select-Object Name, Status, InterfaceDescription | Format-Table -AutoSize
    Get-NetAdapter | Where-Object { $_.Name -match "Local Area Connection" } | Select-Object Name, Status | Format-Table -AutoSize
    try { Get-NetNat -ErrorAction Stop | Select-Object Name, InternalIPInterfaceAddressPrefix | Format-Table -AutoSize } catch { Write-Host "NetNat: khong co / khong dung duoc" }
    $dns = (Get-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).ServerAddresses -join ", "
    Write-Host "DNS Wi-Fi: $dns"
    Show-ExitIp
    return
}

if ($Stop) {
    Write-Host "[1/3] Dung gateway ..." -ForegroundColor Cyan
    Get-Process flowvpnrelay-windows-amd64, lan-proxy -ErrorAction SilentlyContinue | Stop-Process -Force
    if (Test-Admin) {
        try { Get-NetNat -Name "FlowVPN" -ErrorAction Stop | Remove-NetNat -Confirm:$false } catch { }
        Write-Host "[2/3] Da go NetNat (neu co)" -ForegroundColor Yellow
    } else {
        Write-Host "[2/3] Khong phai Administrator -> bo qua go NetNat" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
    Write-Host "[3/3] Xong. Laptop tro lai mang thuong." -ForegroundColor Green
    Show-ExitIp
    return
}

if (-not (Test-Admin)) {
    Write-Host "PHAI chay bang Administrator (chuot phai PowerShell -> Run as administrator)." -ForegroundColor Red
    exit 3
}
if (-not (Test-Path $relayExe)) { Write-Host "Thieu $relayExe" -ForegroundColor Red; exit 4 }
if (-not (Test-Path $cfgTun)) { Write-Host "Thieu $cfgTun" -ForegroundColor Red; exit 5 }

Write-Host "[1/5] Dung tien trinh gateway cu ..." -ForegroundColor Cyan
Get-Process flowvpnrelay-windows-amd64, lan-proxy -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "[2/5] Chay flowvpnrelay che do TUN (links=$Links) ..." -ForegroundColor Cyan
Start-Process -FilePath $relayExe -ArgumentList "-c", $cfgTun -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
Start-Sleep -Seconds 18
$tun = Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match "Wintun" } | Select-Object -First 1
if (-not $tun) {
    Write-Host "      KHONG thay card $TunName. 10 dong log cuoi:" -ForegroundColor Red
    Get-Content $logFile, "$logFile.err" -ErrorAction SilentlyContinue | Select-Object -Last 10
    exit 6
}
Write-Host ("      card tun: " + $tun.Name + " [" + $tun.Status + "]") -ForegroundColor Green
Show-ExitIp "      IP thoat qua TUN"

Write-Host "[3/5] Tim card phat Wi-Fi (Mobile Hotspot) ..." -ForegroundColor Cyan
$ap = Get-NetAdapter | Where-Object { ($_.Name -match "Local Area Connection") -and ($_.Status -eq "Up") } | Select-Object -First 1
if (-not $ap) {
    Write-Host "      KHONG thay card phat. Bat Mobile Hotspot (Settings -> Network -> Mobile hotspot) roi chay lai." -ForegroundColor Yellow
    Write-Host "      (gateway TUN van dang chay; NAT se lam khi co card phat)" -ForegroundColor Yellow
    exit 7
}
Write-Host ("      card phat: " + $ap.Name) -ForegroundColor Green

Write-Host "[4/5] Bat NAT/ICS tu tun ra card phat ..." -ForegroundColor Cyan
$natOk = $false
try {
    if (Get-NetNat -Name "FlowVPN" -ErrorAction SilentlyContinue) { Remove-NetNat -Name "FlowVPN" -Confirm:$false -ErrorAction SilentlyContinue }
    $apIp = (Get-NetIPAddress -InterfaceIndex $ap.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
    if ($apIp) {
        $prefix = ($apIp -replace '\.\d+$', '.0') + "/24"
        New-NetNat -Name "FlowVPN" -InternalIPInterfaceAddressPrefix $prefix -ErrorAction Stop | Out-Null
        Write-Host "      New-NetNat OK: $prefix" -ForegroundColor Green
        $natOk = $true
    }
} catch {
    Write-Host ("      New-NetNat khong dung duoc: " + $_.Exception.Message + " -> thu ICS") -ForegroundColor Yellow
}
if (-not $natOk) {
    try {
        $mgr = New-Object -ComObject HNetCfg.HNetShare
        $pubConn = $null; $privConn = $null
        foreach ($c in $mgr.EnumEveryConnection) {
            $props = $mgr.NetConnectionProps($c)
            if ($props.Name -eq $tun.Name) { $pubConn = $c }
            if ($props.Name -eq $ap.Name) { $privConn = $c }
        }
        if ($pubConn -and $privConn) {
            $pubCfg = $mgr.INetSharingConfigurationForINetConnection($pubConn)
            $privCfg = $mgr.INetSharingConfigurationForINetConnection($privConn)
            if (-not $pubCfg.SharingEnabled) { $pubCfg.EnableSharing(0) }
            if (-not $privCfg.SharingEnabled) { $privCfg.EnableSharing(1) }
            Write-Host "      ICS OK" -ForegroundColor Green
            $natOk = $true
        } else {
            Write-Host "      ICS: khong khop ten card" -ForegroundColor Red
        }
    } catch {
        Write-Host ("      ICS loi: " + $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host "[5/5] Kiem tra cuoi ..." -ForegroundColor Cyan
Get-NetAdapter | Select-Object Name, Status, InterfaceDescription | Format-Table -AutoSize
Show-ExitIp

Write-Host ""
Write-Host "BUOC CUOI TREN TV: noi TV vao Wi-Fi do laptop phat, roi BO proxy de di thang qua gateway:" -ForegroundColor Yellow
Write-Host '  adb shell settings put global http_proxy :0'
Write-Host 'Kiem tren TV: mo FPT Play -> phai phat duoc (IP thoat = IP o tren).'
