# install-gateway-task.ps1 - dang ky lai task "VPNFlow Gateway Watch" voi cau hinh CHIU duoc laptop ngu.
#
# Su co that 24/10/2026: laptop vao Modern Standby 00:20 -> 02:37; task hen 5 phut KHONG chay vi
#   - DisallowStartIfOnBatteries = True  (may dang chay pin 28%)
#   - StopIfGoingOnBatteries   = True
#   - StartWhenAvailable       = False   (nhip bi lo khi ngu KHONG duoc chay bu khi thuc)
# => gateway Windows chet 2,5 gio, TV mat mang, chu du an phai tu mo app.
#
# Script nay chi sua THUOC TINH task (khong dung quyen admin). Chay lai luc nao cung duoc (idempotent):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\lan-proxy\install-gateway-task.ps1
param(
    [string]$TaskName = "VPNFlow Gateway Watch",
    [string]$Root = ""
)

$ErrorActionPreference = "Stop"
if (-not $Root) {
    $Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)          # <repo>
    if (-not (Test-Path (Join-Path $Root "tools\lan-proxy\gateway-autostart.ps1"))) {
        $Root = Split-Path -Parent $PSScriptRoot                            # dang o trong tools\
    }
}
$script = Join-Path $Root "tools\lan-proxy\gateway-autostart.ps1"
if (-not (Test-Path $script)) { throw "khong thay $script" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script) `
    -WorkingDirectory $Root

# 1) trigger luc dang nhap (mo may xong la co gateway, khong doi hen 5 phut)
$tLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# 2) trigger hen 5 phut (watchdog: instance chinh chet thi bat lai)
$tDaily = New-ScheduledTaskTrigger -Daily -At "00:00"
$rep = (New-ScheduledTaskTrigger -Once -At "00:00" `
        -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -RepetitionDuration (New-TimeSpan -Days 1)).Repetition
$tDaily.Repetition = $rep

$triggers = @($tLogon, $tDaily)

# 3) trigger khi may THUC DAY (Kernel-Power 507 = thoat Modern Standby / 1 = thuc sau ngu).
#    Co the bi tu choi voi task nguoi dung thuong => khong nem loi, chi bao.
try {
    $cls = Get-CimClass -ClassName MSFT_TaskEventTrigger -Namespace Root/Microsoft/Windows/TaskScheduler
    $tEvent = New-CimInstance -CimClass $cls -ClientOnly
    $tEvent.Enabled = $true
    $tEvent.Subscription = '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name=''Microsoft-Windows-Kernel-Power''] and (EventID=507 or EventID=1)]]</Select></Query></QueryList>'
    $triggers += $tEvent
} catch {
    Write-Host "  (bo qua trigger 'thuc day': $($_.Exception.Message))"
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -DontStopOnIdleEnd

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal -Force | Out-Null

$t = Get-ScheduledTask -TaskName $TaskName
Write-Host "Da dang ky lai task '$TaskName':"
Write-Host ("  AllowStartIfOnBatteries : {0}" -f (-not $t.Settings.DisallowStartIfOnBatteries))
Write-Host ("  StopIfGoingOnBatteries  : {0}" -f (-not $t.Settings.StopIfGoingOnBatteries))
Write-Host ("  StartWhenAvailable      : {0}" -f $t.Settings.StartWhenAvailable)
Write-Host ("  MultipleInstances       : {0}" -f $t.Settings.MultipleInstances)
Write-Host ("  ExecutionTimeLimit      : {0}" -f $t.Settings.ExecutionTimeLimit)
Write-Host ("  So trigger              : {0}" -f @($t.Triggers).Count)
foreach ($tr in @($t.Triggers)) { Write-Host ("    - {0}" -f $tr.CimClass.CimClassName) }
