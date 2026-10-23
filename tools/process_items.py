"""Sheet ikon/lencana/emote (assets/ui/items_all_in_one.jpg) -> sprite transparan satuan.

Latar magenta (JPEG berisik) dibuang; sprite dipisah per komponen (dilasi 10 px agar bagian yang terpisah,
mis. garis spinner, tetap satu sprite); diurutkan baris demi baris. 1 piksel seni ~ 7 px sumber.
Hasil: export/ui/items/{sprites_hd,sprites}/NN_nama.png + atlas.json
  sprites_hd : potongan resolusi penuh (untuk UI HTML/CSS; perbesar tajam dengan image-rendering: pixelated)
  sprites    : diperkecil 7x (resolusi seni asli, ± 24-40 px) untuk dipakai di dalam game
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "ui" / "items_all_in_one.jpg"
OUT = ROOT / "export" / "ui" / "items"
PX = 7

NAMES = (
    "buku_biru buku_oranye buku_terbuka jendela_kode presentasi editor_kode terminal diagram_alir "
    "ulang kisi_tabel kaca_pembesar_tabel bohlam otak_sirkuit robot laptop folder "
    "tanya centang silang jam_pasir stopwatch piala_emas piala_perak piala_perunggu "
    "bintang tangan_angkat papan_ketik_centang podium panah_bawah seru kursor_sorot jari_sentuh "
    "lencana_salam lencana_pintu lencana_buku lencana_ulang lencana_tabel lencana_bug lencana_bebek lencana_piala "
    "lencana_bintang lencana_kopi lencana_obrolan lencana_cabang lencana_petir lencana_perisai lencana_cip lencana_toga "
    "emote_senyum emote_tawa emote_ceria emote_hati emote_jempol emote_tanya emote_seru emote_info emote_keringat emote_tidur "
    "emote_ide emote_tepuk emote_tepuk_2 emote_lambai kopi bug spinner_a spinner_b emote_centang api"
).split()

a = np.array(Image.open(SRC).convert("RGB")).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
magenta = (r > 150) & (b > 150) & (g < 120) & (np.abs(r - b) < 70)
alpha = ndi.binary_opening(~magenta, iterations=2)
alpha = ndi.binary_erosion(alpha, iterations=2)                 # buang tepi merah muda sisa kompresi JPEG
rgba = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])

lab, n = ndi.label(ndi.binary_dilation(alpha, iterations=10))
items = []
for i, sl in enumerate(ndi.find_objects(lab), 1):
    m = (lab[sl] == i) & alpha[sl]
    ys, xs = np.where(m)
    if len(ys) < 300:
        continue
    y0, y1, x0, x1 = sl[0].start + ys.min(), sl[0].start + ys.max() + 1, sl[1].start + xs.min(), sl[1].start + xs.max() + 1
    items.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "cy": (y0 + y1) / 2, "cx": (x0 + x1) / 2, "id": i})

items.sort(key=lambda t: t["cy"])
rows, cur = [], [items[0]]                                     # kelompokkan per baris menurut gap tengah-y
for t in items[1:]:
    if t["cy"] - np.mean([u["cy"] for u in cur]) > 110:
        rows.append(cur)
        cur = [t]
    else:
        cur.append(t)
rows.append(cur)


def merge_row(row, gap=25):
    """Gabungkan komponen dalam satu baris yang rentang x-nya tumpang tindih/berdekatan (mis. garis spinner, uap kopi)."""
    row = sorted(row, key=lambda t: t["x0"])
    groups = [[row[0]]]
    for t in row[1:]:
        if t["x0"] - max(u["x1"] for u in groups[-1]) <= gap:
            groups[-1].append(t)
        else:
            groups.append([t])
    out = []
    for gp in groups:
        out.append({"x0": min(u["x0"] for u in gp), "y0": min(u["y0"] for u in gp), "x1": max(u["x1"] for u in gp),
                    "y1": max(u["y1"] for u in gp), "ids": [u["id"] for u in gp],
                    "cx": (min(u["x0"] for u in gp) + max(u["x1"] for u in gp)) / 2})
    return out


ordered = [t for row in rows for t in merge_row(row)]
print("baris:", [len(r_) for r_ in rows], "total", len(ordered), "nama", len(NAMES))
if len(ordered) != len(NAMES):
    raise SystemExit("jumlah sprite tidak sama dengan daftar nama; periksa pemisahan")

for d in ("sprites_hd", "sprites"):
    (OUT / d).mkdir(parents=True, exist_ok=True)
    for f in (OUT / d).glob("*.png"):
        f.unlink()
atlas = []
for k, (t, nm) in enumerate(zip(ordered, NAMES), 1):
    sub = np.zeros_like(rgba[t["y0"]:t["y1"], t["x0"]:t["x1"]])
    mask = np.isin(lab[t["y0"]:t["y1"], t["x0"]:t["x1"]], t["ids"])
    sub[mask] = rgba[t["y0"]:t["y1"], t["x0"]:t["x1"]][mask]
    im = Image.fromarray(sub)
    im.save(OUT / "sprites_hd" / f"{k:02d}_{nm}.png")
    small = im.resize((max(1, round(im.width / PX)), max(1, round(im.height / PX))), Image.NEAREST)
    small.save(OUT / "sprites" / f"{k:02d}_{nm}.png")
    atlas.append({"id": k, "nama": nm, "x": int(t["x0"]), "y": int(t["y0"]), "w": im.width, "h": im.height,
                  "w1x": small.width, "h1x": small.height})
(OUT / "atlas.json").write_text(json.dumps({"sumber": SRC.name, "pxSumber": PX, "sprite": atlas}, indent=1), encoding="utf-8")
print("sprite", len(atlas), "->", OUT)
