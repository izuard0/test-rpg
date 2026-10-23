"""Peta KAMPUS: halaman luar + lobi + perpustakaan dalam satu peta terhubung (72 x 54 petak).

Lobi dan perpustakaan memakai tata letak terpisah (lobi.py, perpustakaan.py) yang digeser ke sini.
Kelas (kelas-a/b/c) tetap peta terpisah lewat pintu di dinding kiri lobi.
Gedung depan digambar 2x dan menempel di dinding selatan lobi; pemain masuk lewat pintunya
(Phaser: urutkan kedalaman menurut tepi bawah sprite, sehingga pemain 'masuk' di balik gedung).
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lobi, lib = load("lobi"), load("perpustakaan")
OD = "outdoor"
W, H = 78, 54
LX, LY = 39, 4                                   # pojok perpustakaan di peta kampus


def shift(o, dx, dy):
    o = dict(o)
    o["foot"] = [o["foot"][0] + dx, o["foot"][1] + dy, *o["foot"][2:]]
    if o.get("interact"):
        i = o["interact"]
        o["interact"] = [i[0] + dx, i[1] + dy, *i[2:]]
    return o


objects = []
# lobi: buang pintu ke perpustakaan (sekarang bukaan terbuka)
for o in lobi.objects:
    if o.get("sprite") == ("lobby_doors", "pintu_kayu") and o["foot"][0] == 39:
        continue
    objects.append(o)
doors = [d for d in lobi.doors if d["target"] != "perpustakaan"]
# perpustakaan: geser
for o in lib.objects:
    objects.append(shift(o, LX, LY))


def out(spr, foot, scale=2, **kw):
    objects.append({"sprite": (OD, spr), "foot": foot, "scale": scale, **kw})


# gedung depan menempel di dinding selatan lobi, pintu di x = 20,5 petak
out("gedung_depan", [15, 37, 11, 1], collide=False, type="facade", name="gedung_depan")
BLOCKS = [[15, 28, 4, 9], [22, 28, 4, 9]]        # sayap gedung; lorong x=19..21 terbuka
# halaman: semak dan petak bunga di sayap gedung
for x in [2, 5, 8, 11, 28, 31, 34, 37]:
    out("semak_kecil", [x, 29, 2, 1])
for x in [5, 30]:
    out("petak_bunga_panjang", [x, 31, 5, 1], collide=False)
for x in [3, 13, 27, 36]:
    out("lampu_taman", [x, 36, 1, 1])
# air mancur dan bangku
out("air_mancur", [17, 50, 7, 1], type="landmark", name="air_mancur", props={"landmark": "fountain"})
for x, y in [(11, 46), (28, 46)]:
    out("bangku_a", [x, y, 2, 1])
for x, y in [(11, 49), (28, 49)]:
    out("bangku_b", [x, y, 2, 1])
for x in [9, 31]:
    out("lampu_taman", [x, 44, 1, 1])
# pohon besar (pusat pohon di foot)
for x, y in [(2, 41), (6, 37), (34, 39), (37, 35), (2, 48), (6, 52), (33, 52), (37, 48)]:
    out("pohon_besar", [x, y, 2, 1])
for x, y in [(44, 37), (53, 39), (62, 37), (70, 45), (47, 47), (57, 51), (66, 52), (74, 40)]:
    out("pohon_rimbun", [x, y, 2, 1])
for x in [41, 49, 57, 65, 73]:
    out("pohon_besar", [x, 3, 2, 1])
# sudut sepeda dan taman kecil di timur
out("rak_sepeda", [41, 36, 3, 1])
out("sepeda_merah", [45, 36, 1, 1], collide=False)
out("sepeda_biru", [47, 36, 1, 1], collide=False)
out("bangku_a", [52, 36, 2, 1])
out("bangku_b", [58, 42, 2, 1])
out("pot_batu_bunga", [50, 44, 1, 1], scale=3)
for x, y in [(55, 46), (60, 47), (72, 38), (40, 40), (42, 50), (75, 50)]:
    out("semak_ganda", [x, y, 2, 1], scale=2)
for x, y in [(44, 44), (63, 44), (50, 38)]:
    out("petak_bunga_kecil", [x, y, 4, 1], scale=3, collide=False)

STONE = [(f"batu_{c}", ("outdoor_ground", f"batu_{c}")) for c in "abcd"]
GRASS = [(f"rumput_{c}", ("outdoor_ground", f"rumput_{c}")) for c in "abcd"]

lw = dict(lobi.LAYOUT["wall"])
lw["openings"] = [d["rect"] for d in doors] + [[39, 14, 1, 3], [19, 27, 3, 1]]
pw = dict(lib.LAYOUT["wall"])
pw["openings"] = [[39, 14, 1, 3]]
pf = lib.LAYOUT["floor"]
lib_rug = [LX + pf["carpet"]["rect"][0], LY + pf["carpet"]["rect"][1], LX + pf["carpet"]["rect"][2], LY + pf["carpet"]["rect"][3]]

LAYOUT = {
    "id": "kampus", "title": "Kampus Prodi Informatika", "w": W, "h": H, "capacity": 150,
    "ground": {"base": GRASS, "paths": [
        {"rect": [18, 39, 22, 44], "tiles": STONE},
        {"rect": [12, 44, 28, 52], "tiles": STONE},
        {"rect": [1, 41, 76, 42], "tiles": STONE},
    ]},
    "regions": [
        {"name": "lobi", "rect": [0, 0, 40, 28], "floor": lobi.LAYOUT["floor"], "wall": lw},
        {"name": "perpustakaan", "rect": [LX, LY, 36, 28],
         "floor": {"base": pf["base"], "carpet": {"rect": lib_rug, "tiles": pf["carpet"]["tiles"]}}, "wall": pw},
    ],
    "objects": objects,
    "blocks": BLOCKS,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [20.5, 40]}, {"name": "dari_lab_lovelace", "tile": [2.5, 9.5]},
               {"name": "dari_kelas_b", "tile": [2.5, 15.5]}, {"name": "dari_kelas_c", "tile": [2.5, 21.5]}],
    "zones": [{"name": "luar", "rect": [0, 28, W, H - 28], "chatRadius": 3, "chatPublic": True},
              {"name": "lobi", "rect": [0, 0, 40, 28], "chatRadius": 3, "chatPublic": True},
              {"name": "perpustakaan", "rect": [LX, LY, 36, 28], "chatRadius": 3, "chatPublic": False}],
}
