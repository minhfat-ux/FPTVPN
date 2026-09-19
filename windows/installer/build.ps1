<#
.SYNOPSIS
  Đóng gói VPNFlow cho Windows thành 1 file cài 1-click (Inno Setup 6).

.DESCRIPTION
  1) kiểm tra binary tunnel đã có trong windows/assets (wintun.dll, wireguard-go.exe,
     flowvpnrelay.exe, sing-box.exe)
  2) `dotnet publish` bản self-contained win-x64 (khách không cần cài .NET)
  3) kiểm tra output có đủ exe + 4 binary tunnel
  4) gọi ISCC.exe để tạo windows\installer\out\VPNFlow-Setup-<version>.exe

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1
  powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -Version 1.2.0
  powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -FrameworkDependent  # nhẹ hơn, máy khách phải có .NET 8 Desktop Runtime
  powershell -ExecutionPolicy Bypass -File windows\installer\build.ps1 -SkipPublish          # chỉ build lại installer từ publish có sẵn

.NOTES
  Muốn kiểm tra RIÊNG đường hysteria2-over-WS trên máy này (trước khi mở app), chạy:
    powershell -ExecutionPolicy Bypass -File windows\installer\verify-relay.ps1 -Password <HY_PASSWORD> -Obfs <HY_OBFS>
#>
[CmdletBinding()]
param(
  [string]$Configuration = "Release",
  [string]$Version = "",
  [switch]$FrameworkDependent,
  [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"

$installerDir = $PSScriptRoot
$windowsDir   = Split-Path -Parent $installerDir
$repoRoot     = Split-Path -Parent $windowsDir
$appProj      = Join-Path $windowsDir "PrivateVPNWindows.App\PrivateVPNWindows.App.csproj"
$assetsDir    = Join-Path $windowsDir "assets"
$publishDir   = Join-Path $installerDir "publish"
$outDir       = Join-Path $installerDir "out"
$issFile      = Join-Path $installerDir "VPNFlow.iss"
$appExe       = "PrivateVPNWindows.App.exe"

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }

# 1) binary tunnel bắt buộc: 2 file cho tunnel WireGuard userspace, 2 file cho đường
# "hysteria2 bọc trong WebSocket" (flowvpnrelay = hysteria2-over-WS + SOCKS5, sing-box = TUN).
# Thiếu bất kỳ file nào thì bộ cài vẫn tạo được nhưng đường tương ứng không chạy — chặn ở đây.
Step "Kiểm tra binary tunnel trong windows\assets"
foreach ($f in @("wintun.dll", "wireguard-go.exe", "flowvpnrelay.exe", "sing-box.exe")) {
  $p = Join-Path $assetsDir $f
  if (-not (Test-Path $p)) {
    throw "Thiếu windows\assets\$f. Chạy: bash windows/assets/fetch-assets.sh  (rồi chạy lại script này)"
  }
  Write-Host ("    OK {0} ({1:N0} KB)" -f $f, ((Get-Item $p).Length / 1KB))
}

# 2) publish
if (-not $SkipPublish) {
  # KHONG dung `$x = if (...) {...} else {...}`: do la cu phap PowerShell 7, Windows
  # PowerShell 5.1 (co san tren moi may Windows) bao "Missing closing '}'" va khong chay.
  $selfContained = "true"
  if ($FrameworkDependent) { $selfContained = "false" }
  Step "dotnet publish ($Configuration, win-x64, self-contained=$selfContained)"
  if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }
  & dotnet publish $appProj -c $Configuration -r win-x64 --self-contained $selfContained -o $publishDir
  if ($LASTEXITCODE -ne 0) { throw "dotnet publish thất bại (exit $LASTEXITCODE)" }
} else {
  Step "Bỏ qua publish (-SkipPublish): dùng $publishDir"
}

# 3) kiểm tra output
Step "Kiểm tra output publish"
foreach ($f in @($appExe, "wintun.dll", "wireguard-go.exe", "flowvpnrelay.exe", "sing-box.exe")) {
  $p = Join-Path $publishDir $f
  if (-not (Test-Path $p)) { throw "Publish thiếu $f — kiểm tra lại bước publish/asset" }
}
$sizeMb = [math]::Round(((Get-ChildItem $publishDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "    $publishDir ($sizeMb MB)"

# 4) version: tham số > <Version> trong csproj > FileVersion của exe > 1.0.0
if (-not $Version) {
  $projText = Get-Content $appProj -Raw
  if ($projText -match "<Version>\s*([^<\s]+)\s*</Version>") {
    $Version = $Matches[1]
  } else {
    $fv = (Get-Item (Join-Path $publishDir $appExe)).VersionInfo.FileVersion
    if ($fv) { $Version = ($fv -replace '\.0$', '') } else { $Version = "1.0.0" }
  }
}
Step "Version: $Version"

# 5) tìm Inno Setup 6
Step "Tìm Inno Setup 6 (ISCC.exe)"
$candidates = @(
  (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
  (Join-Path $env:ProgramFiles        "Inno Setup 6\ISCC.exe"),
  (Join-Path $env:LOCALAPPDATA        "Programs\Inno Setup 6\ISCC.exe")
)
$iscc = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $iscc) {
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { $iscc = $cmd.Source }
}
if (-not $iscc) {
  throw "Không tìm thấy ISCC.exe. Cài Inno Setup 6: winget install --id JRSoftware.InnoSetup -e  (hoặc tải tại jrsoftware.org/isdl.php)"
}
Write-Host "    $iscc"

# 6) build installer
Step "ISCC: tạo bộ cài"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
& $iscc "/DAppVersion=$Version" "/DSourceDir=$publishDir" $issFile
if ($LASTEXITCODE -ne 0) { throw "ISCC thất bại (exit $LASTEXITCODE)" }

$setup = Get-ChildItem $outDir -Filter "VPNFlow-Setup-*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "Không thấy file cài trong $outDir" }
$hash = (Get-FileHash $setup.FullName -Algorithm SHA256).Hash.ToLower()
Step ("XONG: {0} ({1:N1} MB)" -f $setup.FullName, ($setup.Length / 1MB))
Write-Host ("    sha256: {0}" -f $hash)
Write-Host "    Gửi khách file này: bấm 1 lần là cài xong (app yêu cầu quyền admin để dựng tunnel)."
