#!/usr/bin/env python3
"""
FlowTech Harness - switch a DSH install's branding (mark / name / title / icon) to FlowTech.

Chay SAU `apply-fpt-patches.py` (script do van giu phan theme + browse picker).
Nhan ca 3 trang thai dau vao: ban goc DeepSeek, ban da patch FPT, hoac ban da la FlowTech
(chay lai khong thay doi gi). Ban goc duoc luu thanh <file>.fpt.bak neu chua co.

Usage:
  python3 apply-flowtech-brand.py [--dsh-root /path/to/@deepseek-ai/dsh] [--dsh-home /path/to/.dsh]
"""
import argparse
import base64
import glob
import os
import re
import shutil
import subprocess
import sys

BRAND_NAME = "HarnessFlow"
BRAND_SHORT = "HarnessFlow"

# Logo to gấp 3 lần bản gốc của DSH (sidebar 24->72, hero 34->102).
SIDEBAR_MARK_SIZE = 72
HERO_MARK_SIZE = 102
SIDEBAR_ROW_HEIGHT = 72
# .logoRow cao 60px + overflow:hidden (padding 8px dọc) -> phải nới lên 88px cho logo 72px khỏi bị cắt.
SIDEBAR_LOGO_ROW_HEIGHT = 88


def log(msg):
    print("[flowtech-brand] " + msg)


def find_dsh_root():
    cands = []
    try:
        npm_root = subprocess.check_output(["npm", "root", "-g"], text=True).strip()
        cands.append(os.path.join(npm_root, "@deepseek-ai", "dsh"))
    except Exception:
        pass
    for c in ["/opt/homebrew/lib/node_modules/@deepseek-ai/dsh",
              "/usr/local/lib/node_modules/@deepseek-ai/dsh",
              os.path.expanduser("~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh")]:
        cands.append(c)
    for c in cands:
        if os.path.isdir(c):
            return c
    return None


def backup(path):
    if not os.path.exists(path + ".fpt.bak"):
        shutil.copy2(path, path + ".fpt.bak")


def write_text(path, content, label):
    if not os.path.isfile(path):
        log("  SKIP (missing): %s" % path)
        return False
    cur = open(path, encoding="utf-8").read()
    if cur == content:
        log("  OK (already applied): %s" % label)
        return False
    backup(path)
    open(path, "w", encoding="utf-8").write(content)
    log("  PATCHED: %s" % label)
    return True


def sub_all(path, pairs, label):
    if not os.path.isfile(path):
        log("  SKIP (missing): %s" % path)
        return False
    s = open(path, encoding="utf-8").read()
    out = s
    for old, new in pairs:
        out = out.replace(old, new)
    return write_text(path, out, label)


def patch_regex(path, pattern, replacement, label, marker=None):
    """Vá bằng regex (bền với tên hàm đã minify).

    marker: chuỗi cho thấy bản vá đã áp từ trước -> OK, không vá lại.
    Không khớp và không có marker: WARN rõ ràng, KHÔNG im lặng bỏ qua (bản cũ hardcode
    `Jt(Gt.wordmark,...)` nên sau khi DSH minify lại là no-op im lặng).
    """
    if not os.path.isfile(path):
        log("  MISSING: %s" % path)
        return False
    s = open(path, encoding="utf-8").read()
    if marker and marker in s:
        log("  OK (already applied): %s" % label)
        return False
    m = re.search(pattern, s)
    if not m:
        log("  WARN khong khop: %s — pattern: %s (ban DSH khac? xem %s)" % (label, pattern, path))
        return False
    out = s[:m.start()] + m.expand(replacement) + s[m.end():]
    return write_text(path, out, label)


TITLE_RE = re.compile(r'const productTitle = "([^"]*)";')
# Giá trị này là trạng thái GỐC (đi vá); giá trị khác cả gốc lẫn brand ⇒ trạng thái lạ ⇒ WARN.
TITLE_OLD_NAMES = ("FPT China Harness", "DeepSeek Harness", "FlowTech Harness")


def patch_product_title(NM, new_name):
    """Tiêu đề tab runtime: DSH 0.1.5+ đọc `productTitle` trong dsh-client-ui-layout (bản cũ ở
    dsh-client-ui-renderer). Ba trạng thái cho từng file:

      GỐC   = một trong TITLE_OLD_NAMES      -> vá thành <new_name>
      ĐÃ VÁ = <new_name>                     -> im lặng "OK (already applied)"
      KHÁC  = giá trị lạ / không thấy dòng nào -> WARN rõ (KHÔNG nới thành im lặng)
    """
    hit = []
    problems = []
    for pkg in ("dsh-client-ui-layout", "dsh-client-ui-renderer"):
        p = os.path.join(NM, pkg, "lib", "client.js")
        if not os.path.isfile(p):
            continue
        s = open(p, encoding="utf-8").read()
        m = TITLE_RE.search(s)
        if not m:
            continue
        cur = m.group(1)
        if cur == new_name:
            log("  OK (already applied): productTitle %s = %r" % (pkg, cur))
            hit.append(pkg)
        elif cur in TITLE_OLD_NAMES:
            write_text(p, s.replace('const productTitle = "%s";' % cur,
                                    'const productTitle = "%s";' % new_name),
                       "productTitle %s" % pkg)
            hit.append(pkg)
        else:
            problems.append("%s (giá trị lạ %r)" % (pkg, cur))
    if not hit and not problems:
        problems.append("khong thay `const productTitle = ...` trong dsh-client-ui-layout/renderer")
    for pr in problems:
        log("  WARN: productTitle — %s; tieu de tab co the sai brand" % pr)
    return bool(hit)


def write_bytes(path, content, label):
    if os.path.isfile(path) and open(path, "rb").read() == content:
        log("  OK (already applied): %s" % label)
        return False
    if os.path.exists(path):
        backup(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)
    log("  WRITTEN: %s" % label)
    return True


MARK_RE = re.compile(
    r"\t\t/\*\*(?:(?!\*/)[\s\S])*?\*/\n"
    r"(?:\t\tconst (?:FPT_LOGO_PATHS = \[[\s\S]*?\n\t\t\];|(?:FLOWTECH_MARK_DATA_URI|FLOWTECH_LOGO_DATA_URI|FLOWTECH_ICON_DATA_URI) = \"(?:[^\"\\]|\\.)*\";)\n)*"
    r"\t\tfunction OfficialBrandMark\(\{ size, className \}\) \{[\s\S]*?\n\t\t\}\n"
)
NAME_RE = re.compile(
    r"\t\t/\*\*(?:(?!\*/)[\s\S])*?\*/\n"
    r"\t\tfunction OfficialBrandName\(\) \{[\s\S]*?\n\t\t\}\n"
)

# Dấu vết cho thấy MARK của brand plugin ĐÃ VÁ (2 kiểu: block data-URI, hoặc <img src="/brand-mark.png">
# của DSH 0.1.5+). Gặp các dấu vết này ⇒ im lặng, KHÔNG WARN (bản cũ vẫn in WARN giả ở đây).
MARK_APPLIED_MARKERS = ("FLOWTECH_LOGO_DATA_URI", "FLOWTECH_MARK_DATA_URI", 'src: "/brand-mark.png"')


def mark_block(logo_uri, icon_uri):
    """Logo ĐẦY ĐỦ (symbol + chữ) cho mọi chỗ hiển thị; chỗ rất nhỏ (<=32px, ví dụ
    rail sidebar thu gọn) dùng bản icon vuông vì logo ngang 3:1 không đọc được."""
    return (
        "\t\t/**\n"
        "\t\t* Render the FlowTech brand mark with the presentation requested by its host surface.\n"
        "\t\t* The full horizontal logo (symbol + wordmark) is embedded as a data URI so the plugin\n"
        "\t\t* stays self-contained and the artwork is never cropped; icon-sized slots fall back to\n"
        "\t\t* the square symbol, where a 3:1 lockup would be unreadable.\n"
        "\t\t* @param props - Host-supplied mark presentation.\n"
        "\t\t* @returns the FlowTech mark.\n"
        "\t\t*/\n"
        '\t\tconst FLOWTECH_LOGO_DATA_URI = "%s";\n' % logo_uri +
        '\t\tconst FLOWTECH_ICON_DATA_URI = "%s";\n' % icon_uri +
        "\t\tfunction OfficialBrandMark({ size, className }) {\n"
        "\t\t\tconst icon = size <= 32;\n"
        '\t\t\treturn (0, react_jsx_runtime.jsx)("img", {\n'
        "\t\t\t\tsrc: icon ? FLOWTECH_ICON_DATA_URI : FLOWTECH_LOGO_DATA_URI,\n"
        "\t\t\t\tclassName,\n"
        '\t\t\t\talt: "",\n'
        "\t\t\t\tdraggable: false,\n"
        "\t\t\t\tstyle: icon\n"
        '\t\t\t\t\t? { width: size, height: size, objectFit: "contain", display: "block" }\n'
        '\t\t\t\t\t: { width: "auto", height: "auto", maxWidth: "100%", maxHeight: size, objectFit: "contain", objectPosition: "left center", display: "block" }\n'
        "\t\t\t});\n"
        "\t\t}\n"
    )


NAME_BLOCK = (
    "\t\t/**\n"
    "\t\t* The brand lockup already carries its wordmark, so the host name slot stays empty\n"
    "\t\t* and the logo can use the full width of the row instead of being squeezed by text.\n"
    "\t\t* @returns nothing.\n"
    "\t\t*/\n"
    "\t\tfunction OfficialBrandName() {\n"
    "\t\t\treturn null;\n"
    "\t\t}\n"
)

NAME_PAIRS = [("FPT China Harness", BRAND_NAME), ("DeepSeek Harness", BRAND_NAME),
              ("FlowTech Harness", BRAND_NAME)]
PROVIDER_PAIRS = [
    ("The FPT China search provider.", "The FlowTech search provider."),
    ("The DeepSeek search provider.", "The FlowTech search provider."),
    ("FPT China \u641c\u7d22\u63d0\u4f9b\u65b9\u3002", "FlowTech \u641c\u7d22\u63d0\u4f9b\u65b9\u3002"),
    ("DeepSeek \u641c\u7d22\u63d0\u4f9b\u65b9\u3002", "FlowTech \u641c\u7d22\u63d0\u4f9b\u65b9\u3002"),
]

BOOT_WORDMARK_RE = r'this\.wordmark=(\w+)\((\w+)\.wordmark,"HARNESS"\)'
BOOT_WORDMARK_MARKER = ('wordmark.appendChild(function(){const e=document.createElement("img");'
                        'e.src="/favicon.png"')


def boot_wordmark_repl(alt):
    """Giữ nguyên tên hàm/variable minify của bundle hiện tại (\1, \2) — KHÔNG hardcode như bản cũ."""
    return (r'this.wordmark=\1(\2.wordmark),this.wordmark.appendChild(function(){'
            r'const e=document.createElement("img");e.src="/favicon.png";'
            r'e.alt="%s";e.style.width="80px";e.style.height="80px";'
            r'e.style.objectFit="contain";e.style.display="block";e.style.margin="0 auto";'
            r'return e}())' % alt)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsh-root")
    ap.add_argument("--dsh-home", default=os.path.expanduser("~/.dsh"))
    args = ap.parse_args()

    root = args.dsh_root or find_dsh_root()
    if not root or not os.path.isdir(root):
        log("ERROR: cannot locate the DSH install. Pass --dsh-root /path/to/node_modules/@deepseek-ai/dsh")
        sys.exit(1)
    log("DSH root: %s" % root)
    NM = os.path.join(root, "node_modules", "@deepseek-ai")
    DIST = os.path.join(NM, "dsh-web-frontend", "dist")
    here = os.path.dirname(os.path.abspath(__file__))

    # 1) browser-tab title, PWA manifest, tab icon
    sub_all(os.path.join(DIST, "index.html"),
            [("<title>FPT China Harness</title>", "<title>%s</title>" % BRAND_NAME),
             ("<title>DeepSeek Harness</title>", "<title>%s</title>" % BRAND_NAME),
             ("<title>FlowTech Harness</title>", "<title>%s</title>" % BRAND_NAME)],
            "index.html title")
    sub_all(os.path.join(DIST, "manifest.webmanifest"),
            [('"name": "FPT China Harness"', '"name": "%s"' % BRAND_NAME),
             ('"name": "DeepSeek Harness"', '"name": "%s"' % BRAND_NAME),
             ('"name": "FlowTech Harness"', '"name": "%s"' % BRAND_NAME),
             ('"short_name": "DSH"', '"short_name": "%s"' % BRAND_SHORT),
             ('"short_name": "FlowTech"', '"short_name": "%s"' % BRAND_SHORT)],
            "manifest.webmanifest name")
    icon = os.path.join(here, "flowtech-favicon.png")
    if os.path.isfile(icon):
        write_bytes(os.path.join(DIST, "favicon.png"), open(icon, "rb").read(), "dist/favicon.png")
        # DSH 0.1.5 trỏ icon tab vào "./favicon.svg" (bản FPT giữ lại làm asset legacy), nên
        # đổi mỗi favicon.png là chưa đủ - tab vẫn hi logo cũ. Bọc chính PNG FlowTech vào SVG
        # để mọi tham chiếu sẵn có (thẻ link, manifest, HTML đã cache) đều ra artwork FlowTech.
        fav_svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" '
                   'viewBox="0 0 512 512"><image href="data:image/png;base64,%s" '
                   'width="512" height="512"/></svg>\n'
                   % base64.b64encode(open(icon, "rb").read()).decode())
        write_text(os.path.join(DIST, "favicon.svg"), fav_svg, "dist/favicon.svg")
    # Logo ngang đầy đủ, phục vụ tĩnh tại /brand-logo.png (dùng cho trang login của gate VPS).
    full = os.path.join(here, "flowtech-logo.png")
    if os.path.isfile(full):
        write_bytes(os.path.join(DIST, "brand-logo.png"), open(full, "rb").read(), "dist/brand-logo.png")
    # Mark trong suốt, phục vụ tĩnh tại /brand-mark.png (DSH 0.1.5+ đọc file này thay cho FishLogo).
    mark_png = os.path.join(here, "flowtech-mark.png")
    if os.path.isfile(mark_png):
        write_bytes(os.path.join(DIST, "brand-mark.png"), open(mark_png, "rb").read(), "dist/brand-mark.png")

    # 2) product title: tiêu đề tab runtime — DSH 0.1.5+ dựng `document.title` từ
    #    `const productTitle = "..."` trong dsh-client-ui-layout (bản cũ: dsh-client-ui-renderer)
    patch_product_title(NM, BRAND_NAME)

    # 3) settings: announcement text + search provider description
    sub_all(os.path.join(NM, "dsh-client-ui-settings-models", "lib", "client.js"),
            NAME_PAIRS, "settings-models announcement")
    sub_all(os.path.join(NM, "dsh-client-ui-settings-plugins", "lib", "client.js"),
            PROVIDER_PAIRS, "settings-plugins search provider")

    # 4) brand plugin: mark + name
    brand = os.path.join(NM, "dsh-client-ui-brand-official", "lib", "client.js")
    if os.path.isfile(brand):
        s = open(brand, encoding="utf-8").read()
        logo_png = os.path.join(here, "flowtech-logo.png")
        icon_png = os.path.join(here, "flowtech-mark.png")
        if not (os.path.isfile(logo_png) and os.path.isfile(icon_png)):
            log("  SKIP: missing asset (flowtech-logo.png / flowtech-mark.png)")
        else:
            logo_uri = "data:image/png;base64," + base64.b64encode(open(logo_png, "rb").read()).decode()
            icon_uri = "data:image/png;base64," + base64.b64encode(open(icon_png, "rb").read()).decode()
            if MARK_RE.search(s):
                s = MARK_RE.sub(lambda _m: mark_block(logo_uri, icon_uri), s, count=1)
            elif any(mk in s for mk in MARK_APPLIED_MARKERS):
                # Trạng thái ĐÃ VÁ (bản data-URI hoặc <img src="/brand-mark.png">) -> im lặng.
                log("  OK (already applied): mark brand plugin")
            else:
                # DSH 0.1.5+ render mark bằng component FishLogo (không nhúng base64) ->
                # đổi sang <img src="/brand-mark.png">, asset ghi ở bước 6 bên dưới.
                old_mark = "return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FishLogo, { size });"
                new_mark = ('return (0, react_jsx_runtime.jsx)("img", { src: "/brand-mark.png", alt: "%s", '
                            'width: size, height: size, style: { objectFit: "contain", display: "block" } });' % BRAND_NAME)
                if old_mark in s:
                    s = s.replace(old_mark, new_mark, 1)
                    log("  PATCHED: mark (DSH 0.1.5+) -> /brand-mark.png")
                else:
                    log("  WARN: khong tim thay block mark cua brand plugin (ban DSH khac?)")
        if NAME_RE.search(s):
            s = NAME_RE.sub(lambda _m: NAME_BLOCK, s, count=1)
        else:
            log("  WARN: khong tim thay block name cua brand plugin (ban DSH khac?)")
        write_text(brand, s, "brand-official mark + name")

    # 5) kích thước logo: sidebar 24 -> 72, hero 34 -> 102 (gấp 3 lần)
    sb = os.path.join(NM, "dsh-client-ui-sidebar", "lib", "client.js")
    if os.path.isfile(sb):
        t = open(sb, encoding="utf-8").read()
        changed = False
        if 'renderSlot("sidebar.brand.mark", { size: %d }' % SIDEBAR_MARK_SIZE in t:
            log("  OK (already applied): sidebar mark %dpx" % SIDEBAR_MARK_SIZE)
        else:
            t2 = re.sub(r'renderSlot\("sidebar\.brand\.mark", \{ size: \d+ \}',
                        'renderSlot("sidebar.brand.mark", { size: %d }' % SIDEBAR_MARK_SIZE, t, count=1)
            if t2 == t:
                log("  WARN: khong thay slot mark cua sidebar (ban DSH khac?)")
            else:
                changed = True
            t = t2
        if "gap:8px;min-width:0;height:%dpx" % SIDEBAR_ROW_HEIGHT in t:
            log("  OK (already applied): sidebar brandIdentity height")
        else:
            t2 = t.replace("brandIdentity{align-items:center;gap:8px;min-width:0;height:24px;display:inline-flex}",
                           "brandIdentity{align-items:center;gap:8px;min-width:0;height:%dpx;display:inline-flex}" % SIDEBAR_ROW_HEIGHT, 1)
            if t2 == t:
                log("  WARN: khong thay CSS brandIdentity (ban DSH khac?)")
            else:
                changed = True
            t = t2
        if "gap:8px;height:%dpx" % SIDEBAR_LOGO_ROW_HEIGHT in t:
            log("  OK (already applied): sidebar logoRow height")
        else:
            t2 = t.replace("gap:8px;height:60px;margin-bottom:8px",
                           "gap:8px;height:%dpx;margin-bottom:8px" % SIDEBAR_LOGO_ROW_HEIGHT, 1)
            if t2 == t:
                log("  WARN: khong thay CSS logoRow (ban DSH khac?)")
            else:
                changed = True
            t = t2
        if "brandMark{flex:1 1 auto;min-width:0" in t:
            log("  OK (already applied): sidebar brandMark stretch")
        else:
            t2 = t.replace("brandMark{flex:none;justify-content:center;align-items:center;display:inline-flex}",
                           "brandMark{flex:1 1 auto;min-width:0;justify-content:flex-start;align-items:center;display:inline-flex}", 1)
            if t2 == t:
                log("  WARN: khong thay CSS brandMark (ban DSH khac?)")
            else:
                changed = True
            t = t2
        if changed:
            write_text(sb, t, "sidebar logo size %dpx" % SIDEBAR_MARK_SIZE)

    hv = os.path.join(NM, "dsh-client-ui-conversation", "lib", "client.js")
    if os.path.isfile(hv):
        t = open(hv, encoding="utf-8").read()
        # Ba trạng thái riêng cho TỪNG mục (không gộp điều kiện: bản cũ đòi cả size lẫn grid CSS nên
        # trên bản đã vá vẫn in WARN giả "khong thay slot mark cua hero").
        hero_re = r'renderSlot\("conversation\.hero\.brand\.mark", \{\s*\n\s*size: (\d+),'
        m = re.search(hero_re, t)
        if m and m.group(1) == str(HERO_MARK_SIZE):
            log("  OK (already applied): hero logo size %dpx" % HERO_MARK_SIZE)
        elif m:
            t = t[:m.start(1)] + str(HERO_MARK_SIZE) + t[m.end(1):]
            write_text(hv, t, "hero logo size %dpx" % HERO_MARK_SIZE)
        else:
            log("  WARN: khong thay slot mark cua hero (ban DSH khac?)")
        # grid CSS của headline: chỉ có 2 dạng biết trước; không thấy CẢ HAI ⇒ cấu trúc khác ⇒ WARN rõ.
        if "grid-template-columns:auto auto auto" in t:
            log("  OK (already applied): cot grid headline")
        elif "grid-template-columns:34px auto auto" in t:
            write_text(hv, t.replace("grid-template-columns:34px auto auto",
                                     "grid-template-columns:auto auto auto", 1),
                       "cot grid headline")
        else:
            log("  WARN: khong thay cot grid cua headline (khong co ca ban goc lan ban da va) — ban DSH khac?")

    # 6) boot/loading wordmark in the hashed main bundle
    for bundle in glob.glob(os.path.join(DIST, "assets", "index-*.js")):
        label = "boot wordmark %s" % os.path.basename(bundle)
        # ảnh boot do apply-fpt-patches.py gắn (alt="FPT China Harness") -> đổi alt sang brand hiện tại
        sub_all(bundle,
                [('alt="FPT China Harness"', 'alt="%s"' % BRAND_NAME),
                 ('alt="FlowTech Harness"', 'alt="%s"' % BRAND_NAME)],
                label)
        # chưa vá (hoặc vá bằng bản cũ hardcode tên minify): vá bằng regex bền minify
        patch_regex(bundle, BOOT_WORDMARK_RE, boot_wordmark_repl(BRAND_NAME),
                    label + " (HARNESS -> anh Culi)", BOOT_WORDMARK_MARKER)

    log("Done. Restart DSH (Ctrl+C, then run `dsh web` again) and hard-refresh the browser.")


if __name__ == "__main__":
    main()
