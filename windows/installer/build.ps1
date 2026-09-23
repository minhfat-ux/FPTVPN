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
  [string]$Commit = "",
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

# 1b) VERSION phải giải TRƯỚC khi publish.
#     Vì sao: trước 21/09/2026 khối này nằm SAU bước publish nên `dotnet publish` không nhận
#     `/p:Version`, app tự khai 1.0.0 trong khi installer tên `VPNFlow-Setup-1.4.1.exe` — cổng
#     `scripts/check-publish-version.py` bắt được (FileVersion 1.0.0.0 ≠ định phát 1.4.1).
#     Thứ tự: tham số -Version > <Version> trong csproj > 1.0.0.
if (-not $Version) {
  $projText = Get-Content $appProj -Raw
  if ($projText -match "<Version>\s*([^<\s]+)\s*</Version>") {
    $Version = $Matches[1]
  } else {
    $Version = "1.0.0"
  }
}
Step "Version: $Version"

# 1c) COMMIT BUILD: phải xác định được, cây nguồn phải SẠCH, và commit được NHÚNG TƯỜNG MINH.
#     Vì sao (lỗi thật 22/09/2026): bản 1.4.3 được build từ cây làm việc đang ở HEAD cũ (7ae07f0)
#     nên app khai `ProductVersion = 1.4.3+7ae07f0…` trong khi sổ phát hành + tag ghi commit build
#     `64e07c7` ⇒ lệch đúng cái mốc trả lời "bản khách đang chạy build từ mã nguồn nào".
#     Từ đây: (a) DỪNG nếu `windows/` còn thay đổi chưa commit, (b) nhúng commit tường minh qua
#     /p:SourceRevisionId + /p:InformationalVersion, (c) kiểm lại số nhúng trong exe ở bước 3b.
if (-not $Commit) {
  $head = (& git -C $repoRoot rev-parse HEAD 2>$null)
  if ($LASTEXITCODE -eq 0 -and $head) { $Commit = $head.Trim() }
}
if (-not $Commit) {
  throw "Không xác định được commit build. Chạy trong repo git hoặc truyền -Commit <sha>."
}
$dirty = (& git -C $repoRoot status --porcelain -- windows 2>$null)
if ($LASTEXITCODE -eq 0 -and $dirty) {
  throw "Cây nguồn còn thay đổi CHƯA COMMIT trong windows/ ⇒ DỪNG (commit trước rồi build lại):`n$dirty"
}
Write-Host "    commit build: $Commit (cây windows/ sạch)" -ForegroundColor Green

$versionArgs = @(
  "/p:Version=$Version",
  "/p:FileVersion=$Version",
  # InformationalVersion: CHỈ đặt <version> — SDK tự nối thêm "+<SourceRevisionId>"
  # (đã kiểm ở 1.4.3: đặt `1.4.3` ⇒ exe khai `1.4.3+7ae07f0…`). Đặt kèm commit ở đây sẽ bị LẶP
  # thành `<v>+<sha>.<sha>` — cổng chặn 3c đã bắt được đúng lỗi này ở lần build đầu của 1.4.4.
  "/p:InformationalVersion=$Version",
  "/p:SourceRevisionId=$Commit"
)

# 2) publish
if (-not $SkipPublish) {
  # KHONG dung `$x = if (...) {...} else {...}`: do la cu phap PowerShell 7, Windows
  # PowerShell 5.1 (co san tren moi may Windows) bao "Missing closing '}'" va khong chay.
  $selfContained = "true"
  if ($FrameworkDependent) { $selfContained = "false" }
  Step "dotnet publish ($Configuration, win-x64, self-contained=$selfContained)"
  if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }
  & dotnet publish $appProj -c $Configuration -r win-x64 --self-contained $selfContained -o $publishDir @versionArgs
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

# 3b) CỔNG CHẶN: số hiệu trong app exe PHẢI khớp số định phát (không tin tên installer).
$builtVersion = (Get-Item (Join-Path $publishDir $appExe)).VersionInfo.FileVersion
$normalized = if ($builtVersion) { $builtVersion -replace '\.0$', '' } else { "" }
if ($normalized -ne $Version) {
  throw "App exe mang version '$builtVersion' nhưng định phát '$Version' — DỪNG (kiểm -SkipPublish: bản publish cũ chưa được dựng lại kèm /p:Version)."
}
Write-Host "    app exe FileVersion = $builtVersion (khớp $Version)" -ForegroundColor Green

# 3c) CỔNG CHẶN: commit nhúng trong exe PHẢI đúng commit build (xem 1c). Cổng này bắt được cả
#     trường hợp ai đó build trong cây có HEAD khác commit định ghi sổ.
$builtInfo = (Get-Item (Join-Path $publishDir $appExe)).VersionInfo.ProductVersion
$expectedInfo = "$Version+$Commit"
if ($builtInfo -ne $expectedInfo) {
  throw "App exe khai ProductVersion '$builtInfo' nhưng phải là '$expectedInfo' — DỪNG (commit nhúng KHÔNG khớp commit build)."
}
Write-Host "    app exe ProductVersion = $builtInfo (khớp commit build)" -ForegroundColor Green

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
