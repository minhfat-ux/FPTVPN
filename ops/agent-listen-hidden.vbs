' Chay bo nghe day trong che do AN: khong hien cua so console nao.
' Task Scheduler goi file nay bang wscript.exe thay vi goi thang cmd/node.
'   wscript.exe ops\agent-listen-hidden.vbs
'
' 0 = cua so an, False = khong cho tien trinh ket thuc.
Option Explicit
Dim fso, shell, opsDir, repo, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
opsDir = fso.GetParentFolderName(WScript.ScriptFullName)
repo = fso.GetParentFolderName(opsDir)
shell.CurrentDirectory = repo
cmd = "cmd /c """ & opsDir & "\agent-listen.cmd"""
shell.Run cmd, 0, False
