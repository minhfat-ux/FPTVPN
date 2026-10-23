# gateway-autostart.ps1 - TU BAT gateway khi laptop o mang nha, TU TAT khi ra mang khac.
#
# Chot voi chu du an 23/10/2026: "gateway tu bat khi o mang nha nay".
#
# Cach nhan dien mang nha (khong can quyen admin):
#   1) SSID Wi-Fi = $HomeSsid (mac dinh "KT-617"), HOAC
#   2) IP cua may nam trong dai $HomeSubnet (mac dinh "192.168.100.")
# Khong khop ca hai => coi la mang khac.
#
# Khi o mang nha: bat con canh `gateway-monitor.ps1` (no tu dung 4 relay + lan-proxy, tu do egress
# moi 60 s va tu dung lai cai chet). Khi ra mang khac: dung het (relay, lan-proxy, monitor) de khong
# chay vo ich / khong lo proxy ra mang ngoai.
#
# Chay thu cong: powershell -NoProfile -ExecutionPolicy Bypass -File tools\lan-proxy\gateway-autostart.ps1 -Once
#   (khong co -Once: vong lap 60 s, dung cho shortcut Startup)
# Log: .tmp\gw-autostart.log

param(
    [switch]$Once,
    [string]$HomeSsid = "KT-617",
    [string]$HomeSubnet = "192.168.100.",
    [int]$CheckSeconds = 60
)

$ErrorActionPreference = "Continue"

# --- chi mot instance duy nhat (Scheduled Task chay moi 5 phut se nhan ban neu khong khoa) ---
$mutex = New-Object System.Threading.Mutex($false, "Local\VPNFlowGatewayAutostart")
if (-not $mutex.WaitOne(0)) {
    Log "da co instance autostart khac dang chay -> thoat"
    exit 0
}
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # ...\FPTVPN
$tcpLog = Join-Path $root ".tmp\gw-autostart.log"
$monitor = Join-Path $root "tools\lan-proxy\gateway-monitor.ps1"
$relayExe = Join-Path $root ".tmp\gateway\flowvpnrelay-windows-amd64.exe"
$lanExe = Join-Path $root "tools\lan-proxy\lan-proxy.exe"

function Log([string]$m) {
    $dir = Split-Path -Parent $tcpLog
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Add-Content -Path $tcpLog -Value ("{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m) -Encoding UTF8
}

function Get-Ssid {
    $out = & netsh wlan show interfaces 2>$null
    foreach ($line in $out) {
        if ($line -match '^\s*SSID\s*:\s*(.+?)\s*$') { return $matches[1].Trim() }
    }
    return ""
}

# ───────── giu may KHONG NGU khi gateway dang chay ─────────
# Chot voi chu du an 23/10/2026: "dung de gateway cua may windows chet luc sleep".
# Power settings da la "sleep after = never" cho ca AC va pin, nhung Modern Standby (S0 Low Power
# Idle) van co the vao DRIPS khi tat man hinh/dong nap. SetThreadExecutionState(ES_CONTINUOUS |
# ES_SYSTEM_REQUIRED) la cach buoc he thong coi nhu "co viec dang chay" => khong ngu; man hinh
# van tat binh thuong (khong dat ES_DISPLAY_REQUIRED de khoi sang man hinh).
function Enable-WakeLock {
    try {
        if (-not ("Win32.PowerUtil" -as [type])) {
            Add-Type -Namespace Win32 -Name PowerUtil -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
        }
        # 2147483649 = ES_CONTINUOUS(0x80000000) | ES_SYSTEM_REQUIRED(0x1) — tinh san de tranh tran Int32
        $flags = [uint32]2147483649
        [uint32]$prev = [Win32.PowerUtil]::SetThreadExecutionState($flags)
        if ($prev -ne 0) { Log "wake-lock: da giu he thong KHONG NGU (Sleep van bi chan)" }
        else { Log "wake-lock: SetThreadExecutionState that bai" }
    } catch {
        Log "wake-lock loi: $($_.Exception.Message)"
    }
}

function Test-HomeNetwork {
    $ssid = Get-Ssid
    if ($ssid -and $ssid -eq $HomeSsid) { return @{ Home = $true; Why = "ssid=$ssid" } }
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -like ($HomeSubnet + "*") } |
            Select-Object -ExpandProperty IPAddress)
    if ($ips.Count -gt 0) { return @{ Home = $true; Why = "ip=$($ips -join ',')" } }
    return @{ Home = $false; Why = "ssid='$ssid' ip ngoai $HomeSubnet" }
}

function Get-MonitorProcess {
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'gateway-monitor\.ps1' }
}

function Start-Monitor {
    if (-not (Test-Path $monitor)) { Log "THIEU $monitor"; return }
    Start-Process -FilePath "powershell.exe" -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden', '-File', $monitor -WindowStyle Hidden
    Log "da bat gateway-monitor (tu dung relay + lan-proxy)"
}

function Stop-Gateway {
    foreach ($p in (Get-MonitorProcess)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    Get-Process flowvpnrelay-windows-amd64, lan-proxy -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

Enable-WakeLock
Log "autostart bat dau (ssid nha='$HomeSsid', dai IP='$HomeSubnet', moi $CheckSeconds s)"
$wasHome = $null

while ($true) {
    $net = Test-HomeNetwork
    if ($net.Home) {
        $mon = @(Get-MonitorProcess).Count
        if ($mon -eq 0) {
            Start-Monitor
        }
        if ($wasHome -ne $true) { Log "o MANG NHA ($($net.Why)) -> gateway BAT" }
        $wasHome = $true
    } else {
        $mon = @(Get-MonitorProcess).Count
        $relays = @(Get-Process flowvpnrelay-windows-amd64 -ErrorAction SilentlyContinue).Count
        $lan = @(Get-Process lan-proxy -ErrorAction SilentlyContinue).Count
        if ($mon -gt 0 -or $relays -gt 0 -or $lan -gt 0) {
            Stop-Gateway
            Log "ra MANG KHAC ($($net.Why)) -> da dung gateway (monitor=$mon relay=$relays lan=$lan)"
        }
        if ($wasHome -ne $false) { Log "dang o mang khac ($($net.Why)) -> gateway TAT" }
        $wasHome = $false
    }
    if ($Once) { break }
    Start-Sleep -Seconds $CheckSeconds
}
