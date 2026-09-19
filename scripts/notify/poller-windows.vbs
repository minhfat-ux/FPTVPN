' Chay poller trong nen (KHONG hien cua so console) + giu watcher harness song (keepalive).
'
' Vi sao can keepalive: watcher khoi dong tu mot phien terminal se bi job object cua phien do giet
' khi lenh ket thuc => "luc co luc khong" (da gap that 19/09). Task Scheduler chay trong ngu canh
' cua no nen tien trinh no sinh ra song doc lap. File nay duoc task FPT-Notify-Poller goi dinh ky.
Option Explicit
Dim fso, sh, repo, pidFile, pid, rc, f
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

repo = "C:\Users\Minhn\FlowTech AI\flowgpt"
pidFile = repo & "\ops\tasks\.watch-win.pid"

' --- watcher con song? doc pid trong file roi hoi Windows ---
rc = 1
If fso.FileExists(pidFile) Then
  Set f = fso.OpenTextFile(pidFile, 1)
  pid = Trim(f.ReadAll)
  f.Close
  If Len(pid) > 0 Then
    rc = sh.Run("cmd /c tasklist /FI ""PID eq " & pid & """ /FI ""IMAGENAME eq node.exe"" /NH | findstr /I node.exe > nul", 0, True)
  End If
End If

If rc <> 0 Then
  If fso.FileExists(repo & "\ops\agent-watch.cmd") Then
    sh.Run "cmd /c """ & repo & "\ops\agent-watch.cmd""", 0, False
  End If
End If

' --- 1 luot poller VPNFlow ---
sh.Run """C:\Program Files\Git\bin\bash.exe"" ""C:\Users\Minhn\FPTVPN\scripts\notify\inbox-poller.sh"" --target windows --once", 0, False
