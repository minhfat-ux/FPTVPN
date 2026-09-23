import zipfile, plistlib, os, glob
p = "/root/flowvpn-ipa/VPNFlow-latest.ipa"
z = zipfile.ZipFile(p)
n = [x for x in z.namelist() if x.endswith(".app/Info.plist")][0]
d = plistlib.loads(z.read(n))
print("IPA dang phat:", d.get("CFBundleShortVersionString"), d.get("CFBundleVersion"), "| size", os.path.getsize(p))
print("incoming:", glob.glob("/root/flowvpn-ipa/incoming/*"))
