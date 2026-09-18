<#
.SYNOPSIS
  FlowTech Harness — bootstrap tự cài MỌI thứ cho Windows, chạy 1 dòng lệnh.

.DESCRIPTION
  Dán vào PowerShell (quyền user bình thường):

      irm https://meetflowai.site/dl/harness/install.ps1 | iex

  Nó tự làm, theo thứ tự:
    1) Node.js LTS (winget; nếu không có winget thì tải MSI từ nodejs.org)
    2) DeepSeek Harness:  npm install -g @deepseek-ai/dsh
    3) Python 3 (bước installer cài tiếp, qua winget)
    4) Tải bộ cài đúng phiên bản mới nhất -> chạy installer (theme FlowVPN + branding FlowTech)

  Bộ cài lấy từ latest.json (đọc kèm ?t=<epoch> để Cloudflare không trả bản cũ) và được
  kiểm tra sha256 trước khi chạy.

.PARAMETER BundleBase
  Gốc chứa latest.json + zip (mặc định https://meetflowai.site/dl/harness).

.PARAMETER SkipPatch
  Chỉ cài Node + DSH, không patch style.
#>
[CmdletBinding()]
param(
  [string]$BundleBase = "https://meetflowai.site/dl/harness",
  [switch]$SkipPatch
)

$ErrorActionPreference = "Stop"
function Log  { Write-Host "==> $args" -ForegroundColor Green }
function Info { Write-Host "--> $args" -ForegroundColor Cyan }
function Ok   { Write-Host "   OK  $args" -ForegroundColor Green }
function Warn { Write-Host "   !!  $args" -ForegroundColor Yellow }

function Update-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   FLOWTECH HARNESS - CAI DAT TU DONG (WINDOWS)" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# ---------- [1] Node.js ----------
Log "Buoc 1/4: Node.js"
if (Get-Command node -ErrorAction SilentlyContinue) {
  Ok "da co Node.js $(node --version)"
} else {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Info "cai Node.js LTS qua winget..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Update-Path
  } else {
    Info "khong co winget — tai MSI Node.js LTS tu nodejs.org..."
    $ver = "v22.14.0"
    $msi = Join-Path $env:TEMP "node-lts-x64.msi"
    Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-x64.msi" -OutFile $msi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i", "`"$msi`"", "/qn", "/norestart" -Wait
    Update-Path
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Cai Node.js that bai. Tai tay tu https://nodejs.org roi chay lai lenh nay."
  }
  Ok "Node.js $(node --version)"
}

# ---------- [2] DeepSeek Harness ----------
Log "Buoc 2/4: DeepSeek Harness"
$npmRoot = (npm root -g) 2>$null
$dshRoot = Join-Path $npmRoot "@deepseek-ai\dsh"
if (Test-Path $dshRoot) {
  Ok "da co DSH: $dshRoot"
} else {
  Info "cai @deepseek-ai/dsh (toan cau)..."
  npm install -g @deepseek-ai/dsh
  $npmRoot = (npm root -g) 2>$null
  $dshRoot = Join-Path $npmRoot "@deepseek-ai\dsh"
  if (-not (Test-Path $dshRoot)) { throw "Cai DSH that bai. Chay lai: npm install -g @deepseek-ai/dsh" }
  Ok "DSH: $dshRoot"
}

# ---------- [3] tai bo cai moi nhat ----------
Log "Buoc 3/4: tai bo cai moi nhat"
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$latest = Invoke-RestMethod "$BundleBase/latest.json?t=$stamp" -UseBasicParsing -TimeoutSec 30
$file = $latest.windows.file
$wantSha = "$($latest.windows.sha256)".ToLower()
if (-not $file -or -not $wantSha) { throw "latest.json thieu thong tin cho windows" }
$zip = Join-Path $env:TEMP $file
Info "$BundleBase/$file"
Invoke-WebRequest "$BundleBase/$file" -OutFile $zip -UseBasicParsing -TimeoutSec 300
$gotSha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($gotSha -ne $wantSha) { throw "sha256 khong khop (mong doi $wantSha, nhan $gotSha) — thu lai" }
Ok "tai xong + sha256 khop ($($gotSha.Substring(0,12))...)"

$dir = Join-Path $env:TEMP "flowvpn-harness"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
Expand-Archive $zip $dir -Force

# ---------- [4] chay installer ----------
Log "Buoc 4/4: ap style FlowVPN + branding FlowTech"
$installer = Get-ChildItem $dir -Recurse -Filter "install-fpt-harness.ps1" | Select-Object -First 1
if (-not $installer) { throw "Khong thay install-fpt-harness.ps1 trong bo cai" }
$args = @("-ExecutionPolicy", "Bypass", "-File", $installer.FullName)
if ($SkipPatch) { $args += "-SkipPatch" }
& powershell @args
if ($LASTEXITCODE -ne 0) { throw "Installer tra loi (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   XONG" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "  1) Restart DSH:  Ctrl+C cua so ``dsh web`` roi chay lai  dsh web"
Write-Host "  2) Trong trinh duyet:  Ctrl+Shift+R  (hard refresh)"
Write-Host ""
