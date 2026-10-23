"""Lembar luar ruangan (assets/tiles/_draft/outdoor_tileset_*.jpg) -> sprite transparan.

Gambar mentah punya kisi hitam 2 px di tiap kelipatan 64 px dan latar abu gelap.
1) kisi diperbaiki dengan menyalin piksel tetangga, 2) latar dibuang,
3) sprite dipisah per komponen, 4) petak lantai (rumput, tanah, batu) diambil per sel.
Hasil: export/tiles/outdoor/{sprites,ground}/NN_nama.png + atlas.json + atlas.png
"""
import glob
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
SRC = sorted(glob.glob(str(ROOT / "assets" / "tiles" / "_draft" / "outdoor_tileset_*.jpg")))[-1]
OUT = ROOT / "export" / "tiles" / "outdoor"
CELL, BG, TOL = 64, np.array([62, 66, 75]), 26
NAMES = json.loads((ROOT / "tools" / "tile_names.json").read_text(encoding="utf-8")).get("outdoor", {})

a = np.array(Image.open(SRC).convert("RGB")).astype(np.uint8)
for k in range(0, 1024, CELL):                       # perbaiki kisi
    for c in (k - 1, k):
        if 0 <= c < 1024:
            src = c - 2 if c == k - 1 else c + 2
            src = min(max(src, 0), 1023)
            a[:, c] = a[:, src]
            a[c, :] = a[src, :]
dist = np.abs(a.astype(int) - BG).sum(-1)
alpha = dist > TOL
alpha = ndi.binary_opening(alpha, iterations=1)
rgba = np.dstack([a, (alpha * 255).astype(np.uint8)])

for d in ("sprites", "ground"):
    (OUT / d).mkdir(parents=True, exist_ok=True)
    for f in (OUT / d).glob("*.png"):
        f.unlink()

# --- petak lantai (sel 64 px, tepi dipotong 2 px) ---
GROUND = {  # nama: (x, y) pojok kiri-atas; rumput hanya sel tengah blok 3x3 (sel lain bergaris tepi gelap)
    "tanah_tengah": (4 * CELL + 3, CELL + 3), "batu_a": (10 * CELL + 3, 3), "batu_b": (11 * CELL + 3, CELL + 3),
    "batu_c": (12 * CELL + 3, 3), "batu_d": (13 * CELL + 3, CELL + 3),
}
gi = []
def put(n, img):
    img.resize((28, 28), Image.LANCZOS).save(OUT / "ground" / f"{n}.png")
    gi.append(n)
for n, (x, y) in GROUND.items():
    put(n, Image.fromarray(a[y:y + CELL - 6, x:x + CELL - 6]))
g0 = Image.fromarray(a[CELL + 4:2 * CELL - 4, CELL + 4:2 * CELL - 4])
for n, im in {"rumput_a": g0, "rumput_b": g0.transpose(Image.FLIP_LEFT_RIGHT), "rumput_c": g0.transpose(Image.FLIP_TOP_BOTTOM),
              "rumput_d": g0.transpose(Image.ROTATE_180)}.items():
    put(n, im)

# --- sprite bertulis tangan (koordinat sumber) untuk bagian yang saling menempel ---
MANUAL = {
    "bunga_merah": (70, 195, 126, 250), "bunga_kuning": (130, 195, 190, 250),
    "petak_bunga_kecil": (196, 195, 380, 257), "petak_bunga_panjang": (126, 258, 384, 322),
    "air_mancur": (0, 318, 322, 706),
    "bangku_a": (4, 706, 124, 768), "bangku_b": (4, 770, 124, 832), "pagar_kayu": (4, 844, 124, 892),
    "lampu_taman": (203, 704, 244, 832), "lampu_pendek": (144, 768, 178, 894),
    "sepeda_merah": (254, 718, 322, 770), "sepeda_biru": (254, 780, 322, 832), "rak_sepeda": (192, 834, 318, 884),
    "pot_a": (392, 446, 442, 508), "pot_b": (456, 444, 506, 508), "pot_c": (512, 450, 576, 508),
    "pot_d": (580, 446, 626, 508),
    "gedung_depan": (405, 450, 1002, 1022),
    "tepi_batu_a": (4, 894, 126, 1018), "tepi_batu_b": (188, 894, 314, 1018),
}
BAD = {"gedung_depan": [(380, 440, 640, 508), (380, 960, 446, 1024)]}   # pot dan semak yang menempel
mask = alpha.copy()
mask[:192] = False
rects = []
for nm, (x0, y0, x1, y1) in MANUAL.items():
    mask[y0:y1, x0:x1] = False
    rects.append((nm, x0, y0, x1, y1))
lab, n = ndi.label(ndi.binary_dilation(mask, iterations=2))
comp = []
for k, sl in enumerate(ndi.find_objects(lab), 1):
    m = (lab[sl] == k) & alpha[sl]
    ys, xs = np.where(m)
    if len(ys) < 150:
        continue
    comp.append((sl[0].start + ys.min() // 1, sl[1].start + xs.min(), sl[0].start + ys.max() + 1, sl[1].start + xs.max() + 1))
comp.sort(key=lambda r: (r[0] // 48, r[1]))
items = [(nm, x0, y0, x1, y1) for nm, x0, y0, x1, y1 in rects] + [(None, c[1], c[0], c[3], c[2]) for c in comp]
atlas = []
for k, (nm, x0, y0, x1, y1) in enumerate(items, 1):
    crop = rgba[y0:y1, x0:x1].copy()
    if nm == "gedung_depan":                       # jendela/bayangan gelap mirip latar: isi lubang alfa
        crop[..., 3] = ndi.binary_fill_holes(crop[..., 3] > 0) * 255
    for bx0, by0, bx1, by1 in BAD.get(nm, []):
        crop[max(by0 - y0, 0):max(by1 - y0, 0), max(bx0 - x0, 0):max(bx1 - x0, 0), 3] = 0
    nm = nm or NAMES.get(str(k))
    if nm == "_buang":
        continue
    ys, xs = np.where(crop[..., 3] > 0)
    crop = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(crop)
    im = im.resize((max(1, im.width // 4), max(1, im.height // 4)), Image.NEAREST)   # 1 piksel seni = 4 px sumber
    fn = f"{k:02d}_{nm}.png" if nm else f"{k:02d}.png"
    im.save(OUT / "sprites" / fn)
    atlas.append({"id": k, "nama": nm, "x": int(x0 + xs.min()), "y": int(y0 + ys.min()), "w": int(crop.shape[1]), "h": int(crop.shape[0])})
(OUT / "atlas.json").write_text(json.dumps({"sumber": Path(SRC).name, "ground": gi, "sprite": atlas}, indent=1), encoding="utf-8")
Image.fromarray(rgba).save(OUT / "atlas.png")
print(f"sprite {len(atlas)}, petak lantai {len(gi)} -> {OUT}")
