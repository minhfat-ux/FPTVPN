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
    # 2 dia chi + 2 lan thu: mang TQ hay chan/lam roi 1.1.1.1 tung luc, mot lan truot khong du coi la
    # relay chet (neu khong se "dung lai" relay dang song => TV dut mang oan).
    foreach ($url in @("https://1.1.1.1/cdn-cgi/trace", "https://www.gstatic.com/generate_204")) {
        for ($try = 1; $try -le 2; $try++) {
            $r = & curl.exe -s --max-time 10 -x "socks5h://127.0.0.1:$p" $url 2>$null
            if ($r) {
                $ip = (($r | Where-Object { $_ -like "ip=*" }) -replace "^ip=", "")
                if (-not [string]::IsNullOrWhiteSpace($ip)) { return $ip }
                if ($url -like "*gstatic*") { return "ok(gstatic)" }
            }
            if ($try -lt 2) { Start-Sleep -Seconds 1 }
        }
    }
    return $null
}

# Internet cua CHINH laptop con khong? Neu mat mang noi bo thi dung lai relay la vo nghia va chi lam
# loan log (va lam TV mat them vai chuc giay).
function Test-LocalNet {
    $r = & curl.exe -s -o NUL -w "%{http_code}" --max-time 8 "https://api.meetflowai.site/v1/app-version?platform=android" 2>$null
    return ($r -eq "200")
}

function Test-ProxyEgress {
    $r = & curl.exe -s --max-time 20 -x http://192.168.100.5:18081 https://1.1.1.1/cdn-cgi/trace 2>$null
    if (-not $r) { return $null }
    $ip = (($r | Where-Object { $_ -like "ip=*" }) -replace "^ip=", "")
    if ([string]::IsNullOrWhiteSpace($ip)) { return $null }
    return $ip
}

function Wait-Port([int]$p, [int]$sec = 20) {
    for ($i = 1; $i -le $sec; $i++) {
        if (Test-Port $p) { return $i }
        Start-Sleep -Seconds 1
    }
    return -1
}

# Zombie = process relay con song nhung KHONG listen cong nao cua minh. Kiem-theo-cong khong bao gio
# don duoc loai nay, nen cu moi lan "dung lai" lai de them mot xac (su co that 24/10/2026: 4 instance
# udp chong nhau, khong cai nao listen, TV mat mang 2,5 gio). Bo qua process moi bat < 30 s.
function Remove-RelayZombies {
    $live = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $relays.Port -contains $_.LocalPort } |
            Select-Object -ExpandProperty OwningProcess -Unique)
    $now = Get-Date
    Get-Process -Name "flowvpnrelay-windows-amd64" -ErrorAction SilentlyContinue | ForEach-Object {
        # 120 s: du de mot process dang cho bind / dang bat tay xong; ngan hon se giet oan process
        # chay cham (loi that 24/10/2026: giet process 36 s tuoi trong khi no con dang cho cong).
        if (($live -notcontains $_.Id) -and (($now - $_.StartTime).TotalSeconds -ge 120)) {
            Log "don zombie relay pid=$($_.Id) (song $([int](($now - $_.StartTime).TotalSeconds))s, khong listen)"
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

# Doi cong THAT SU trong (process cu nha cong trong luc dang thoat) truoc khi bat process moi:
# bat som hon => process moi bind that bai va co the ket trong vong lap thu lai, khong bao gio listen.
function Wait-PortFree([int]$p, [int]$sec = 10) {
    for ($i = 1; $i -le ($sec * 2); $i++) {
        $owner = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if (-not $owner) { return $true }
        $owner | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Start-Relay($relay) {
    $p = [int]$relay.Port
    Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    [void](Wait-PortFree $p 10)
    if ([string]::IsNullOrEmpty($relay.Name)) {
        # UDP trực tiếp: dùng nguyên cấu hình pc-gateway-udp.json (socks5 127.0.0.1:1081)
        $f = $relay.Cfg
    } else {
        $c = Get-Content $cfgWs -Raw | ConvertFrom-Json
        $c.transport.url = "wss://api.meetflowai.site/relay/$($relay.Name)"
        $c.transport.links = 24
        $c.socks5.listen = "127.0.0.1:$p"
        $f = Join-Path $env:TEMP "gwmon-$($relay.Name).json"
        # KHONG duoc de BOM: PowerShell 5.1 them BOM khi `Set-Content -Encoding UTF8`, con Go json
        # tu choi BOM ("invalid character '\ufeff'"). Su co that 24/10/2026: 1101/1102 KHONG BAO GIO
        # len duoc (chi UDP 1081 song) => ca dem chi con mot duong, UDP chet la TV mat mang.
        [System.IO.File]::WriteAllText($f, ($c | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
    }
    $errLog = Join-Path $root ".tmp\gw-relay-$p.err.log"
    $proc = Start-Process -FilePath $relayExe -ArgumentList "-c", $f -WindowStyle Hidden -RedirectStandardError $errLog -PassThru
    $n = Wait-Port $p 30
    if ($n -ge 0) {
        Log "da bat lai relay port $p ($(if ($relay.Name) { $relay.Name } else { 'udp-truc-tiep' })) - READY sau ${n}s"
    } else {
        $tail = (Get-Content $errLog -ErrorAction SilentlyContinue | Select-Object -Last 2) -join " | "
        Log "CANH BAO: relay port $p KHONG listen sau 30 s -> giet pid=$($proc.Id), thu lai nhip sau. Loi: $tail"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
            ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    }
}

function Start-LanProxy {
    Get-NetTCPConnection -LocalPort 18081 -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    [void](Wait-PortFree 18081 10)
    Start-Process -FilePath $lanExe -ArgumentList "-listen", "0.0.0.0:18081", "-upstream", "socks5://127.0.0.1:1081,socks5://127.0.0.1:1101,socks5://127.0.0.1:1102", "-route", ".tv360.vn=socks5://127.0.0.1:1103", "-direct", ".miwifi.com", "-direct", ".xiaomi.com", "-direct", ".mi.com", "-direct", ".miui.com" -WindowStyle Hidden -RedirectStandardError (Join-Path $root ".tmp\gw-lanproxy.err.log") | Out-Null
    $n = Wait-Port 18081 20
    if ($n -ge 0) { Log "da bat lai lan-proxy 0.0.0.0:18081 (upstream $upstreams) - READY sau ${n}s" }
    else {
        $tail = (Get-Content (Join-Path $root ".tmp\gw-lanproxy.err.log") -ErrorAction SilentlyContinue | Select-Object -Last 2) -join " | "
        Log "CANH BAO: lan-proxy KHONG listen 18081 sau 20 s. Loi: $tail"
    }
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
    Remove-RelayZombies
    $anyDown = $false
    $localNet = Test-LocalNet

    foreach ($r in $relays) {
        $p = [int]$r.Port
        if (-not (Test-Port $p)) {
            $anyDown = $true
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
            if ($fail[$p] -ge 3 -and $localNet -and ((Get-Date) - $lastRestart[$p]).TotalSeconds -ge 120) {
                Log "relay port $p khong ra duoc internet 3 nhip lien tiep -> dung lai"
                Start-Relay $r
                $lastRestart[$p] = Get-Date
                $fail[$p] = 0
            } elseif ($fail[$p] -ge 3 -and -not $localNet) {
                Log "relay port $p khong ra duoc internet nhung laptop MAT MANG NOI BO -> khong dung lai"
                $fail[$p] = 0
            }
        }
    }

    if (-not (Test-Port 18081)) {
        $anyDown = $true
        Start-LanProxy
        $proxyLastRestart = Get-Date
    } else {
        $pip = Test-ProxyEgress
        if ($pip) {
            $proxyFail = 0
        } else {
            $proxyFail += 1
            if ($proxyFail -ge 3 -and ((Get-Date) - $proxyLastRestart).TotalSeconds -ge 180) {
                Log "lan-proxy khong ra duoc internet 3 nhip lien tiep -> dung lai"
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

    # Nhip tim de gateway-autostart biet monitor con SONG THAT (khong chi con process): monitor treo
    # trong khi process van ton tai la kieu chet khong ai don.
    try { Set-Content -Path (Join-Path $root ".tmp\gw-monitor.heartbeat") -Value ((Get-Date).ToString("o")) -Encoding UTF8 } catch { }

    # Dang co loi (thieu cong / relay-proxy khong ra duoc internet) thi kiem lai NHANH, dung doi 60 s.
    $trouble = $anyDown -or ($proxyFail -gt 0) -or (@($fail.Values | Where-Object { $_ -gt 0 }).Count -gt 0)
    if ($trouble) { Start-Sleep -Seconds 20 } else { Start-Sleep -Seconds 60 }
}
