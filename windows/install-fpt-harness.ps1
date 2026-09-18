# =======================================================================
#  FPT HARNESS - 1-CLICK INSTALLER (WINDOWS)
#
#  Cai TOAN BO FPT Harness tren Windows chi voi MOT lenh:
#    branding + theme FlowVPN + logo FPT/Culi, browse-picker tu xa,
#    auto-start DSH khi login, reverse tunnel (Task Scheduler, chong trung),
#    va phan VPS backend (Caddy HTTPS + nginx auth gate + login form).
#
#  Cach dung (chay trong PowerShell voi quyen user binh thuong):
#    powershell -ExecutionPolicy Bypass -File install-fpt-harness.ps1
#    powershell -ExecutionPolicy Bypass -File install-fpt-harness.ps1 -VpsIP 103.173.155.50 -Domain dhs-win.meetflowai.site
#
#  Tham so:
#    -VpsIP      IP VPS backend (de trong = bo qua phan tunnel/VPS)
#    -Domain     Domain DSH (mac dinh dhs-win.meetflowai.site - can DNS A record toi VPS)
#    -SshUser    User SSH tren VPS (mac dinh root)
#    -TunnelPort Port tunnel tren VPS (mac dinh 13081 - KHONG dung 13080 cua Mac)
#    -AuthUser/-AuthPass  user/pass dang nhap GUI harness (BAT BUOC truyen -AuthPass khi
#                         dung site cong khai; khong co mat khau mac dinh trong ma nguon)
#    -SkipPatch  bo qua patch branding (neu chi muon tunnel)
#    -Yes        khong hoi, dung mac dinh
#
#  An toan khi chay lai: moi buoc idempotent (patch .py co backup .fpt.bak).
# =======================================================================
param(
    [string]$VpsIP = "",
    [string]$Domain = "dhs-win.meetflowai.site",
    [string]$SshUser = "root",
    [int]$TunnelPort = 13081,
    [string]$AuthUser = "dhs",
    [string]$AuthPass = "",
    [switch]$SkipPatch,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
$SRC = Split-Path -Parent $MyInvocation.MyCommand.Path   # thu muc windows/ cua package
# patches/profile co the nam canh windows/ (cau truc package day du) HOAC ben trong windows/
# (bundle tu chua). Tim ca 2, uu tien cau truc day du.
$PKG = Split-Path $SRC -Parent
$patchDir = @((Join-Path $PKG "patches"), (Join-Path $SRC "patches")) | Where-Object { Test-Path $_ } | Select-Object -First 1
$profSrc = @((Join-Path $PKG "profile\cordis.patch.yml"), (Join-Path $SRC "profile\cordis.patch.yml")) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $patchDir) { throw "THIEU folder patches/ - copy ca package (xem README-WINDOWS.md) hoac dat apply-fpt-patches.py + favicon.png canh install-fpt-harness.ps1" }
if (-not $profSrc) { throw "THIEU profile/cordis.patch.yml - copy ca package (xem README-WINDOWS.md)" }

function Log  { Write-Host "==> $args" -ForegroundColor Green }
function Info { Write-Host "--> $args" -ForegroundColor Cyan }
function Ok   { Write-Host "   OK  $args" -ForegroundColor Green }
function Warn { Write-Host "   !!  $args" -ForegroundColor Yellow }

# ---------- [0] banner ----------
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   FPT HARNESS - CAI DAT 1-CLICK (WINDOWS)" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# ---------- [1] kiem tra tien quyet ----------
Log "Kiem tra tien quyet"

# Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Warn "Chua thay Node.js. Dang cai Node.js LTS qua winget..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    # refresh PATH trong session nay
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw "Cai Node.js that bai. Tai tu https://nodejs.org roi chay lai." }
}
Ok "Node.js: $(node --version)"

# npm global root -> DSH install
$npmRoot = npm root -g 2>$null
$dshRoot = Join-Path $npmRoot "@deepseek-ai\dsh"
if (-not (Test-Path $dshRoot)) {
    Log "Chua thay DSH. Dang cai @deepseek-ai/dsh toan cau..."
    npm install -g @deepseek-ai/dsh
    $npmRoot = npm root -g 2>$null
    $dshRoot = Join-Path $npmRoot "@deepseek-ai\dsh"
    if (-not (Test-Path $dshRoot)) { throw "Cai DSH that bai. Chay lai: npm install -g @deepseek-ai/dsh" }
}
Ok "DSH: $dshRoot"

# Python (cho script patch .py - dung chung voi ban Mac)
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    Warn "Chua thay Python. Dang cai Python qua winget..."
    winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $py = Get-Command python -ErrorAction SilentlyContinue
    if (-not $py) { throw "Cai Python that bai. Tai tu https://python.org roi chay lai." }
}
Ok "Python: $(python --version 2>&1)"

# ---------- [2] patch branding/theme ----------
if (-not $SkipPatch) {
    $patchPy = Join-Path $patchDir "apply-fpt-patches.py"
    if (Test-Path $patchPy) {
        Log "Ap ban va FPT (theme, logo, favicon, browse-picker) - co backup .fpt.bak"
        python $patchPy
        Ok "Patch xong (log phia tren)"
    } else {
        Warn "Khong thay $patchPy - bo qua patch"
    }

    # Branding FlowTech (mark / ten / title / favicon) - chay SAU ban FPT vi ban do
    # giu lai phan theme + browse-picker. Script idempotent, nhan ca 3 trang thai dau vao
    # (DSH goc / da patch FPT / da la FlowTech).
    $brandPy = Join-Path $patchDir "apply-flowtech-brand.py"
    if (Test-Path $brandPy) {
        Log "Ap branding FlowTech (mark, ten, title, favicon)"
        python $brandPy
        Ok "Branding FlowTech xong"
    } else {
        Warn "Khong thay $brandPy - bo qua branding FlowTech"
    }

    # profile pin browse picker
    Log "Cai profile (pin browse directory picker cho truy cap tu xa)"
    $profDir = Join-Path $env:USERPROFILE ".dsh\profiles\web"
    New-Item -ItemType Directory -Force -Path $profDir | Out-Null
    if ($profSrc) {
        $profDst = Join-Path $profDir "cordis.patch.yml"
        if ((Test-Path $profDst) -and -not (Test-Path "$profDst.bak")) {
            Copy-Item $profDst "$profDst.bak"
        }
        Copy-Item $profSrc $profDst -Force
        Ok "profile: $profDst"
    }
} else {
    Info "Bo qua patch (--SkipPatch)"
}

# ---------- [3] SSH key tunnel ----------
$keyPath = Join-Path $env:USERPROFILE ".ssh\dsh_tunnel"
$keyPub  = "$keyPath.pub"
if (-not (Test-Path $keyPath)) {
    Log "Tao SSH key rieng cho tunnel: $keyPath"
    New-Item -ItemType Directory -Force -Path (Split-Path $keyPath) | Out-Null
    ssh-keygen -t ed25519 -f $keyPath -N '""' -C "dsh-tunnel-windows" | Out-Null
    Ok "Key tao xong: $keyPub"
} else {
    Ok "Key da co: $keyPath"
}

# ---------- [4] tunnel wrapper + Task Scheduler ----------
$wrapper = Join-Path $env:USERPROFILE "dsh-tunnel.cmd"
Log "Tao tunnel wrapper: $wrapper"
@"
@echo off
rem FPT Harness tunnel (Windows) - self-healing, single-instance, port $TunnelPort
set VPS=$VpsIP
set KEY=%USERPROFILE%\.ssh\dsh_tunnel
set LOCK=%TEMP%\dsh-tunnel.lock

rem single-instance guard
mkdir "%LOCK%" 2>nul
if errorlevel 1 (
  echo %date% %time% another tunnel wrapper running, exiting >> %TEMP%\dsh-tunnel.out.log
  exit /b 0
)

rem connect with retry (up to 8 times). Moi lan retry deu don port cu tren VPS
rem (sshd vua chet giu port -> "remote port forwarding failed").
for /L %%i in (1,1,8) do (
  ssh -i "%KEY%" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 $SshUser@$VpsIP "fuser -k $TunnelPort/tcp 2>/dev/null; sleep 1; true" 2>nul
  ssh -i "%KEY%" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o ConnectTimeout=8 -C -N -R 127.0.0.1:$TunnelPort:127.0.0.1:3080 $SshUser@$VpsIP
  if errorlevel 1 timeout /t 2 /nobreak >nul
)

rmdir "%LOCK%" 2>nul
exit /b 1
"@ | Set-Content -Path $wrapper -Encoding ASCII
Ok $wrapper

# Task Scheduler: DSH server (auto-start khi login)
Log "Cai Task Scheduler: DSH server + tunnel (tu dong chay khi login)"
$dshCmd = Join-Path $env:USERPROFILE "dsh-server.cmd"
@"
@echo off
rem DSH auto-start wrapper - skip if already running
netstat -ano | findstr "LISTENING" | findstr ":3080 " >nul 2>&1
if not errorlevel 1 exit /b 0
cd %USERPROFILE%
start "" /b cmd /c "dsh web --no-open"
"@ | Set-Content -Path $dshCmd -Encoding ASCII

schtasks /create /f /tn "FPT-DSH-Server" /tr "cmd /c `"$dshCmd`"" /sc onlogon /rl limited | Out-Null
Ok "Task FPT-DSH-Server (chay DSH khi login)"

if ($VpsIP) {
    schtasks /create /f /tn "FPT-DSH-Tunnel" /tr "cmd /c `"$wrapper`"" /sc onlogon /rl limited | Out-Null
    Ok "Task FPT-DSH-Tunnel (reverse tunnel -> ${VpsIP}:$TunnelPort)"
} else {
    Warn "Khong co -VpsIP - bo qua task tunnel (chay lai voi -VpsIP khi co)"
}

# ---------- [5] cai pubkey len VPS ----------
if ($VpsIP) {
    Log "Cai pubkey len VPS $SshUser@$VpsIP (se hoi password SSH)"
    $pub = Get-Content $keyPub
    ssh -p 22 "$SshUser@$VpsIP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && grep -qF '$pub' ~/.ssh/authorized_keys 2>/dev/null || echo '$pub' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
    if ($LASTEXITCODE -eq 0) { Ok "Pubkey da cai len VPS" } else { Warn "Cai pubkey that bai - chay lai lenh ssh o tren tay" }
}

# ---------- [6] huong dan VPS site ----------
Write-Host ""
Write-Host "  ------------------------------------------------" -ForegroundColor Cyan
Write-Host "   XONG! Buoc cuoi (tren VPS):" -ForegroundColor Cyan
Write-Host "  ------------------------------------------------" -ForegroundColor Cyan
if ($VpsIP) {
    Write-Host "  1) Chay script them site Windows tren VPS:" -ForegroundColor White
    Write-Host "     bash /tmp/fpt-harness-vps/add-windows-site.sh $Domain $TunnelPort" -ForegroundColor Green
    Write-Host "  2) Tro DNS: $Domain -> IP VPS" -ForegroundColor White
    Write-Host "  3) Dung tu moi thiet bi:  https://$Domain" -ForegroundColor Green
    Write-Host "     Login: user $AuthUser / pass (dat qua -AuthPass khi cai)" -ForegroundColor White
    Write-Host ""
    Write-Host "  (VPS side: nginx gate moi 127.0.0.1:3082 -> tunnel port $TunnelPort + Caddy site $Domain)" -ForegroundColor DarkGray
} else {
    Write-Host "  Chay lai voi -VpsIP <IP> de cai tunnel + huong dan VPS." -ForegroundColor White
}
Write-Host "  ------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Info "Khoi dong lai (hoac dang xuat/dang nhap) de Task Scheduler chay DSH + tunnel."
Info "Log: %TEMP%\dsh-tunnel.out.log"
