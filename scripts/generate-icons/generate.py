#!/usr/bin/env python3
"""
Generates app/icon.png, app/apple-icon.png, and app/favicon.ico to match
the brand mark used by the sidebar logo (app/components/Sidebar.tsx): a
near-black square with a centered white serif "H".

Re-run this whenever the mark changes: `python3 scripts/generate-icons/generate.py`
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ── Brand mark — keep in sync with tailwind.config's `ink`/`cream` colors
# and the Sidebar Logo component ─────────────────────────────────────────
BG_COLOR = "#1A1A1A"  # tailwind `ink`
FG_COLOR = "#FAF9F6"  # tailwind `cream`
GLYPH = "H"
FONT_PATH = Path(__file__).parent / "PlayfairDisplay-Variable.ttf"
FONT_WEIGHT = "Bold"  # matches font-bold on the sidebar logo
GLYPH_HEIGHT_RATIO = 0.52  # ~50-55% of canvas height, per spec

MASTER_SIZE = 512  # render large, downsample for crisp small sizes

ROOT = Path(__file__).resolve().parents[2]  # repo root
APP_DIR = ROOT / "app"
OUT_DIR = Path(__file__).parent  # preview images live next to the script


def render_master() -> Image.Image:
    img = Image.new("RGB", (MASTER_SIZE, MASTER_SIZE), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Binary-search the font size so the glyph's actual ink height (not
    # font metrics, which include ascender/descender padding that varies
    # a lot for serif faces) lands at GLYPH_HEIGHT_RATIO of the canvas.
    target_h = MASTER_SIZE * GLYPH_HEIGHT_RATIO
    lo, hi = 10, MASTER_SIZE
    best_font = None
    best_bbox = None
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(str(FONT_PATH), mid)
        font.set_variation_by_name(FONT_WEIGHT)
        bbox = draw.textbbox((0, 0), GLYPH, font=font)
        glyph_h = bbox[3] - bbox[1]
        if glyph_h <= target_h:
            best_font, best_bbox = font, bbox
            lo = mid + 1
        else:
            hi = mid - 1

    bbox = draw.textbbox((0, 0), GLYPH, font=best_font)
    glyph_w = bbox[2] - bbox[0]
    glyph_h = bbox[3] - bbox[1]
    x = (MASTER_SIZE - glyph_w) / 2 - bbox[0]
    y = (MASTER_SIZE - glyph_h) / 2 - bbox[1]
    draw.text((x, y), GLYPH, font=best_font, fill=FG_COLOR)
    return img


def main():
    master = render_master()

    icon_192 = master.resize((192, 192), Image.LANCZOS)
    icon_192.save(APP_DIR / "icon.png", format="PNG")

    apple_180 = master.resize((180, 180), Image.LANCZOS)
    apple_180.save(APP_DIR / "apple-icon.png", format="PNG")

    # Multi-resolution .ico — Pillow downsamples the master into each size.
    master.save(
        APP_DIR / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    # Preview grid: 16/32/48/192 side by side, plus a circle-cropped 192
    # (Google crops favicons into a circle in search results).
    sizes = [16, 32, 48, 192]
    pad = 12
    row_h = 192
    total_w = sum(sizes) + pad * (len(sizes) + 1) + row_h + pad
    preview = Image.new("RGB", (total_w, row_h + pad * 2), "#F0EDE8")
    x = pad
    for s in sizes:
        thumb = master.resize((s, s), Image.LANCZOS)
        y = pad + (row_h - s) // 2
        preview.paste(thumb, (x, y))
        x += s + pad

    circle_thumb = master.resize((row_h, row_h), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (row_h, row_h), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, row_h, row_h), fill=255)
    circle = Image.new("RGBA", (row_h, row_h), (240, 237, 232, 255))
    circle.paste(circle_thumb, (0, 0), mask)
    preview.paste(circle.convert("RGB"), (x, pad))

    preview_path = OUT_DIR / "icon-preview.png"
    preview.save(preview_path, format="PNG")

    print(f"Wrote {APP_DIR / 'icon.png'} (192x192)")
    print(f"Wrote {APP_DIR / 'apple-icon.png'} (180x180)")
    print(f"Wrote {APP_DIR / 'favicon.ico'} (16/32/48)")
    print(f"Wrote {preview_path}")


if __name__ == "__main__":
    main()
