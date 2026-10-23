#!/usr/bin/env python3
"""Vá tên app + bảng màu MeetFlow + nền FPT + version cho thư mục apktool đã decode.

Dùng: python3 patch_app.py <thư-mục-decode> [versionCode] [versionName]
"""
import re
import sys

# Bảng màu lấy từ meetflowai.site
COLORS = {
    "semi_red": "#33c773",                        # brand accent (đỏ -> xanh MeetFlow)
    "red": "#33c773",                             # tiến trình/điểm nhấn
    "light_red": "#7fe6c0",
    "scheme_grey_background_dark": "#0d1b30",     # nền
    "scheme_grey_card_background_dark": "#071628",
    "scheme_grey_shelf_background_dark": "#0a1f3b",
    "scheme_red_shelf_background_dark": "#071628",
    "grey": "#0d1b30",
}

BG_COLOR_ITEMS = (
    "@color/scheme_grey_shelf_background_dark",
    "@color/scheme_red_shelf_background_dark",
    "@color/shelf_background_dark",
)


def patch_colors(root):
    p = root + "/res/values/colors.xml"
    s = open(p, encoding="utf-8").read()
    for name, val in COLORS.items():
        s = re.sub(r'<color name="%s">#[0-9a-fA-F]{6,8}</color>' % name,
                   '<color name="%s">%s</color>' % (name, val), s)
    open(p, "w", encoding="utf-8").write(s)


def patch_styles(root):
    """Cửa sổ dùng ảnh nền bg_fpt (Leanback vẫn vẽ màu shelf đè lên ở màn lưới — xem README)."""
    p = root + "/res/values/styles.xml"
    s = open(p, encoding="utf-8").read()
    for c in BG_COLOR_ITEMS:
        s = s.replace('<item name="android:windowBackground">%s</item>' % c,
                      '<item name="android:windowBackground">@drawable/bg_fpt</item>')
    open(p, "w", encoding="utf-8").write(s)


def patch_strings(root):
    p = root + "/res/values/strings.xml"
    s = open(p, encoding="utf-8").read()
    s = re.sub(r'<string name="app_name">[^<]*</string>',
               '<string name="app_name">FPT Tubeflow</string>', s)
    open(p, "w", encoding="utf-8").write(s)


def patch_version(root, code, name):
    p = root + "/apktool.yml"
    s = open(p, encoding="utf-8").read()
    s = re.sub(r"versionCode: \d+", "versionCode: %s" % code, s)
    s = re.sub(r"versionName: .*", "versionName: %s" % name, s)
    open(p, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    root = sys.argv[1]
    code = sys.argv[2] if len(sys.argv) > 2 else "9013"
    name = sys.argv[3] if len(sys.argv) > 3 else "2.2-fpt-tubeflow"
    patch_colors(root)
    patch_styles(root)
    patch_strings(root)
    patch_version(root, code, name)
    print("patch: app_name=FPT Tubeflow, version=%s/%s" % (code, name))
