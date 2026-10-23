"""Uji kualitas kepala yang diperkecil (diambil ulang dari gambar asli)."""
import re
from pathlib import Path

import numpy as np
from PIL import Image

src = (Path(__file__).parent / "process_character.py").read_text(encoding="utf-8")
utils = src[:src.index("# ------------------------------------------------------------------ badan")]
cut = re.search(r"def cut_neck\(s\):.*?\n(?=\n\nheads)", src, re.S).group(0)
ns = {"__file__": str(Path(__file__).parent / "process_character.py")}
exec(utils, ns)
exec(cut, ns)

SHEET = {"hijab_simple": ("kepala_penutup.jpg", 0), "hijab_long": ("kepala_penutup.jpg", 1),
         "hijab_sport": ("kepala_penutup.jpg", 2), "hair_long": ("kepala_rambut_B.jpg", 1),
         "hair_bun": ("kepala_rambut_B.jpg", 3)}
SCALES = [1.0, 0.9, 0.85, 0.8]
rows = []
for name, (f, r) in SHEET.items():
    a = ns["load"](f)
    tiles = []
    for d, c in (("down", 0), ("left", 2)):
        for sc in SCALES:
            s, _ = ns["cut_neck"](ns["pixelate"](ns["grid_cell"](a, r, c), ns["PITCH"] / sc))
            t = np.zeros((38, 34, 4), np.uint8)
            t[38 - s.shape[0]:, (34 - s.shape[1]) // 2:(34 - s.shape[1]) // 2 + s.shape[1]] = s
            tiles.append(t)
    rows.append(np.concatenate(tiles, 1))
sheet = np.concatenate(rows, 0)
bg = np.zeros_like(sheet); bg[..., :3] = (230, 228, 222); bg[..., 3] = 255
al = sheet[..., 3:4] / 255.0
bg[..., :3] = (sheet[..., :3] * al + bg[..., :3] * (1 - al)).astype(np.uint8)
out = r"C:\Users\Izu\AppData\Local\Temp\claude\D--BAHAN-AJAR-logika-komputasional-Minggu-09-10-Pseudocode\79df006c-0a0d-4680-bf50-e0d884c3a138\scratchpad\head_scale.png"
Image.fromarray(bg).resize((bg.shape[1] * 5, bg.shape[0] * 5), Image.NEAREST).save(out)
print("ok")
