"""Memproses gambar Gemini (raw) menjadi sprite karakter kecil + atlas untuk simulasi.

Masukan : assets/characters/raw/*.jpg
Keluaran: prototype/karakter/atlas.png, atlas.json, preview.png

Karakter dirakit TANPA LEHER: leher dibuang dari kepala dan dari badan,
dagu langsung menempel di kerah.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets" / "characters" / "raw"
OUT = ROOT / "prototype" / "karakter"
OUT.mkdir(parents=True, exist_ok=True)

PITCH = 9.45          # ukuran satu piksel-seni di gambar Gemini
MAG = np.array([255, 0, 255])


# ------------------------------------------------------------------ util
def load(name):
    return np.array(Image.open(RAW / name).convert("RGB")).astype(int)


def is_bg(px):
    return np.abs(px - MAG).sum(-1) < 230


def grid_cell(a, r, c, rows=5, cols=6):
    h, w = a.shape[:2]
    ch, cw = h // rows, w // cols
    return a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw]


def blobs(a, min_area=15000):
    """Semua figur di gambar, diurutkan baris lalu kolom (nomor 1, 2, 3, ...)."""
    m = ndimage.binary_closing(~is_bg(a), iterations=3)
    lab, _ = ndimage.label(m)
    objs = [s for s in ndimage.find_objects(lab)
            if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) >= min_area]
    objs.sort(key=lambda s: (s[0].start // 150, s[1].start))
    pad = 12
    out = []
    for s in objs:
        y0, y1 = max(s[0].start - pad, 0), min(s[0].stop + pad, a.shape[0])
        x0, x1 = max(s[1].start - pad, 0), min(s[1].stop + pad, a.shape[1])
        out.append(a[y0:y1, x0:x1])
    return out


def trim(s):
    ys, xs = np.where(s[..., 3] > 0)
    return s[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def pixelate(a, pitch=None):
    """Perkecil ke resolusi piksel-seni. Fase grid dicari agar blok paling seragam.
    pitch lebih besar dari PITCH = hasil lebih kecil (dipakai untuk ukuran kepala)."""
    P = pitch or PITCH
    fg = ~is_bg(a)
    ys, xs = np.where(fg)
    a = a[max(ys.min() - 12, 0):ys.max() + 12, max(xs.min() - 12, 0):xs.max() + 12]
    best = None
    for ox in np.arange(0, P, 1.0):
        for oy in np.arange(0, P, 1.0):
            nx = int((a.shape[1] - ox) // P)
            ny = int((a.shape[0] - oy) // P)
            cx = (ox + (np.arange(nx) + 0.5) * P).astype(int)
            cy = (oy + (np.arange(ny) + 0.5) * P).astype(int)
            c0 = a[np.ix_(cy, cx)]
            c1 = a[np.ix_(np.clip(cy + 2, 0, a.shape[0] - 1), np.clip(cx + 2, 0, a.shape[1] - 1))]
            c2 = a[np.ix_(np.clip(cy - 2, 0, a.shape[0] - 1), np.clip(cx - 2, 0, a.shape[1] - 1))]
            err = np.abs(c0 - c1).sum() + np.abs(c0 - c2).sum()
            if best is None or err < best[0]:
                best = (err, ox, oy, nx, ny)
    _, ox, oy, nx, ny = best
    out = np.zeros((ny, nx, 4), np.uint8)
    for j in range(ny):
        for i in range(nx):
            x0 = int(ox + i * P + P * 0.25)
            x1 = int(ox + i * P + P * 0.75)
            y0 = int(oy + j * P + P * 0.25)
            y1 = int(oy + j * P + P * 0.75)
            blk = a[y0:y1 + 1, x0:x1 + 1].reshape(-1, 3)
            bgm = is_bg(blk)
            if bgm.mean() > 0.5:
                continue
            out[j, i, :3] = np.median(blk[~bgm], axis=0)
            out[j, i, 3] = 255
    r, g, b, al = [out[..., k].astype(int) for k in range(4)]
    out[(al > 0) & (r > g + 40) & (b > g + 40)] = 0      # sisa fringe magenta
    return trim(out)


def skin_mask(s):
    r, g, b, al = [s[..., k].astype(int) for k in range(4)]
    return (al > 0) & (r > g + 18) & (g > b + 5) & (r > 150)


def grey_mask(s):
    r, g, b, al = [s[..., k].astype(int) for k in range(4)]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return (al > 0) & (mx - mn < 30) & (lum > 95)


def center_x(mask, rows):
    ys, xs = np.where(mask[rows])
    return float(xs.mean()) if len(xs) else mask.shape[1] / 2


# ------------------------------------------------------------------ badan
def strip_neck(s):
    """Buang potongan leher di atas kerah. Kembalikan (sprite, attachY, neckX)."""
    sk = skin_mask(s)
    op = s[..., 3] > 0
    width = op.sum(1)
    collar = 0
    for y in range(s.shape[0]):
        if (op[y] & ~sk[y]).sum() >= 0.5 * width.max():
            collar = y
            break
    nx = center_x(sk, slice(0, max(collar, 1) + 1))
    s = s.copy()
    s[:collar + 2][sk[:collar + 2]] = 0
    # baris kosong di atas ikut terpotong oleh trim; hitung geseran
    top = int(np.where((s[..., 3] > 0).any(1))[0].min())
    left = int(np.where((s[..., 3] > 0).any(0))[0].min())
    return trim(s), collar - top, nx - left


def tint_limit(s):
    """Baris batas pewarnaan atasan: baris pertama (setelah 30% tinggi) yang
    hampir tidak berisi warna abu-abu atasan lagi (celana mulai)."""
    gm, op = grey_mask(s), s[..., 3] > 0
    h = s.shape[0]
    for y in range(int(h * 0.3), h):
        if op[y].sum() and gm[y].sum() < 0.2 * op[y].sum():
            return y
    return int(h * 0.7)


SETS = {
    # berkas, cara ambil, frame per arah (urutan: langkah, berdiri, langkah)
    "hoodie": {
        "file": "set_hoodie.jpg", "label": "Hoodie", "mode": "grid",
        "down": [(1, 0), (1, 2), (3, 0)],
        "up": [(1, 4), (4, 0), (4, 4)],
        # (3, 1) dibuang: badannya lebih lebar & menghadap 3/4 depan, tidak
        # konsisten dengan dua frame samping lainnya -> animasi 2 frame
        "left": [(3, 2), (3, 3), (3, 2)],
    },
    "flannel": {
        "file": "set_flannel.jpg", "label": "Flanel", "mode": "blob",
        # nomor figur (1-based) dari hasil deteksi; "m" = dicerminkan
        "down": [7, 9, 13],
        "up": [11, 10, 12],
        "left": [15, 16, "14m"],
    },
    # set berikutnya meniru tata letak hoodie: #7/#9/#19 depan, #10-12 belakang,
    # #21-22 samping kiri, #20 menghadap kanan (dicerminkan)
    "kaos": {
        "file": "set_kaos.jpg", "label": "Kaos", "mode": "blob",
        "down": [7, 9, 19], "up": [11, 10, 12], "left": [21, 22, "20m"],
    },
    "kemeja": {
        "file": "set_kemeja.jpg", "label": "Kemeja", "mode": "blob",
        "down": [7, 9, 19], "up": [11, 10, 12], "left": [21, 22, "20m"],
    },
}

bodies = {}
for name, cfg in SETS.items():
    a = load(cfg["file"])
    figs = blobs(a) if cfg["mode"] == "blob" else None
    bodies[name] = {}
    for d in ("down", "up", "left"):
        lst = []
        for spec in cfg[d]:
            flip = False
            if cfg["mode"] == "grid":
                crop = grid_cell(a, *spec)
            else:
                if isinstance(spec, str) and spec.endswith("m"):
                    spec, flip = int(spec[:-1]), True
                crop = figs[spec - 1]
            s = pixelate(crop)
            if flip:
                s = s[:, ::-1].copy()
            lst.append(s)
        bodies[name][d] = lst
    bodies[name]["right"] = [s[:, ::-1].copy() for s in bodies[name]["left"]]

# ------------------------------------------------------------------ tipe badan ramping
# Dibuat lewat kode (seam carving): buang SLIM jalur piksel kain polos di sisi
# kiri & kanan badan. Tinggi dan kerah tetap, jadi semua kepala/aksesori cocok.
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from slim import slim  # noqa: E402

SLIM = 4   # badan perempuan: 4 jalur piksel lebih ramping
for name in list(bodies):
    bodies[name + "_b"] = {d: [slim(s.astype(int), SLIM).astype(np.uint8) for s in lst]
                           for d, lst in bodies[name].items() if d != "right"}
    bodies[name + "_b"]["right"] = [s[:, ::-1].copy() for s in bodies[name + "_b"]["left"]]
    SETS[name + "_b"] = {"label": SETS[name]["label"]}

# ------------------------------------------------------------------ kepala
SHEETS = {
    "kepala_rambut_A.jpg": ["hair_short_01", "hair_short_02", "hair_buzz", "hair_curly", "hair_undercut"],
    "kepala_rambut_B.jpg": ["hair_medium", "hair_long", "hair_ponytail", "hair_bun", "hair_wavy"],
    "kepala_penutup.jpg": ["hijab_simple", "hijab_long", "hijab_sport", "peci", "cap_baseball"],
    "kepala_aksesori.jpg": ["beanie"],
}
HEAD_COL = {"down": 0, "right": 1, "left": 2, "up": 4}


def cut_neck(s):
    """Buang leher: sisakan sampai baris terbawah yang masih selebar kepala
    (dagu / tengkuk). Kepala bertutup (hijab, rambut panjang) tetap utuh."""
    w = (s[..., 3] > 0).sum(1)
    h = s.shape[0]
    neck_w = float(np.median(w[-3:]))
    op = s[..., 3] > 0
    skin_frac = skin_mask(s)[-3:].sum() / max(op[-3:].sum(), 1)
    if neck_w > 0.6 * w.max() or skin_frac < 0.5:   # bawahnya kain/rambut, bukan leher
        return s, False
    # naik dari bawah selama lebarnya masih selebar leher; baris pertama yang
    # jelas lebih lebar adalah dagu/rahang -> dagu & mulut tetap utuh
    y = h - 1
    while y > 0 and w[y] <= neck_w * 1.35 + 1:
        y -= 1
    yb = min(y + 1, h - 1)                # sertakan 1 baris garis dagu
    return s[:yb + 1], yb + 1 < h


# Ukuran kepala (persen). Kepala yang lebih kecil diambil ulang dari gambar asli
# dengan grid piksel lebih besar, sehingga tetap tajam.
HEAD_SCALES = [100, 95, 90, 85, 80]
SHEET_CACHE = {}


def build_heads(pitch):
    hs, cut = {}, {}
    for sheet, names in SHEETS.items():
        a = SHEET_CACHE.setdefault(sheet, load(sheet))
        for r, name in enumerate(names):
            hs[name], cut[name] = {}, {}
            for d, c in HEAD_COL.items():
                hs[name][d], cut[name][d] = cut_neck(pixelate(grid_cell(a, r, c), pitch))
                if name.startswith("hijab") and d == "up":
                    hs[name][d] = clear_neck_rows(hs[name][d])
    return hs, cut


def clear_neck_rows(s):
    """Hijab tampak belakang: kosongkan baris bawah yang masih memperlihatkan
    leher (kulit). Ukuran sprite dipertahankan agar posisi tidak bergeser."""
    s = s.copy()
    sk = skin_mask(s)
    h = s.shape[0]
    y = h - 1
    while y >= h - 4 and sk[y].any():
        s[y] = 0
        y -= 1
    return s


HEADS = {sc: build_heads(PITCH * 100 / sc) for sc in HEAD_SCALES}
heads, neck_cut = HEADS[100]

# ------------------------------------------------------------------ aksesori kepala
# Dipisahkan dengan membandingkan kepala beraksesori (kepala_aksesori.jpg)
# dengan kepala botak polos (set_hoodie.jpg baris 3).
def chin_point(s, was_cut=True):
    sk = skin_mask(s)
    h = s.shape[0]
    rows = slice(max(h - 3, 0), h)
    return center_x(sk, rows) if sk[rows].any() else s.shape[1] / 2, h - 1


def align(src, ref, r=3):
    """Geser ref agar paling cocok dengan src (dasar: dagu sejajar)."""
    best = None
    H, W = src.shape[:2]
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            canvas = np.zeros_like(src)
            oy = H - ref.shape[0] + dy
            ox = (W - ref.shape[1]) // 2 + dx
            ys0, xs0 = max(oy, 0), max(ox, 0)
            ys1, xs1 = min(oy + ref.shape[0], H), min(ox + ref.shape[1], W)
            if ys1 <= ys0 or xs1 <= xs0:
                continue
            canvas[ys0:ys1, xs0:xs1] = ref[ys0 - oy:ys1 - oy, xs0 - ox:xs1 - ox]
            both = (src[..., 3] > 0) & (canvas[..., 3] > 0) & skin_mask(src)
            err = (np.abs(src[..., :3].astype(int) - canvas[..., :3].astype(int)).sum(-1)[both] > 60).sum() \
                - both.sum() * 0.5
            if best is None or err < best[0]:
                best = (err, canvas, ox, oy)
    return best[1], best[2], best[3]


hood_raw = load("set_hoodie.jpg")
acc_raw = load("kepala_aksesori.jpg")
ACC_ROWS = {"acc_glasses_round": 1, "acc_glasses_square": 2, "acc_headset": 3, "acc_vr_headset": 4}
ACC_LABEL = {"acc_glasses_round": "Kacamata bulat", "acc_glasses_square": "Kacamata kotak",
             "acc_headset": "Headset", "acc_vr_headset": "VR"}


def build_accs(pitch):
  bald = {d: cut_neck(pixelate(grid_cell(hood_raw, 2, c), pitch))[0] for d, c in HEAD_COL.items()}
  accs = {}
  for name, r in ACC_ROWS.items():
    accs[name] = {}
    for d, c in HEAD_COL.items():
        src, _ = cut_neck(pixelate(grid_cell(acc_raw, r, c), pitch))
        ref, rox, roy = align(src, bald[d])
        bcx, _ = chin_point(bald[d])
        cx, cy = rox + bcx, roy + bald[d].shape[0] - 1      # dagu kepala botak (patokan)
        diff = (src[..., 3] > 0) & (
            (ref[..., 3] == 0) | (np.abs(src[..., :3].astype(int) - ref[..., :3].astype(int)).sum(-1) > 70))
        diff &= ~skin_mask(src)
        # buang sisa garis tepi kepala: piksel gelap di pita tepi siluet kepala botak
        ref_a = ref[..., 3] > 0
        band = ndimage.binary_dilation(ref_a & ~ndimage.binary_erosion(ref_a), iterations=2)
        rr, gg, bb = [src[..., k].astype(int) for k in range(3)]
        lum = 0.299 * rr + 0.587 * gg + 0.114 * bb
        outline_like = (lum < 75) | ((rr > gg + 15) & (rr > 90))      # garis navy / bayangan kulit
        diff &= ~(band & outline_like)
        diff = ndimage.binary_opening(diff, structure=np.ones((1, 2))) | ndimage.binary_opening(diff, structure=np.ones((2, 1)))
        lab, n = ndimage.label(diff)
        if n:
            sizes = ndimage.sum(diff, lab, range(1, n + 1))
            keep_min = max(3, 0.25 * max(sizes))      # buang serpihan kecil terpisah
            diff = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= keep_min])
        if name.startswith("acc_glasses") and d == "up":
            diff[:] = False                            # kacamata tak terlihat dari belakang
        out = np.zeros_like(src)
        out[diff] = src[diff]
        if not diff.any():
            accs[name][d] = None
            continue
        ys, xs = np.where(diff)
        accs[name][d] = (out[ys.min():ys.max() + 1, xs.min():xs.max() + 1],
                         int(xs.min() - round(cx)), int(ys.min() - cy))
  return accs


ACCS = {sc: build_accs(PITCH * 100 / sc) for sc in HEAD_SCALES}
accs = ACCS[100]

# ------------------------------------------------------------------ tas
# Badan tebal tas diambil dari warna (bukan abu-abu manekin, bukan kulit, bukan
# garis tipis); tali digambar ulang secara sederhana.
tas_raw = load("tas.jpg")
BAG_ROWS = {"acc_backpack": 1, "acc_laptop_bag": 3}
BAG_LABEL = {"acc_backpack": "Ransel", "acc_laptop_bag": "Tas laptop"}
BAG_COL = {"down": 0, "left": 2, "up": 4}
bags = {}
for name, r in BAG_ROWS.items():
    bags[name] = {}
    for d, c in BAG_COL.items():
        s = pixelate(grid_cell(tas_raw, r, c))
        _, attach_y, nx = strip_neck(s)
        top = int(np.where((s[..., 3] > 0).any(1))[0].min())
        left = int(np.where((s[..., 3] > 0).any(0))[0].min())
        rr, gg, bb = [s[..., k].astype(int) for k in range(3)]
        suit = grey_mask(s) & ((0.299 * rr + 0.587 * gg + 0.114 * bb) > 150)   # abu-abu terang manekin
        cand = (s[..., 3] > 0) & ~suit & ~skin_mask(s)
        thick = ndimage.binary_opening(cand, structure=np.ones((3, 3)))
        thick = ndimage.binary_dilation(thick) & (s[..., 3] > 0) & ~skin_mask(s)
        out = np.zeros_like(s)
        out[thick] = s[thick]
        bags[name][d] = {"sprite": out, "has": bool(thick.any()),
                         "ox": -nx - left, "oy": -(attach_y + top)}
    bags[name]["right"] = None   # dicerminkan dari "left" di bawah

# ------------------------------------------------------------------ atlas + meta
sprites, meta = [], {"sets": {}, "heads": {}, "overlap": 1}
for name, dirs in bodies.items():
    meta["sets"][name] = {"label": SETS[name]["label"]}
    for d, lst in dirs.items():
        meta["sets"][name][d] = []
        for i, s in enumerate(lst):
            s, attach_y, nx = strip_neck(s)
            key = f"body_{name}_{d}_{i}"
            sprites.append((key, s))
            meta["sets"][name][d].append({"key": key, "neckX": round(nx, 1),
                                          "attachY": int(attach_y), "tintBelow": tint_limit(s)})

def head_meta(heads, neck_cut, suffix):
  out = {}
  for name, dirs in heads.items():
    out[name] = {}
    for d, s in dirs.items():
        key = f"head_{name}_{d}{suffix}"
        sprites.append((key, s))
        h = s.shape[0]
        sk = skin_mask(s)
        sk_rows = np.where(sk.any(1))[0]
        if neck_cut[name][d]:
            ny, rows = h - 1, slice(max(h - 3, 0), h)          # dagu / tengkuk
        elif len(sk_rows):
            ny = int(sk_rows.max())                              # dagu (kepala bertutup)
            rows = slice(max(ny - 2, 0), ny + 1)
        else:
            ny, rows = None, None
        nx = center_x(sk, rows) if rows is not None and sk[rows].any() else s.shape[1] / 2
        out[name][d] = {"key": key, "neckX": round(nx, 1), "neckY": ny}
  # tampak belakang tertutup: pakai titik dagu dari arah samping/depan
  for name, dirs in out.items():
    for d, m in dirs.items():
        if m["neckY"] is None:
            ref = next(dirs[k]["neckY"] for k in ("left", "right", "down") if dirs[k]["neckY"] is not None)
            m["neckY"] = min(ref, heads[name][d].shape[0] - 1)
  return out


def acc_meta(accs, suffix):
  out = {}
  for name, dirs in accs.items():
    out[name] = {"label": ACC_LABEL[name]}
    for d, v in dirs.items():
        if v is None:
            out[name][d] = None
            continue
        s, ax, ay = v
        key = f"acc_{name}_{d}{suffix}"
        sprites.append((key, s))
        out[name][d] = {"key": key, "ax": ax, "ay": ay}
  return out


meta["heads"] = head_meta(heads, neck_cut, "")
meta["acc"] = acc_meta(accs, "")
meta["headScale"], meta["accScale"] = {}, {}
for sc in HEAD_SCALES[1:]:
    meta["headScale"][str(sc)] = head_meta(*HEADS[sc], f"_s{sc}")
    meta["accScale"][str(sc)] = acc_meta(ACCS[sc], f"_s{sc}")

meta["bags"] = {}
for name, dirs in bags.items():
    meta["bags"][name] = {"label": BAG_LABEL[name]}
    for d in ("down", "left", "up"):
        v = dirs[d]
        s = trim(v["sprite"]) if v["has"] else None
        if s is None:
            meta["bags"][name][d] = None
            continue
        ys, xs = np.where(v["sprite"][..., 3] > 0)
        ox, oy = v["ox"] + int(xs.min()), v["oy"] + int(ys.min())
        key = f"bag_{name}_{d}"
        sprites.append((key, s))
        meta["bags"][name][d] = {"key": key, "ax": int(round(ox)), "ay": int(oy), "w": s.shape[1]}
        if d == "left":
            sprites.append((f"bag_{name}_right", s[:, ::-1].copy()))
            meta["bags"][name]["right"] = {"key": f"bag_{name}_right", "ax": int(round(-ox - s.shape[1])),
                                           "ay": int(oy), "w": s.shape[1]}

W = 1024
x = y = rowh = 0
places = {}
for key, s in sprites:
    h, w = s.shape[:2]
    if x + w > W:
        x, y, rowh = 0, y + rowh + 1, 0
    places[key] = (x, y, w, h)
    x += w + 1
    rowh = max(rowh, h)
atlas = np.zeros((y + rowh + 1, W, 4), np.uint8)
for key, s in sprites:
    px, py, w, h = places[key]
    atlas[py:py + h, px:px + w] = s
Image.fromarray(atlas).save(OUT / "atlas.png")
meta["frames"] = {k: {"x": v[0], "y": v[1], "w": v[2], "h": v[3]} for k, v in places.items()}
(OUT / "atlas.json").write_text(json.dumps(meta, indent=1))
print("sprites:", len(sprites), "atlas:", atlas.shape)
for name in SETS:
    print(name, {d: [(f["attachY"], f["tintBelow"], places[f["key"]][3]) for f in v]
                 for d, v in meta["sets"][name].items() if d != "label"})
