import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
root = [i.filename for i in z.infolist() if "\\" not in i.filename and not i.filename.endswith("/")]
print("ROOT ENTRIES (%d):" % len(root))
for f in root[:40]:
    print(" ", f)
exe = [i.filename for i in z.infolist() if i.filename.lower().endswith(".exe")]
print("EXE:", exe[:10])
