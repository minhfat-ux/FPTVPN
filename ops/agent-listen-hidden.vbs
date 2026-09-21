' Chay bo nghe day trong che do AN: khong hien cua so console nao.
' Task Scheduler goi file nay bang wscript.exe thay vi goi thang cmd/node.
'   wscript.exe ops\agent-listen-hidden.vbs
'
' 0 = cua so an, False = khong cho tien trinh ket thuc.
'
' Sua 21/09/2026 (sau khi may Windows van thay cua so command nhay):
'  - BO lop `cmd /c agent-listen.cmd`: moi lop cmd.exe la mot console co the lo ra thanh cua so
'    command nhay tren man hinh. Chay thang node.exe tu day.
'  - Neu bo nghe DANG SONG thi THOAT NGAY, khong spawn gi ca. Task lap moi 15 phut truoc day van
'    mo mot cmd roi thoat ngay (chot pidfile) => moi 15 phut nhay mot cua so.
Option Explicit
Dim fso, shell, env, opsDir, repo, nodeExe, svc, procs, p, alive
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
opsDir = fso.GetParentFolderName(WScript.ScriptFullName)
repo = fso.GetParentFolderName(opsDir)

alive = False
On Error Resume Next
Set svc = GetObject("winmgmts:\\.\root\cimv2")
Set procs = svc.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name='node.exe'")
For Each p In procs
  If Not IsNull(p.CommandLine) Then
    If InStr(p.CommandLine, "agent-listen.mjs") > 0 Then alive = True
  End If
Next
On Error GoTo 0
If alive Then WScript.Quit 0

nodeExe = "C:\Program Files\nodejs\node.exe"
If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"

Set env = shell.Environment("PROCESS")
env("AGENT_NAME") = "WIN"
env("PATH") = env("PATH") & ";C:\Program Files\nodejs;" & shell.ExpandEnvironmentStrings("%APPDATA") & "\npm"

shell.CurrentDirectory = repo
shell.Run """" & nodeExe & """ """ & opsDir & "\agent-listen.mjs""", 0, False
