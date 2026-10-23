"""Peta KAMPUS v3: satu denah gedung (100 x 62 petak), dirancang dari seluruh aset yang ada.

Rujukan: video csbinussmg (denah gedung dari atas; ruangan berlantai beda warna, padat isi, koridor lebar,
dinding berjendela, halaman hanya hiasan tepi). Rancangan: docs/PETA.md bagian 9.

  utara   (y 4-24)  : Lab Lovelace | Ruang Kolaborasi | Auditorium Turing | Bilik Fokus / Ruang Diskusi A
  koridor (y 24-30) : tulang punggung timur-barat; semua ruangan membuka ke sini
  selatan (y 30-57) : Lobi | Perpustakaan | Ruang Santai / Ruang Diskusi B ; pintu depan di selatan lobi

Kelas (kelas-a/b/c) digambar 'tampak' (cutaway): interior terlihat tetapi tidak bisa dijalani; pemain masuk lewat
pintunya (peta terpisah). Aturan skala: benda yang diduduki/dipakai 1x, dekorasi/besar 2x (lihat tiap tata letak).
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lobi, lib = load("lobi"), load("perpustakaan")
ka, kb, kc = load("kelas-a"), load("kelas-b"), load("kelas-c")
OD, CF = "outdoor", "classroom_floor_wall"
LF_, LFU, LTE, LOF, LTC = "library_floor_wall", "library_furniture", "library_terminals", "lobby_furniture", "lobby_tech"
RS = "room_signs"
W, H = 100, 62
NY, NH = 4, 21                                   # pita utara: y 4..24
CY, CH = 24, 7                                   # koridor: dinding y=24 (utara) dan y=30 (selatan), dalam y 25..29
SY, SH = 30, 28                                  # pita selatan: y 30..57
OX = 4                                           # tepi barat gedung
LX = OX + 39                                     # perpustakaan (berbagi dinding timur lobi)
EX = 78                                          # kolom timur pita selatan (berbagi dinding timur perpustakaan)
NX = 73                                          # kolom timur pita utara
SW = SY + SH - 1                                 # dinding selatan gedung (y=57)


def shift(o, dx, dy):
    o = dict(o)
    o["foot"] = [o["foot"][0] + dx, o["foot"][1] + dy, *o["foot"][2:]]
    if o.get("collide_rect"):
        c = o["collide_rect"]
        o["collide_rect"] = [c[0] + dx, c[1] + dy, *c[2:]]
    if o.get("interact"):
        i = o["interact"]
        o["interact"] = [i[0] + dx, i[1] + dy, *i[2:]]
    return o


def shift_rect(r, dx, dy):
    return [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]


def decor_only(o):
    """Objek kelas untuk tampilan 'tampak': hanya yang bergambar; tanpa interaksi atau tabrakan."""
    o = dict(o)
    o.pop("interact", None)
    o.pop("props", None)
    o["type"], o["collide"] = "decor", False
    return o


objects = []
for o in lobi.objects:                           # pintu kelas lama di dinding lobi dibuang (kini di koridor)
    if o.get("sprite") == ("lobby_doors", "pintu_kayu"):
        continue
    objects.append(shift(o, OX, SY))
for o in lib.objects:
    objects.append(shift(o, LX, SY))
for mod, ox in ((ka, 4), (kb, 23), (kc, 46)):
    for o in mod.objects:
        if o.get("door") or not o.get("sprite"):
            continue
        objects.append(decor_only(shift(o, ox, NY)))


def put(spr, foot, scale=2, sheet=OD, **kw):
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


def room(name, x, y, w, h, floor, wall, rug=NORUG, cutaway=False, top_rows=2):
    return {"name": name, "rect": [x, y, w, h], "cutaway": cutaway, "floor": {"base": floor, "carpet": rug},
            "wall": {**wall, "top_rows": top_rows, "face_rows": 1, "openings": []}}


lf = lobi.LAYOUT["floor"]
pf = lib.LAYOUT["floor"]
lobi_rugs = [shift_rect(r, OX, SY) for r in lf["carpet"]["rect"]]
lib_rug = shift_rect(pf["carpet"]["rect"], LX, SY)

regions = [
    {"name": "lobi", "rect": [OX, SY, 40, 28],
     "floor": {"base": lf["base"], "carpet": {"rect": lobi_rugs, "tiles": lf["carpet"]["tiles"]}},
     "wall": {**lobi.LAYOUT["wall"], "openings": []}},
    {"name": "perpustakaan", "rect": [LX, SY, 36, 28],
     "floor": {"base": pf["base"], "carpet": {"rect": lib_rug, "tiles": pf["carpet"]["tiles"]}},
     "wall": {**lib.LAYOUT["wall"], "openings": []}},
    room("santai", EX, SY, 18, 15, PARKET, LWALL, {"rect": [80, 35, 93, 42], "tiles": NAVY}),
    room("diskusi-b", EX, 44, 18, 14, PARKET, LWALL),
    room("kelas-a", 4, NY, 20, NH, GREY, CWALL, cutaway=True),
    room("kelas-b", 23, NY, 24, NH, GREY, CWALL, cutaway=True),
    room("kelas-c", 46, NY, 28, NH, GREY, CWALL, cutaway=True),
    room("bilik-fokus", NX, NY, 23, 11, GREY, CWALL),
    room("diskusi-a", NX, 14, 23, 11, PARKET, LWALL),
    {"name": "koridor", "rect": [OX, CY, 92, CH], "floor": {"base": GREY, "carpet": NORUG},
     "wall": {**CWALL, "top_rows": 1, "face_rows": 1, "openings": []}},
]

# bukaan: koridor <-> lobi (2), koridor <-> perpustakaan, lobi <-> perpustakaan, perpustakaan <-> Diskusi B,
# koridor <-> Santai, koridor <-> Diskusi A, Diskusi A <-> Bilik Fokus, pintu depan
OPEN = [[19, SY, 3, 5], [31, SY, 3, 5], [LX + 16, SY, 3, 3], [LX, SY + 10, 1, 3], [EX, 49, 1, 3],
        [86, SY, 3, 2], [84, CY, 3, 1], [84, 14, 3, 2], [23, SW, 3, 1]]

# ---- koridor: pintu kelas (sprite + papan nama berwarna + area interaksi), tanaman, kios, tempat sampah
doors = []
for (nm, tgt, spawn, dx, sign, label) in [
        ("kelas-a", "kelas-a", "dari_lab_lovelace", 12, "papan_biru", "Lab Lovelace"),
        ("kelas-b", "kelas-b", "dari_kelas_b", 34, "papan_oranye", "Ruang Kolaborasi"),
        ("kelas-c", "kelas-c", "dari_kelas_c", 59, "papan_biru_menyala", "Auditorium Turing")]:
    objects.append({"sprite": (CF, "pintu_kelas"), "foot": [dx, CY + 1, 1, 1], "collide": False})
    objects.append({"sprite": (RS, sign), "foot": [dx + 2, CY, 1, 1], "collide": False})
    doors.append({"rect": [dx - 1, CY + 2, 3, 1], "target": tgt, "spawn": spawn, "label": label})
for x in [6, 90]:
    put("tanaman_besar", [x, 29, 2, 1], sheet=LOF)
put("kios_nyala", [48, 29, 3, 1], sheet=LTC, type="info", name="kios_koridor", props={"info": "peta"},
    interact=[48, 28, 3, 1])
for x in [16, 40, 64, 78]:
    put("tempat_sampah_a", [x, 29, 1, 1], sheet=LOF)
objects.append({"sprite": (RS, "papan_hijau"), "foot": [LX + 19, SY, 1, 1], "collide": False})
objects.append({"sprite": (RS, "papan_oranye"), "foot": [87, 14, 1, 1], "collide": False})

# ---- Bilik Fokus (x73..95, y4..14): 8 bilik belajar 1x, pintu ke Diskusi A di tengah bawah
for x in (75, 79, 88, 92):
    for y in (7, 10):
        put("bilik_belajar_tiga", [x, y, 3, 2], scale=1, sheet=LTE)
for x, y in [(74, 12), (93, 12)]:
    put("tanaman_pakis", [x, y, 2, 1], sheet=LFU)

# ---- Ruang Diskusi A (x73..95, y14..24)
for x in (76, 88):
    put("meja_baca_panjang", [x, 18, 4, 3], scale=1, sheet=LFU)
put("papan_tulis_beroda", [75, 16, 2, 1], sheet=LFU)
put("papan_tulis_beroda", [92, 16, 2, 1], sheet=LFU)
put("tanaman_pakis", [93, 22, 2, 1], sheet=LFU)

# ---- Ruang Santai (x78..95, y30..44)
for spr, foot, sc in [("sofa_sudut", [80, 35, 3, 1], 1), ("sofa_panjang", [90, 35, 2, 1], 1), ("meja_bulat", [85, 38, 1, 1], 1),
                      ("bean_navy", [81, 40, 1, 1], 1), ("bean_oranye", [88, 40, 1, 1], 1), ("bean_abu", [91, 40, 1, 1], 1),
                      ("dispenser_air", [93, 33, 1, 1], 2), ("tanaman_besar", [79, 33, 2, 1], 2)]:
    put(spr, foot, scale=sc, sheet=LOF)

# ---- Ruang Diskusi B (x78..95, y44..57): pintu dari perpustakaan di barat
for x in (82, 89):
    put("meja_baca_panjang", [x, 49, 4, 3], scale=1, sheet=LFU)
put("papan_tulis_beroda", [81, 46, 2, 1], sheet=LFU)
put("tanaman_pakis", [92, 55, 2, 1], sheet=LFU)

# ---- jendela di dinding selatan gedung
for x in [7, 11, 15, 28, 32, 36, 47, 51, 55, 63, 67, 71, 82, 86, 90]:
    objects.append({"sprite": (CF, "jendela_gabung_a"), "foot": [x, SW, 3, 1], "collide": False})

# ---- hiasan tepi: pohon (jarang), semak di kaki dinding selatan, bangku, lampu, petak bunga
for x in range(2, 98, 8):
    put("pohon_besar" if (x // 8) % 2 else "pohon_rimbun", [x, 4, 2, 1])
for y in [10, 18, 26, 34, 42, 50]:
    put("pohon_besar", [1, y, 2, 1])
    put("pohon_rimbun", [97, y, 2, 1])
for x in [3, 45, 95]:
    put("pohon_besar" if x % 2 else "pohon_rimbun", [x, 61, 2, 1])
for x in [6, 10, 14, 31, 35, 39, 48, 52, 56, 62, 66, 70, 82, 86, 90]:
    put("semak_kecil", [x, 58, 2, 1])
put("petak_bunga_panjang", [13, 59, 5, 1], collide=False)
put("petak_bunga_panjang", [30, 59, 5, 1], collide=False)
put("bangku_a", [17, 60, 2, 1])
put("bangku_a", [28, 60, 2, 1])
put("lampu_taman", [21, 59, 1, 1])
put("lampu_taman", [27, 59, 1, 1])
put("rak_sepeda", [60, 60, 3, 1])
put("sepeda_merah", [64, 60, 1, 1], collide=False)
put("sepeda_biru", [66, 60, 1, 1], collide=False)
put("bangku_b", [72, 60, 2, 1])
put("pot_batu_bunga", [78, 60, 1, 1], scale=3)

STONE = [(f"batu_{c}", ("outdoor_ground", f"batu_{c}")) for c in "abcd"]
GRASS = [(f"rumput_{c}", ("outdoor_ground", f"rumput_{c}")) for c in "abcd"]

LAYOUT = {
    "id": "kampus", "title": "Kampus Prodi Informatika", "w": W, "h": H, "capacity": 150,
    "ground": {"base": GRASS, "paths": [{"rect": [23, SW + 1, 25, SW + 4], "tiles": STONE}]},
    "regions": regions,
    "openings": OPEN,
    "objects": objects,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [24.5, 52]},
               {"name": "dari_lab_lovelace", "tile": [12.5, 27.5]},
               {"name": "dari_kelas_b", "tile": [34.5, 27.5]},
               {"name": "dari_kelas_c", "tile": [59.5, 27.5]}],
    "zones": [{"name": "luar", "rect": [0, 0, W, H], "chatRadius": 3, "chatPublic": True},
              {"name": "lobi", "rect": [OX, SY, 40, 28], "chatRadius": 3, "chatPublic": True},
              {"name": "perpustakaan", "rect": [LX, SY, 36, 28], "chatRadius": 3, "chatPublic": False},
              {"name": "koridor", "rect": [OX, CY, 92, CH], "chatRadius": 3, "chatPublic": True},
              {"name": "bilik-fokus", "rect": [NX, NY, 23, 11], "chatRadius": 3, "chatPublic": False},
              {"name": "diskusi-a", "rect": [NX, 14, 23, 11], "chatRadius": 99, "chatPublic": False},
              {"name": "santai", "rect": [EX, SY, 18, 15], "chatRadius": 3, "chatPublic": False},
              {"name": "diskusi-b", "rect": [EX, 44, 18, 14], "chatRadius": 99, "chatPublic": False},
              {"name": "kelas-a (tampak)", "rect": [4, NY, 20, NH], "chatRadius": 0, "chatPublic": False},
              {"name": "kelas-b (tampak)", "rect": [23, NY, 24, NH], "chatRadius": 0, "chatPublic": False},
              {"name": "kelas-c (tampak)", "rect": [46, NY, 28, NH], "chatRadius": 0, "chatPublic": False}],
}
