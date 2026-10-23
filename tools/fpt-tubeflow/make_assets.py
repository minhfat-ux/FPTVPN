#!/usr/bin/env python3
"""Sinh toàn bộ ảnh cho FPT Tubeflow (rebuild từ SmartTube) vào thư mục đã decode bằng apktool.

Dùng:
    python3 make_assets.py <thư-mục-decode> [thư-mục-preview]

Sinh:
  - icon kiểu YouTube: nền đỏ #FF0000 bo góc + tam giác play trắng CÓ BÓNG ĐỔ (mọi density)
  - app_logo (header, logo FPT + chữ) theo density bucket
  - app_banner (Android TV banner 320x180 dp) theo density bucket
  - bg_fpt.png 2560x1440 (nền navy + watermark logo FPT)

Yêu cầu: Pillow. Font: Arial (macOS) — đổi FONT_B/FONT_R nếu chạy nơi khác.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_R = "/System/Library/Fonts/Supplemental/Arial.ttf"
FPT_LOGO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fpt_logo.png")

YT_RED = (0xFF, 0x00, 0x00)
BG_DEEP = (0x07, 0x16, 0x28)
BG_HI = (0x14, 0x40, 0x6C)
CYAN = (0x22, 0xD3, 0xEE)
GREEN = (0x33, 0xC7, 0x73)
ACCENT_MINT = (0x7F, 0xE6, 0xC0)
TEXT = (0xEA, 0xF2, 0xFF)

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def play_icon(px):
    """Icon kiểu YouTube: đỏ bo góc + tam giác play trắng có bóng đổ."""
    s = px * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.30), fill=YT_RED + (255,))
    cx, cy = s / 2, s / 2
    w, h = s * 0.33, s * 0.30
    tri = [(cx - w * 0.62, cy - h), (cx - w * 0.62, cy + h), (cx + w * 0.95, cy)]
    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    off = int(s * 0.030)
    ImageDraw.Draw(shadow).polygon([(x, y + off) for x, y in tri], fill=(0, 0, 0, 120))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(int(s * 0.035))))
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).polygon(tri, fill=(255, 255, 255, 60))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(int(s * 0.030))))
    ImageDraw.Draw(img).polygon(tri, fill=(255, 255, 255, 255))
    return img.resize((px, px), Image.LANCZOS)


def _fpt_logo(width):
    logo = Image.open(FPT_LOGO).convert("RGBA")
    logo = logo.resize((width, int(logo.height * width / logo.width)), Image.LANCZOS)
    logo.putalpha(logo.split()[3].point(lambda v: int(v * 0.92)))
    return logo


def app_logo(w, h):
    """Logo header: logo FPT bên trái, chữ bên phải (tỉ lệ theo kích thước)."""
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    logo = _fpt_logo(int(w * 0.36))
    canvas.alpha_composite(logo, (int(w * 0.025), (h - logo.height) // 2))
    fb = ImageFont.truetype(FONT_B, max(9, int(h * 0.21)))
    fr = ImageFont.truetype(FONT_R, max(7, int(h * 0.115)))
    d = ImageDraw.Draw(canvas)
    x = int(w * 0.42)
    d.text((x, int(h * 0.30)), "FPT Tubeflow", font=fb, fill=TEXT + (240,))
    d.text((x, int(h * 0.58)), "YouTube · Premium", font=fr, fill=ACCENT_MINT + (215,))
    return canvas


def banner(w, h):
    w2, h2 = w * 2, h * 2
    im = Image.new("RGB", (w2, h2), (0x0D, 0x1B, 0x30))
    d = ImageDraw.Draw(im)
    for x in range(w2):
        t = x / (w2 - 1)
        d.line([(x, h2 - int(h2 * 0.10)), (x, h2)],
               fill=tuple(int(GREEN[i] + (CYAN[i] - GREEN[i]) * t) for i in range(3)))
    mark = app_logo(int(w2 * 0.92), int(h2 * 0.34))
    im = im.convert("RGBA")
    im.alpha_composite(mark, (int(w2 * 0.04), int(h2 * 0.28)))
    return im.convert("RGB").resize((w, h), Image.LANCZOS)


def background(w=2560, h=1440):
    base = Image.new("RGB", (w, h), BG_DEEP)
    d = ImageDraw.Draw(base)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(BG_HI[i] + (BG_DEEP[i] - BG_HI[i]) * t) for i in range(3)))
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for r in range(900, 0, -8):
        a = int(38 * (1 - r / 900))
        od.ellipse([w - 330 - r, h - 90 - r, w - 330 + r, h - 90 + r],
                   fill=(CYAN[0], CYAN[1], CYAN[2], a))
    for r in range(760, 0, -8):
        a = int(34 * (1 - r / 760))
        od.ellipse([160 - r, h - 110 - r, 160 + r, h - 110 + r],
                   fill=(GREEN[0], GREEN[1], GREEN[2], a))
    base = Image.alpha_composite(base.convert("RGBA"), ov.filter(ImageFilter.GaussianBlur(80)))
    logo = _fpt_logo(640)
    logo.putalpha(logo.split()[3].point(lambda v: int(v * 0.15)))
    base.alpha_composite(logo, (w - logo.width - 140, h - logo.height - 90))
    return base.convert("RGB")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    root = sys.argv[1]
    preview = sys.argv[2] if len(sys.argv) > 2 else None
    res = os.path.join(root, "res")

    # icon: luôn có bản -v30 (Android 13+ ưu tiên bản này)
    for bucket, k in DENSITIES.items():
        d = os.path.join(res, "mipmap-" + bucket)
        os.makedirs(d, exist_ok=True)
        px = int(48 * k)
        play_icon(px).save(os.path.join(d, "ic_launcher.png"))
        app_logo(int(240 * k), int(80 * k)).save(os.path.join(d, "app_logo.png"))
        for alt in ("app_logo_semi_red.png", "app_logo_semi_grey.png"):
            app_logo(int(240 * k), int(80 * k)).save(os.path.join(d, alt))
        banner(int(320 * k), int(180 * k)).save(os.path.join(d, "app_banner.png"))

    nodpi = os.path.join(res, "mipmap-nodpi")
    v30 = os.path.join(res, "mipmap-nodpi-v30")
    os.makedirs(v30, exist_ok=True)
    play_icon(320).save(os.path.join(nodpi, "app_icon.png"))
    play_icon(320).save(os.path.join(nodpi, "app_icon_alt.png"))
    play_icon(320).save(os.path.join(v30, "app_icon.png"))
    # file cũ còn được public.xml tham chiếu -> phải tồn tại
    banner(320, 180).save(os.path.join(nodpi, "app_banner_bak.png"))
    drawn = os.path.join(res, "drawable-nodpi")
    os.makedirs(drawn, exist_ok=True)
    background().save(os.path.join(drawn, "bg_fpt.png"))

    if preview:
        os.makedirs(preview, exist_ok=True)
        play_icon(320).save(os.path.join(preview, "icon-320.png"))
        app_logo(720, 240).save(os.path.join(preview, "logo-720x240.png"))
        banner(640, 360).save(os.path.join(preview, "banner-640x360.png"))
        background(1280, 720).save(os.path.join(preview, "bg-1280x720.png"))
    print("assets: xong")


if __name__ == "__main__":
    main()
