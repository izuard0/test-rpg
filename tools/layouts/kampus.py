"""Peta KAMPUS: satu denah gedung dikelilingi pinggiran rumput (83 x 52 petak).

Rujukan: video csbinussmg (denah satu gedung dari atas; ruangan berlantai beda warna dan padat isi,
dihubungkan koridor lebar; dinding selatan berjendela; halaman hanya jalur rumput tipis berpohon di tepi).
Susunan: lobi (kiri) + perpustakaan (kanan) di atas, koridor memanjang di tengah, lima ruangan kecil
di bawah (Ruang Diskusi A, Vestibul/pintu depan, Bilik Fokus, Ruang Santai, Ruang Diskusi B).

Lobi dan perpustakaan memakai tata letak terpisah (lobi.py, perpustakaan.py) yang digeser ke sini.
Kelas (kelas-a/b/c) tetap peta terpisah; pintunya di dinding kiri lobi (area interaksi di dalam lobi).
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
LF_, LFU, LTE, LOF = "library_floor_wall", "library_furniture", "library_terminals", "lobby_furniture"
W, H = 83, 52
OX, OY = 4, 4                                    # pojok kiri-atas lobi
LX, LY = OX + 39, OY                             # pojok perpustakaan (berbagi dinding timur lobi)
CY = OY + 27                                     # dinding selatan lobi/perpustakaan = dinding utara koridor (y=31)
RY, RH = 36, 12                                  # ruangan kecil: dinding atas y=36, dinding bawah y=47
SW = RY + RH - 1                                 # dinding selatan gedung


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


def out(spr, foot, scale=2, sheet=OD, **kw):
    objects.append({"sprite": (sheet, spr), "foot": foot, "scale": scale, **kw})


def tiles(prefix, sheet, letters):
    return [(f"{prefix}{c}", (sheet, f"{prefix}{c}")) for c in letters]


GREY = tiles("lantai_", CF, "abcd")
PARKET = tiles("lantai_parket_", LF_, "abcd")
NAVY = [("karpet_navy_a", (LF_, "karpet_navy_a")), ("karpet_navy_b", (LF_, "karpet_navy_b"))]
CWALL = {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
         "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))]}
LWALL = {"dark": ("panel_navy_gelap", (LF_, "panel_navy_gelap")),
         "face": [("dinding_krem_a", (LF_, "dinding_krem_a")), ("dinding_krem_b", (LF_, "dinding_krem_b"))]}
NORUG = {"rect": [-1, -1, -1, -1], "tiles": [NAVY[0]]}

# ruangan kecil: (nama, x, lebar, lantai, dinding, karpet); lebar termasuk dua dinding samping (dibagi dengan tetangga)
ROOMS = [
    ("diskusi-a", 4, 13, GREY, CWALL, NORUG),
    ("vestibul", 16, 17, PARKET, LWALL, NORUG),
    ("bilik-fokus", 32, 16, GREY, CWALL, {"rect": [33, 38, 46, 46], "tiles": NAVY}),
    ("santai", 47, 17, PARKET, LWALL, {"rect": [49, 40, 61, 45], "tiles": NAVY}),
    ("diskusi-b", 63, 16, PARKET, LWALL, NORUG),
]
small = [{"name": nm, "rect": [x, RY, w, RH], "floor": {"base": fl, "carpet": rug},
          "wall": {**wl, "top_rows": 2, "face_rows": 1, "openings": []}} for nm, x, w, fl, wl, rug in ROOMS]

DOOR_X = [9, 23, 39, 54, 70]                     # bukaan di dinding atas tiap ruangan (3 petak, 2 baris)
OPEN = [[OX + 19, CY, 3, 1], [LX + 16, CY, 3, 1], [LX, LY + 10, 1, 3], [23, SW, 3, 1]]
OPEN += [[x, RY, 3, 2] for x in DOOR_X]

# jendela di dinding selatan gedung
for x in [6, 10, 34, 38, 42, 50, 54, 58, 66, 70, 74]:
    objects.append({"sprite": (CF, "jendela_gabung_a"), "foot": [x, SW, 3, 1], "collide": False})

# koridor
for x in [6, 40, 75]:
    out("tanaman_besar", [x, 35, 2, 1], sheet=LOF)
for x in [14, 33, 52, 68]:
    out("tempat_sampah_a", [x, 35, 1, 1], sheet=LOF)

# ruang diskusi A dan B: meja panjang, papan tulis, tanaman
for x0 in (4, 63):
    out("meja_baca_panjang", [x0 + 3, 40, 8, 5], sheet=LFU)
    out("papan_tulis_beroda", [x0 + 2, 38, 3, 1], sheet=LFU)
    out("tanaman_pakis", [x0 + 10, 38, 2, 1], sheet=LFU)
# bilik fokus
for (x, y) in [(34, 39), (41, 39), (34, 43), (41, 43)]:
    out("bilik_belajar_tiga", [x, y, 6, 3], sheet=LTE)
# ruang santai
for spr, foot in [("sofa_sudut", [50, 41, 5, 1]), ("sofa_panjang", [57, 41, 4, 1]), ("meja_bulat", [55, 44, 2, 1]),
                  ("bean_navy", [50, 45, 2, 1]), ("bean_oranye", [58, 45, 2, 1]), ("tanaman_besar", [48, 38, 2, 1]),
                  ("tanaman_besar", [61, 38, 2, 1]), ("dispenser_air", [60, 38, 1, 1])]:
    out(spr, foot, sheet=LOF)
# vestibul: pintu depan di selatan, sejajar dengan bukaan ke koridor dan lobi
for foot in ([17, 38, 2, 1], [29, 38, 2, 1]):
    out("tanaman_besar", foot, sheet=LOF)
for x in (18, 28):
    out("sofa_tunggal_biru_1", [x, 44, 2, 2], sheet=LFU)

# hiasan tepi: pohon (jarang), semak di kaki dinding selatan, bangku, lampu, petak bunga
for x in [2, 10, 18, 26, 34, 42, 50, 58, 66, 74]:
    out("pohon_besar" if (x // 8) % 2 else "pohon_rimbun", [x, 4, 2, 1])
for y in [10, 18, 26, 34, 42]:
    out("pohon_besar", [1, y, 2, 1])
    out("pohon_rimbun", [80, y, 2, 1])
for x in [3, 45, 79]:
    out("pohon_besar" if x % 2 else "pohon_rimbun", [x, 51, 2, 1])
for x in [6, 10, 14, 34, 38, 42, 52, 56, 60, 66, 70, 74]:
    out("semak_kecil", [x, 48, 2, 1])
out("petak_bunga_panjang", [13, 49, 5, 1], collide=False)
out("petak_bunga_panjang", [29, 49, 5, 1], collide=False)
out("bangku_a", [18, 50, 2, 1])
out("bangku_a", [27, 50, 2, 1])
out("lampu_taman", [21, 49, 1, 1])
out("lampu_taman", [27, 49, 1, 1])
out("rak_sepeda", [54, 50, 3, 1])
out("sepeda_merah", [58, 50, 1, 1], collide=False)
out("sepeda_biru", [60, 50, 1, 1], collide=False)
out("bangku_b", [66, 50, 2, 1])
out("pot_batu_bunga", [72, 50, 1, 1], scale=3)

STONE = [(f"batu_{c}", ("outdoor_ground", f"batu_{c}")) for c in "abcd"]
GRASS = [(f"rumput_{c}", ("outdoor_ground", f"rumput_{c}")) for c in "abcd"]

lf = lobi.LAYOUT["floor"]
pf = lib.LAYOUT["floor"]
lobi_rugs = [shift_rect(r, OX, OY) for r in lf["carpet"]["rect"]]
lib_rug = shift_rect(pf["carpet"]["rect"], LX, LY)
lw = {**lobi.LAYOUT["wall"], "openings": []}
pw = {**lib.LAYOUT["wall"], "openings": []}

doors = []                                       # pintu kelas: area interaksi di sisi dalam lobi
for d in lobi.doors:
    if d["target"] != "perpustakaan":
        doors.append({**d, "rect": [OX + 1, OY + d["rect"][1], 1, 3]})

corridor = {"name": "koridor", "rect": [OX, CY, 75, 6], "floor": {"base": GREY, "carpet": NORUG},
            "wall": {**CWALL, "top_rows": 1, "face_rows": 1, "openings": []}}

LAYOUT = {
    "id": "kampus", "title": "Kampus Prodi Informatika", "w": W, "h": H, "capacity": 150,
    "ground": {"base": GRASS, "paths": [{"rect": [23, SW + 1, 25, SW + 4], "tiles": STONE}]},
    "regions": [
        {"name": "lobi", "rect": [OX, OY, 40, 28],
         "floor": {"base": lf["base"], "carpet": {"rect": lobi_rugs, "tiles": lf["carpet"]["tiles"]}}, "wall": lw},
        {"name": "perpustakaan", "rect": [LX, LY, 36, 28],
         "floor": {"base": pf["base"], "carpet": {"rect": lib_rug, "tiles": pf["carpet"]["tiles"]}}, "wall": pw},
        corridor,
    ] + small,
    "openings": OPEN,
    "objects": objects,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [24.5, 43]},
               {"name": "dari_lab_lovelace", "tile": [OX + 2.5, OY + 9.5]},
               {"name": "dari_kelas_b", "tile": [OX + 2.5, OY + 15.5]},
               {"name": "dari_kelas_c", "tile": [OX + 2.5, OY + 21.5]}],
    "zones": [{"name": "luar", "rect": [0, 0, W, H], "chatRadius": 3, "chatPublic": True},
              {"name": "lobi", "rect": [OX, OY, 40, 28], "chatRadius": 3, "chatPublic": True},
              {"name": "perpustakaan", "rect": [LX, LY, 36, 28], "chatRadius": 3, "chatPublic": False},
              {"name": "koridor", "rect": [OX, CY, 75, 6], "chatRadius": 3, "chatPublic": True},
              {"name": "diskusi-a", "rect": [4, RY, 13, RH], "chatRadius": 99, "chatPublic": False},
              {"name": "bilik-fokus", "rect": [32, RY, 16, RH], "chatRadius": 3, "chatPublic": False},
              {"name": "santai", "rect": [47, RY, 17, RH], "chatRadius": 3, "chatPublic": False},
              {"name": "diskusi-b", "rect": [63, RY, 16, RH], "chatRadius": 99, "chatPublic": False}],
}
