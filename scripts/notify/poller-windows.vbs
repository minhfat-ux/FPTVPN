' Chay poller trong nen, KHONG hien cua so console.
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files\Git\bin\bash.exe"" ""C:\Users\Minhn\FPTVPN\scripts\notify\inbox-poller.sh"" --target windows --once", 0, False
