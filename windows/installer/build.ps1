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
  [switch]$SkipPublish,

  # ---------------------------------------------------------------------------
  # KÝ SỐ (NFR-WIN-002) - xem docs/RELEASE_RUNBOOK.md §6.
  #
  # Vì sao cần: máy khách bật Smart App Control CHẶN file chưa ký (os error 4551). Đo thật
  # 23/09/2026 trên máy harness: bộ cài chưa ký bị chặn ngay khi chạy (event CodeIntegrity
  # 3033/3077/3118, Policy {0283ac0f-fff1-49ae-ada1-8a933130cad6}) - khách bấm Yes ở UAC cũng
  # không cài được.
  #
  # KHÔNG hard-code chứng chỉ/mật khẩu trong file này. Cấu hình qua tham số hoặc biến môi trường:
  #   -SignCertThumbprint / VPNFLOW_SIGN_CERT_THUMBPRINT  cert trong store (KHUYẾN NGHỊ: không mật khẩu)
  #   -SignPfxPath        / VPNFLOW_SIGN_PFX_PATH         hoặc file .pfx
  #   -SignPfxPassword    / VPNFLOW_SIGN_PFX_PASSWORD     mật khẩu .pfx (KHÔNG bao giờ in ra log)
  #   -SignTimestampUrl   / VPNFLOW_SIGN_TIMESTAMP_URL    mặc định http://timestamp.digicert.com
  #   -SigntoolPath       / VPNFLOW_SIGNTOOL              để trống thì tự dò
  #
  # Không cấu hình gì => vẫn build được nhưng IN CẢNH BÁO TO (bản chưa ký sẽ bị SAC/SmartScreen chặn).
  # Dùng -RequireSigning để biến cảnh báo đó thành lỗi cứng (đường phát hành nên dùng).
  # ---------------------------------------------------------------------------
  [string]$SignCertThumbprint = $env:VPNFLOW_SIGN_CERT_THUMBPRINT,
  [string]$SignPfxPath = $env:VPNFLOW_SIGN_PFX_PATH,
  [string]$SignPfxPassword = $env:VPNFLOW_SIGN_PFX_PASSWORD,
  [string]$SignTimestampUrl = $env:VPNFLOW_SIGN_TIMESTAMP_URL,
  [string]$SigntoolPath = $env:VPNFLOW_SIGNTOOL,
  [switch]$RequireSigning,

  # CHỈ để thử dây ký bằng cert tự ký (chuỗi tin cậy không dựng được). KHÔNG dùng để phát hành.
  [switch]$AllowUntrustedSignature
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

# --- Ký số: hàm dùng chung (khối tham số ở đầu file, tài liệu ở RELEASE_RUNBOOK §6) ---------

function Resolve-SigntoolPath {
  if ($SigntoolPath) {
    if (-not (Test-Path $SigntoolPath)) { throw "Không thấy signtool.exe tại -SigntoolPath: $SigntoolPath" }
    return (Resolve-Path $SigntoolPath).Path
  }

  # Bản cài cục bộ, KHÔNG cần cả Windows SDK: gói NuGet Microsoft.Windows.SDK.BuildTools.
  $local = Join-Path $env:LOCALAPPDATA "VPNFlowTools\signtool\signtool.exe"
  if (Test-Path $local) { return $local }

  $sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
         Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
  if ($sdk) { return $sdk.FullName }

  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  return $null
}

function Get-SignBaseArguments {
  # Tham số cho `signtool sign`, KHÔNG gồm tên file cần ký.
  $arguments = @("sign")
  if ($SignCertThumbprint) {
    # Cert trong store: không có mật khẩu ở đâu cả (đường an toàn nhất, dùng được cả token EV).
    $arguments += @("/sha1", $SignCertThumbprint)
  } elseif ($SignPfxPath) {
    if (-not (Test-Path $SignPfxPath)) { throw "Không thấy file .pfx: $SignPfxPath" }
    $arguments += @("/f", (Resolve-Path $SignPfxPath).Path)
    if ($SignPfxPassword) { $arguments += @("/p", $SignPfxPassword) }
  } else {
    throw "Thiếu chứng chỉ ký: truyền -SignCertThumbprint hoặc -SignPfxPath."
  }

  # SHA-256 cho cả digest lẫn timestamp (SHA-1 đã bị Windows coi là yếu).
  $arguments += @("/fd", "sha256")
  if ($SignTimestampUrl) { $arguments += @("/tr", $SignTimestampUrl, "/td", "sha256") }
  return $arguments
}

function Invoke-SignFile([string]$signtool, [string[]]$baseArguments, [string]$file) {
  # KHÔNG in $baseArguments: có thể chứa mật khẩu .pfx.
  & $signtool @($baseArguments + @($file)) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "signtool sign thất bại cho $(Split-Path -Leaf $file) (exit $LASTEXITCODE)" }
}

function New-SignWrapper([string]$signtool, [string[]]$baseArguments, [string]$path) {
  # Inno Setup gọi công cụ ký qua SignTool=<tên>: sinh 1 file .cmd thay vì nhúng cả dòng lệnh
  # vào /S của ISCC (PowerShell 5.1 làm hỏng dấu nháy lồng khi truyền cho exe native).
  # Mật khẩu .pfx KHÔNG ghi vào file này: thay bằng %VPNFLOW_SIGN_PFX_PASSWORD% đọc từ môi trường.
  $quoted = $baseArguments | ForEach-Object {
    if ($SignPfxPassword -and $_ -eq $SignPfxPassword) { "%VPNFLOW_SIGN_PFX_PASSWORD%" }
    elseif ($_ -match '\s') { '"' + $_ + '"' }
    else { $_ }
  }
  $lines = @(
    "@echo off",
    "`"$signtool`" $($quoted -join ' ') `"%~1`"",
    "exit /b %ERRORLEVEL%"
  )
  Set-Content -LiteralPath $path -Value $lines -Encoding ASCII
  return $path
}

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

# 3d) KÝ SỐ binary CỦA MÌNH trong bộ publish - làm TRƯỚC khi đóng gói để file BÊN TRONG bộ cài
#     cũng đã ký. Chỉ ký file của mình: KHÔNG ký lại binary bên thứ ba (sing-box, wireguard-go,
#     wintun.dll) - ký đè lên chữ ký của người khác là việc không được phép làm.
if (-not $SignTimestampUrl) { $SignTimestampUrl = "http://timestamp.digicert.com" }
$signConfigured = [bool]($SignCertThumbprint -or $SignPfxPath)
$signWrapper = $null
$signtool = $null

if ($signConfigured) {
  Step "Ký số binary của mình trong bộ publish"
  $signtool = Resolve-SigntoolPath
  if (-not $signtool) {
    throw "Đã cấu hình ký số nhưng không tìm thấy signtool.exe. Cài Windows SDK, hoặc lấy gói NuGet Microsoft.Windows.SDK.BuildTools rồi trỏ -SigntoolPath."
  }
  Write-Host "    signtool: $signtool" -ForegroundColor Green

  if ($SignPfxPassword) { $env:VPNFLOW_SIGN_PFX_PASSWORD = $SignPfxPassword }   # cho wrapper .cmd đọc
  $signBaseArguments = Get-SignBaseArguments

  foreach ($pattern in @("PrivateVPNWindows.App.exe", "PrivateVPNWindows.*.dll", "flowvpnrelay.exe")) {
    foreach ($file in @(Get-ChildItem -Path $publishDir -Filter $pattern -File)) {
      Invoke-SignFile $signtool $signBaseArguments $file.FullName
      Write-Host ("    ký {0}" -f $file.Name)
    }
  }

  # Wrapper cho Inno Setup (ký cả Setup lẫn uninstaller).
  $wrapperPath = Join-Path ([System.IO.Path]::GetTempPath()) ("vpnflow-sign-" + $PID + ".cmd")
  $signWrapper = New-SignWrapper $signtool $signBaseArguments $wrapperPath
  if ($signWrapper -match '\s') {
    # ISCC nhận công cụ ký qua /S<name>=<command>: đường dẫn có dấu cách sẽ bị cắt sai.
    try {
      $fso = New-Object -ComObject Scripting.FileSystemObject
      $signWrapper = $fso.GetFile($signWrapper).ShortPath
    } catch { }
  }
  if ($signWrapper -match '\s') {
    throw "Đường dẫn wrapper ký số có dấu cách ($signWrapper) - ISCC /S không xử lý được. Đổi TEMP sang đường dẫn không dấu cách."
  }
  Write-Host "    wrapper ký cho Inno: $signWrapper"
} else {
  Write-Host ""
  Write-Host "    CẢNH BÁO: build KHÔNG ký số." -ForegroundColor Yellow
  Write-Host "    Bộ cài chưa ký bị Smart App Control CHẶN trên máy khách (os error 4551) và bị SmartScreen cảnh báo." -ForegroundColor Yellow
  Write-Host "    Cấu hình: -SignCertThumbprint <sha1> hoặc -SignPfxPath <file.pfx>. Xem docs/RELEASE_RUNBOOK.md muc 6." -ForegroundColor Yellow
  Write-Host ""
  if ($RequireSigning) { throw "Yêu cầu -RequireSigning nhưng chưa cấu hình chứng chỉ ký số. DỪNG." }
}

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
$isccArguments = @("/DAppVersion=$Version", "/DSourceDir=$publishDir")
if ($signConfigured) {
  # VPNFlow.iss chỉ bật SignTool/SignedUninstaller khi có /DSignedBuild (xem #ifdef trong file).
  # BẮT BUỘC phải có `$f` trong chuỗi: Inno thay `$f` bằng đường dẫn file cần ký, thiếu là ISCC
  # báo "Unable to run Sign Tool: $f sequence is missing" (đã gặp thật 23/09/2026).
  $isccArguments += @("/DSignedBuild", ('/Ssigntool=' + $signWrapper + ' $f'))
}
$isccArguments += $issFile
& $iscc @isccArguments
if ($LASTEXITCODE -ne 0) { throw "ISCC thất bại (exit $LASTEXITCODE)" }

$setup = Get-ChildItem $outDir -Filter "VPNFlow-Setup-*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "Không thấy file cài trong $outDir" }

# 6b) CỔNG CHẶN: đã cấu hình ký số thì file phát hành PHẢI thật sự có chữ ký tin cậy
#     (NFR-WIN-002: `signtool verify /pa` VÀ Get-AuthenticodeSignature = Valid, có timestamp).
if ($signConfigured) {
  Step "Xác minh chữ ký số (NFR-WIN-002)"
  foreach ($file in @((Join-Path $publishDir $appExe), $setup.FullName)) {
    $signature = Get-AuthenticodeSignature -LiteralPath $file
    if (-not $signature.SignerCertificate) { throw "$(Split-Path -Leaf $file) KHÔNG có chữ ký số - DỪNG." }
    $stamped = if ($signature.TimeStamperCertificate) { "có timestamp" } else { "KHÔNG có timestamp" }
    & $signtool verify /pa $file | Out-Null
    $trusted = ($LASTEXITCODE -eq 0)
    Write-Host ("    {0}: {1} | {2}" -f (Split-Path -Leaf $file), $signature.Status, $stamped)
    Write-Host ("      ký bởi: {0}" -f $signature.SignerCertificate.Subject)
    if (-not $trusted) {
      if ($AllowUntrustedSignature) {
        Write-Host "      CẢNH BÁO: signtool verify /pa KHÔNG ĐẠT (chuỗi tin cậy) - chỉ chấp nhận khi THỬ dây ký." -ForegroundColor Yellow
      } else {
        throw "signtool verify /pa KHÔNG ĐẠT cho $(Split-Path -Leaf $file) - DỪNG (NFR-WIN-002 đòi chữ ký tin cậy)."
      }
    }
  }
}

if ($signWrapper) { Remove-Item -LiteralPath $signWrapper -Force -ErrorAction SilentlyContinue }

$hash = (Get-FileHash $setup.FullName -Algorithm SHA256).Hash.ToLower()
Step ("XONG: {0} ({1:N1} MB)" -f $setup.FullName, ($setup.Length / 1MB))
Write-Host ("    sha256: {0}" -f $hash)
if ($signConfigured) { Write-Host "    chữ ký số: ĐÃ KÝ và xác minh (NFR-WIN-002)" -ForegroundColor Green }
else { Write-Host "    chữ ký số: CHƯA KÝ (xem cảnh báo ở bước 3d)" -ForegroundColor Yellow }
Write-Host "    Gửi khách file này: bấm 1 lần là cài xong (app yêu cầu quyền admin để dựng tunnel)."
