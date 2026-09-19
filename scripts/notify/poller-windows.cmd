@echo off
REM FPT-Notify-Poller --- chay 1 luot poller (Task Scheduler goi dinh ky).
REM Khong in ra man hinh; ghi log vao %USERPROFILE%\.flowvpn-inbox\poller.log
REM
REM File nay con giu WATCHER harness song (keepalive). Vi sao can: watcher khoi dong tu mot phien
REM terminal se bi job object cua phien do giet khi lenh ket thuc (da gap that: watcher "luc co luc
REM khong"). Task Scheduler chay trong ngu canh cua no nen tien trinh no sinh ra song doc lap.
set LOG=%USERPROFILE%\.flowvpn-inbox\poller.log
if not exist "%USERPROFILE%\.flowvpn-inbox" mkdir "%USERPROFILE%\.flowvpn-inbox"

set REPO=C:\Users\Minhn\FlowTech AI\flowgpt
set WPIDFILE=%REPO%\ops\tasks\.watch-win.pid

REM --- keepalive watcher: doc pid trong file, khong con song thi khoi dong lai ---
set WPID=
if exist "%WPIDFILE%" set /p WPID=<"%WPIDFILE%"
if "%WPID%"=="" goto startwatch
tasklist /FI "PID eq %WPID%" 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 goto startwatch
goto afterwatch

:startwatch
if exist "%REPO%\ops\agent-watch.cmd" (
  echo [%DATE% %TIME%] watcher khong chay - khoi dong lai>> "%LOG%"
  start "agent-watch" /min cmd /c ""%REPO%\ops\agent-watch.cmd""
)

:afterwatch
"C:\Program Files\Git\bin\bash.exe" "C:\Users\Minhn\FPTVPN\scripts\notify\inbox-poller.sh" --target windows --once >> "%LOG%" 2>&1
