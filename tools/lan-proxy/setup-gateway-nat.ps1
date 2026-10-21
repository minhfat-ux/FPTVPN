# setup-gateway-nat.ps1 — biến laptop thành GATEWAY thật cho TV (MiTV-AFZP0 không có TUN).
#
# PHẢI chạy bằng **Administrator**:
#   chuột phải PowerShell → "Run as administrator" →
#   cd C:\Users\Minhn\FPTVPN
#   powershell -ExecutionPolicy Bypass -File tools\lan-proxy\setup-gateway-nat.ps1
#
# Script làm 4 việc:
#   1. DNS laptop = 1.1.1.1 / 1.0.0.1
#   2. Bật IP forwarding (để chuyển gói giữa card hotspot và tun)
#   3. Bật chia sẻ Internet (ICS hoặc NAT) từ tunnel (flowvpntun) ra card phát Wi-Fi
#   4. In lại trạng thái để kiểm
#
# Yêu cầu trước khi chạy: gateway TUN đã chạy (flowvpnrelay -c pc-gateway-tun.json) để có
# card "flowvpntun", và Mobile Hotspot đã bật (card "Local Area Connection* X" Up).

param(
    [string]$TunName = "flowvpntun",
    [string]$Dns1 = "1.1.1.1",
    [string]$Dns2 = "1.0.0.1",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "PHẢI chạy bằng Administrator (chuột phải PowerShell -> Run as administrator)." -ForegroundColor Red
        exit 3
    }
}

Assert-Admin

if ($Remove) {
    Write-Host "[1/4] Gỡ NAT/ICS + trả DNS tự động ..." -ForegroundColor Cyan
    try { Get-NetNat -Name "FlowVPN" -ErrorAction Stop | Remove-NetNat -Confirm:$false } catch { }
    net stop SharedAccess 2>$null | Out-Null
    try { Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ResetServerAddresses -ErrorAction Stop } catch { }
    Write-Host "Đã gỡ." -ForegroundColor Yellow
    return
}

# ── 1. DNS
Write-Host "[1/4] Đặt DNS laptop = $Dns1 , $Dns2 ..." -ForegroundColor Cyan
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ($Dns1, $Dns2)
Write-Host ("      DNS Wi-Fi hiện tại: " + ((Get-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).ServerAddresses -join ", "))

# ── 2. IP forwarding
Write-Host "[2/4] Bật IP forwarding ..." -ForegroundColor Cyan
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name IPEnableRouter -Value 1 -Type DWord
netsh int ipv4 set global forwarding=enabled | Out-Null
Write-Host "      IPEnableRouter=1, forwarding=enabled"

# ── 3. Tìm card tunnel + card phát hotspot
Write-Host "[3/4] Tìm card tunnel và card phát ..." -ForegroundColor Cyan
$tun = Get-NetAdapter -IncludeHidden | Where-Object { $_.Name -eq $TunName -or $_.InterfaceDescription -match "Wintun" } | Select-Object -First 1
if (-not $tun) {
    Write-Host "      KHÔNG thấy card '$TunName' — chạy gateway TUN trước (pc-gateway-tun.json) rồi chạy lại script này." -ForegroundColor Red
    exit 4
}
$ap = Get-NetAdapter | Where-Object { $_.Name -match "Local Area Connection" -and $_.Status -eq "Up" } | Select-Object -First 1
if (-not $ap) {
    Write-Host "      KHÔNG thấy card phát Wi-Fi (Mobile Hotspot) — bật Mobile Hotspot trước." -ForegroundColor Red
    exit 5
}
Write-Host ("      tunnel = " + $tun.Name + " (" + $tun.InterfaceDescription + ")")
Write-Host ("      phát   = " + $ap.Name + " (" + $ap.InterfaceDescription + ")")

# ── 4. NAT: ưu tiên New-NetNat, không có thì dùng ICS (COM)
Write-Host "[4/4] Bật NAT/ICS ..." -ForegroundColor Cyan
$natOk = $false
try {
    if (Get-NetNat -Name "FlowVPN" -ErrorAction SilentlyContinue) { Remove-NetNat -Name "FlowVPN" -Confirm:$false -ErrorAction SilentlyContinue }
    $apIp = (Get-NetIPAddress -InterfaceIndex $ap.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
    if ($apIp) {
        $prefix = ($apIp -replace '\.\d+$', '.0') + "/24"
        New-NetNat -Name "FlowVPN" -InternalIPInterfaceAddressPrefix $prefix -ErrorAction Stop | Out-Null
        Write-Host ("      New-NetNat OK: " + $prefix + " -> tunnel " + $tun.Name) -ForegroundColor Green
        $natOk = $true
    }
} catch {
    Write-Host ("      New-NetNat không dùng được (" + $_.Exception.Message + ") -> thử ICS") -ForegroundColor Yellow
}

if (-not $natOk) {
    try {
        $mgr = New-Object -ComObject HNetCfg.HNetShare
        $conns = $mgr.EnumEveryConnection
        $pub = $null; $priv = $null
        foreach ($c in $conns) {
            $props = $mgr.NetConnectionProps($c)
            if ($props.Name -eq $tun.Name) { $pub = $c }
            if ($props.Name -eq $ap.Name) { $priv = $c }
        }
        if ($pub -and $priv) {
            $pubCfg = $mgr.INetSharingConfigurationForINetConnection($pub)
            $privCfg = $mgr.INetSharingConfigurationForINetConnection($priv)
            if (-not $pubCfg.SharingEnabled) { $pubCfg.EnableSharing(0) } # 0 = public
            if (-not $privCfg.SharingEnabled) { $privCfg.EnableSharing(1) } # 1 = private
            Write-Host "      ICS OK: chia sẻ từ tunnel ra card phát" -ForegroundColor Green
            $natOk = $true
        } else {
            Write-Host "      ICS: không khớp tên card (mở Network Connections để chia sẻ tay: chuột phải card tunnel → Properties → Sharing)" -ForegroundColor Red
        }
    } catch {
        Write-Host ("      ICS lỗi: " + $_.Exception.Message) -ForegroundColor Red
    }
}

# ── Tổng kết
Write-Host ""
Write-Host "=== TRẠNG THÁI ===" -ForegroundColor Cyan
Get-NetAdapter | Select-Object Name, Status, InterfaceDescription | Format-Table -AutoSize
Write-Host ("DNS Wi-Fi : " + ((Get-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).ServerAddresses -join ", "))
Write-Host ("IP thoát laptop: " + (& curl.exe -s --max-time 15 https://api.ipify.org))
Write-Host ""
Write-Host "Bước cuối trên TV: nối TV vào Wi-Fi do laptop phát (VPNFLOW-TV), rồi BỎ proxy để đi thẳng qua gateway:" -ForegroundColor Yellow
Write-Host '  adb shell settings put global http_proxy :0'
