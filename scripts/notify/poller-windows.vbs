' Chay 1 luot poller VPNFlow trong nen (KHONG hien cua so console).
'
' File nay CHI goi poller-windows.cmd — moi logic nam o .cmd de chi co 1 cho:
'   - giu watcher harness song (keepalive: doc ops\tasks\.watch-win.pid)
'   - chay 1 luot inbox-poller.sh va ghi log vao %USERPROFILE%\.flowvpn-inbox\poller.log
' Truoc day .vbs goi thang bash nen log khong duoc ghi (poller.log dung tu 18/09).
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c """"C:\Users\Minhn\FPTVPN\scripts\notify\poller-windows.cmd""""", 0, False
