"""Tata letak Lobi, 40x28 petak, kapasitas 100 (docs/PETA.md). Satuan: petak.

Lantai sementara memakai lantai kelas (lobby_floor_wall akan dibuat ulang)."""

CF = "classroom_floor_wall"
LF = "lobby_furniture"
LT = "lobby_tech"
LD = "lobby_decor"
DR = "lobby_doors"

objects = []
wall = lambda s, foot, **kw: objects.append({"sprite": s, "foot": foot, "collide": False, **kw})
solid = lambda s, foot, **kw: objects.append({"sprite": s, "foot": foot, **kw})

# dinding atas
wall((LD, "poster_chip_biru"), [8, 2, 2, 1])
wall((LD, "poster_chip_emas"), [12, 2, 1, 1])
wall((LD, "poster_chip_abu"), [27, 2, 1, 1])
wall((LD, "poster_chip_biru"), [31, 2, 2, 1])
objects.append({"sprite": (LT, "papan_info_layar"), "foot": [18, 2, 4, 1], "collide": False, "type": "board",
                "name": "papan_pengumuman", "props": {"board": "pengumuman"}, "interact": [18, 3, 4, 1]})

# pintu: kiri = kelas, kanan = perpustakaan
DOORS = [  # (rect, target, spawn, label, sprite)
    ([0, 6, 1, 2], "kelas-a", "dari_lobi", "Lab Lovelace", "pintu_kayu"),
    ([0, 12, 1, 2], "kelas-b", "dari_lobi", "Ruang Kolaborasi", "pintu_kayu"),
    ([0, 18, 1, 2], "kelas-c", "dari_lobi", "Auditorium Turing", "pintu_kayu"),
    ([39, 12, 1, 2], "perpustakaan", "dari_lobi", "Perpustakaan Al-Khawarizmi", "pintu_kayu"),
]
doors = []
for rect, tgt, sp, label, spr in DOORS:
    x, y = rect[0], rect[1]
    wall((DR, spr), [x, y + 1, 1, 1])
    doors.append({"rect": rect, "target": tgt, "spawn": sp, "label": label})

# pameran teknologi (kanan atas)
solid((LT, "etalase_robot"), [25, 6, 2, 2], type="exhibit", name="etalase_robot", props={"exhibit": "robot"},
      interact=[25, 8, 2, 1])
solid((LT, "lengan_robot"), [28, 6, 1, 2])
solid((LT, "printer3d_meja"), [30, 6, 2, 1])
solid((LT, "rak_server_meja"), [33, 6, 2, 1])
# arkade (kiri atas)
solid((LT, "arkade_cokelat"), [3, 5, 2, 1])
solid((LT, "arkade_biru"), [6, 5, 2, 1])
solid((LD, "lemari_piala"), [14, 3, 2, 1])
# resepsionis tengah
solid((LF, "meja_kerja_putih"), [18, 10, 2, 1], type="info", name="resepsionis", props={"info": "bantuan"},
      interact=[18, 11, 2, 1])
solid((LT, "kios_nyala"), [22, 10, 1, 1], type="info", name="kios_info", props={"info": "peta"},
      interact=[22, 11, 1, 1])
# lounge kiri bawah
solid((LF, "sofa_sudut"), [4, 23, 3, 2])
solid((LF, "meja_bulat"), [8, 24, 1, 1])
solid((LF, "sofa_panjang"), [11, 24, 2, 1])
for x, y in [(15, 23), (17, 25), (14, 25)]:
    solid((LF, ["bean_navy", "bean_oranye", "bean_abu"][(x + y) % 3]), [x, y, 1, 1])
# kafe kanan bawah
solid((LF, "meja_kopi"), [33, 22, 2, 1], type="info", name="meja_kopi", props={"info": "kafe"},
      interact=[33, 23, 2, 1])
solid((LF, "dispenser_air"), [36, 22, 1, 1])
for x in [30, 31]:
    solid((LF, "tempat_sampah_a"), [x, 22, 1, 1])
solid((LF, "bar_panjang"), [33, 18, 3, 1])
for x in [33, 34, 35]:
    solid((LF, "bangku_bulat"), [x, 19, 1, 1])
solid((LD, "gantungan_jaket"), [2, 22, 1, 1])
# tanaman
for x, y in [(1, 3), (38, 3), (1, 26), (38, 26), (20, 20), (23, 20)]:
    solid((LF, "tanaman_besar" if y in (3, 26) else "tanaman_a"), [x, y, 1, 1])

LAYOUT = {
    "id": "lobi", "title": "Lobi", "w": 40, "h": 28, "capacity": 100,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [-1, -1, -1, -1], "tiles": [("lantai_a", (CF, "lantai_a"))]},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 3, "openings": [d["rect"] for d in doors]},
    "objects": objects,
    "doors": doors,
    "spawns": [{"name": "awal", "tile": [20, 20]}, {"name": "dari_perpustakaan", "tile": [37.5, 13]},
               {"name": "dari_lab_lovelace", "tile": [2.5, 7]}, {"name": "dari_kelas_b", "tile": [2.5, 13]},
               {"name": "dari_kelas_c", "tile": [2.5, 19]}],
    "zones": [{"name": "lobi", "rect": [0, 0, 40, 28], "chatRadius": 3, "chatPublic": True}],
}
