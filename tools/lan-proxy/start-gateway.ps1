# start-gateway.ps1 — bật "gateway laptop" cho TV không có TUN (MiTV-AFZP0).
#
# Kiến trúc:  TV (http_proxy = 192.168.100.11:18081)
#               → lan-proxy (HTTP, keep-alive, 0.0.0.0:18081)
#               → SOCKS5 của flowvpnrelay (hysteria qua cầu WS tới VPS1)
#               → Internet, IP thoát 103.173.155.50 (Việt Nam)
#
# Chạy:  powershell -ExecutionPolicy Bypass -File tools\lan-proxy\start-gateway.ps1
# Dừng:  powershell -ExecutionPolicy Bypass -File tools\lan-proxy\start-gateway.ps1 -Stop
#
# Lưu ý: laptop phải BẬT thì TV mới có mạng qua gateway. Muốn TV dùng mạng thẳng:
#        adb shell settings put global http_proxy :0

param(
    [switch]$Stop,
    [int]$Links = 12,
    [string]$Listen = "0.0.0.0:18081"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$relay = Join-Path $repo ".tmp\gateway\flowvpnrelay-windows-amd64.exe"
$cfgFile = Join-Path $repo ".tmp\gateway\pc-gateway.json"
$lanProxy = Join-Path $PSScriptRoot "lan-proxy.exe"

function Stop-All {
    Get-Process flowvpnrelay-windows-amd64, lan-proxy -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "[gateway] đã dừng mọi tiến trình gateway" -ForegroundColor Yellow
}

if ($Stop) { Stop-All; return }

if (-not (Test-Path $relay)) { throw "Thiếu $relay — build lại bằng tools/hysteria-relay/build.sh" }
if (-not (Test-Path $lanProxy)) { throw "Thiếu $lanProxy — build bằng: cd tools\lan-proxy; go build -o lan-proxy.exe ." }
if (-not (Test-Path $cfgFile)) { throw "Thiếu $cfgFile (chứa credential, không commit)" }

Stop-All
Start-Sleep -Seconds 2

Write-Host "[gateway] khởi động flowvpnrelay (WS relay, $Links link) ..." -ForegroundColor Cyan
Start-Process -FilePath $relay -ArgumentList "-c", $cfgFile -WindowStyle Hidden
Start-Sleep -Seconds 14

$socksOk = (Get-NetTCPConnection -LocalPort 1080 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
Write-Host ("[gateway] SOCKS5 1080: " + $(if ($socksOk) { "OK" } else { "KHÔNG mở" })) -ForegroundColor $(if ($socksOk) { "Green" } else { "Red" })

Write-Host "[gateway] khởi động lan-proxy tại $Listen ..." -ForegroundColor Cyan
Start-Process -FilePath $lanProxy -ArgumentList "-listen", $Listen, "-upstream", "socks5://127.0.0.1:1080" -WindowStyle Hidden
Start-Sleep -Seconds 4

$httpOk = (Get-NetTCPConnection -LocalPort 18081 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
Write-Host ("[gateway] HTTP proxy 18081: " + $(if ($httpOk) { "OK" } else { "KHÔNG mở" })) -ForegroundColor $(if ($httpOk) { "Green" } else { "Red" })

try {
    $ip = & curl.exe -s --max-time 20 -x "http://192.168.100.11:18081" https://api.ipify.org
    Write-Host "[gateway] IP thoát qua gateway: $ip" -ForegroundColor Green
} catch {
    Write-Host "[gateway] không kiểm được IP thoát: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host @"

Xong. Trên TV proxy phải là: 192.168.100.11:18081
  adb shell settings get global http_proxy
  adb shell settings put global http_proxy 192.168.100.11:18081     # đặt
  adb shell settings put global http_proxy :0                       # bỏ (TV dùng mạng thẳng)

"@ -ForegroundColor Cyan
