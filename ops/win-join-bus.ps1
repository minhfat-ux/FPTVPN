<#
  Cho máy WINDOWS vào connector trên VPS — một lệnh, tự lấy token qua tunnel VPN.

      pwsh -File ops\win-join-bus.ps1

  Script làm: lấy token ở http://10.77.0.1:7799/token (chỉ máy trong VPN lấy được),
  ghi .env.bus, in các tin đang chờ cho "win", rồi nhắc chạy watcher.
#>
param(
  [string]$BusUrl = "http://10.77.0.1:7799",
  [switch]$NoWrite
)
$ErrorActionPreference = "Stop"
Write-Host "== Vào connector VPS: $BusUrl ==" -ForegroundColor Cyan
try {
  $token = (Invoke-RestMethod -Uri "$BusUrl/token" -TimeoutSec 10).token
} catch {
  Write-Host "! Không lấy được token qua $BusUrl. Máy này có đang nối VPNFlow không?" -ForegroundColor Red
  Write-Host "  Thử đường khác: -BusUrl http://10.78.0.1:7799" -ForegroundColor Yellow
  exit 1
}
Write-Host ("✓ token: " + $token.Substring(0, 6) + "…" + $token.Substring($token.Length - 4))

if (-not $NoWrite) {
  "AGENT_BUS_URL=$BusUrl`nAGENT_BUS_TOKEN=$token" | Set-Content -Encoding ascii .env.bus
  Write-Host "✓ đã ghi .env.bus (đã bị gitignore)"
}

Write-Host "`n-- Tin đang chờ cho 'win' --" -ForegroundColor Cyan
$pull = Invoke-RestMethod -Uri "$BusUrl/pull?agent=win&since=0" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 10
if ($pull.messages.Count -eq 0) { Write-Host "  (không có tin nào)" }
foreach ($m in $pull.messages) {
  Write-Host ("  #" + $m.id + " [" + $m.kind + "] " + $m.title) -ForegroundColor Green
  if ($m.body) { Write-Host ("     " + ($m.body -replace "`n", "`n     ")) }
}

Write-Host "`nBước tiếp: chạy watcher để tự nhận việc" -ForegroundColor Cyan
Write-Host "  `$env:AGENT_NAME='WIN' ; node ops\agent-watch.mjs --auto"
Write-Host "  (hoặc: pwsh -File ops\agent-watch-install.ps1)"
Write-Host "`nNhận việc đang chờ:  AGENT_NAME=WIN node ops/task.mjs ack T-20260918-01 --push"
