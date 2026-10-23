"""Lembar bantu penamaan sprite: tiap sprite diperbesar dengan nomor id TEPAT di bawahnya.

Pakai: python tools/name_sheet.py <lembar> [keluaran.png]
Lihat hasilnya, lalu isi nama di tools/tile_names.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sheet = sys.argv[1]
d = json.loads((ROOT / "export" / "tiles" / sheet / "atlas.json").read_text(encoding="utf-8"))
a = np.array(Image.open(ROOT / "export" / "tiles" / sheet / "atlas.png").convert("RGBA"))
font = ImageFont.load_default(size=22)
COLS, ZMAX, CELL_W, MAXH = 6, 4, 270, 230
sprites = d["sprite"]

items = []
for s in sprites:
    im = Image.fromarray(a[s["y"]:s["y"] + s["h"], s["x"]:s["x"] + s["w"]])
    z = max(1, min(ZMAX, (CELL_W - 12) // s["w"], MAXH // s["h"]))
    big = im.resize((s["w"] * z, s["h"] * z), Image.NEAREST)
    bg = Image.new("RGB", big.size, (205, 205, 210))
    bg.paste(big, (0, 0), big)
    items.append((s, bg))

rows = [items[i:i + COLS] for i in range(0, len(items), COLS)]
heights = [max(b.height for _, b in r) + 34 for r in rows]
out = Image.new("RGB", (COLS * CELL_W, sum(heights)), (240, 238, 232))
dr = ImageDraw.Draw(out)
y = 0
for r, rh in zip(rows, heights):
    for c, (s, b) in enumerate(r):
        x = c * CELL_W
        out.paste(b, (x + 6, y + 2))
        dr.text((x + 6, y + b.height + 6), f"{s['id']}  {s['w']}x{s['h']}", fill=(180, 20, 20), font=font)
    y += rh
dest = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "export" / "tiles" / sheet / "nama.png"
out.save(dest)
print(dest.name, out.size)
