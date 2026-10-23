"""Eksperimen: membuat badan "ramping" dari badan tegap lewat kode (seam carving).

Membuang beberapa jalur piksel vertikal berenergi terendah (kain polos) di
bagian dalam badan, tanpa menyentuh siluet luar. Hasil: lembar perbandingan.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
K = ROOT / "prototype" / "karakter"
meta = json.loads((K / "atlas.json").read_text())
atlas = np.array(Image.open(K / "atlas.png").convert("RGBA")).astype(int)


def crop(key):
    f = meta["frames"][key]
    return atlas[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]].copy()


def energy(s):
    rgb = s[..., :3].astype(float)
    a = s[..., 3] > 0
    gx = np.abs(np.diff(rgb, axis=1, append=rgb[:, -1:])).sum(-1) + np.abs(np.diff(rgb, axis=1, prepend=rgb[:, :1])).sum(-1)
    gy = np.abs(np.diff(rgb, axis=0, append=rgb[-1:])).sum(-1)
    e = gx + 0.5 * gy
    # lindungi siluet: kolom di mana piksel ini bertetangga dengan transparan
    edge = a & ~(np.roll(a, 1, 1) & np.roll(a, -1, 1))
    e[edge] += 1e6
    e[~a] = 0                       # transparan murah (tetap boleh dilalui)
    return e


def remove_seam(s, x_lo, x_hi):
    """Buang satu seam vertikal yang dibatasi di kolom [x_lo, x_hi)."""
    h, w = s.shape[:2]
    e = energy(s)
    big = 1e9
    cost = np.full((h, w), big)
    cost[0, x_lo:x_hi] = e[0, x_lo:x_hi]
    back = np.zeros((h, w), int)
    for y in range(1, h):
        for x in range(x_lo, x_hi):
            best, bx = big, x
            for dx in (-1, 0, 1):
                px = x + dx
                if x_lo <= px < x_hi and cost[y - 1, px] < best:
                    best, bx = cost[y - 1, px], px
            cost[y, x] = best + e[y, x]
            back[y, x] = bx
    x = int(np.argmin(cost[-1, x_lo:x_hi])) + x_lo
    out = np.zeros((h, w - 1, 4), int)
    for y in range(h - 1, -1, -1):
        out[y] = np.delete(s[y], x, axis=0)
        x = back[y, x]
    return out


def slim(s, n=2):
    for i in range(n):
        h, w = s.shape[:2]
        # kiri dan kanan badan bergantian, hindari garis tengah (ritsleting/kancing)
        lo, hi = (int(w * 0.18), int(w * 0.45)) if i % 2 == 0 else (int(w * 0.55), int(w * 0.82))
        s = remove_seam(s, lo, hi)
    return s


rows = []
for name in ["hoodie", "kaos", "kemeja", "flannel"]:
    tiles = []
    for d in ("down", "left", "up"):
        fm = meta["sets"][name][d][1]
        a = crop(fm["key"])
        b = slim(a, 2)
        c = slim(a, 4)
        for s in (a, b, c):
            t = np.zeros((40, 34, 4), int)
            t[40 - s.shape[0]:, (34 - s.shape[1]) // 2:(34 - s.shape[1]) // 2 + s.shape[1]] = s
            tiles.append(t)
    rows.append(np.concatenate(tiles, 1))
sheet = np.concatenate(rows, 0).astype(np.uint8)
bg = np.zeros_like(sheet); bg[..., :3] = (230, 228, 222); bg[..., 3] = 255
al = sheet[..., 3:4] / 255.0
bg[..., :3] = (sheet[..., :3] * al + bg[..., :3] * (1 - al)).astype(np.uint8)
out = Path(r"C:\Users\Izu\AppData\Local\Temp\claude\D--BAHAN-AJAR-logika-komputasional-Minggu-09-10-Pseudocode\79df006c-0a0d-4680-bf50-e0d884c3a138\scratchpad\slim_test.png")
Image.fromarray(bg).resize((bg.shape[1] * 5, bg.shape[0] * 5), Image.NEAREST).save(out)
print("ok", out)
