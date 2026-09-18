<#
  Cài watcher đánh thức trên máy WINDOWS (chạy 1 lần, sau đó không cần đụng tay nữa).

  Cách dùng (PowerShell, trong thư mục repo):
      pwsh -File ops\agent-watch-install.ps1
      pwsh -File ops\agent-watch-install.ps1 -Interval 20 -NoAutostart   # chỉ chạy thử

  Script làm 4 việc:
    1. kiểm tra node + dsh có trong PATH (thiếu dsh thì chỉ báo, không tự đánh thức được)
    2. tự kiểm tra: thấy việc mới trong sổ thì in ra dòng "ĐÁNH THỨC …"
    3. tạo Scheduled Task chạy khi đăng nhập (ONLOGON) và chạy ngay
    4. nếu watcher đã chạy thì không tạo trùng
#>
param(
  [string]$Repo = (Get-Location).Path,
  [int]$Interval = 20,
  [switch]$NoAutostart,
  [string]$TaskName = "AgentWatch"
)

$ErrorActionPreference = "Stop"
$env:AGENT_NAME = "WIN"
Write-Host "== Cài watcher đánh thức cho harness WINDOWS ==" -ForegroundColor Cyan
Write-Host "Repo: $Repo"

# 1. node + dsh
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Host "! Không thấy 'node' trong PATH. Cài Node rồi chạy lại." -ForegroundColor Red; exit 1 }
Write-Host ("node : " + $node.Source)
$dsh = (Get-Command dsh -ErrorAction SilentlyContinue)
if ($dsh) { Write-Host ("dsh  : " + $dsh.Source) }
else { Write-Host "! Không thấy 'dsh' trong PATH — watcher vẫn ghi nhận việc nhưng KHÔNG boot được harness." -ForegroundColor Yellow
       Write-Host "  Khắc phục: thêm thư mục chứa dsh vào PATH, hoặc đặt DSH_WAKE_CMD trỏ tới lệnh boot của bạn." }

$script = Join-Path $Repo "ops\agent-watch.mjs"
if (-not (Test-Path $script)) { Write-Host "! Không thấy $script — chạy script này trong thư mục repo." -ForegroundColor Red; exit 1 }

# 2. tự kiểm tra: có thấy việc mới không
Write-Host "`n-- Tự kiểm tra (không làm gì) --" -ForegroundColor Cyan
Push-Location $Repo
node ops\agent-watch.mjs --once --dry-run
Pop-Location

if ($NoAutostart) { Write-Host "`n(-NoAutostart) bỏ qua tạo Scheduled Task." -ForegroundColor Yellow; exit 0 }

# 3. Scheduled Task: chạy khi đăng nhập, tự chạy lại nếu thoát.
#    Vì sao KHÔNG dùng `schtasks /Create /TR $action`: schtasks cắt tham số /TR tại dấu cách
#    đầu tiên, nên repo nằm trong thư mục có dấu cách ("...\FlowTech AI\flowgpt") sẽ báo
#    "ERROR: Invalid argument/option". Register-ScheduledTask nhận đối số dạng mảng nên an toàn.
$action = "cmd /c cd /d `"$Repo`" && set `"AGENT_NAME=WIN`" && node ops\agent-watch.mjs --auto --interval $Interval"
Write-Host "`n-- Tạo Scheduled Task '$TaskName' --" -ForegroundColor Cyan
try {
  $taskAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $action"
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn
  $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger `
    -Settings $taskSettings -Force -ErrorAction Stop | Out-Null
  Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Write-Host "  ✓ đã đăng ký + chạy task '$TaskName' (ONLOGON)." -ForegroundColor Green
} catch {
  # Không có quyền admin thì Register-ScheduledTask trả "Access is denied". Đường lui KHÔNG cần
  # admin: một launcher .vbs trong thư mục Startup của user — chạy khi đăng nhập và chạy ẩn
  # (không nháy cửa sổ console), đúng cách repo đã dùng cho poller-windows.vbs.
  Write-Host "  ! Register-ScheduledTask không được: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "    -> dung launcher trong thu muc Startup (khong can admin)." -ForegroundColor Yellow
  $startup = [Environment]::GetFolderPath("Startup")
  $vbs = Join-Path $startup "AgentWatch.vbs"
  $lines = @(
    "' Watcher danh thuc harness (do ops/agent-watch-install.ps1 sinh ra). Chay an khi dang nhap.",
    'Set sh = CreateObject("WScript.Shell")',
    ('sh.CurrentDirectory = "' + $Repo + '"'),
    ('sh.Run "cmd /c set ""AGENT_NAME=WIN"" && node ops\agent-watch.mjs --auto --interval ' + $Interval + '", 0, False')
  )
  Set-Content -Path $vbs -Value $lines -Encoding ASCII
  Write-Host "  da tao: $vbs" -ForegroundColor Green
  Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbs`"" -WindowStyle Hidden
  Write-Host "  da chay watcher an ngay bay gio." -ForegroundColor Green
}

# 4. kiểm tra lại
Start-Sleep -Seconds 3
$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*agent-watch.mjs*" }
if ($running) {
  Write-Host "`n✓ Watcher đang chạy (PID $($running.ProcessId -join ', '))." -ForegroundColor Green
  Write-Host "  Từ giờ: mỗi khi Mac giao việc, máy này tự được đánh thức trong ~$Interval giây." -ForegroundColor Green
  Write-Host "  Bằng chứng: sự kiện 'woken' xuất hiện trong ops/tasks/ và được push lên git."
} else {
  Write-Host "`n! Chưa thấy tiến trình watcher. Mở terminal chạy tay để xem lỗi:" -ForegroundColor Yellow
  Write-Host "  cd `"$Repo`" ; `$env:AGENT_NAME='WIN' ; node ops\agent-watch.mjs --auto"
}
Write-Host "`nNhận việc đang chờ:  AGENT_NAME=WIN node ops/task.mjs ack T-20260918-01 --push"
