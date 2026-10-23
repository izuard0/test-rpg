"""Gambar perbandingan skala: karakter vs benda tileset pada ukuran asli (1 piksel-seni = 1 px).

Pakai: python tools/scale_check.py [keluaran.png]
Hasil dipakai untuk memutuskan normalisasi skala (lihat docs/TILES.md).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CH = ROOT / "export" / "character"
TL = ROOT / "export" / "tiles"
Z = 4


def sprite(sheet, pick):
    d = json.loads((TL / sheet / "atlas.json").read_text(encoding="utf-8"))
    a = np.array(Image.open(TL / sheet / "atlas.png").convert("RGBA"))
    s = pick(d["sprite"])
    return Image.fromarray(a[s["y"]:s["y"] + s["h"], s["x"]:s["x"] + s["w"]]), s


def character():
    meta = json.loads((CH / "atlas.json").read_text())
    at = Image.open(CH / "atlas.png").convert("RGBA")

    def crop(key):
        f = meta["frames"][key]
        return at.crop((f["x"], f["y"], f["x"] + f["w"], f["y"] + f["h"]))

    bm = meta["sets"]["hoodie"]["down"][1]
    hm = meta["heads"]["hair_short_01"]["down"]
    body, head = crop(bm["key"]), crop(hm["key"])
    hx = round(bm["neckX"] - hm["neckX"])
    hy = bm["attachY"] + meta["overlap"] - hm["neckY"] - 1
    top = min(0, hy)
    im = Image.new("RGBA", (max(body.width, hx + head.width, head.width) + 2, body.height - top + 2), (0, 0, 0, 0))
    im.alpha_composite(body, (0, -top))
    im.alpha_composite(head, (max(hx, 0), hy - top))
    return im


def by_area(items, rank):
    return sorted(items, key=lambda s: s["w"] * s["h"])[rank]


items = [
    ("karakter", character(), None),
]
picks = [
    ("pintu lobi", "lobby_doors", lambda L: next(s for s in L if 18 <= s["w"] <= 23 and 37 <= s["h"] <= 45)),
    ("rak buku", "library_bookshelves", lambda L: L[0]),
    ("meja baca", "library_furniture", lambda L: by_area(L, -1)),
    ("kursi?", "library_furniture", lambda L: next(s for s in L if 30 <= s["h"] <= 42 and 15 <= s["w"] <= 36)),
    ("meja lab", "lab_computer_desks", lambda L: L[0]),
    ("lantai perp.", "library_floor_wall", lambda L: L[0]),
    ("sel lantai lobi", "lobby_floor_wall", lambda L: L[0]),
]
for label, sheet, pick in picks:
    im, s = sprite(sheet, pick)
    items.append((f"{label}\n{sheet}\n{s['w']}x{s['h']}", im, s))

pad = 14
W = sum(i.width * Z + pad for _, i, _ in items) + pad
H = max(i.height for _, i, _ in items) * Z + 80
canvas = Image.new("RGB", (W, H), (236, 232, 222))
d = ImageDraw.Draw(canvas)
base = H - 52
# acuan petak 32 x 32 di sisi kiri
d.rectangle([pad, base - 32 * Z, pad + 32 * Z, base], outline=(232, 131, 58), width=2)
d.text((pad + 4, base - 32 * Z - 14), "petak 32x32", fill=(180, 80, 20))
x = pad + 32 * Z + pad
for label, im, s in items:
    big = im.resize((im.width * Z, im.height * Z), Image.NEAREST)
    canvas.paste(big, (x, base - big.height), big)
    for k, line in enumerate(label.split("\n")):
        d.text((x, base + 4 + k * 12), line, fill=(30, 40, 60))
    x += big.width + pad
out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "skala-aset.png"
canvas.save(out)
print("tulis", out, canvas.size)
