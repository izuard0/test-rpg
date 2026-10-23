"""Bantu memeriksa gambar set busana dari Gemini: deteksi figur, beri nomor,
ukur tinggi, dan simpan lembar kandidat bernomor.

Pakai: python tools/inspect_set.py <gambar.jpg> <keluaran.png>
"""
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

MAG = np.array([255, 0, 255])


def figures(a, min_area=15000):
    m = np.abs(a - MAG).sum(-1) > 230
    lab, _ = ndimage.label(ndimage.binary_closing(m, iterations=3))
    objs = [s for s in ndimage.find_objects(lab)
            if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) >= min_area]
    objs.sort(key=lambda s: (s[0].start // 150, s[1].start))
    return objs, m


def main(src, dst):
    a = np.array(Image.open(src).convert("RGB")).astype(int)
    objs, m = figures(a)
    cols = 6
    rows = (len(objs) + cols - 1) // cols
    W = Image.new("RGB", (cols * 300, rows * 380), (205, 205, 210))
    d = ImageDraw.Draw(W)
    for i, s in enumerate(objs):
        c, mm = a[s], m[s]
        im = np.full(c.shape, 205)
        im[mm] = c[mm]
        t = Image.fromarray(im.astype(np.uint8))
        t.thumbnail((290, 340))
        W.paste(t, ((i % cols) * 300 + 5, (i // cols) * 380 + 30))
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        d.text(((i % cols) * 300 + 8, (i // cols) * 380 + 8), f"#{i + 1}  {w}x{h}", fill=(0, 0, 0))
        print(f"#{i + 1:2d}  y={s[0].start:4d} x={s[1].start:4d}  {w}x{h}")
    W.save(dst)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
