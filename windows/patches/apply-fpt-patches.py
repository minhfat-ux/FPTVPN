#!/usr/bin/env python3
"""
FPT Harness — apply branding/theme/logo/browse-picker patches to a DSH install.

Usage:
  python3 apply-fpt-patches.py [--dsh-root /path/to/@deepseek-ai/dsh] [--dsh-home /path/to/.dsh]
                               [--skip-profile] [--force]

Auto-detects the global DSH install if --dsh-root is omitted. Idempotent:
already-applied patches are skipped. Originals are saved as <file>.fpt.bak.
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys

DEFAULT_DOMAIN = "dhs.meetflowai.site"

# ---------------------------------------------------------------- helpers
def log(msg):
    print("[fpt-patch] " + msg)

def find_dsh_root():
    # 1) arg 2) common global locations 3) npm root -g
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

def patch_file(path, old, new, expect=None):
    if not os.path.isfile(path):
        log("  SKIP (missing): %s" % path)
        return False
    s = open(path, encoding="utf-8").read()
    n = s.count(old)
    if n == 0:
        log("  OK (already applied or version differs): %s" % path)
        return False
    if expect is not None and n != expect:
        log("  WARN %s: expected %d occurrence(s), found %d — patching anyway" % (path, expect, n))
    if not os.path.exists(path + ".fpt.bak"):
        shutil.copy2(path, path + ".fpt.bak")
    open(path, "w", encoding="utf-8").write(s.replace(old, new))
    log("  PATCHED: %s" % path)
    return True

def write_file(path, content):
    is_bytes = isinstance(content, bytes)
    try:
        if os.path.isfile(path):
            with open(path, "rb" if is_bytes else "r", encoding=None if is_bytes else "utf-8") as f:
                if f.read() == content:
                    log("  OK (already applied): %s" % path)
                    return
    except Exception:
        pass
    if os.path.exists(path) and not os.path.exists(path + ".fpt.bak"):
        shutil.copy2(path, path + ".fpt.bak")
    with open(path, "wb" if is_bytes else "w", encoding=None if is_bytes else "utf-8") as f:
        f.write(content)
    log("  WRITTEN: %s" % path)

# ------------------------------------------------------------- patch data
# -- theme override (appended to the theme plugin's STYLES list) ----------
FLOWVPN_CSS = ("body,body[data-ds-dark-theme]{--dsw-alias-bg-base:#0A1F3B;"
  "--dsw-alias-bg-layer-1:#0E2747;--dsw-alias-bg-layer-2:#123052;--dsw-alias-bg-layer-3:#16385E;"
  "--dsw-alias-bg-module-platform:#0E2747;--dsw-alias-bg-overlay:#0A1F3B;"
  "--dsw-alias-bg-mask-1:rgba(10,31,59,.5);--dsw-alias-bg-mask-2:rgba(10,31,59,.65);--dsw-alias-bg-mask-3:rgba(10,31,59,.8);"
  "--dsw-alias-bg-multi-select:rgba(51,199,115,.16);--dsw-alias-bg-skeleton:rgba(255,255,255,.08);"
  "--dsw-alias-brand-primary:#33C773;--dsw-alias-brand-text:#0A1F3B;--dsw-alias-brand-primary-invert:#0A1F3B;"
  "--dsw-alias-brand-primary-new-colorprimary-new-color:#33C773;--dsw-alias-button-primary-fill:#33C773;"
  "--dsw-alias-button-primary-hover:#3DD982;--dsw-alias-button-primary-dimmed:rgba(51,199,115,.3);"
  "--dsw-alias-button-info-fill:#33C773;--dsw-alias-button-info-hover:#3DD982;--dsw-alias-button-contrast-fill:#0A1F3B;"
  "--dsw-alias-button-elevated-fill:#0E2747;--dsw-alias-button-floating-fill:#123052;--dsw-alias-button-floating-hover:#16385E;"
  "--dsw-alias-label-primary:#FFFFFF;--dsw-alias-label-secondary:rgba(255,255,255,.6);--dsw-alias-label-tertiary:rgba(255,255,255,.4);"
  "--dsw-alias-label-caption:rgba(255,255,255,.35);--dsw-alias-label-primary-bluish:#FFFFFF;--dsw-alias-label-primary-dimmed:rgba(255,255,255,.72);"
  "--dsw-alias-label-dimmed:rgba(255,255,255,.55);--dsw-alias-label-primary-foreground:#0A1F3B;--dsw-alias-label-primary-inverted:#0A1F3B;"
  "--dsw-alias-border-l1:rgba(255,255,255,.06);--dsw-alias-border-l2:rgba(255,255,255,.12);--dsw-alias-border-l3:rgba(255,255,255,.16);--dsw-alias-border-l4:rgba(255,255,255,.2);"
  "--dsw-alias-interactive-bg-hover:rgba(51,199,115,.08);--dsw-alias-interactive-bg-active:rgba(51,199,115,.16);"
  "--dsw-alias-interactive-bg-hover-solid:rgba(51,199,115,.12);"
  "--dsw-alias-markdown-inline-code:rgba(255,255,255,.08);--dsw-alias-markdown-code-block:#123052;--dsw-alias-markdown-code-block-banner:#123052;"
  "--dsw-alias-markdown-code-segment-selected:#16385E;--dsw-alias-markdown-code-segment-unselected:#0E2747;"
  "--dsw-alias-markdown-placeholder:rgba(255,255,255,.45);--dsw-alias-markdown-tag:rgba(51,199,115,.2);--dsw-alias-markdown-citation:#0E2747;"
  "--dsw-alias-scrollbar-bg-l2:rgba(255,255,255,.12);--dsw-alias-scrollbar-hover-l2:rgba(51,199,115,.4);"
  "--dsw-alias-state-error-primary:#f25a5a;--dsw-alias-state-business-primary:#33C773;"
  "--dsw-alias-state-warn-primary:rgba(51,199,115,.35);--dsw-alias-state-warn-secondary:rgba(51,199,115,.28);"
  "--dsw-alias-state-warn-tertiary:rgba(51,199,115,.18);--dsw-alias-state-warn-label:#3DD982;"
  "--dsw-alias-toast-bg:#16385E;--dsw-alias-tooltip-bg:#123052;"
  "--dsw-specific-input-major:#0E2747;--dsw-specific-bubble:#0E2747;--dsw-specific-bubble-highlight:#123052;"
  "--dsw-specific-login-input:#123052;--dsw-specific-selector:#123052;--dsw-specific-tip:#123052;"
  "--dsw-specific-menu:var(--dsw-alias-bg-layer-3);--dsw-specific-sidebar-fill:#0A1F3B;"
  "--dsw-specific-sidebar-nav-item-active:#123052;--dsw-specific-sidebar-nav-item-active-accent:rgba(51,199,115,.25);"
  "--dsw-specific-sidebar-nav-item-hover:#16385E}"
  "::selection{background:rgba(51,199,115,.38);color:#0A1F3B}"
  # Box mở file (directory picker) dùng <button> không set color nên thừa hưởng mặc định
  # của trình duyệt (đen) trên nền navy -> chữ vô hình. Ép thừa hưởng, và cho chữ trong
  # dialog mở file màu cyan cho dễ đọc. `:has()` giới hạn phần title đúng dialog của picker;
  # trình duyệt không hỗ trợ :has() chỉ bỏ rule đó, các rule còn lại vẫn ăn.
  "[role=dialog] button{color:inherit}"
  "[role=dialog] [class*=rowName],[role=dialog] [class*=crumb],"
  "[role=dialog] [class*=showHiddenToggle],[role=dialog] [class*=pathInput]{color:#67E8F9}"
  "[role=dialog]:has([class*=rowName]) [class*=title]{color:#67E8F9}")

FPT_LOGO_MARK = """\t\tconst FPT_LOGO_PATHS = [
\t\t\t["M6.68439 3.50089C4.75756 3.50089 3.12259 4.75793 2.55021 6.5013C2.53888 6.54111 2.52471 6.58093 2.51338 6.6179L2.41703 6.99331L0 17.499H6.08934C7.90849 17.499 9.45845 16.3415 10.0478 14.7204L10.2774 13.7193L12.6292 3.49805H6.68439V3.50089Z", "#08509F"],
\t\t\t["M18.1691 0C16.18 0 14.5025 1.34236 13.984 3.17389C13.9443 3.3104 13.9131 3.44976 13.8876 3.59196L9.88379 21H15.8286C17.866 21 19.5746 19.5951 20.0506 17.6981H20.0535L24.1196 0H18.1691Z", "#F27123"],
\t\t\t["M28.0555 3.50098C26.1967 3.50098 24.6099 4.6727 23.9865 6.31937C23.9553 6.40469 23.8448 6.75165 23.8448 6.75165L21.3711 17.5019H27.3159C29.3589 17.5019 31.0732 16.0885 31.5408 14.183C31.5408 14.183 31.5408 14.183 31.5408 14.1858L33.9975 3.50382H28.0555V3.50098Z", "#51B748"],
\t\t\t["M4.03217 7.37699C3.69781 7.6557 3.48246 7.99413 3.41728 8.26431L2.15918 13.9637H2.23002C2.62105 13.9637 2.98942 13.8243 3.32378 13.5484C3.66097 13.2726 3.87349 12.9341 3.95566 12.5445L4.27869 11.0969H6.97908C7.37011 11.0969 7.74131 10.9576 8.07851 10.6817C8.4157 10.4058 8.63105 10.0646 8.71606 9.67208L8.73023 9.60098H4.61305L4.86524 8.46055H8.76706C9.1581 8.46055 9.52646 8.32119 9.86366 8.04817C10.198 7.7723 10.4049 7.42818 10.4955 7.03855L10.5125 6.96745H5.12593C4.73489 6.96176 4.36653 7.10112 4.03217 7.37699Z", "white"],
\t\t\t["M31.52 7.30069C31.3047 7.08455 31.0213 6.97363 30.6813 6.97363H25.2975L25.289 7.02198C25.2691 7.12721 25.2578 7.22675 25.2578 7.3206C25.2578 7.6505 25.3683 7.92637 25.5837 8.14535C25.8019 8.3615 26.0824 8.47241 26.4252 8.47241H27.587L26.4196 13.9642H26.4932C26.8843 13.9642 27.2498 13.8248 27.5842 13.5518C27.9185 13.2759 28.1254 12.9375 28.2076 12.545L29.0718 8.46957H31.809L31.8175 8.42122C31.8374 8.32168 31.8487 8.21645 31.8487 8.11407C31.8459 7.78986 31.7354 7.51683 31.52 7.30069Z", "white"],
\t\t\t["M19.7101 6.96223H16.0718L16.0747 6.95654H14.5785L13.0938 13.9641H13.1646C13.5556 13.9641 13.924 13.8248 14.2555 13.5489C14.587 13.273 14.7967 12.9346 14.8789 12.545L15.1821 11.1059H18.8544C19.2454 11.1059 19.611 10.9666 19.9453 10.6935C20.2768 10.4205 20.4894 10.0792 20.5772 9.68108L20.8521 8.41551C20.8719 8.31597 20.8832 8.21359 20.8832 8.10836C20.8832 7.78414 20.7727 7.51112 20.5517 7.29213C20.3364 7.07315 20.0502 6.96223 19.7101 6.96223ZM15.7488 8.46101H19.3531L19.1038 9.60714H15.4995L15.7488 8.46101Z", "white"]
\t\t];
\t\tfunction OfficialBrandMark({ size, className }) {
\t\t\treturn (0, react_jsx_runtime.jsx)("svg", {
\t\t\t\twidth: size,
\t\t\t\theight: size,
\t\t\t\tviewBox: "0 0 34 21",
\t\t\t\tclassName,
\t\t\t\tfill: "none",
\t\t\t\tpreserveAspectRatio: "xMidYMid meet",
\t\t\t\tchildren: FPT_LOGO_PATHS.map(([d, fill]) => (0, react_jsx_runtime.jsx)("path", { d, fill }))
\t\t\t});
\t\t}"""

OLD_MARK = """\t\tfunction OfficialBrandMark({ size, className }) {
\t\t\treturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FishLogo, {
\t\t\t\tsize,
\t\t\t\tclassName
\t\t\t});
\t\t}"""

NEW_NAME = """\t\tfunction OfficialBrandName() {
\t\t\treturn (0, react_jsx_runtime.jsx)("span", {
\t\t\t\tstyle: {
\t\t\t\t\tfontSize: 15,
\t\t\t\t\tfontWeight: 600,
\t\t\t\t\tlineHeight: 1.2,
\t\t\t\t\twhiteSpace: "nowrap",
\t\t\t\t\tletterSpacing: 0.2,
\t\t\t\t\tcolor: "var(--dsw-alias-label-primary)"
\t\t\t\t},
\t\t\t\tchildren: "FPT China Harness"
\t\t\t});
\t\t}"""

OLD_NAME = """\t\tfunction OfficialBrandName() {
\t\t\treturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.BrandWordmark, { includeMark: false });
\t\t}"""

OLD_CRUMBS = """\t\tfunction displayCrumbs(listing, homeLabel) {
\t\t\tconst homeIndex = listing.crumbs.findIndex((crumb) => crumb.path === listing.home);
\t\t\tif (homeIndex === -1) return listing.crumbs;
\t\t\tconst tail = listing.crumbs.slice(homeIndex + 1);
\t\t\treturn [{
\t\t\t\tname: homeLabel,
\t\t\t\tpath: listing.home,
\t\t\t\thidden: false
\t\t\t}, ...tail];
\t\t}"""

NEW_CRUMBS = """\t\tfunction displayCrumbs(listing, homeLabel) {
\t\t\t// fpt-harness: always show the full ancestry (incl. root "/") so external volumes are reachable.
\t\t\treturn listing.crumbs;
\t\t}"""

# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsh-root", default=None)
    ap.add_argument("--dsh-home", default=os.path.expanduser("~/.dsh"))
    ap.add_argument("--skip-profile", action="store_true")
    args = ap.parse_args()

    root = args.dsh_root or find_dsh_root()
    if not root or not os.path.isdir(root):
        log("ERROR: cannot locate the DSH install. Pass --dsh-root /path/to/node_modules/@deepseek-ai/dsh")
        sys.exit(1)
    log("DSH root: %s" % root)
    NM = os.path.join(root, "node_modules", "@deepseek-ai")
    DIST = os.path.join(root, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist")

    here = os.path.dirname(os.path.abspath(__file__))

    # 1) dist: title, manifest, favicon
    patch_file(os.path.join(DIST, "index.html"),
               "<title>DeepSeek Harness</title>", "<title>FPT China Harness</title>")
    patch_file(os.path.join(DIST, "manifest.webmanifest"),
               '"name": "DeepSeek Harness"', '"name": "FPT China Harness"')
    # Browser-tab icon: Culi PNG (favicon.svg kept as legacy asset)
    fpt_png = os.path.join(here, "favicon.png")
    if os.path.isfile(fpt_png):
        write_file(os.path.join(DIST, "favicon.png"), open(fpt_png, "rb").read())
    fpt_svg = os.path.join(here, "favicon.svg")
    if os.path.isfile(fpt_svg):
        write_file(os.path.join(DIST, "favicon.svg"), open(fpt_svg, encoding="utf-8").read())
    # point the page + manifest at the PNG icon
    patch_file(os.path.join(DIST, "index.html"),
               'rel="icon" type="image/svg+xml" href="/favicon.svg"',
               'rel="icon" type="image/png" href="/favicon.png"')
    patch_file(os.path.join(DIST, "manifest.webmanifest"),
               '"src": "/favicon.svg"', '"src": "/favicon.png", "sizes": "512x512"')
    patch_file(os.path.join(DIST, "manifest.webmanifest"),
               '"type": "image/svg+xml"', '"type": "image/png"')

    # 2) renderer product title
    patch_file(os.path.join(NM, "dsh-client-ui-renderer", "lib", "client.js"),
               'const productTitle = "DeepSeek Harness";', 'const productTitle = "FPT China Harness";')

    # 3) settings-models announcement (4 occurrences)
    p = os.path.join(NM, "dsh-client-ui-settings-models", "lib", "client.js")
    s = open(p, encoding="utf-8").read()
    if "FPT China Harness" in s:
        log("  OK (already applied): settings-models")
    elif "DeepSeek Harness" in s:
        if not os.path.exists(p + ".fpt.bak"):
            shutil.copy2(p, p + ".fpt.bak")
        open(p, "w", encoding="utf-8").write(s.replace("DeepSeek Harness", "FPT China Harness"))
        log("  PATCHED: settings-models")
    else:
        log("  SKIP (version differs): settings-models")

    # 4) settings-plugins search provider description
    patch_file(os.path.join(NM, "dsh-client-ui-settings-plugins", "lib", "client.js"),
               "The DeepSeek search provider.", "The FPT China search provider.")
    patch_file(os.path.join(NM, "dsh-client-ui-settings-plugins", "lib", "client.js"),
               "DeepSeek \u641c\u7d22\u63d0\u4f9b\u65b9\u3002", "FPT China \u641c\u7d22\u63d0\u4f9b\u65b9\u3002")

    # 5) brand-official: FPT logo + name
    patch_file(os.path.join(NM, "dsh-client-ui-brand-official", "lib", "client.js"),
               OLD_MARK, FPT_LOGO_MARK)
    patch_file(os.path.join(NM, "dsh-client-ui-brand-official", "lib", "client.js"),
               OLD_NAME, NEW_NAME)

    # 6) theme: flowvpn override
    p = os.path.join(NM, "dsh-client-ui-theme", "lib", "client.js")
    s = open(p, encoding="utf-8").read()
    css_const = '\t\tconst flowvpn_css_default = "%s";\n' % FLOWVPN_CSS
    # Re-running must refresh the CSS, not just skip: the theme is the one artifact that
    # changes often. Match the existing constant (our CSS holds no double quote) and rewrite.
    existing = re.search(r'^\t\tconst flowvpn_css_default = ".*?";\n', s, re.M)
    if existing:
        if existing.group(0) == css_const:
            log("  OK (already applied): theme")
        else:
            if not os.path.exists(p + ".fpt.bak"):
                shutil.copy2(p, p + ".fpt.bak")
            s = s[:existing.start()] + css_const + s[existing.end():]
            open(p, "w", encoding="utf-8").write(s)
            log("  UPDATED: theme (flowvpn.css)")
    else:
        anchor = "\t\tconst STYLES = ["
        if anchor not in s:
            log("  SKIP (version differs): theme")
        else:
            if not os.path.exists(p + ".fpt.bak"):
                shutil.copy2(p, p + ".fpt.bak")
            s = s.replace(anchor, css_const + anchor)
            last = '\t\t\t["shiki.css", shiki_css_default]\n\t\t];'
            if last in s:
                s = s.replace(last, '\t\t\t["shiki.css", shiki_css_default],\n\t\t\t["flowvpn.css", flowvpn_css_default]\n\t\t];')
            open(p, "w", encoding="utf-8").write(s)
            log("  PATCHED: theme")

    # 7) browse picker: always show full breadcrumbs
    patch_file(os.path.join(NM, "dsh-client-ui-directory-picker-browse", "lib", "client.js"),
               OLD_CRUMBS, NEW_CRUMBS)

    # 7b) boot/loading screen: replace the "HARNESS" wordmark with the Culi logo
    # (the shell lives in the hashed main bundle dist/assets/index-*.js)
    for bundle in glob.glob(os.path.join(DIST, "assets", "index-*.js")):
        patch_file(bundle,
                   'this.wordmark=Jt(Gt.wordmark,"HARNESS")',
                   'this.wordmark=Jt(Gt.wordmark),this.wordmark.appendChild(function(){const e=document.createElement("img");e.src="/favicon.png";e.alt="FPT China Harness";e.style.width="80px";e.style.height="80px";e.style.objectFit="contain";e.style.display="block";e.style.margin="0 auto";return e}())')

    # 7c) rename the "Ungrouped" bucket label to "MeetFlowAI"
    ws = os.path.join(NM, "dsh-client-ui-workspace", "lib", "client.js")
    patch_file(ws, 'const UNGROUPED_LABEL = "Ungrouped";', 'const UNGROUPED_LABEL = "MeetFlowAI";')
    patch_file(ws, '"group.ungrouped": "Ungrouped",', '"group.ungrouped": "MeetFlowAI",')
    patch_file(ws, 'Its sessions will appear under Ungrouped.', 'Its sessions will appear under MeetFlowAI.')

    # 8) profile patch: pin browse picker
    if not args.skip_profile:
        prof = os.path.join(args.dsh_home, "profiles", "web", "cordis.patch.yml")
        prof_src = os.path.join(here, "..", "profile", "cordis.patch.yml")
        if os.path.isfile(prof_src):
            os.makedirs(os.path.dirname(prof), exist_ok=True)
            content = open(prof_src, encoding="utf-8").read()
            if os.path.isfile(prof):
                cur = open(prof, encoding="utf-8").read()
                if "directory-picker-browse" in cur:
                    log("  OK (already applied): profile cordis.patch.yml")
                else:
                    if not os.path.exists(prof + ".fpt.bak"):
                        shutil.copy2(prof, prof + ".fpt.bak")
                    open(prof, "w", encoding="utf-8").write(content)
                    log("  WRITTEN (merged profile): %s" % prof)
            else:
                open(prof, "w", encoding="utf-8").write(content)
                log("  WRITTEN: %s" % prof)

    log("Done. Restart DSH (Ctrl+C, then run `dsh web` again) and hard-refresh the browser.")

if __name__ == "__main__":
    main()
