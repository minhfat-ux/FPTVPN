# setup-gateway-nat.ps1 - bien laptop thanh GATEWAY that cho TV (MiTV-AFZP0 khong co TUN).
#
# PHAI chay bang Administrator:
#   chuot phai PowerShell -> "Run as administrator" ->
#   cd C:\Users\Minhn\FPTVPN
#   powershell -ExecutionPolicy Bypass -File tools\lan-proxy\setup-gateway-nat.ps1
#
# Script lam 4 viec:
#   1. DNS laptop = 1.1.1.1 / 1.0.0.1
#   2. Bat IP forwarding (chuyen goi giua card hotspot va tun)
#   3. Bat chia se Internet (NAT hoac ICS) tu tunnel (flowvpntun) ra card phat Wi-Fi
#   4. In lai trang thai de kiem
#
# Yeu cau truoc khi chay: gateway TUN da chay (flowvpnrelay -c pc-gateway-tun.json) de co
# card "flowvpntun", va Mobile Hotspot da bat (card "Local Area Connection* X" Up).
#
# File nay CO TINH viet khong dau (ASCII) de tranh loi encoding cua PowerShell 5.1.

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
        Write-Host "PHAI chay bang Administrator (chuot phai PowerShell -> Run as administrator)." -ForegroundColor Red
        exit 3
    }
}

Assert-Admin

if ($Remove) {
    Write-Host "[1/4] Go NAT/ICS + tra DNS tu dong ..." -ForegroundColor Cyan
    try { Get-NetNat -Name "FlowVPN" -ErrorAction Stop | Remove-NetNat -Confirm:$false } catch { }
    net stop SharedAccess 2>$null | Out-Null
    try { Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ResetServerAddresses -ErrorAction Stop } catch { }
    Write-Host "Da go." -ForegroundColor Yellow
    return
}

Write-Host "[1/4] Dat DNS laptop = $Dns1 , $Dns2 ..." -ForegroundColor Cyan
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses @($Dns1, $Dns2)
$dnsNow = (Get-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).ServerAddresses -join ", "
Write-Host "      DNS Wi-Fi hien tai: $dnsNow"

Write-Host "[2/4] Bat IP forwarding ..." -ForegroundColor Cyan
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name IPEnableRouter -Value 1 -Type DWord
netsh int ipv4 set global forwarding=enabled | Out-Null
Write-Host "      IPEnableRouter=1, forwarding=enabled"

Write-Host "[3/4] Tim card tunnel va card phat ..." -ForegroundColor Cyan
$tun = Get-NetAdapter -IncludeHidden | Where-Object { ($_.Name -eq $TunName) -or ($_.InterfaceDescription -match "Wintun") } | Select-Object -First 1
if (-not $tun) {
    Write-Host "      KHONG thay card '$TunName' - chay gateway TUN truoc (pc-gateway-tun.json) roi chay lai." -ForegroundColor Red
    exit 4
}
$ap = Get-NetAdapter | Where-Object { ($_.Name -match "Local Area Connection") -and ($_.Status -eq "Up") } | Select-Object -First 1
if (-not $ap) {
    Write-Host "      KHONG thay card phat Wi-Fi (Mobile Hotspot) - bat Mobile Hotspot truoc." -ForegroundColor Red
    exit 5
}
Write-Host ("      tunnel = " + $tun.Name + " (" + $tun.InterfaceDescription + ")")
Write-Host ("      phat   = " + $ap.Name + " (" + $ap.InterfaceDescription + ")")

Write-Host "[4/4] Bat NAT/ICS ..." -ForegroundColor Cyan
$natOk = $false
try {
    if (Get-NetNat -Name "FlowVPN" -ErrorAction SilentlyContinue) {
        Remove-NetNat -Name "FlowVPN" -Confirm:$false -ErrorAction SilentlyContinue
    }
    $apIp = (Get-NetIPAddress -InterfaceIndex $ap.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
    if ($apIp) {
        $prefix = ($apIp -replace '\.\d+$', '.0') + "/24"
        New-NetNat -Name "FlowVPN" -InternalIPInterfaceAddressPrefix $prefix -ErrorAction Stop | Out-Null
        Write-Host "      New-NetNat OK: $prefix -> tunnel $($tun.Name)" -ForegroundColor Green
        $natOk = $true
    } else {
        Write-Host "      card phat chua co IP IPv4" -ForegroundColor Yellow
    }
} catch {
    Write-Host ("      New-NetNat khong dung duoc: " + $_.Exception.Message + " -> thu ICS") -ForegroundColor Yellow
}

if (-not $natOk) {
    try {
        $mgr = New-Object -ComObject HNetCfg.HNetShare
        $conns = $mgr.EnumEveryConnection
        $pubConn = $null
        $privConn = $null
        foreach ($c in $conns) {
            $props = $mgr.NetConnectionProps($c)
            if ($props.Name -eq $tun.Name) { $pubConn = $c }
            if ($props.Name -eq $ap.Name) { $privConn = $c }
        }
        if ($pubConn -and $privConn) {
            $pubCfg = $mgr.INetSharingConfigurationForINetConnection($pubConn)
            $privCfg = $mgr.INetSharingConfigurationForINetConnection($privConn)
            if (-not $pubCfg.SharingEnabled) { $pubCfg.EnableSharing(0) }
            if (-not $privCfg.SharingEnabled) { $privCfg.EnableSharing(1) }
            Write-Host "      ICS OK: chia se tu tunnel ra card phat" -ForegroundColor Green
            $natOk = $true
        } else {
            Write-Host "      ICS: khong khop ten card. Mo Network Connections, chuot phai card tunnel -> Properties -> Sharing -> chon card phat." -ForegroundColor Red
        }
    } catch {
        Write-Host ("      ICS loi: " + $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== TRANG THAI ===" -ForegroundColor Cyan
Get-NetAdapter | Select-Object Name, Status, InterfaceDescription | Format-Table -AutoSize
$dnsNow2 = (Get-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).ServerAddresses -join ", "
Write-Host "DNS Wi-Fi : $dnsNow2"
$exitIp = & curl.exe -s --max-time 15 https://api.ipify.org
Write-Host "IP thoat laptop: $exitIp"
Write-Host ""
Write-Host "Buoc cuoi tren TV: noi TV vao Wi-Fi do laptop phat (VPNFLOW-TV), roi BO proxy de di thang qua gateway:" -ForegroundColor Yellow
Write-Host '  adb shell settings put global http_proxy :0'
