"""Tata letak Lobi Utama, 40x24 petak, kapasitas 100 (docs/PETA.md). Satuan: petak.

Semua perabot duduk (sofa, bean bag, meja bulat, bangku bar) diskalakan ~1.85x-2x agar serasi dengan meja
resepsionis, bar kopi, kios, dan tanaman besar. Arah hadap sofa dan kios sudah diperbaiki (memakai flip=True bila perlu).
Bukaan ke koridor berada di tengah-kiri (x=15..18) sehingga tidak memotong poster maupun papan layar pengumuman."""

CF = "classroom_floor_wall"
LB = "library_floor_wall"
LF = "lobby_furniture"
LT = "lobby_tech"
LD = "lobby_decor"
DR = "lobby_doors"

objects = []


def wall(s, foot, scale=1.6, **kw):
    objects.append({"sprite": s, "foot": foot, "collide": False, "scale": scale, **kw})


def solid(s, foot, scale=2, **kw):
    objects.append({"sprite": s, "foot": foot, "scale": scale, **kw})


# dinding atas (4 baris: 1 gelap + 3 biru; sela x=15..18 bebas untuk gerbang ke koridor)
wall((LD, "poster_chip_biru"), [4, 3, 3, 1], scale=1.5)
wall((LD, "poster_chip_emas"), [9, 3, 2, 1], scale=1.5)
objects.append({"sprite": (LT, "papan_info_layar"), "foot": [20, 3, 6, 1], "collide": False, "scale": 1.75,
                "type": "board", "name": "papan_pengumuman", "props": {"board": "pengumuman"},
                "interact": [20, 4, 6, 1]})
wall((LD, "poster_chip_abu"), [28, 3, 2, 1], scale=1.5)
wall((LD, "poster_chip_biru"), [33, 3, 3, 1], scale=1.5)

# pintu: kiri = kelas, kanan = perpustakaan (dipakai bila lobi berdiri sendiri; di kampus.py digeser ke koridor)
DOORS = [
    ([0, 7, 1, 3], "kelas-a", "dari_lobi", "Lab Lovelace"),
    ([0, 12, 1, 3], "kelas-b", "dari_lobi", "Ruang Kolaborasi"),
    ([0, 17, 1, 3], "kelas-c", "dari_lobi", "Auditorium Turing"),
    ([39, 12, 1, 3], "perpustakaan", "dari_lobi", "Perpustakaan Al-Khawarizmi"),
]
doors = []
for rect, tgt, sp, label in DOORS:
    wall((DR, "pintu_kayu"), [rect[0], rect[1] + 2, 1, 1], scale=2)
    doors.append({"rect": rect, "target": tgt, "spawn": sp, "label": label})

# pojok arkade & piala (kiri atas)
solid((LT, "arkade_cokelat"), [4, 6, 3, 1], scale=2)
solid((LT, "arkade_biru"), [7, 6, 3, 1], scale=2)
solid((LD, "lemari_piala"), [11, 5, 3, 1], scale=2, type="exhibit", name="lemari_piala", props={"exhibit": "prestasi"},
      interact=[11, 6, 3, 1])

# pameran teknologi (kanan atas)
solid((LT, "lengan_robot"), [24, 6, 3, 1], scale=2)
solid((LT, "etalase_robot"), [28, 6, 4, 1], scale=2, type="exhibit", name="etalase_robot", props={"exhibit": "robot"},
      interact=[28, 7, 4, 1])
solid((LT, "printer3d_meja"), [33, 6, 3, 1], scale=2)
solid((LT, "rak_server_meja"), [36, 6, 3, 1], scale=2)

# resepsionis & kios info di tengah lobi (kios dicerminkan agar menghadap ke area tengah)
solid((LF, "meja_kerja_putih"), [16, 11, 4, 1], scale=2, type="info", name="resepsionis", props={"info": "bantuan"},
      interact=[16, 12, 4, 1])
solid((LT, "kios_nyala"), [22, 11, 3, 1], scale=2, flip=True, type="info", name="kios_info", props={"info": "peta"},
      interact=[22, 12, 3, 1])
solid((LF, "tanaman_d"), [14, 11, 1, 1], scale=2)
solid((LF, "tanaman_d"), [26, 11, 1, 1], scale=2)

# area duduk tengah di bawah resepsionis (sofa samping saling berhadapan mengapit meja bulat + bean bag 1.85x)
solid((LF, "sofa_samping"), [14, 15, 2, 2], scale=1.85, flip=True)
solid((LF, "meja_bulat"), [18, 16, 2, 1], scale=1.85)
solid((LF, "sofa_samping"), [22, 15, 2, 2], scale=1.85)
solid((LF, "bean_oranye"), [16, 18, 2, 1], scale=1.85)
solid((LF, "bean_navy"), [20, 18, 2, 1], scale=1.85)

# lounge barat (sofa sudut dicerminkan di pojok kiri-atas karpet, sofa panjang di bawah menghadap utara ke meja)
solid((LF, "sofa_sudut"), [4, 14, 5, 3], scale=1.85, flip=True, collide_rect=[4, 14, 5, 2])
solid((LF, "meja_bulat"), [7, 17, 2, 1], scale=1.85)
solid((LF, "bean_abu"), [10, 16, 2, 1], scale=1.85)
solid((LF, "sofa_panjang"), [5, 20, 4, 1], scale=1.85)
solid((LD, "gantungan_jaket"), [2, 19, 2, 1], scale=1.85)

# kafe & bar kopi di sisi timur (bangku bulat 1.85x tepat di depan meja bar)
solid((LF, "bar_panjang"), [29, 14, 7, 1], scale=2)
for x in [30, 32, 34]:
    solid((LF, "bangku_bulat"), [x, 16, 1, 1], scale=1.85)
solid((LF, "meja_kopi"), [30, 20, 3, 1], scale=2, type="info", name="meja_kopi", props={"info": "kafe"},
      interact=[30, 21, 3, 1])
solid((LF, "dispenser_air"), [35, 20, 1, 1], scale=2)
solid((LF, "tempat_sampah_a"), [28, 20, 1, 1], scale=1.85)

# tanaman besar di sudut ruangan dan pengapit gerbang selatan (x=21..24 bebas untuk gerbang utama)
for x, y in [(1, 5), (37, 5), (2, 22), (18, 21), (26, 21), (37, 22)]:
    solid((LF, "tanaman_besar"), [x, y, 2, 1], scale=2)

KARPET = [("karpet_navy_a", (LB, "karpet_navy_a")), ("karpet_navy_b", (LB, "karpet_navy_b"))]
LAYOUT = {
    "id": "lobi", "title": "Lobi", "w": 40, "h": 24, "capacity": 100,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [[13, 10, 26, 19], [3, 13, 11, 21], [28, 13, 37, 21]], "tiles": KARPET},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 4, "face_rows": 3, "openings": [d["rect"] for d in doors]},
    "objects": objects,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [22, 19]}, {"name": "dari_perpustakaan", "tile": [37.5, 13.5]},
               {"name": "dari_lab_lovelace", "tile": [2.5, 8.5]}, {"name": "dari_kelas_b", "tile": [2.5, 13.5]},
               {"name": "dari_kelas_c", "tile": [2.5, 18.5]}],
    "zones": [{"name": "lobi", "rect": [0, 0, 40, 24], "chatRadius": 3, "chatPublic": True}],
}
