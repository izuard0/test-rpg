"""Tata letak Lobi, 40x28 petak, kapasitas 100 (docs/PETA.md). Satuan: petak.

Aturan skala: dekorasi/pameran/tanaman 2x; benda yang diduduki/dipakai (sofa, bean bag, bangku, meja) 1x.
Lantai sementara memakai lantai kelas; karpet memakai karpet perpustakaan."""

CF = "classroom_floor_wall"
LB = "library_floor_wall"
LF = "lobby_furniture"
LT = "lobby_tech"
LD = "lobby_decor"
DR = "lobby_doors"

objects = []


def wall(s, foot, **kw):
    objects.append({"sprite": s, "foot": foot, "collide": False, "scale": 2, **kw})


def solid(s, foot, **kw):
    objects.append({"sprite": s, "foot": foot, "scale": 2, **kw})


# dinding atas (5 baris: 2 gelap, 3 biru)
wall((LD, "poster_chip_biru"), [6, 4, 4, 1])
wall((LD, "poster_chip_emas"), [11, 4, 2, 1])
objects.append({"sprite": (LT, "papan_info_layar"), "foot": [16, 4, 7, 1], "collide": False, "scale": 2,
                "type": "board", "name": "papan_pengumuman", "props": {"board": "pengumuman"},
                "interact": [16, 5, 7, 1]})
wall((LD, "poster_chip_abu"), [25, 4, 2, 1])
wall((LD, "poster_chip_biru"), [30, 4, 4, 1])

# pintu: kiri = kelas, kanan = perpustakaan (bukaan 3 petak, pintu 2x)
DOORS = [
    ([0, 8, 1, 3], "kelas-a", "dari_lobi", "Lab Lovelace"),
    ([0, 14, 1, 3], "kelas-b", "dari_lobi", "Ruang Kolaborasi"),
    ([0, 20, 1, 3], "kelas-c", "dari_lobi", "Auditorium Turing"),
    ([39, 14, 1, 3], "perpustakaan", "dari_lobi", "Perpustakaan Al-Khawarizmi"),
]
doors = []
for rect, tgt, sp, label in DOORS:
    wall((DR, "pintu_kayu"), [rect[0], rect[1] + 2, 1, 1])
    doors.append({"rect": rect, "target": tgt, "spawn": sp, "label": label})

# arkade dan piala (kiri atas)
solid((LT, "arkade_cokelat"), [4, 7, 3, 1])
solid((LT, "arkade_biru"), [8, 7, 3, 1])
solid((LD, "lemari_piala"), [12, 6, 3, 1], type="exhibit", name="lemari_piala", props={"exhibit": "prestasi"},
      interact=[12, 7, 3, 1])
# pameran teknologi (kanan atas)
solid((LT, "lengan_robot"), [22, 8, 3, 1])
solid((LT, "etalase_robot"), [26, 8, 4, 1], type="exhibit", name="etalase_robot", props={"exhibit": "robot"},
      interact=[26, 9, 4, 1])
solid((LT, "printer3d_meja"), [31, 8, 3, 1])
solid((LT, "rak_server_meja"), [35, 8, 3, 1])

# resepsionis tengah, di atas karpet
solid((LF, "meja_kerja_putih"), [16, 13, 4, 1], type="info", name="resepsionis", props={"info": "bantuan"},
      interact=[16, 14, 4, 1])
solid((LT, "kios_nyala"), [22, 13, 3, 1], type="info", name="kios_info", props={"info": "peta"},
      interact=[22, 14, 3, 1])
solid((LF, "bean_oranye"), [27, 16, 1, 1], scale=1)
solid((LF, "bean_abu"), [25, 16, 1, 1], scale=1)
solid((LF, "sofa_panjang"), [12, 15, 2, 1], scale=1)
solid((LF, "meja_bulat"), [15, 16, 1, 1], scale=1)
solid((LF, "tanaman_c"), [14, 14, 1, 1])
solid((LF, "tanaman_d"), [26, 13, 1, 1])

# lounge kiri bawah
solid((LF, "sofa_sudut"), [6, 23, 3, 1], scale=1)
solid((LF, "meja_bulat"), [12, 25, 1, 1], scale=1)
solid((LF, "sofa_panjang"), [15, 24, 2, 1], scale=1)
solid((LF, "bean_abu"), [8, 26, 1, 1], scale=1)
solid((LF, "bean_navy"), [16, 26, 1, 1], scale=1)
solid((LF, "tanaman_e"), [20, 24, 1, 1])
solid((LD, "gantungan_jaket"), [2, 25, 2, 1])

# kafe kanan bawah
solid((LF, "bar_panjang"), [29, 19, 7, 1])
for x in [30, 32, 34]:
    solid((LF, "bangku_bulat"), [x, 21, 1, 1], scale=1)
solid((LF, "meja_kopi"), [31, 25, 3, 1], type="info", name="meja_kopi", props={"info": "kafe"},
      interact=[31, 26, 3, 1])
solid((LF, "dispenser_air"), [36, 25, 1, 1])
solid((LF, "tempat_sampah_a"), [28, 25, 1, 1])
solid((LF, "tempat_sampah_b"), [38, 25, 1, 1])

# dua pulau duduk di sisi barat dan timur tengah lobi (benda duduk 1x)
for cx, cy in [(6, 13), (34, 13)]:
    solid((LF, "meja_bulat"), [cx, cy, 1, 1], scale=1)
    for dx, dy, b in [(-2, 0, "bean_navy"), (2, 0, "bean_oranye"), (0, -2, "bean_abu"), (0, 2, "bean_navy")]:
        solid((LF, b), [cx + dx, cy + dy, 1, 1], scale=1)
solid((LF, "tanaman_besar"), [17, 25, 2, 1])
solid((LF, "tanaman_besar"), [23, 25, 2, 1])

# tanaman besar di sudut
for x, y in [(1, 6), (37, 6), (1, 26), (37, 26)]:
    solid((LF, "tanaman_besar"), [x, y, 2, 1])

KARPET = [("karpet_navy_a", (LB, "karpet_navy_a")), ("karpet_navy_b", (LB, "karpet_navy_b"))]
LAYOUT = {
    "id": "lobi", "title": "Lobi", "w": 40, "h": 28, "capacity": 100,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [[11, 11, 29, 17], [4, 22, 22, 26], [28, 18, 37, 22]], "tiles": KARPET},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 5, "face_rows": 3, "openings": [d["rect"] for d in doors]},
    "objects": objects,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [20, 20]}, {"name": "dari_perpustakaan", "tile": [37.5, 15.5]},
               {"name": "dari_lab_lovelace", "tile": [2.5, 9.5]}, {"name": "dari_kelas_b", "tile": [2.5, 15.5]},
               {"name": "dari_kelas_c", "tile": [2.5, 21.5]}],
    "zones": [{"name": "lobi", "rect": [0, 0, 40, 28], "chatRadius": 3, "chatPublic": True}],
}
