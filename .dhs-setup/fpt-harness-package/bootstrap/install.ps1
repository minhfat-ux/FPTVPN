<#
.SYNOPSIS
  FlowTech Harness - bootstrap tu cai MOI thu cho Windows, chay 1 dong lenh.

.DESCRIPTION
  Dan vao PowerShell (quyen user binh thuong):

      irm https://meetflowai.site/dl/harness/install.ps1 | iex

  Quy trinh:
    [0/5] KIEM TRA HE THONG  - liet ke cai gi da co, con thieu gi (khong sua gi)
    [1/5] XAC NHAN           - in ro se cai/sua nhung gi, cho nguoi dung dong y
    [2/5] Node.js LTS        - winget; khong co winget thi tai MSI tu nodejs.org
    [3/5] DeepSeek Harness   - npm install -g @deepseek-ai/dsh
    [4/5] Python 3           - winget / python.org (chi can khi patch style)
    [5/5] Bo cai + patch     - tai zip (verify sha256) -> theme FlowVPN + branding FlowTech

  Khong cai gi khi nguoi dung khong dong y. Moi file bi sua deu co backup `.fpt.bak`.

  LUU Y: file nay PHAI la ASCII thuan (khong dau tieng Viet). PowerShell 5.1 doc file .ps1
  / phan hoi cua `irm` theo codepage ANSI khi khong co charset/BOM, nen ky tu UTF-8 da byte
  (vi du dau gach dai U+2014) se bi bien thanh dau ngoac thong minh va lam vo chuoi -> loi parse.

.PARAMETER BundleBase
  Goc chua latest.json + zip (mac dinh https://meetflowai.site/dl/harness).

.PARAMETER SkipPatch
  Chi cai Node + DSH, khong patch style (khong can Python).

.PARAMETER Check
  Chi kiem tra he thong, in bang trang thai, KHONG cai/sua gi.

.PARAMETER Yes
  Dong y truoc (bo qua cau hoi xac nhan) - dung cho cai tu dong.

.PARAMETER No
  Tu choi truoc: chi kiem tra roi thoat, khong cai gi.
#>
[CmdletBinding()]
param(
  [string]$BundleBase = "https://meetflowai.site/dl/harness",
  [switch]$SkipPatch,
  [switch]$Check,
  [switch]$Yes,
  [switch]$No
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------- helpers
function Log  { Write-Host "==> $args" -ForegroundColor Green }
function Info { Write-Host "--> $args" -ForegroundColor Cyan }
function Ok   { Write-Host "   OK  $args" -ForegroundColor Green }
function Warn { Write-Host "   !!  $args" -ForegroundColor Yellow }
function Err  { Write-Host "   XX  $args" -ForegroundColor Red }

$script:Report = New-Object System.Collections.ArrayList
function Add-Result($name, $status, $detail) {
  [void]$script:Report.Add([pscustomobject]@{ Name = $name; Status = $status; Detail = $detail })
}
function Show-Report {
  Write-Host ""
  Write-Host "  ----------------- KIEM TRA HE THONG -----------------" -ForegroundColor Cyan
  foreach ($r in $script:Report) {
    $color = "Gray"
    if ($r.Status -eq "OK")      { $color = "Green" }
    elseif ($r.Status -eq "DA CAI") { $color = "Green" }
    elseif ($r.Status -eq "THIEU")  { $color = "Yellow" }
    elseif ($r.Status -eq "WARN")   { $color = "Yellow" }
    elseif ($r.Status -eq "FAIL")   { $color = "Red" }
    Write-Host ("   {0,-7} {1,-22} {2}" -f $r.Status, $r.Name, $r.Detail) -ForegroundColor $color
  }
  Write-Host "  -----------------------------------------------------" -ForegroundColor Cyan
}

function Update-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

function Test-Url($url, $timeoutSec = 15) {
  try {
    $null = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec $timeoutSec -Method Head
    return $true
  } catch {
    try {
      $null = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec $timeoutSec
      return $true
    } catch { return $false }
  }
}

function Get-FreeGB($path) {
  try {
    $root = [System.IO.Path]::GetPathRoot((Resolve-Path $path -ErrorAction SilentlyContinue).Path)
    if (-not $root) { $root = $env:SystemDrive + "\" }
    $d = New-Object System.IO.DriveInfo($root)
    return [math]::Round($d.AvailableFreeSpace / 1GB, 1)
  } catch { return -1 }
}

# Tim binary o cac vi tri cai dat pho bien (winget/MSI khong cap nhat PATH cua session)
function Find-Node {
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe",
                   "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if (Test-Path $p) { $env:Path = (Split-Path $p) + ";" + $env:Path; return $p }
  }
  return $null
}
function Find-Npm {
  $c = Get-Command npm -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("$env:ProgramFiles\nodejs\npm.cmd", "$env:APPDATA\npm\npm.cmd")) {
    if (Test-Path $p) { $env:Path = (Split-Path $p) + ";" + $env:Path; return $p }
  }
  return $null
}
function Get-Major($versionText, $prefix) {
  if (-not $versionText) { return -1 }
  $t = "$versionText".Trim()
  if ($prefix) { $t = $t -replace "^$prefix", "" }
  $m = [regex]::Match($t, '(\d+)')
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return -1
}
function Test-PyExe($exe, $pre) {
  # Kiem tra Python "chay duoc that" (tranh stub Microsoft Store bao sai la da co Python)
  try {
    $pyArgs = @()
    if ($pre) { $pyArgs += $pre }
    $pyArgs += @("-c", "import sys;print('%d.%d.%d' % sys.version_info[:3])")
    $out = (& $exe @pyArgs 2>&1 | Out-String).Trim()
    if ($out -match '^3\.(\d+)\.\d+$') { return $out }
  } catch { }
  return $null
}
function Get-PythonVersion {
  foreach ($cmd in @("python", "python3")) {
    $c = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($c) { $v = Test-PyExe $c.Source $null; if ($v) { return $v } }
  }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) { $v = Test-PyExe $py.Source @("-3"); if ($v) { return $v } }
  foreach ($p in (Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Filter python.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue)) {
    $v = Test-PyExe $p.FullName $null
    if ($v) { $env:Path = $p.DirectoryName + ";" + $env:Path; return $v }
  }
  foreach ($p in @("$env:ProgramFiles\Python312\python.exe", "$env:ProgramFiles\Python311\python.exe", "$env:ProgramFiles\Python310\python.exe")) {
    if (Test-Path $p) { $v = Test-PyExe $p $null; if ($v) { $env:Path = (Split-Path $p) + ";" + $env:Path; return $v } }
  }
  return $null
}
function Find-Python { return (Get-PythonVersion) }

function Install-Node {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Info "cai Node.js LTS qua winget..."
    try {
      & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent | Out-Host
    } catch { Warn "winget tra loi: $($_.Exception.Message)" }
    Update-Path
    if (Find-Node) { return $true }
  }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $ver = "v22.14.0"
  try {
    $idx = Invoke-RestMethod "https://nodejs.org/dist/index.json" -TimeoutSec 30
    $lts = $idx | Where-Object { $_.lts } | Select-Object -First 1
    if ($lts -and $lts.version) { $ver = "$($lts.version)" }
  } catch { Warn "khong lay duoc ban LTS moi nhat - dung $ver" }
  $msi = Join-Path $env:TEMP "node-lts-$arch.msi"
  Info "tai Node.js $ver ($arch) tu nodejs.org..."
  Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-$arch.msi" -OutFile $msi -UseBasicParsing -TimeoutSec 300
  Info "chay msiexec (co the hoi quyen)..."
  $p = Start-Process msiexec.exe -ArgumentList "/i", "`"$msi`"", "/qn", "/norestart" -Wait -PassThru
  if ($p.ExitCode -ne 0) { Warn "msiexec exit $($p.ExitCode)" }
  Update-Path
  return [bool](Find-Node)
}

function Install-Python {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Info "cai Python 3 qua winget..."
    try {
      & winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements --silent | Out-Host
    } catch { Warn "winget tra loi: $($_.Exception.Message)" }
    Update-Path
    if (Find-Python) { return $true }
  }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "amd64" }
  $ver = "3.12.10"
  $exe = Join-Path $env:TEMP "python-$ver-$arch.exe"
  Info "tai Python $ver ($arch) tu python.org..."
  Invoke-WebRequest "https://www.python.org/ftp/python/$ver/python-$ver-$arch.exe" -OutFile $exe -UseBasicParsing -TimeoutSec 300
  Info "chay installer Python (che do im lang, them vao PATH)..."
  $p = Start-Process $exe -ArgumentList "/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_launcher=1" -Wait -PassThru
  if ($p.ExitCode -ne 0) { Warn "python installer exit $($p.ExitCode)" }
  Update-Path
  return [bool](Find-Python)
}

function Install-Dsh {
  $npm = Find-Npm
  if (-not $npm) { return $false }
  Info "cai @deepseek-ai/dsh (toan cau)..."
  try {
    & npm install -g @deepseek-ai/dsh | Out-Host
  } catch {
    Warn "npm install -g loi: $($_.Exception.Message)"
    Info "thu lai voi prefix nguoi dung (khong can quyen admin)..."
    $prefix = Join-Path $env:APPDATA "npm-global"
    New-Item -ItemType Directory -Force -Path $prefix | Out-Null
    & npm install -g --prefix $prefix @deepseek-ai/dsh | Out-Host
    $env:Path = (Join-Path $prefix "node_modules\.bin") + ";" + $env:Path
  }
  return [bool](Get-DshPath)
}

function Get-DshPath {
  $npmRoot = (& npm root -g 2>&1 | Out-String).Trim()
  if ($npmRoot) {
    $p = Join-Path $npmRoot "@deepseek-ai\dsh"
    if (Test-Path $p) { return $p }
  }
  foreach ($cand in @("$env:APPDATA\npm-global\node_modules\@deepseek-ai\dsh",
                      "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh")) {
    if (Test-Path $cand) { return $cand }
  }
  return $null
}

# ---------------------------------------------------------------- [0] banner
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   FLOWTECH HARNESS - CAI DAT TU DONG (WINDOWS)" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------- [0/5] kiem tra
Log "[0/5] Kiem tra he thong (chua cai/sua gi)"

# OS + PowerShell
$os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue)
$needInstall = New-Object System.Collections.ArrayList
if ($os) {
  Add-Result "Windows" "OK" ("{0} (build {1}, {2})" -f $os.Caption, $os.BuildNumber, $env:PROCESSOR_ARCHITECTURE)
  if ([int]$os.BuildNumber -lt 17763) { Warn "Windows cu (build < 17763) - co the thieu winget/Expand-Archive" }
} else {
  Add-Result "Windows" "WARN" "khong doc duoc thong tin OS"
}
Add-Result "PowerShell" "OK" "$($PSVersionTable.PSVersion)"

# Mang
$cdnOk = Test-Url "$BundleBase/latest.json"
if ($cdnOk) { Add-Result "Internet - CDN" "OK" $BundleBase }
else { Add-Result "Internet - CDN" "FAIL" "khong ket noi duoc $BundleBase"; [void]$needInstall.Add("Internet (CDN)") }
if (Test-Url "https://registry.npmjs.org/-/ping") { Add-Result "Internet - npm registry" "OK" "registry.npmjs.org" }
else { Add-Result "Internet - npm registry" "FAIL" "khong ket noi duoc registry.npmjs.org"; [void]$needInstall.Add("Internet (npm)") }

# Dung luong dia
$freeTmp = Get-FreeGB $env:TEMP
if ($freeTmp -lt 0) { Add-Result "Dung luong dia" "WARN" "khong doc duoc" }
elseif ($freeTmp -lt 1.5) { Add-Result "Dung luong dia" "THIEU" "$freeTmp GB trong - can >= 1.5 GB"; [void]$needInstall.Add("Dung luong dia") }
else { Add-Result "Dung luong dia" "OK" "$freeTmp GB trong ($($env:SystemDrive))" }

# TEMP ghi duoc
try {
  $probe = Join-Path $env:TEMP ("fpt-write-test-" + [Guid]::NewGuid().ToString("N") + ".tmp")
  Set-Content -Path $probe -Value "ok" -Encoding ASCII
  Remove-Item $probe -Force
  Add-Result "Thu muc TEMP" "OK" "$env:TEMP (ghi duoc)"
} catch {
  Add-Result "Thu muc TEMP" "FAIL" "khong ghi duoc vao $env:TEMP"; [void]$needInstall.Add("TEMP")
}

# winget (cong cu tu cai dat)
$wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
if ($wingetCmd) {
  $wv = (& winget --version 2>&1 | Out-String).Trim()
  Add-Result "winget" "OK" $wv
} else {
  Add-Result "winget" "WARN" "khong co - se tai truc tiep tu nodejs.org/python.org"
}

# Node + npm
$nodePath = Find-Node
$nodeOk = $false
if ($nodePath) {
  $nodeVer = (& node --version 2>&1 | Out-String).Trim()
  $major = Get-Major $nodeVer "v"
  if ($major -ge 18) { Add-Result "Node.js" "OK" "$nodeVer (>= 18)"; $nodeOk = $true }
  else { Add-Result "Node.js" "THIEU" "$nodeVer qua cu - can >= 18"; [void]$needInstall.Add("Node.js") }
} else {
  Add-Result "Node.js" "THIEU" "chua cai"; [void]$needInstall.Add("Node.js")
}

$npmPath = Find-Npm
if ($nodeOk) {
  if ($npmPath) {
    $npmVer = (& npm --version 2>&1 | Out-String).Trim()
    Add-Result "npm" "OK" $npmVer
  } else { Add-Result "npm" "THIEU" "khong thay npm.cmd"; [void]$needInstall.Add("npm") }
} else {
  Add-Result "npm" "THIEU" "di kem Node.js"
}

# Python (chi can khi patch)
$pyVer = Get-PythonVersion
$needPy = -not $SkipPatch
if (-not $needPy) {
  Add-Result "Python 3" "OK" "khong can (dang -SkipPatch)"
} elseif ($pyVer) {
  $pyMinor = 0
  if ($pyVer -match '^3\.(\d+)\.') { $pyMinor = [int]$Matches[1] }
  if ($pyMinor -ge 8) { Add-Result "Python 3" "OK" "$pyVer (>= 3.8)" }
  else { Add-Result "Python 3" "THIEU" "$pyVer qua cu - can >= 3.8"; [void]$needInstall.Add("Python 3") }
} else {
  Add-Result "Python 3" "THIEU" "chua cai (buoc patch style can Python)"; [void]$needInstall.Add("Python 3")
}

# DSH
$dshPath = if ($npmPath) { Get-DshPath } else { $null }
if ($dshPath) {
  Add-Result "DeepSeek Harness" "OK" $dshPath
} else {
  Add-Result "DeepSeek Harness" "THIEU" "@deepseek-ai/dsh chua cai"; [void]$needInstall.Add("DeepSeek Harness")
}

# Duong dan dai (npm node_modules tren Windows)
try {
  $lp = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -ErrorAction Stop).LongPathsEnabled
  if ($lp -eq 1) { Add-Result "LongPathsEnabled" "OK" "da bat" }
  else { Add-Result "LongPathsEnabled" "WARN" "= 0 (chi anh huong neu gap loi duong dan dai)" }
} catch { Add-Result "LongPathsEnabled" "WARN" "khong doc duoc registry" }

Show-Report

if ($Check) {
  Write-Host ""
  if ($needInstall.Count -eq 0) {
    Write-Host "  Ket luan: he thong DA DU moi thu can thiet." -ForegroundColor Green
    exit 0
  }
  Write-Host "  Ket luan: con thieu -> $($needInstall -join ', ')" -ForegroundColor Yellow
  Write-Host "  Chay lai KHONG co -Check de tu cai (se hoi dong y truoc khi cai)." -ForegroundColor Cyan
  exit 1
}

# ---------------------------------------------------------------- [1/5] xac nhan
Log "[1/5] Xac nhan truoc khi cai"

if ($needInstall.Count -eq 0) {
  Ok "khong thieu gi - chi con tai bo cai + patch style"
}

Write-Host ""
Write-Host "  ---------------- DIEU KHOAN CAI DAT ----------------" -ForegroundColor Cyan
Write-Host "  Bootstrap se THUC HIEN cac thao tac sau tren may nay:" -ForegroundColor White
$step = 1
if ($needInstall -contains "Node.js" -or $needInstall -contains "npm") {
  Write-Host ("   {0}. Cai Node.js LTS (winget, hoac MSI tu nodejs.org)  [can thiet de chay DSH]" -f $step); $step++
}
if ($needInstall -contains "DeepSeek Harness") {
  Write-Host ("   {0}. Cai DeepSeek Harness: npm install -g @deepseek-ai/dsh" -f $step); $step++
}
if ($needInstall -contains "Python 3") {
  Write-Host ("   {0}. Cai Python 3 (winget, hoac installer tu python.org)  [de chay script patch]" -f $step); $step++
}
if ($SkipPatch) {
  Write-Host ("   {0}. Tai goi FlowTech Harness + chay installer voi -SkipPatch (khong doi giao dien)" -f $step); $step++
} else {
  Write-Host ("   {0}. Tai goi FlowTech Harness + patch giao dien DSH:" -f $step)
  Write-Host "      theme FlowVPN + branding FlowTech + favicon + browse-picker"
  Write-Host "      (moi file bi sua deu duoc backup thanh <file>.fpt.bak, chay lai duoc nhieu lan)"
  $step++
}
Write-Host ("   {0}. Tao wrapper + Task Scheduler 'FPT-DSH-Server' (tu chay DSH khi dang nhap)" -f $step)
Write-Host "      (task chi chay khi cong 3080 chua duoc dung; khong gui du lieu ra ngoai)"
Write-Host ""
Write-Host "  KHONG thu thap du lieu ca nhan. KHONG dung toi phien lam viec (~/.dsh/sessions)." -ForegroundColor White
Write-Host "  Chi cai vao thu muc nguoi dung + npm global, khong can quyen admin (tru khi winget/msi hoi)." -ForegroundColor White
Write-Host "  ---------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

if ($No) {
  Write-Host ""
  Write-Host "  Da HUY (-No) - chi kiem tra, khong cai gi. Khong co thay doi nao tren may." -ForegroundColor Yellow
  exit 0
}

if (-not $Yes) {
  if ([Console]::IsInputRedirected) {
    Err "Khong co terminal de hoi dong y (stdin bi chuyen huong)."
    Write-Host "  Neu ban dong y voi cac dieu khoan tren, chay lai voi -Yes:" -ForegroundColor Yellow
    Write-Host "    & ([scriptblock]::Create((irm $BundleBase/install.ps1))) -Yes" -ForegroundColor Cyan
    exit 3
  }
  $answer = Read-Host "  Ban dong y cai dat? (y/N)"
  if ($answer -notmatch '^(y|Y|yes|YES|Yes)$') {
    Write-Host ""
    Write-Host "  Da HUY - khong cai gi ca. Khong co thay doi nao tren may." -ForegroundColor Yellow
    exit 0
  }
  Ok "da dong y"
} else {
  Ok "da dong y truoc bang -Yes"
}

# ---------------------------------------------------------------- [2/5] Node
Log "[2/5] Node.js + npm"
if (-not (Find-Node) -or -not (Find-Npm)) {
  $installed = Install-Node
  if ($installed -and (Find-Npm)) {
    Ok "Node.js $(node --version) / npm $(npm --version)"
    Add-Result "Node.js" "DA CAI" "$(node --version)"
  } else {
    Err "Cai Node.js that bai. Tai tay tu https://nodejs.org roi chay lai lenh nay."
    exit 1
  }
} else {
  Ok "da co Node.js $(node --version) / npm $(npm --version)"
}

# ---------------------------------------------------------------- [3/5] DSH
Log "[3/5] DeepSeek Harness"
$dshPath = Get-DshPath
if ($dshPath) {
  Ok "da co DSH: $dshPath"
} else {
  if (Install-Dsh) {
    $dshPath = Get-DshPath
    Ok "DSH: $dshPath"
    Add-Result "DeepSeek Harness" "DA CAI" $dshPath
  } else {
    Err "Cai DSH that bai. Chay lai: npm install -g @deepseek-ai/dsh"
    exit 1
  }
}

# ---------------------------------------------------------------- [4/5] Python
if (-not $SkipPatch) {
  Log "[4/5] Python 3 (cho buoc patch)"
  $pyVer = Get-PythonVersion
  if ($pyVer) {
    Ok "da co Python $pyVer"
  } else {
    if (Install-Python) {
      $pyVer = Get-PythonVersion
      Ok "Python: $pyVer"
      Add-Result "Python 3" "DA CAI" $pyVer
    } else {
      Err "Cai Python that bai. Tai tay tu https://python.org roi chay lai."
      exit 1
    }
  }
} else {
  Log "[4/5] Python 3 - bo qua (-SkipPatch)"
}

# ---------------------------------------------------------------- [5/5] tai + patch
Log "[5/5] Tai bo cai moi nhat + ap style"
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$latest = Invoke-RestMethod "$BundleBase/latest.json?t=$stamp" -UseBasicParsing -TimeoutSec 30
$file = $latest.windows.file
$wantSha = "$($latest.windows.sha256)".ToLower()
if (-not $file -or -not $wantSha) { throw "latest.json thieu thong tin cho windows" }
$zip = Join-Path $env:TEMP $file
Info "$BundleBase/$file"
Invoke-WebRequest "$BundleBase/$file" -OutFile $zip -UseBasicParsing -TimeoutSec 300
$gotSha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($gotSha -ne $wantSha) { throw "sha256 khong khop (mong doi $wantSha, nhan $gotSha) - thu lai" }
Ok "tai xong + sha256 khop ($($gotSha.Substring(0,12))...)"

$dir = Join-Path $env:TEMP "flowvpn-harness"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
Expand-Archive $zip $dir -Force

$installer = Get-ChildItem $dir -Recurse -Filter "install-fpt-harness.ps1" | Select-Object -First 1
if (-not $installer) { throw "Khong thay install-fpt-harness.ps1 trong bo cai" }
$psArgs = @("-ExecutionPolicy", "Bypass", "-File", $installer.FullName)
if ($SkipPatch) { $psArgs += "-SkipPatch" }
& powershell @psArgs
if ($LASTEXITCODE -ne 0) { throw "Installer tra loi (exit $LASTEXITCODE)" }

# ---------------------------------------------------------------- ket qua cuoi
Write-Host ""
Log "Kiem tra lai sau khi cai"
$script:Report.Clear()
Update-Path
$nodePath = Find-Node; $npmPath = Find-Npm
if ($nodePath) { Add-Result "Node.js" "OK" "$(node --version 2>&1)" } else { Add-Result "Node.js" "FAIL" "khong thay" }
if ($npmPath)  { Add-Result "npm" "OK" "$(npm --version 2>&1)" } else { Add-Result "npm" "FAIL" "khong thay" }
if (-not $SkipPatch) {
  $pyFinal = Get-PythonVersion
if ($pyFinal) { Add-Result "Python 3" "OK" $pyFinal } else { Add-Result "Python 3" "FAIL" "khong thay" }
}
$dshPath = Get-DshPath
if ($dshPath) { Add-Result "DeepSeek Harness" "OK" $dshPath } else { Add-Result "DeepSeek Harness" "FAIL" "khong thay" }

$html = Get-ChildItem (Split-Path $dshPath -Parent) -Recurse -Filter "index.html" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match 'dsh-web-frontend' } | Select-Object -First 1
if ($html) {
  $title = ([regex]::Match((Get-Content $html.FullName -Raw), '<title>([^<]*)</title>')).Groups[1].Value
  if ($title -eq "HarnessFlow") { Add-Result "Giao dien" "OK" "<title>HarnessFlow</title> ($($html.FullName))" }
  else { Add-Result "Giao dien" "WARN" "title = '$title' (chua patch?)" }
}
Show-Report

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   XONG" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "  1) Restart DSH:  Ctrl+C cua so ``dsh web`` roi chay lai  dsh web"
Write-Host "  2) Trong trinh duyet:  Ctrl+Shift+R  (hard refresh)"
Write-Host ""
