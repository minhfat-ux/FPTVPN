<#
  Cài BỘ NGHE ĐẨY (SSE) cho harness trên máy WINDOWS — thay cho watcher poll 20 giây.

  Vì sao đổi: watcher poll `origin/flowgpt` mỗi 20 giây, mỗi vòng gọi git hàng chục lần. Trên
  Windows MỖI tiến trình con là MỘT cửa sổ console nháy lên rồi tắt ⇒ màn hình nháy không ngớt
  ("cả đống windows command chạy rồi tắt loạn cả mắt"). Bộ nghe giữ MỘT kết nối mở sẵn; lúc rảnh
  không chạy gì cả; có tin thì connector đẩy xuống ngay và nó chạy đúng một vòng đồng bộ (ẩn).

  Cách dùng (PowerShell, trong thư mục repo):
      pwsh -File ops\agent-listen-install.ps1
      pwsh -File ops\agent-listen-install.ps1 -NoAutostart     # chỉ kiểm tra, không tạo task

  Script làm 6 việc:
    1. kiểm tra node + .env.bus
    2. dọn watcher cũ: xoá task "AgentWatch" và tắt tiến trình node agent-watch.mjs
    3. thử nối kênh đẩy một lần (--once --dry-run) để biết kết nối thông
    4. tạo Scheduled Task "AgentListen" chạy ẨN (wscript + VBS), tự chạy lại mỗi 15 phút nếu chết
    5. chạy ngay và kiểm tra đúng MỘT tiến trình
    6. in trạng thái connector (/health: đang có mấy kết nối đẩy)
#>
param(
  [string]$Repo = (Get-Location).Path,
  [string]$TaskName = "AgentListen",
  [int]$Safety = 600,
  [switch]$NoAutostart
)

$ErrorActionPreference = "Stop"
$env:AGENT_NAME = "WIN"

# schtasks in ra stderr khi task KHONG ton tai; PowerShell 5.1 voi ErrorActionPreference=Stop bien
# stderr cua lenh native thanh loi CHET ⇒ script dung ngay buoc "don watcher cu" (da gap that
# 19/09/2026 tren may Windows: chua co task nao nen /Query luon bao loi). Boc qua ham nay de stderr
# khong lam chet script ma van lay duoc ma thoat.
function Invoke-Schtasks {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $ErrorActionPreference = "Continue"
  $null = & schtasks.exe @Arguments 2>$null
  return $LASTEXITCODE
}

Write-Host "== Cài BỘ NGHE ĐẨY cho harness WINDOWS ==" -ForegroundColor Cyan
Write-Host "Repo: $Repo"

# 1. node + file cần thiết
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Host "! Không thấy 'node' trong PATH. Cài Node rồi chạy lại." -ForegroundColor Red; exit 1 }
Write-Host ("node : " + $node.Source)

$listen = Join-Path $Repo "ops\agent-listen.mjs"
if (-not (Test-Path $listen)) {
  Write-Host "! Không thấy $listen — hãy chạy script này trong thư mục repo và đã `git pull`." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $Repo ".env.bus"))) {
  Write-Host "! Không thấy .env.bus trong repo — thiếu token thì bộ nghe không nối được connector." -ForegroundColor Yellow
}

# 2. dọn watcher cũ (chính nó gây bão cửa sổ console)
Write-Host "`n-- Dọn watcher cũ --" -ForegroundColor Cyan
foreach ($name in @("AgentWatch", "AgentListen")) {
  if ((Invoke-Schtasks /Query /TN $name) -eq 0) {
    $null = Invoke-Schtasks /Delete /TN $name /F
    Write-Host "  đã xoá Scheduled Task '$name'"
  }
}
$old = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*agent-watch.mjs*" }
foreach ($p in $old) {
  Write-Host "  tắt watcher cũ pid $($p.ProcessId)"
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

# 3. thử nối kênh đẩy (không chạy gì)
Write-Host "`n-- Thử nối kênh đẩy (không làm gì) --" -ForegroundColor Cyan
Push-Location $Repo
$eap = $ErrorActionPreference; $ErrorActionPreference = "Continue"
node ops\agent-listen.mjs --once --dry-run
$probe = $LASTEXITCODE
$ErrorActionPreference = $eap
Pop-Location
if ($probe -ne 0) {
  Write-Host "! Chưa nối được connector (mã $probe). Xem lại .env.bus / mạng, rồi chạy lại." -ForegroundColor Yellow
}

if ($NoAutostart) { Write-Host "`n(-NoAutostart) bỏ qua tạo Scheduled Task." -ForegroundColor Yellow; exit 0 }

# 4. Scheduled Task chạy ẨN, tự chạy lại mỗi 15 phút (bộ nghe có chốt pidfile nên chạy chồng vô hại)
Write-Host "`n-- Tạo Scheduled Task '$TaskName' (chạy ẨN) --" -ForegroundColor Cyan
$vbs = Join-Path $Repo "ops\agent-listen-hidden.vbs"
if (-not (Test-Path $vbs)) { Write-Host "! Không thấy $vbs — thiếu file chạy ẩn." -ForegroundColor Red; exit 1 }

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`""
$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
# -RunLevel Highest doi quyen admin ⇒ Register-ScheduledTask bao "Access is denied" tren tai khoan
# nguoi dung thuong (da gap that 19/09/2026) ⇒ khong tao duoc task, bo nghe khong duoc cai. Bo nghe
# chi can quyen nguoi dung (wscript + node trong profile), nen de Limited.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
# Trigger AtLogOn la duong gon nhat, nhung co may/token tu choi "Access is denied" (da gap that
# 19/09/2026). Khi do van tao task voi trigger lap 15 phut (tu chay lai neu chet) va bu phan
# tu-khoi-dong-khi-dang-nhap bang mot muc trong thu muc Startup.
try { $atLogon = New-ScheduledTaskTrigger -AtLogOn } catch { $atLogon = $null }

$registered = $false
foreach ($triggers in @(@($atLogon, $repeatTrigger), @($repeatTrigger))) {
  if (-not $triggers[0]) { continue }
  try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
      -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
    if ($atLogon) { Write-Host "  đã tạo task (Register-ScheduledTask)" }
    else { Write-Host "  đã tạo task (Register-ScheduledTask, KHÔNG có trigger đăng nhập — bù bằng Startup)" -ForegroundColor Yellow }
    $registered = $true
    break
  } catch {
    Write-Host "  Register-ScheduledTask lỗi ($($_.Exception.Message.Trim())) — thử cách khác" -ForegroundColor Yellow
  }
}
if (-not $registered) {
  $null = Invoke-Schtasks /Create /TN $TaskName /SC ONLOGON /TR "wscript.exe `"$vbs`"" /F
}

# Bu tu-khoi-dong khi dang nhap — du dung ke ca khi khong dat duoc trigger AtLogOn.
$startupVbs = Join-Path ([Environment]::GetFolderPath('Startup')) "AgentListen.vbs"
if (-not (Test-Path $startupVbs)) {
  Set-Content -Path $startupVbs -Encoding ASCII -Value @(
    "' Khoi dong BO NGHE DAY (SSE) khi dang nhap - chay an, khong cua so.",
    'Set sh = CreateObject("WScript.Shell")',
    ('sh.Run """wscript.exe"" ""' + $vbs + '""", 0, False')
  )
  Write-Host "  đã thêm Startup: $startupVbs"
}

$null = Invoke-Schtasks /Run /TN $TaskName
Start-Sleep -Seconds 5

# 5. kiểm tra: đúng MỘT tiến trình, và không còn watcher nào
$listeners = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*agent-listen.mjs*" }
$watchers = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*agent-watch.mjs*" }
Write-Host "`n-- Kiểm tra --" -ForegroundColor Cyan
Write-Host ("  tiến trình bộ nghe: " + $(if ($listeners) { ($listeners.ProcessId -join ", ") } else { "KHÔNG CÓ" })) `
  -ForegroundColor $(if ($listeners) { "Green" } else { "Red" })
Write-Host ("  tiến trình watcher cũ: " + $(if ($watchers) { ($watchers.ProcessId -join ", ") + " (nên tắt hết)" } else { "không còn" })) `
  -ForegroundColor $(if ($watchers) { "Yellow" } else { "Green" })

# 6. trạng thái connector
try {
  $health = Invoke-RestMethod -Uri "https://fbuddy.meetflowai.site/agent-bus/health" -TimeoutSec 10
  $subs = @()
  foreach ($prop in $health.subscribers.PSObject.Properties) { $subs += "$($prop.Name)=$($prop.Value)" }
  Write-Host ("  connector: " + $(if ($subs.Count) { $subs -join ", " } else { "chưa có kết nối đẩy nào" }))
} catch {
  Write-Host "  connector: không gọi được /health (mạng?)" -ForegroundColor Yellow
}

Write-Host "`nTừ giờ máy này KHÔNG poll nữa: nằm im một kết nối, có tin là connector đẩy xuống." -ForegroundColor Green
Write-Host "Nhận việc bằng tay:  AGENT_NAME=WIN node ops/task.mjs ack <id> --push"
Write-Host "Xem bộ nghe còn sống: node ops/agent-listen.mjs --once --dry-run"
