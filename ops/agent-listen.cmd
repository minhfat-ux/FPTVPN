@echo off
REM Bo nghe day (SSE) cho Windows - thay cho watcher poll 20 giay.
REM   agent-listen.cmd          -> chay mai (muon AN hoan toan thi dung agent-listen-hidden.vbs)
REM   agent-listen.cmd --once   -> noi thu mot lan roi thoat
REM
REM LUU Y: dat bien theo dung kieu  set "TEN=GIA TRI"  (co ngoac kep). Thieu ngoac kep se them
REM mot DAU CACH o cuoi gia tri - da gay loi that: ten agent thanh "WIN ".
cd /d "%~dp0.."
set "AGENT_NAME=WIN"
set "PATH=%PATH%;%ProgramFiles%\nodejs"
echo [agent-listen] repo=%CD%  agent=%AGENT_NAME%
node ops\agent-listen.mjs %*
