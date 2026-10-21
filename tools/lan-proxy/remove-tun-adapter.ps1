# remove-tun-adapter.ps1 - go han card TUN (Wintun) con sot de laptop co mang lai NGAY.
#
# Vi sao can: sau khi thu nghiem TUN, card "flowvpntun" con ~24.000 route (0.0.0.0/8, 1.0.0.0/8 ...)
# tro vao card da chet => laptop mat mang. Xoa tung route qua cham (chi duoc ~6 route/phut), nen cach
# dung la GO CARD: xoa card la Windows tu don het route cua no.
#
# PHAI chay bang Administrator. File ASCII-only.

$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "PHAI chay bang Administrator." -ForegroundColor Red
    exit 3
}

Write-Host "[1/4] Dung moi tien trinh gateway ..." -ForegroundColor Cyan
Get-Process flowvpnrelay-windows-amd64, lan-proxy, hysteria-windows-amd64 -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "[2/4] Liet ke thiet bi Wintun ..." -ForegroundColor Cyan
$devs = @(Get-PnpDevice -Class Net -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match "Wintun|flowvpntun" -or $_.InstanceId -match "wintun" })
if ($devs.Count -eq 0) {
    Write-Host "      khong thay thiet bi Wintun" -ForegroundColor Yellow
}
foreach ($d in $devs) {
    Write-Host ("      " + $d.Status + " | " + $d.FriendlyName + " | " + $d.InstanceId)
    Write-Host "      -> disable ..."
    Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Start-Sleep -Milliseconds 500
    Write-Host "      -> remove ..."
    Remove-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
}

Write-Host "[3/4] Kiem tra adapter con lai ..." -ForegroundColor Cyan
$left = @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match "Wintun" })
Write-Host ("      so adapter Wintun con lai: " + $left.Count)
foreach ($a in $left) {
    Write-Host ("      con: " + $a.Name + " [" + $a.Status + "] -> thu disable")
    Disable-NetAdapter -Name $a.Name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
}

Write-Host "[4/4] Kiem tra mang ..." -ForegroundColor Cyan
$trace = & curl.exe -s --max-time 15 https://1.1.1.1/cdn-cgi/trace 2>$null
$ip = ($trace | Where-Object { $_ -like "ip=*" }) -replace "^ip=", ""
if ($ip) {
    Write-Host ("      Laptop CO MANG TRO LAI, IP: " + $ip) -ForegroundColor Green
} else {
    Write-Host "      VAN CHUA CO MANG. Cach chac chan: KHOI DONG LAI LAPTOP (route cua Wintun la route tam, reboot la sach)." -ForegroundColor Red
}
