# fBuddy — deploy from Windows to node-2 (165.101.114.162).
#
#   pwsh -File deploy\deploy.ps1                # full deploy
#   pwsh -File deploy\deploy.ps1 -SkipBuild     # reuse web/dist from a previous build
#   pwsh -File deploy\deploy.ps1 -SkipDeps      # do not run npm install on the server
#
# Requires: the DSH Windows key already authorised on the VPS (ssh root@165.101.114.162).
[CmdletBinding()]
param(
  [string]$Host_ = "165.101.114.162",
  [string]$RemoteAppDir = "/opt/fbuddy",
  [switch]$SkipBuild,
  [switch]$SkipDeps,
  # Cài/refresh luôn flowdesk (backend riêng cho bản Windows). Mặc định TẮT để
  # deploy fBuddy không tự đụng vào service khác.
  [switch]$WithDesk
)

# Native tools (ssh/scp/npm) write progress and warnings to stderr, which
# PowerShell turns into a terminating error under 'Stop'. Exit codes are checked
# explicitly after every command instead.
$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
$tarball = Join-Path $env:TEMP "fbuddy-release.tar.gz"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
# Runs a command in the current PowerShell host (works on Windows PowerShell 5.1
# and PowerShell 7 — `pwsh` is not always on PATH inside a harness session).
function Run($cmd, $workdir) {
  Write-Host "    $cmd" -ForegroundColor DarkGray
  if ($workdir) { Push-Location $workdir }
  try {
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại (exit $LASTEXITCODE): $cmd" }
  } finally { if ($workdir) { Pop-Location } }
}

Step "1/6 Kiểm tra SSH tới node-2"
$probe = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 "root@$Host_" "hostname; node -v"
if ($LASTEXITCODE -ne 0) { throw "Không SSH được tới $Host_" }
$probe | ForEach-Object { Write-Host "    $_" }

Step "2/6 Build web (vite)"
if ($SkipBuild) {
  if (-not (Test-Path (Join-Path $repo "web\dist\index.html"))) { throw "Chưa có web/dist — bỏ -SkipBuild" }
  Write-Host "    dùng web/dist có sẵn" -ForegroundColor DarkGray
} else {
  Run "npm --workspace web run build" $repo
}

Step "3/6 Đóng gói release"
if (Test-Path $tarball) { Remove-Item $tarball -Force }
$tarArgs = @(
  "-czf", $tarball,
  "--exclude=node_modules",
  "--exclude=data",
  "--exclude=.git",
  "--exclude=.npm-cache",
  "--exclude=.test-out.txt",
  "--exclude=*.log",
  "-C", $repo, "."
)
& tar @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar thất bại (exit $LASTEXITCODE)" }
$size = [math]::Round((Get-Item $tarball).Length / 1MB, 2)
Write-Host "    $tarball ($size MB)"

Step "4/6 Upload lên node-2"
Run "scp -o StrictHostKeyChecking=no `"$tarball`" root@${Host_}:/tmp/fbuddy-release.tar.gz"

Step "5/6 Cài đặt trên server"
$installDeps = if ($SkipDeps) { "false" } else { "true" }
$remote = @"
set -euo pipefail
mkdir -p $RemoteAppDir
tar -xzf /tmp/fbuddy-release.tar.gz -C $RemoteAppDir
cd $RemoteAppDir
if [ "$installDeps" = "true" ] && [ ! -d node_modules/express ] && [ ! -d server/node_modules/express ]; then
  echo '--- npm install (production deps) ---'
  npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3
fi
chmod -R go-w $RemoteAppDir 2>/dev/null || true
bash $RemoteAppDir/deploy/remote-setup.sh
"@
$remote = $remote -replace "`r",""
# PowerShell 5.1 re-adds CRLF when piping text into a native command, which makes
# bash choke on every line ("$'\r': command not found"). Ship the script as a
# base64 payload on a single line instead.
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
Run "ssh -o StrictHostKeyChecking=no root@${Host_} `"echo $encoded | base64 -d | bash`""
if ($LASTEXITCODE -ne 0) { throw "Cài đặt trên server thất bại" }

Step "6/6 Kiểm tra công khai"
$publicCode = (curl.exe -s -o NUL -w "%{http_code}" --max-time 15 https://fbuddy.meetflowai.site/api/health) 2>$null
if ($publicCode -eq "200") {
  Write-Host "    https://fbuddy.meetflowai.site/api/health -> 200" -ForegroundColor Green
} else {
  Write-Host "    https://fbuddy.meetflowai.site/api/health -> $publicCode" -ForegroundColor Yellow
  Write-Host "    (Bình thường khi bản ghi DNS 'fbuddy' chưa tồn tại — app vẫn chạy ở 127.0.0.1:7790 trên node-2.)" -ForegroundColor Yellow
  Write-Host "    Tạo DNS: bash /opt/fbuddy/deploy/dns-cloudflare.sh --apply" -ForegroundColor Yellow
}

if ($WithDesk) {
  Step "Thêm: cài/refresh flowdesk (backend riêng cho bản Windows)"
  # Script từ chối khởi động nếu /etc/flowdesk/flowdesk.env chưa có (env chứa key
  # Soniox/OpenRouter riêng), nên bước này không thể làm hỏng bản Mac hay fBuddy.
  Run "ssh -o StrictHostKeyChecking=no root@${Host_} `"bash $RemoteAppDir/deploy/flowdesk-remote-setup.sh`""
  $deskCode = (curl.exe -s -o NUL -w "%{http_code}" --max-time 15 https://desk.meetflowai.site/v1/desktop/health) 2>$null
  Write-Host "    https://desk.meetflowai.site/v1/desktop/health -> $deskCode" -ForegroundColor $(if ($deskCode -eq "200") { "Green" } else { "Yellow" })
}

Write-Host "`nXong. Log: ssh root@$Host_ 'journalctl -u fbuddy -f'" -ForegroundColor Green
