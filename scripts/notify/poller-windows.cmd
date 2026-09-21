@echo off
REM FPT-Notify-Poller --- chay 1 luot poller (Task Scheduler goi dinh ky).
REM Khong in ra man hinh; ghi log vao %USERPROFILE%\.flowvpn-inbox\poller.log
REM
REM 21/09/2026 --- BO keepalive watcher cu (agent-watch). Dong cu:
REM     start "agent-watch" /min cmd /c ""%REPO%\ops\agent-watch.cmd""
REM `start ... cmd /c` LUON mo mot cua so console MOI (thu nho nhung van hien ra man hinh /
REM taskbar), va vi pidfile .watch-win.pid tro vao tien trinh da chet nen cu ~5 phut lai bat mot
REM cua so ten "agent-watch" => dung thu lam "cứ bị bật mấy cái cửa sổ command".
REM
REM Nay harness Windows da chuyen sang BO NGHE DAY (SSE) `ops\agent-listen.mjs` (task AgentListen
REM lo vong doi). Keepalive o day chi goi VBS chay AN: VBS tu kiem tra, bo nghe dang song thi
REM thoat ngay (khong spawn gi), chet thi khoi dong lai bang node.exe khong qua cmd.
set LOG=%USERPROFILE%\.flowvpn-inbox\poller.log
if not exist "%USERPROFILE%\.flowvpn-inbox" mkdir "%USERPROFILE%\.flowvpn-inbox"

set REPO=C:\Users\Minhn\FlowTech AI\flowgpt

REM --- keepalive BO NGHE DAY, chay an hoan toan (khong cua so nao) ---
if exist "%REPO%\ops\agent-listen-hidden.vbs" wscript.exe "%REPO%\ops\agent-listen-hidden.vbs"

"C:\Program Files\Git\bin\bash.exe" "C:\Users\Minhn\FPTVPN\scripts\notify\inbox-poller.sh" --target windows --once >> "%LOG%" 2>&1
