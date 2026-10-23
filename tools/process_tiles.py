"""Mengolah lembar tileset mentah dari Gemini menjadi sprite transparan.

Masukan : assets/tiles/<folder>/<lembar>.png   (sebenarnya JPEG, latar polos / magenta)
Keluaran: export/tiles/<lembar>/{atlas.png, atlas.json, sheet.png, preview.png}
          export/tiles/index.json  (ringkasan semua lembar)

Cara kerja (semua pada resolusi piksel-seni, bukan piksel gambar):
 1. Cari kisi piksel-seni lembar itu (ukuran + fase) dari tepi warna.
 2. Ambil satu warna median per sel kisi -> gambar piksel-seni bersih.
 3. Latar = warna tepi yang tersambung ke batas gambar (isi banjir) + sisa magenta.
 4. Tiap bagian terpisah di luar latar = satu sprite; disusun menjadi atlas.

Skala TIDAK dinormalisasi: 1 piksel-seni = 1 piksel. Ukuran antarlembar tidak
seragam (lihat docs/TILES.md); keputusan skala ada di sisi klien.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "tiles"
OUT = ROOT / "export" / "tiles"
TILE = 32
MIN_AREA = 30          # sprite lebih kecil dari ini (piksel-seni persegi) dibuang
BG_TOL = 60            # selisih warna (jumlah |dR|+|dG|+|dB|) yang masih dianggap latar


def axis_profile(g, axis):
    return np.abs(np.diff(g, axis=axis)).sum(1 - axis)


def lattice_score(profile, p):
    """Skor terbaik dan fasenya untuk satu ukuran sel p: tepi kuat di garis kisi,
    lemah di tengah sel."""
    n = len(profile)
    k = np.arange(0, int(n / p) + 2)
    best = (-1e18, 0.0)
    for ox in np.arange(0, p, p / 8):
        edge = np.round(ox + k * p).astype(int)
        edge = edge[edge < n]
        mid = np.round(ox + (k + 0.5) * p).astype(int)
        mid = mid[mid < n]
        s = profile[edge].mean() - profile[mid].mean()
        if s > best[0]:
            best = (s, float(ox))
    return best


def lattice_for(sizes, profiles):
    """Gambar dibuat pada kisi dengan JUMLAH SEL BULAT lalu dibesarkan, jadi
    pitch = ukuran / N. Cari N yang paling cocok; pada lembar persegi, jumlah sel
    di kedua sumbu dianggap sama. Kembalikan [(pitch, fase), (pitch, fase)]."""
    (W, H), (px_prof, py_prof) = sizes, profiles
    if W == H:
        best = (-1e18, 0)
        for N in range(int(W / 8), int(W / 2.8) + 1):
            p = W / N
            sx, _ = lattice_score(px_prof, p)
            sy, _ = lattice_score(py_prof, p)
            if sx + sy > best[0]:
                best = (sx + sy, N)
        p = W / best[1]
        return [(p, lattice_score(px_prof, p)[1]), (p, lattice_score(py_prof, p)[1])]
    out = []
    for L, prof in ((W, px_prof), (H, py_prof)):
        cand = [(lattice_score(prof, L / N)[0], N) for N in range(int(L / 8), int(L / 2.8) + 1)]
        p = L / max(cand)[1]
        out.append((p, lattice_score(prof, p)[1]))
    return out


def lattice_image(a, px, ox, py, oy):
    """Satu warna median per sel kisi."""
    H, W = a.shape[:2]
    nx, ny = int((W - ox) // px), int((H - oy) // py)
    k = max(1, int(round(min(px, py) * 0.5)))
    offs = np.arange(k) - k // 2
    cx = (ox + (np.arange(nx) + 0.5) * px).astype(int)
    cy = (oy + (np.arange(ny) + 0.5) * py).astype(int)
    yy = np.clip(cy[:, None, None, None] + offs[None, None, :, None], 0, H - 1)
    xx = np.clip(cx[None, :, None, None] + offs[None, None, None, :], 0, W - 1)
    win = a[yy, xx]                                   # (ny, nx, k, k, 3)
    return np.median(win.reshape(ny, nx, k * k, 3), axis=2).astype(np.uint8)


def background_mask(img):
    """Latar: warna tepi dominan yang tersambung ke batas gambar + sisa magenta."""
    a = img.astype(int)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    vals, cnt = np.unique(border // 8, axis=0, return_counts=True)
    bg = vals[cnt.argmax()] * 8 + 4
    near = np.abs(a - bg).sum(-1) < BG_TOL
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    mask = np.isin(lab, list(edge))
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    magenta = (r > g + 60) & (b > g + 60)
    return mask | magenta, tuple(int(v) for v in bg)


def grid_cuts(img, axis):
    """Posisi garis pemisah 1 piksel yang sudah menyatu di gambar (mosaik petak).
    Kembalikan batas sel [-1, garis1, garis2, ..., panjang]."""
    g = img.astype(float).mean(-1)
    prof = np.abs(np.diff(g, axis=axis)).sum(1 - axis)
    prof = prof[:-1] + prof[1:]                      # garis tipis memberi tepi di kedua sisi
    best = (-1e18, 0.0, 0.0)
    for p in np.arange(12.0, 41.0, 0.1):
        s, ox = lattice_score(prof, p)
        if s > best[0]:
            best = (s, float(p), ox)
    _, p, ox = best
    n = img.shape[axis]
    lines = [int(round(ox + k * p)) + 1 for k in range(int(n / p) + 2)]
    lines = [x for x in lines if 2 < x < n - 2]
    return [-1] + lines + [n], p


def pack(sprites, width=512):
    order = sorted(range(len(sprites)), key=lambda i: (-sprites[i].shape[0], i))
    pos, x, y, rowh = {}, 0, 0, 0
    for i in order:
        h, w = sprites[i].shape[:2]
        if x + w > width:
            x, y, rowh = 0, y + rowh + 1, 0
        pos[i] = (x, y)
        x += w + 1
        rowh = max(rowh, h)
    H = y + rowh + 1
    atlas = np.zeros((H, width, 4), np.uint8)
    for i, (px, py) in pos.items():
        h, w = sprites[i].shape[:2]
        atlas[py:py + h, px:px + w] = sprites[i]
    return atlas, pos


def preview(sheet_rgba, boxes, scale=3):
    h, w = sheet_rgba.shape[:2]
    chk = np.indices((h, w)).sum(0) // 4 % 2
    bg = np.where(chk[..., None] == 0, 205, 232).astype(np.uint8).repeat(3, 2)
    al = sheet_rgba[..., 3:4] / 255.0
    comp = (sheet_rgba[..., :3] * al + bg * (1 - al)).astype(np.uint8)
    im = Image.fromarray(comp).resize((w * scale, h * scale), Image.NEAREST).convert("RGB")
    d = ImageDraw.Draw(im)
    for i, (x, y, bw, bh) in enumerate(boxes):
        d.rectangle([x * scale, y * scale, (x + bw) * scale, (y + bh) * scale], outline=(232, 60, 60))
        d.text((x * scale + 2, y * scale + 1), str(i + 1), fill=(200, 0, 0))
    return im


def process(path):
    name = path.stem
    a = np.array(Image.open(path).convert("RGB"))
    g = a.astype(float).mean(-1)
    (px, ox), (py, oy) = lattice_for((g.shape[1], g.shape[0]), (axis_profile(g, 1), axis_profile(g, 0)))
    img = lattice_image(a, px, ox, py, oy)
    bgm, bgcol = background_mask(img)
    fg = ~bgm
    fgc = ndimage.binary_closing(fg, iterations=1)
    lab, n = ndimage.label(fgc)
    boxes, sprites = [], []
    for i, s in enumerate(ndimage.find_objects(lab)):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        m = (lab[s] == i + 1) & fg[s]
        if m.sum() < MIN_AREA or w < 3 or h < 3:
            continue
        spr = np.zeros((h, w, 4), np.uint8)
        spr[..., :3] = img[s]
        spr[..., 3] = np.where(m, 255, 0)
        boxes.append((s[1].start, s[0].start, w, h))
        sprites.append(spr)
    grid = None
    if len(boxes) == 1 and boxes[0][2] * boxes[0][3] > 0.6 * img.shape[0] * img.shape[1]:
        # lembar mosaik tanpa celah: potong menurut garis pemisah yang menyatu di gambar
        (cx, pxc), (cy, pyc) = grid_cuts(img, 1), grid_cuts(img, 0)
        boxes, sprites, cellpos = [], [], []
        for r in range(len(cy) - 1):
            for c in range(len(cx) - 1):
                x0, x1, y0, y1 = cx[c] + 1, cx[c + 1], cy[r] + 1, cy[r + 1]
                if x1 - x0 < 6 or y1 - y0 < 6:
                    continue
                spr = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
                spr[..., :3] = img[y0:y1, x0:x1]
                spr[..., 3] = np.where(fg[y0:y1, x0:x1], 255, 0)
                if spr[..., 3].sum() == 0:
                    continue
                boxes.append((x0, y0, x1 - x0, y1 - y0))
                sprites.append(spr)
                cellpos.append([c + 1, r + 1])
        grid = {"kolom": len(cx) - 1, "baris": len(cy) - 1, "selPiksel": [round(pxc, 1), round(pyc, 1)],
                "catatan": "Lembar mosaik dipotong menurut garis pemisah. Benda yang lebih besar dari "
                           "satu sel terpotong menjadi beberapa sel; gabungkan memakai posisi 'sel'."}
        order = list(range(len(boxes)))
    else:
        cellpos = None
        # urutan baca: baris (toleransi 6 sel) lalu kolom
        order = sorted(range(len(boxes)), key=lambda i: (boxes[i][1] // 6, boxes[i][0]))
        boxes, sprites = [boxes[i] for i in order], [sprites[i] for i in order]

    sheet = np.zeros(img.shape[:2] + (4,), np.uint8)
    sheet[..., :3] = img
    sheet[..., 3] = np.where(fg, 255, 0)
    atlas, pos = pack(sprites)
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas).save(d / "atlas.png", optimize=True)
    Image.fromarray(sheet).save(d / "sheet.png", optimize=True)
    preview(sheet, boxes).save(d / "preview.png", optimize=True)
    info = {
        "sumber": str(path.relative_to(ROOT)).replace("\\", "/"),
        "pitchPiksel": [round(px, 2), round(py, 2)],
        "warnaLatar": list(bgcol),
        "ukuranLembar": [int(img.shape[1]), int(img.shape[0])],
        "sprite": [
            {"id": i + 1, "x": pos[i][0], "y": pos[i][1], "w": b[2], "h": b[3],
             "dariLembar": {"x": b[0], "y": b[1]},
             "petak": [round(b[2] / TILE, 2), round(b[3] / TILE, 2)], "nama": None,
             **({"sel": cellpos[i]} if cellpos else {})}
            for i, b in enumerate(boxes)
        ],
    }
    if grid:
        info["mosaik"] = grid
    (d / "atlas.json").write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding="utf-8")
    return name, info


def main():
    names = sys.argv[1:]
    files = sorted(p for p in SRC.rglob("*.png") if "_draft" not in p.parts)
    if names:
        files = [p for p in files if p.stem in names]
    summary = {}
    for p in files:
        name, info = process(p)
        sizes = [(s["w"], s["h"]) for s in info["sprite"]]
        print(f"{name:26s} pitch {info['pitchPiksel']}  sprite {len(sizes):3d}  "
              f"lebar {min(w for w, _ in sizes) if sizes else 0}-{max(w for w, _ in sizes) if sizes else 0}  "
              f"tinggi {min(h for _, h in sizes) if sizes else 0}-{max(h for _, h in sizes) if sizes else 0}")
        summary[name] = {"sumber": info["sumber"], "pitchPiksel": info["pitchPiksel"],
                         "jumlahSprite": len(sizes)}
    if not names:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "index.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
