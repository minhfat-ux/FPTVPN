# disable-tun-for-gateway.ps1 - DISABLE leftover TUN adapter (sing-tun) so relays are not hijacked.
#
# Why: adapter `flowvpntun` (sing-tun Tunnel) keeps ~24.000 IPv4 routes => relay WS cannot open any
# link (log: "wsarecv: forcibly closed", source IP 100.100.100.101). remove-tun-adapter.ps1 only
# looked for "Wintun" so it never saw this adapter (FriendlyName "sing-tun Tunnel").
#
# MUST run as Administrator. ASCII-only file.

$ErrorActionPreference = "Continue"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "PHAI chay bang Administrator."
    exit 3
}

Write-Host "[1/4] Dung tien trinh gateway (relay/lan-proxy) ..."
Get-Process flowvpnrelay-windows-amd64, flowvpnrelay, lan-proxy -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "[2/4] Disable adapter TUN ..."
$adapters = @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceDescription -match 'sing-tun|Wintun' -or $_.Name -match 'flowvpntun' })
Write-Host ("      found " + $adapters.Count + " adapter(s)")
foreach ($a in $adapters) {
    Write-Host ("      " + $a.Name + " [" + $a.Status + "] -> disable")
    Disable-NetAdapter -Name $a.Name -Confirm:$false -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

Write-Host "[3/4] Remove device (pnputil) if still present ..."
$devs = @(Get-PnpDevice -Class Net -ErrorAction SilentlyContinue |
    Where-Object { $_.FriendlyName -match 'sing-tun|Wintun' -or $_.InstanceId -match 'WINTUN' })
foreach ($d in $devs) {
    Write-Host ("      " + $d.FriendlyName + " [" + $d.Status + "] " + $d.InstanceId)
    Disable-PnpDevice -InstanceId $d.InstanceId -Confirm:$false -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    & pnputil.exe /remove-device $d.InstanceId 2>&1 | ForEach-Object { Write-Host ("        " + $_) }
}

Write-Host "[4/4] Check routes + internet ..."
$left = @(Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'flowvpntun' -and $_.Status -eq 'Up' })
Write-Host ("      flowvpntun still UP: " + $left.Count)
$trace = & curl.exe -s --max-time 15 https://1.1.1.1/cdn-cgi/trace 2>$null
$ip = ($trace | Where-Object { $_ -like "ip=*" })
if ($ip) { Write-Host ("      laptop HAS internet: " + $ip) } else { Write-Host "      laptop has NO internet - reboot needed" }
