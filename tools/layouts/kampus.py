"""Peta KAMPUS: satu denah gedung (lobi + perpustakaan) dikelilingi pinggiran rumput (83 x 36 petak).

Rujukan: video csbinussmg (denah satu gedung dari atas; ruangan berlantai beda warna dan padat isi;
dinding selatan berjendela; halaman hanya jalur rumput tipis berpohon di tepi). Karena itu:
tanpa gedung depan, plaza, atau air mancur; luar ruangan hanya hiasan di tepi.

Lobi dan perpustakaan memakai tata letak terpisah (lobi.py, perpustakaan.py) yang digeser ke sini.
Kelas (kelas-a/b/c) tetap peta terpisah; pintunya ada di dinding kiri lobi (area interaksi di dalam lobi).
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
OD, CF = "outdoor", "classroom_floor_wall"
W, H = 83, 36
OX, OY = 4, 4                                    # pojok kiri-atas lobi
LX, LY = OX + 39, OY                             # pojok perpustakaan (berbagi dinding timur lobi)


def shift(o, dx, dy):
    o = dict(o)
    o["foot"] = [o["foot"][0] + dx, o["foot"][1] + dy, *o["foot"][2:]]
    if o.get("interact"):
        i = o["interact"]
        o["interact"] = [i[0] + dx, i[1] + dy, *i[2:]]
    return o


def shift_rect(r, dx, dy):
    return [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]


objects = []
for o in lobi.objects:                           # buang pintu perpustakaan lama (kini bukaan terbuka)
    if o.get("sprite") == ("lobby_doors", "pintu_kayu") and o["foot"][0] == 39:
        continue
    objects.append(shift(o, OX, OY))
for o in lib.objects:
    objects.append(shift(o, LX, LY))


def out(spr, foot, scale=2, **kw):
    objects.append({"sprite": (OD, spr), "foot": foot, "scale": scale, **kw})


# jendela di dinding selatan (terlihat dari halaman)
SY = OY + 27
for x in [OX + 5, OX + 9, OX + 13, OX + 27, OX + 31, OX + 35]:
    objects.append({"sprite": (CF, "jendela_gabung_a"), "foot": [x, SY, 3, 1], "collide": False})
for x in range(LX + 4, LX + 33, 4):
    objects.append({"sprite": (CF, "jendela_gabung_a"), "foot": [x, SY, 3, 1], "collide": False})

# hiasan tepi: pohon di sekeliling (pusat pohon di foot), semak di kaki dinding selatan
for x in [2, 10, 18, 26, 34, 42, 50, 58, 66, 74]:
    out("pohon_besar" if (x // 8) % 2 else "pohon_rimbun", [x, 4, 2, 1])
for y in [10, 18, 26]:
    out("pohon_besar", [1, y, 2, 1])
    out("pohon_rimbun", [80, y, 2, 1])
for x in [3, 41, 79]:
    out("pohon_besar" if x % 2 else "pohon_rimbun", [x, 35, 2, 1])
for x in [OX + 2, OX + 6, OX + 10, OX + 14, OX + 28, OX + 32, OX + 36, LX + 3, LX + 11, LX + 19, LX + 27, LX + 33]:
    out("semak_kecil", [x, 32, 2, 1])
out("petak_bunga_panjang", [OX + 7, 33, 5, 1], collide=False)
out("petak_bunga_panjang", [OX + 29, 33, 5, 1], collide=False)
out("bangku_a", [OX + 15, 34, 2, 1])
out("bangku_a", [OX + 25, 34, 2, 1])
out("lampu_taman", [OX + 17, 33, 1, 1])
out("lampu_taman", [OX + 24, 33, 1, 1])
out("rak_sepeda", [LX + 6, 34, 3, 1])
out("sepeda_merah", [LX + 10, 34, 1, 1], collide=False)
out("sepeda_biru", [LX + 12, 34, 1, 1], collide=False)
out("bangku_b", [LX + 22, 34, 2, 1])
out("pot_batu_bunga", [LX + 28, 34, 1, 1], scale=3)

STONE = [(f"batu_{c}", ("outdoor_ground", f"batu_{c}")) for c in "abcd"]
GRASS = [(f"rumput_{c}", ("outdoor_ground", f"rumput_{c}")) for c in "abcd"]

lf = lobi.LAYOUT["floor"]
lobi_rugs = [shift_rect(r, OX, OY) for r in lf["carpet"]["rect"]]
lw = dict(lobi.LAYOUT["wall"])
lw["openings"] = [[LX, LY + 10, 1, 3], [OX + 19, SY, 3, 1]]       # ke perpustakaan, ke halaman (pintu depan)
pw = dict(lib.LAYOUT["wall"])
pw["openings"] = [[LX, LY + 10, 1, 3]]
pf = lib.LAYOUT["floor"]
lib_rug = shift_rect(pf["carpet"]["rect"], LX, LY)

# pintu kelas: sprite di dinding, area interaksi di sisi dalam lobi
doors = []
for d in lobi.doors:
    if d["target"] == "perpustakaan":
        continue
    doors.append({**d, "rect": [OX + 1, OY + d["rect"][1], 1, 3]})

LAYOUT = {
    "id": "kampus", "title": "Kampus Prodi Informatika", "w": W, "h": H, "capacity": 150,
    "ground": {"base": GRASS, "paths": [{"rect": [OX + 19, SY + 1, OX + 21, SY + 4], "tiles": STONE}]},
    "regions": [
        {"name": "lobi", "rect": [OX, OY, 40, 28],
         "floor": {"base": lf["base"], "carpet": {"rect": lobi_rugs, "tiles": lf["carpet"]["tiles"]}}, "wall": lw},
        {"name": "perpustakaan", "rect": [LX, LY, 36, 28],
         "floor": {"base": pf["base"], "carpet": {"rect": lib_rug, "tiles": pf["carpet"]["tiles"]}}, "wall": pw},
    ],
    "objects": objects,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [OX + 20.5, OY + 23]},
               {"name": "dari_lab_lovelace", "tile": [OX + 2.5, OY + 9.5]},
               {"name": "dari_kelas_b", "tile": [OX + 2.5, OY + 15.5]},
               {"name": "dari_kelas_c", "tile": [OX + 2.5, OY + 21.5]}],
    "zones": [{"name": "luar", "rect": [0, 0, W, H], "chatRadius": 3, "chatPublic": True},
              {"name": "lobi", "rect": [OX, OY, 40, 28], "chatRadius": 3, "chatPublic": True},
              {"name": "perpustakaan", "rect": [LX, LY, 36, 28], "chatRadius": 3, "chatPublic": False}],
}
