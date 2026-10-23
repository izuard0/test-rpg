"""Lembar bantu penamaan sprite: tiap sprite diperbesar dengan nomor id besar di bawahnya.

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
COLS, Z, CELL_W = 5, 3, 330
sprites = d["sprite"]
cell_h = min(Z * max(s["h"] for s in sprites) + 34, 330)
rows = (len(sprites) + COLS - 1) // COLS
W, H = COLS * CELL_W, rows * cell_h
out = Image.new("RGB", (W, H), (240, 238, 232))
dr = ImageDraw.Draw(out)
for i, s in enumerate(sprites):
    im = Image.fromarray(a[s["y"]:s["y"] + s["h"], s["x"]:s["x"] + s["w"]])
    z = min(Z, (CELL_W - 20) // s["w"], (cell_h - 40) // s["h"]) or 1
    big = im.resize((s["w"] * z, s["h"] * z), Image.NEAREST)
    x, y = (i % COLS) * CELL_W, (i // COLS) * cell_h
    bg = Image.new("RGB", big.size, (205, 205, 210))
    bg.paste(big, (0, 0), big)
    out.paste(bg, (x + 10, y + 4))
    dr.text((x + 10, y + cell_h - 30), f"{s['id']}   {s['w']}x{s['h']}", fill=(180, 20, 20), font=font)
dest = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "export" / "tiles" / sheet / "nama.png"
out.save(dest)
print(dest, out.size)
