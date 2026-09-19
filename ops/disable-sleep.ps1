# TAT CHE DO SLEEP/HIBERNATE tren may Windows de harness + watcher khong bi tat khi khong dung.
# Chay bang PowerShell (can quyen admin de set lid action):
#   powershell -ExecutionPolicy Bypass -File ops\disable-sleep.ps1
Write-Host "== Tat sleep/hibernate de fBuddy watcher chay 24/7 ==" -ForegroundColor Cyan

# Khong bao gio ngu/hibernate (ca khi cam sac lan dung pin)
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0

# Man hinh tat sau 15 phut (tiet kiem nhung may van CHAY)
powercfg /change monitor-timeout-ac 15
powercfg /change monitor-timeout-dc 5

# Dong nap laptop KHONG ngu (may la laptop thi can)
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT

Write-Host "`n== Kiem tra ==="
Write-Host "Standby (sleep) hien tai:"
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
Write-Host "`nXong. Watcher se khong bi tat vi sleep nua. (Can khoi dong lai watcher neu no dang tat: ops\agent-watch.cmd)"
