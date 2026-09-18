@echo off
REM FPT-Notify-Poller — chay 1 luot poller (Task Scheduler goi moi 1 phut).
REM Khong in ra man hinh; ghi log vao %USERPROFILE%\.flowvpn-inbox\poller.log
set LOG=%USERPROFILE%\.flowvpn-inbox\poller.log
if not exist "%USERPROFILE%\.flowvpn-inbox" mkdir "%USERPROFILE%\.flowvpn-inbox"
"C:\Program Files\Git\bin\bash.exe" "C:\Users\Minhn\FPTVPN\scripts\notify\inbox-poller.sh" --target windows --once >> "%LOG%" 2>&1
