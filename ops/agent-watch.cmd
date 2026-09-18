@echo off
REM Watcher danh thuc cho Windows — chay duoc voi PowerShell 5.1 tro len, KHONG can pwsh 7.
REM   agent-watch.cmd            -> chay lien tuc (de Task Scheduler goi)
REM   agent-watch.cmd --once     -> chay mot vong roi thoat
REM
REM LUU Y: dat bien theo dung kieu  set "TEN=GIA TRI"  (co ngoac kep).
REM Kieu  set TEN=GIA TRI && lenh  se cho gia tri mot DAU CACH o cuoi — da gay loi that:
REM ten agent thanh "WIN " nen ten file su kien thanh "win -woken.json".
cd /d "%~dp0.."
set "AGENT_NAME=WIN"
set "PATH=%PATH%;%ProgramFiles%\nodejs"
echo [agent-watch] repo=%CD%  agent=%AGENT_NAME%
node ops\agent-watch.mjs --auto %*
