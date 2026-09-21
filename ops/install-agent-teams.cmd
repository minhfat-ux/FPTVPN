@echo off
rem ============================================================================
rem  Cai plugin AgentTeams vao profile DSH — chay NGOAI harness (terminal thuong).
rem  Xem docs/TASK-dsh-agent-teams-upgrade.md.
rem
rem    ops\install-agent-teams.cmd
rem    ops\install-agent-teams.cmd --profile headless
rem
rem  Vi sao phai chay ngoai harness: session harness bi file-sandbox
rem  `workspace-write` chan ghi ra ~/.dsh nen `dsh plugin add` chet voi
rem  [EPERM] ...\.dsh\profiles\<p>\_tmp_... (da gap that tren WIN 21/09/2026).
rem ============================================================================
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay node trong PATH. Cai Node.js truoc.
  exit /b 1
)

node "%~dp0install-agent-teams.mjs" %*
set "RC=%ERRORLEVEL%"
exit /b %RC%
