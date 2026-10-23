"""Peta KAMPUS v4: denah arsitektur bersayap (non-persegi, 108 x 70 petak) dengan Plaza Air Mancur di tengah-selatan.

Perbaikan utama dari v3:
1. Bentuk bangunan TIDAK lagi satu kotak persegi kaku: keempat sisi (Utara, Selatan, Timur, Barat) memiliki sayap
   yang maju-mundur secara arsitektural:
   - Utara: Lab Lovelace (y=5), Ruang Kolaborasi menonjol ke utara (y=3), Auditorium Turing (y=5), Bilik Fokus mundur (y=8).
   - Barat: Koridor & Lab Lovelace di x=8, Lobi Utama menonjol ke barat (x=3), Sayap Diskusi A mundur ke x=7.
   - Selatan: Sayap Diskusi A menonjol ke y=64 di kiri, Perpustakaan menonjol ke y=60 di kanan, mengapit Plaza Gerbang Utama
     & Taman Air Mancur berbentuk U (y=55..67); Ruang Diskusi B mundur ke y=56 di tenggara.
   - Timur: Bilik Fokus di x=99, Koridor di x=95, Lounge Santai menonjol ke x=102, Ruang Diskusi B mundur ke x=96.
2. Skala objek seragam dan proporsional: sofa, bean bag, meja bulat, bangku bar, meja baca, bilik belajar, troli buku,
   dan bangku/sepeda taman diperbesar ke 1.55x-3x agar seimbang dengan meja resepsionis, rak, kios, dan tanaman.
3. Arah hadap objek diperbaiki: terminal perpustakaan dicerminkan menghadap kiri (ke dalam ruangan), sofa sudut dan
   sofa samping menghadap meja di tengah karpet, sofa panjang di sisi selatan menghadap utara, pintu kelas di koridor
   memakai pintu ganda di dinding koridor (tanpa papan miring yang salah perspektif), dan tidak ada jendela/poster
   yang bertumpuk dengan bukaan pintu atau rak buku.
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
LF_, LFU, LTE, LOF, LTC, LDR = "library_floor_wall", "library_furniture", "library_terminals", "lobby_furniture", "lobby_tech", "lobby_doors"
W, H = 108, 70

# Koordinat sayap-sayap gedung (maju-mundur di keempat mata angin, bukan persegi)
KA_X, KA_Y = 8, 5                                # Lab Lovelace (20x21 -> x=8..27, y=5..25)
KB_X, KB_Y = 27, 3                               # Ruang Kolaborasi menonjol ke utara (24x23 -> x=27..50, y=3..25)
KC_X, KC_Y = 50, 5                               # Auditorium Turing (28x21 -> x=50..77, y=5..25)
BF_X, BF_Y, BF_W, BF_H = 77, 8, 22, 18           # Bilik Fokus mundur ke selatan (x=77..98, y=8..25)

CY, CH = 25, 8                                   # Koridor utama: x=8..95, y=25..32
OX, SY = 3, 32                                   # Lobi Utama menonjol ke barat: x=3..42, y=32..55 (40x24)
DA_X, DA_Y, DA_W, DA_H = 7, 55, 16, 10           # Sayap Diskusi A menonjol ke selatan-barat (x=7..22, y=55..64)
LX = 42                                          # Perpustakaan menonjol ke selatan-tengah (x=42..77, y=32..59, 36x28)
SA_X, SA_Y, SA_W, SA_H = 77, 30, 25, 16          # Lounge Santai menonjol ke timur (x=77..101, y=30..45)
DB_X, DB_Y, DB_W, DB_H = 77, 45, 19, 12          # Ruang Diskusi B mundur di tenggara (x=77..95, y=45..56)


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
for mod, ox, oy in ((ka, KA_X, KA_Y), (kb, KB_X, KB_Y), (kc, KC_X, KC_Y)):
    for o in mod.objects:
        if o.get("door") or not o.get("sprite"):
            continue
        objects.append(decor_only(shift(o, ox, oy)))


def put(spr, foot, scale=2, sheet=OD, **kw):
    objects.append({"sprite": (sheet, spr), "foot": foot, "scale": scale, **kw})


def tiles(prefix, sheet, letters):
    return [(f"{prefix}{c}", (sheet, f"{prefix}{c}")) for c in letters]


GREY = tiles("lantai_", CF, "abcd")
PARKET = tiles("lantai_parket_", LF_, "abcd")
SAGE = [("karpet_navy_a", (LF_, "karpet_navy_a")), ("karpet_navy_b", (LF_, "karpet_navy_b"))]
BIRU = [("karpet_biru_a", (LF_, "karpet_navy_a")), ("karpet_biru_b", (LF_, "karpet_navy_b"))]
TERAKOTA = [("karpet_terakota_a", (LF_, "karpet_navy_a")), ("karpet_terakota_b", (LF_, "karpet_navy_b"))]
CWALL = {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
         "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))]}
LWALL = {"dark": ("panel_navy_gelap", (LF_, "panel_navy_gelap")),
         "face": [("dinding_krem_a", (LF_, "dinding_krem_a")), ("dinding_krem_b", (LF_, "dinding_krem_b"))]}
NORUG = {"rect": [-1, -1, -1, -1], "tiles": [SAGE[0]]}


def room(name, x, y, w, h, floor, wall, rug=NORUG, cutaway=False, top_rows=3, face_rows=2):
    return {"name": name, "rect": [x, y, w, h], "cutaway": cutaway, "floor": {"base": floor, "carpet": rug},
            "wall": {**wall, "top_rows": top_rows, "face_rows": face_rows, "openings": []}}


lf = lobi.LAYOUT["floor"]
pf = lib.LAYOUT["floor"]
lobi_rugs = [shift_rect(r, OX, SY) for r in lf["carpet"]["rect"]]
lib_rug = shift_rect(pf["carpet"]["rect"], LX, SY)
ka_rugs = [shift_rect(r, KA_X, KA_Y) for r in ka.LAYOUT["floor"]["carpet"]["rect"]]
kb_rugs = [shift_rect(r, KB_X, KB_Y) for r in kb.LAYOUT["floor"]["carpet"]["rect"]]
kc_rugs = [shift_rect(r, KC_X, KC_Y) for r in kc.LAYOUT["floor"]["carpet"]["rect"]]

regions = [
    # Sayap akademik utara (tampak/cutaway) + Bilik Fokus
    room("kelas-a", KA_X, KA_Y, 20, 21, GREY, CWALL, {"rect": ka_rugs, "tiles": BIRU}, cutaway=True, top_rows=3, face_rows=2),
    room("kelas-b", KB_X, KB_Y, 24, 23, GREY, CWALL, {"rect": kb_rugs, "tiles": TERAKOTA}, cutaway=True, top_rows=3, face_rows=2),
    room("kelas-c", KC_X, KC_Y, 28, 21, GREY, CWALL, {"rect": kc_rugs, "tiles": BIRU}, cutaway=True, top_rows=3, face_rows=2),
    room("bilik-fokus", BF_X, BF_Y, BF_W, BF_H, GREY, CWALL, {"rect": [79, 12, 96, 22], "tiles": BIRU}, top_rows=3, face_rows=2),
    # Koridor utama dengan karpet galeri (x=8..94, menjorok masuk dari Lobi di barat dan Santai di timur)
    {"name": "koridor", "rect": [KA_X, CY, 87, CH],
     "floor": {"base": GREY, "carpet": {"rect": [[12, 28, 26, 30], [33, 28, 68, 30], [74, 28, 90, 30]], "tiles": BIRU}},
     "wall": {**CWALL, "top_rows": 2, "face_rows": 1, "openings": []}},
    # Sayap selatan & timur (berlekuk mengapit Plaza Air Mancur di selatan)
    {"name": "lobi", "rect": [OX, SY, 40, 24],
     "floor": {"base": lf["base"], "carpet": {"rect": lobi_rugs, "tiles": lf["carpet"]["tiles"]}},
     "wall": {**lobi.LAYOUT["wall"], "openings": []}},
    room("diskusi-a", DA_X, DA_Y, DA_W, DA_H, PARKET, LWALL, {"rect": [9, 59, 20, 63], "tiles": TERAKOTA}, top_rows=3, face_rows=2),
    {"name": "perpustakaan", "rect": [LX, SY, 36, 28],
     "floor": {"base": pf["base"], "carpet": {"rect": lib_rug, "tiles": pf["carpet"]["tiles"]}},
     "wall": {**lib.LAYOUT["wall"], "openings": []}},
    room("santai", SA_X, SA_Y, SA_W, SA_H, PARKET, LWALL, {"rect": [80, 35, 98, 43], "tiles": SAGE}, top_rows=3, face_rows=2),
    room("diskusi-b", DB_X, DB_Y, DB_W, DB_H, PARKET, LWALL, {"rect": [80, 49, 93, 55], "tiles": TERAKOTA}, top_rows=3, face_rows=2),
]

# Bukaan penghubung antarwilayah (semua bebas dari poster, rak, dan jendela!):
OPEN = [
    [OX + 15, SY, 4, 4],                         # koridor <-> lobi (gerbang utama tengah-kiri x=18..21)
    [LX + 15, SY, 4, 4],                         # koridor <-> perpustakaan (gerbang tengah x=57..60 di antara dua sayap rak)
    [85, CY, 3, 2],                              # koridor <-> bilik fokus
    [82, SA_Y, 3, 3],                            # koridor <-> ruang santai
    [LX, SY + 10, 1, 3],                         # lobi <-> perpustakaan
    [13, DA_Y, 3, 3],                            # lobi <-> diskusi-a (sayap barat daya)
    [SA_X, 38, 1, 3],                            # perpustakaan <-> ruang santai
    [DB_X, 50, 1, 3],                            # perpustakaan <-> diskusi-b
    [85, DB_Y, 3, 3],                            # ruang santai <-> diskusi-b
    [OX + 21, SY + 23, 4, 1],                    # gerbang selatan lobi ke Plaza Kampus (x=24..27, y=55)
]

# ---- Koridor: pintu ganda 1.65x ke tiga kelas (pas dengan tinggi dinding koridor 2 baris), kios, sofa tunggu, tanaman
doors = []
for (nm, tgt, spawn, dx, door_spr, label) in [
        ("kelas-a", "kelas-a", "dari_lab_lovelace", 16, "pintu_ganda_kaca", "Lab Lovelace"),
        ("kelas-b", "kelas-b", "dari_kelas_b", 38, "pintu_ganda_kayu_a", "Ruang Kolaborasi"),
        ("kelas-c", "kelas-c", "dari_kelas_c", 62, "pintu_ganda_kaca", "Auditorium Turing")]:
    objects.append({"sprite": (LDR, door_spr), "foot": [dx, CY + 1, 3, 1], "scale": 1.65, "collide": False})
    doors.append({"rect": [dx, CY + 2, 3, 1], "target": tgt, "spawn": spawn, "label": label})

# Perabot koridor: kios informasi di rotunda tengah, sofa tunggu menghadap utara, tanaman besar, dispenser, tempat sampah
put("kios_nyala", [50, 29, 3, 1], scale=2, sheet=LTC, type="info", name="kios_koridor", props={"info": "peta"},
    interact=[50, 28, 3, 1])
put("sofa_panjang", [23, 30, 4, 1], scale=1.75, sheet=LOF)
put("sofa_panjang", [43, 30, 4, 1], scale=1.75, sheet=LOF)
put("sofa_panjang", [68, 30, 4, 1], scale=1.75, sheet=LOF)
for x in [9, 28, 55, 75, 92]:
    put("tanaman_besar", [x, 30, 2, 1], scale=1.9, sheet=LOF)
for x in [14, 35, 60, 80]:
    put("tempat_sampah_a", [x, 30, 1, 1], scale=1.8, sheet=LOF)
put("dispenser_air", [89, 27, 1, 1], scale=2, sheet=LOF)

# ---- Bilik Fokus (x=77..98, y=8..25): 4 bilik belajar 1.75x + 2 meja dua monitor 1.75x + tanaman pakis
for x in (79, 90):
    for y in (13, 17):
        put("bilik_belajar_tiga", [x, y, 5, 2], scale=1.75, sheet=LTE)
put("meja_dua_monitor", [79, 21, 3, 2], scale=1.75, flip=True, sheet=LTE)
put("meja_dua_monitor", [92, 21, 3, 2], scale=1.75, sheet=LTE)
for x, y in [(78, 11), (95, 11)]:
    put("tanaman_pakis", [x, y, 2, 1], scale=1.8, sheet=LFU)

# ---- Sayap Diskusi A / Co-Working Barat Daya (x=7..22, y=55..64)
put("meja_baca_panjang", [9, 60, 6, 3], scale=1.55, sheet=LFU, collide_rect=[9, 61, 6, 2])
put("papan_tulis_beroda", [17, 58, 3, 1], scale=1.8, sheet=LFU)
put("tanaman_pakis", [8, 58, 2, 1], scale=1.8, sheet=LFU)
put("tanaman_pakis", [19, 62, 2, 1], scale=1.8, sheet=LFU)

# ---- Lounge Mahasiswa Timur / Ruang Santai (x=77..101, y=30..45)
put("jendela_kayu", [88, 32, 2, 1], scale=1.8, sheet=LF_, collide=False)
put("jendela_kayu", [94, 32, 2, 1], scale=1.8, sheet=LF_, collide=False)
put("sofa_sudut", [80, 35, 5, 3], scale=1.85, flip=True, sheet=LOF, collide_rect=[80, 35, 5, 2])
put("sofa_sudut", [93, 35, 5, 3], scale=1.85, sheet=LOF, collide_rect=[93, 35, 5, 2])
put("meja_bulat", [85, 38, 2, 1], scale=1.85, sheet=LOF)
put("meja_bulat", [91, 38, 2, 1], scale=1.85, sheet=LOF)
put("bean_navy", [82, 40, 2, 1], scale=1.85, sheet=LOF)
put("bean_oranye", [88, 41, 2, 1], scale=1.85, sheet=LOF)
put("bean_abu", [95, 40, 2, 1], scale=1.85, sheet=LOF)
put("dispenser_air", [98, 34, 1, 1], scale=2, sheet=LOF)
put("tanaman_besar", [78, 34, 2, 1], scale=2, sheet=LOF)
put("tanaman_besar", [98, 43, 2, 1], scale=2, sheet=LOF)

# ---- Ruang Diskusi B di Tenggara (x=77..95, y=45..56)
put("meja_baca_panjang", [80, 50, 6, 3], scale=1.55, sheet=LFU, collide_rect=[80, 51, 6, 2])
put("papan_tulis_beroda", [89, 49, 3, 1], scale=1.8, sheet=LFU)
put("sofa_tunggal_biru_1", [89, 53, 2, 2], scale=1.8, sheet=LFU)
put("tanaman_pakis", [92, 54, 2, 1], scale=1.8, sheet=LFU)

# ---- Area Luar Ruangan: Plaza Gerbang Utama (U-Courtyard), Air Mancur, Taman & Parkir Sepeda
# 1. Plaza Air Mancur di lekukan selatan Lobi (x=23..41, y=56..66)
put("air_mancur", [32, 62, 5, 4], scale=1.75, collide_rect=[32, 60, 5, 3])
put("bangku_a", [24, 60, 3, 1], scale=3)
put("bangku_a", [38, 60, 3, 1], scale=3)
put("lampu_taman", [23, 57, 1, 1], scale=3)
put("lampu_taman", [28, 57, 1, 1], scale=3)
put("lampu_taman", [24, 64, 1, 1], scale=3)
put("lampu_taman", [40, 64, 1, 1], scale=3)
put("petak_bunga_panjang", [29, 56, 4, 1], scale=2.2, collide=False)
put("petak_bunga_panjang", [36, 56, 4, 1], scale=2.2, collide=False)
put("pot_batu_bunga", [23, 56, 1, 1], scale=3)
put("pot_batu_bunga", [28, 56, 1, 1], scale=3)

# 2. Taman & Parkir Sepeda di lekukan tenggara (x=44..102, y=57..66)
put("petak_bunga_panjang", [46, 60, 5, 1], scale=2.5, collide=False)
put("petak_bunga_panjang", [64, 60, 5, 1], scale=2.5, collide=False)
put("bangku_b", [54, 62, 3, 1], scale=3)
put("bangku_b", [72, 62, 3, 1], scale=3)
put("lampu_taman", [52, 61, 1, 1], scale=3)
put("lampu_taman", [70, 61, 1, 1], scale=3)
put("lampu_taman", [82, 59, 1, 1], scale=3)

# Teluk Parkir Sepeda berlantai batu di tenggara (x=80..95, y=58..64)
put("rak_sepeda", [81, 60, 3, 1], scale=3)
put("rak_sepeda", [86, 60, 3, 1], scale=3)
put("sepeda_merah", [90, 60, 2, 1], scale=3, collide=False)
put("sepeda_biru", [93, 60, 2, 1], scale=3, flip=True, collide=False)
put("bangku_a", [84, 63, 3, 1], scale=3)
put("pot_batu_bunga", [79, 58, 1, 1], scale=3)
put("pot_batu_bunga", [95, 58, 1, 1], scale=3)

# 3. Semak & bunga penghias kaki dinding (mengikuti lekukan gedung tanpa menghalangi jalan)
for x in [9, 14, 19]:
    put("semak_kecil", [x, 65, 2, 1], scale=1.8)
for x in [44, 51, 58, 63, 70, 75]:
    put("semak_kecil", [x, 60, 2, 1], scale=1.8)
for x, y in [(6, 4), (14, 4), (22, 4), (54, 4), (62, 4), (70, 4), (82, 7), (90, 7), (97, 29), (97, 56)]:
    put("semak_bulat", [x, y, 1, 1], scale=2.2)
for x, y, spr in [(24, 65, "bunga_merah"), (26, 66, "bunga_kuning"), (39, 65, "bunga_kuning"),
                  (41, 66, "bunga_merah"), (59, 61, "bunga_merah"), (61, 61, "bunga_kuning"),
                  (80, 5, "bunga_merah"), (85, 6, "bunga_kuning"), (93, 5, "bunga_merah"),
                  (5, 12, "bunga_kuning"), (5, 19, "bunga_merah"), (5, 60, "bunga_kuning"), (99, 50, "bunga_kuning")]:
    put(spr, [x, y, 1, 1], scale=2.2, collide=False)

# 4. Pepohonan rimbun di kantong-kantong taman (bebas dari atap maupun dinding ruangan!)
TREES = [
    # Taman Barat Laut (mengisi lekukan barat Lab Lovelace & utara kelas)
    (2, 4, "pohon_besar"), (4, 10, "pohon_rimbun"), (2, 16, "pohon_besar"), (4, 22, "pohon_rimbun"),
    (11, 3, "pohon_rimbun"), (19, 3, "pohon_besar"), (34, 2, "pohon_besar"), (44, 2, "pohon_rimbun"),
    (58, 3, "pohon_besar"), (68, 3, "pohon_rimbun"),
    # Taman Sudut Timur Laut (di atas Bilik Fokus yang mundur ke y=8)
    (79, 4, "pohon_besar"), (85, 6, "pohon_rimbun"), (91, 4, "pohon_besar"), (97, 6, "pohon_rimbun"), (103, 11, "pohon_besar"),
    # Sisi Barat & Taman Sudut Barat Daya (di barat Diskusi A yang menjorok ke x=7)
    (0, 31, "pohon_rimbun"), (0, 41, "pohon_besar"), (0, 51, "pohon_rimbun"),
    (2, 59, "pohon_besar"), (3, 66, "pohon_rimbun"), (14, 68, "pohon_besar"),
    # Sisi Timur & Taman Tenggara (mengisi lekukan timur Koridor, Santai, dan Diskusi B)
    (102, 20, "pohon_rimbun"), (99, 27, "pohon_besar"), (104, 38, "pohon_rimbun"),
    (100, 49, "pohon_besar"), (103, 56, "pohon_rimbun"), (99, 64, "pohon_besar"), (104, 66, "pohon_rimbun"),
    # Taman Selatan
    (45, 67, "pohon_besar"), (61, 67, "pohon_rimbun"), (77, 67, "pohon_besar"), (89, 67, "pohon_rimbun"),
]
for tx, ty, tspr in TREES:
    put(tspr, [tx, ty, 2, 1], scale=2)

STONE = [(f"batu_{c}", ("outdoor_ground", f"batu_{c}")) for c in "abcd"]
GRASS = [(f"rumput_{c}", ("outdoor_ground", f"rumput_{c}")) for c in "abcd"]
DIRT = [("tanah_tengah", ("outdoor_ground", "tanah_tengah"))]

LAYOUT = {
    "id": "kampus", "title": "Kampus Prodi Informatika", "w": W, "h": H, "capacity": 150,
    "ground": {
        "base": GRASS,
        "paths": [
            # Plaza Gerbang Utama berbentuk U di selatan Lobi (x=23..41, y=56..66)
            {"rect": [23, 56, 41, 65], "tiles": STONE},
            {"rect": [24, 55, 27, 66], "tiles": STONE},
            # Pulau taman rumput di tengah plaza untuk Air Mancur
            {"rect": [31, 59, 37, 63], "tiles": GRASS},
            # Jalur pedestrian timur menyusuri taman selatan Perpustakaan ke Parkir Sepeda
            {"rect": [42, 61, 95, 63], "tiles": STONE},
            # Pelataran batu Parkir Sepeda di lekukan tenggara
            {"rect": [80, 58, 95, 64], "tiles": STONE},
            # Tanah kebun bunga di tepi plaza
            {"rect": [29, 56, 39, 56], "tiles": DIRT},
        ],
    },
    "regions": regions,
    "openings": OPEN,
    "objects": objects,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [25.5, 51]},
               {"name": "dari_lab_lovelace", "tile": [17.5, 28.5]},
               {"name": "dari_kelas_b", "tile": [39.5, 28.5]},
               {"name": "dari_kelas_c", "tile": [63.5, 28.5]}],
    "zones": [{"name": "luar", "rect": [0, 0, W, H], "chatRadius": 3, "chatPublic": True},
              {"name": "lobi", "rect": [OX, SY, 40, 24], "chatRadius": 3, "chatPublic": True},
              {"name": "perpustakaan", "rect": [LX, SY, 36, 28], "chatRadius": 3, "chatPublic": False},
              {"name": "koridor", "rect": [KA_X, CY, 87, CH], "chatRadius": 3, "chatPublic": True},
              {"name": "bilik-fokus", "rect": [BF_X, BF_Y, BF_W, BF_H], "chatRadius": 3, "chatPublic": False},
              {"name": "diskusi-a", "rect": [DA_X, DA_Y, DA_W, DA_H], "chatRadius": 99, "chatPublic": False},
              {"name": "santai", "rect": [SA_X, SA_Y, SA_W, SA_H], "chatRadius": 3, "chatPublic": False},
              {"name": "diskusi-b", "rect": [DB_X, DB_Y, DB_W, DB_H], "chatRadius": 99, "chatPublic": False},
              {"name": "kelas-a (tampak)", "rect": [KA_X, KA_Y, 20, 21], "chatRadius": 0, "chatPublic": False},
              {"name": "kelas-b (tampak)", "rect": [KB_X, KB_Y, 24, 23], "chatRadius": 0, "chatPublic": False},
              {"name": "kelas-c (tampak)", "rect": [KC_X, KC_Y, 28, 21], "chatRadius": 0, "chatPublic": False}],
}
