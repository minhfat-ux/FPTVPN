#!/usr/bin/env python3
"""Generate a Tailscale-style app icon (shield) for FPTPrivateVPN.
Writes PNGs into the AppIcon.appiconset sized for macOS 1024 (single-size).
"""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "Assets.xcassets", "AppIcon.appiconset", "icon_1024.png")

SIZE = 1024
M = 90  # margin around the shield

def lerp(a, b, t):
    return int(a + (b - a) * t)

def make():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background: rounded-square gradient (dark blue -> deep blue), like Tailscale.
    radius = int(SIZE * 0.225)
    for y in range(SIZE):
        t = y / SIZE
        r = lerp(0.07, 0.11, t)
        g = lerp(0.10, 0.15, t)
        b = lerp(0.24, 0.32, t)
        draw.line([(0, y), (SIZE, y)], fill=(int(r*255), int(g*255), int(b*255), 255))

    # Apply rounded mask.
    mask = Image.new("L", (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, SIZE, SIZE], radius=radius, fill=255)
    img.putalpha(mask)

    # Shield shape (Tailscale-like shield).
    # Outline points for a shield: wide top, tapering to a point at the bottom.
    cx = SIZE // 2
    top = M
    bottom = SIZE - M
    half_w = int(SIZE * 0.36)
    waist = int(SIZE * 0.30)
    tip_y = SIZE - int(SIZE * 0.18)

    shield = [
        (cx - half_w, top),
        (cx + half_w, top),
        (cx + half_w, int(SIZE * 0.5)),
        (cx + waist, tip_y),
        (cx, SIZE - int(SIZE * 0.08)),
        (cx - waist, tip_y),
        (cx - half_w, int(SIZE * 0.5)),
    ]

    # Draw shield with a subtle white fill + green accent border.
    draw.polygon(shield, fill=(255, 255, 255, 255))
    draw.line(shield + [shield[0]], fill=(int(0.20*255), int(0.78*255), int(0.45*255), 255), width=int(SIZE*0.045), joint="curve")

    # Center "keyhole" mark (Tailscale's checkmark-ish). We draw a simple
    # vertical sliver to suggest the mesh mark.
    key_cx = cx
    draw.line(
        [(key_cx, top + int(SIZE*0.16)), (key_cx, SIZE - int(SIZE*0.22))],
        fill=(int(0.20*255), int(0.78*255), int(0.45*255), 255),
        width=int(SIZE*0.055),
    )

    # Slight shadow under shield for depth.
    shadow = img.filter(ImageFilter.GaussianBlur(6))
    img = Image.alpha_composite(shadow, img)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG")
    print("wrote", OUT, img.size)

if __name__ == "__main__":
    make()
