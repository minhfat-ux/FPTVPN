# fix-tun-leftover.ps1 - don sach card TUN + route rac con sot sau khi gateway TUN bi dung dot ngot.
#
# Trieu chung: laptop MAT MANG sau khi thu nghiem TUN (route 0.0.0.0/8, 1.0.0.0/8 ... tren card
# flowvpntun con nam lai, tro vao card da chet). Script nay xoa het route cua card do va go card.
#
# PHAI chay bang Administrator:
#   powershell -ExecutionPolicy Bypass -File tools\lan-proxy\fix-tun-leftover.ps1
#
# File ASCII-only (tranh loi encoding PowerShell 5.1).

param([string]$TunName = "flowvpntun")

$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "PHAI chay bang Administrator." -ForegroundColor Red
    exit 3
}

Write-Host "[1/5] Dung tien trinh gateway dang chay ..." -ForegroundColor Cyan
Get-Process flowvpnrelay-windows-amd64, lan-proxy, hysteria-windows-amd64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "[2/5] Tim card $TunName ..." -ForegroundColor Cyan
$nics = @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $TunName -or $_.InterfaceDescription -match "Wintun" })
if ($nics.Count -eq 0) {
    Write-Host "      khong con card $TunName" -ForegroundColor Yellow
} else {
    foreach ($n in $nics) {
        $idx = $n.ifIndex
        Write-Host ("      card " + $n.Name + " ifIndex=" + $idx + " status=" + $n.Status)
        Write-Host "[3/5] Xoa route cua card ifIndex=$idx ..." -ForegroundColor Cyan
        $routes = @(Get-NetRoute -InterfaceIndex $idx -ErrorAction SilentlyContinue)
        Write-Host ("      so route: " + $routes.Count)
        foreach ($r in $routes) {
            Remove-NetRoute -DestinationPrefix $r.DestinationPrefix -InterfaceIndex $idx -Confirm:$false -ErrorAction SilentlyContinue
        }
        Write-Host "[4/5] Go card ..." -ForegroundColor Cyan
        try {
            Disable-NetAdapter -Name $n.Name -Confirm:$false -ErrorAction Stop
            Write-Host "      da disable"
        } catch {
            Write-Host ("      disable loi: " + $_.Exception.Message) -ForegroundColor Yellow
        }
        $dev = Get-PnpDevice -Class Net -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -like "*$TunName*" -or $_.FriendlyName -like "*Wintun*" }
        foreach ($d in $dev) {
            Write-Host ("      go PnP device: " + $d.FriendlyName + " [" + $d.InstanceId + "]")
            try { Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction Stop } catch { }
        }
    }
}

Write-Host "[5/5] Kiem tra lai ..." -ForegroundColor Cyan
Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object DestinationPrefix, NextHop, InterfaceAlias, RouteMetric | Format-Table -AutoSize
$trace = & curl.exe -s --max-time 15 https://1.1.1.1/cdn-cgi/trace 2>$null
$ip = ($trace | Where-Object { $_ -like "ip=*" }) -replace "^ip=", ""
if ($ip) { Write-Host "Laptop co mang tro lai, IP: $ip" -ForegroundColor Green }
else { Write-Host "Van chua co mang - kiem tra them (co the phai reboot laptop)." -ForegroundColor Red }
