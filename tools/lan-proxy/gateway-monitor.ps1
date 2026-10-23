# gateway-monitor.ps1 - giu duong du phong (relay UDP + 2 relay WS + lan-proxy) THAT SU ra duoc internet.
#
# Vi sao phai do EGRESS chu khong chi kiem cong: su co that 22/10/2026 - sau cu mang dut qua dem,
# hai relay van LISTEN (nen kiem cong bao "on") nhung khong ra duoc internet => TV mat mang.
#
# 22/10/2026 (chieu): UDP truc tiep MO LAI va do duoc ~9 Mbps (gap ~40 lan cau WS 0,1-0,6 Mbps).
# Vi vay monitor nay quan ly 3 duong: 1081 = UDP truc tiep (uu tien), 1101/1102 = cau WS du phong.
# lan-proxy duoc chay voi upstream "socks5://127.0.0.1:1081,socks5://127.0.0.1:1101,socks5://127.0.0.1:1102"
# (uu tien dau danh sach). Neu lan-proxy khong ra duoc internet 2 nhip lien tiep thi dung lai.
#
# Chay: powershell -NoProfile -ExecutionPolicy Bypass -File .tmp\gateway-monitor.ps1
# Log:  .tmp\gw-monitor.log

$ErrorActionPreference = "Continue"
# Script co the nam o .tmp\ hoac tools\lan-proxy\ => tim goc repo bang su ton tai cua lan-proxy.exe
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $root "tools\lan-proxy\lan-proxy.exe"))) { $root = Split-Path -Parent $PSScriptRoot }
$relayExe = Join-Path $root ".tmp\gateway\flowvpnrelay-windows-amd64.exe"
$lanExe = Join-Path $root "tools\lan-proxy\lan-proxy.exe"
$cfgWs = Join-Path $root ".tmp\gateway\pc-gateway.json"
$cfgUdp = Join-Path $root ".tmp\gateway\pc-gateway-udp.json"
$log = Join-Path $root ".tmp\gw-monitor.log"
$upstreams = "socks5://127.0.0.1:1081,socks5://127.0.0.1:1101,socks5://127.0.0.1:1102"

# port, tên relay (rỗng = UDP trực tiếp), file cấu hình
$relays = @(
    @{ Port = 1081; Name = "";      Cfg = $cfgUdp },
    @{ Port = 1101; Name = "vn1hy"; Cfg = $cfgWs },
    @{ Port = 1102; Name = "vn2hy"; Cfg = $cfgWs }
)

function Log([string]$m) {
    Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format "HH:mm:ss"), $m) -Encoding UTF8
}

function Test-Port([int]$p) {
    return ((Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) | Measure-Object).Count -gt 0
}

function Test-Egress([int]$p) {
    $r = & curl.exe -s --max-time 14 -x "socks5h://127.0.0.1:$p" https://1.1.1.1/cdn-cgi/trace 2>$null
    if (-not $r) { return $null }
    $ip = (($r | Where-Object { $_ -like "ip=*" }) -replace "^ip=", "")
    if ([string]::IsNullOrWhiteSpace($ip)) { return $null }
    return $ip
}

function Test-ProxyEgress {
    $r = & curl.exe -s --max-time 20 -x http://192.168.100.5:18081 https://1.1.1.1/cdn-cgi/trace 2>$null
    if (-not $r) { return $null }
    $ip = (($r | Where-Object { $_ -like "ip=*" }) -replace "^ip=", "")
    if ([string]::IsNullOrWhiteSpace($ip)) { return $null }
    return $ip
}

function Start-Relay($relay) {
    $p = [int]$relay.Port
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    if ([string]::IsNullOrEmpty($relay.Name)) {
        # UDP trực tiếp: dùng nguyên cấu hình pc-gateway-udp.json (socks5 127.0.0.1:1081)
        $f = $relay.Cfg
    } else {
        $c = Get-Content $cfgWs -Raw | ConvertFrom-Json
        $c.transport.url = "wss://api.meetflowai.site/relay/$($relay.Name)"
        $c.transport.links = 24
        $c.socks5.listen = "127.0.0.1:$p"
        $f = Join-Path $env:TEMP "gwmon-$($relay.Name).json"
        ($c | ConvertTo-Json -Depth 6) | Set-Content -Path $f -Encoding UTF8
    }
    Start-Process -FilePath $relayExe -ArgumentList "-c", $f -WindowStyle Hidden | Out-Null
    Log "da bat lai relay port $p ($(if ($relay.Name) { $relay.Name } else { 'udp-truc-tiep' }))"
}

function Start-LanProxy {
    Get-NetTCPConnection -LocalPort 18081 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath $lanExe -ArgumentList "-listen", "0.0.0.0:18081", "-upstream", "socks5://127.0.0.1:1081,socks5://127.0.0.1:1101,socks5://127.0.0.1:1102", "-route", ".tv360.vn=socks5://127.0.0.1:1103", "-direct", ".miwifi.com", "-direct", ".xiaomi.com", "-direct", ".mi.com", "-direct", ".miui.com" -WindowStyle Hidden | Out-Null
    Log "da bat lai lan-proxy 0.0.0.0:18081 (upstream $upstreams)"
}

$fail = @{}
$lastRestart = @{}
foreach ($r in $relays) { $fail[$r.Port] = 0; $lastRestart[$r.Port] = [datetime]::MinValue }
$proxyFail = 0
$proxyLastRestart = [datetime]::MinValue

Log "monitor bat dau (EGRESS-check): 1081=udp truc tiep, 1101=vn1hy/node1, 1102=vn2hy/node2, proxy 18081"

$tick = 0
while ($true) {
    $tick += 1

    foreach ($r in $relays) {
        $p = [int]$r.Port
        if (-not (Test-Port $p)) {
            if (((Get-Date) - $lastRestart[$p]).TotalSeconds -ge 120) {
                Start-Relay $r
                $lastRestart[$p] = Get-Date
            }
            continue
        }
        $ip = Test-Egress $p
        if ($ip) {
            $fail[$p] = 0
        } else {
            $fail[$p] = $fail[$p] + 1
            if ($fail[$p] -ge 2 -and ((Get-Date) - $lastRestart[$p]).TotalSeconds -ge 120) {
                Log "relay port $p khong ra duoc internet 2 nhip lien tiep -> dung lai"
                Start-Relay $r
                $lastRestart[$p] = Get-Date
                $fail[$p] = 0
            }
        }
    }

    if (-not (Test-Port 18081)) {
        Start-LanProxy
    } else {
        $pip = Test-ProxyEgress
        if ($pip) {
            $proxyFail = 0
        } else {
            $proxyFail += 1
            if ($proxyFail -ge 2 -and ((Get-Date) - $proxyLastRestart).TotalSeconds -ge 180) {
                Log "lan-proxy khong ra duoc internet 2 nhip lien tiep -> dung lai"
                Start-LanProxy
                $proxyLastRestart = Get-Date
                $proxyFail = 0
            }
        }
    }

    if (($tick % 5) -eq 1) {
        $ip = Test-ProxyEgress
        $est = (Get-NetTCPConnection -LocalPort 18081 -ErrorAction SilentlyContinue |
                Where-Object { $_.RemoteAddress -eq "192.168.100.104" -and $_.State -eq "Established" } |
                Measure-Object).Count
        if ($ip) { Log "ok: ip=$ip  ket_noi_TV=$est" }
        else { Log "CANH BAO: proxy LAN khong ra duoc internet (ket_noi_TV=$est)" }
    }

    Start-Sleep -Seconds 60
}
