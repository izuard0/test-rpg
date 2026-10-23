"""Tata letak Perpustakaan Al-Khawarizmi (docs/PETA.md bagian 4). Satuan: petak."""

LF = "library_floor_wall"
BS = "library_bookshelves"
FU = "library_furniture"
TE = "library_terminals"

SHELVES = [  # (x, sprite, kode mata kuliah, warna, judul)
    (3, "rak_biru", "logika-komputasional", "biru", "Logika Komputasional"),
    (7, "rak_biru_2", "logika-komputasional", "biru", "Logika Komputasional"),
    (11, "rak_oranye", "kecerdasan-buatan", "oranye", "Kecerdasan Buatan"),
    (15, "rak_oranye", "kecerdasan-buatan", "oranye", "Kecerdasan Buatan"),
    (19, "rak_hijau", "", "hijau", "Segera hadir"),
    (23, "rak_hijau_2", "", "hijau", "Segera hadir"),
]

objects = []
for i, (x, spr, course, color, title) in enumerate(SHELVES, 1):
    objects.append({"sprite": (BS, spr), "foot": [x, 4, 2, 1], "type": "shelf", "name": f"rak_{i}",
                    "props": {"shelfId": i, "course": course, "color": color, "title": title},
                    "interact": [x, 5, 2, 1]})
for i, y in enumerate([5, 8, 11, 14], 1):
    objects.append({"sprite": (TE, "kios_nyala_a"), "foot": [27, y, 1, 1], "type": "terminal", "name": f"terminal_{i}",
                    "props": {"terminalId": i, "mode": "terminal"}, "interact": [26, y, 1, 1]})
for (x, y) in [(6, 9), (13, 9), (6, 14), (13, 14)]:
    objects.append({"sprite": (FU, "meja_baca_panjang"), "foot": [x, y, 4, 3]})
objects += [
    {"sprite": (FU, "meja_pustakawan"), "foot": [2, 16, 3, 2]},
    {"type": "npc", "name": "pustakawan", "foot": [3, 15, 1, 1], "interact": [3, 18, 1, 1],
     "props": {"npc": "pustakawan", "dialog": "tutorial-perpustakaan"}},  # NPC belum punya sprite
    {"sprite": (FU, "sofa_tunggal_biru_1"), "foot": [24, 19, 1, 1]},
    {"sprite": (FU, "sofa_tunggal_biru_2"), "foot": [26, 19, 1, 1]},
    {"sprite": (FU, "troli_buku"), "foot": [19, 19, 2, 1]},
    {"sprite": (FU, "papan_tulis_beroda"), "foot": [24, 10, 2, 1]},
    {"sprite": (TE, "bilik_belajar_tiga"), "foot": [21, 17, 3, 2]},
    {"sprite": (LF, "pembaca_kartu_pilar"), "foot": [0, 9, 1, 1], "collide": False},
]
for (x, y) in [(1, 2), (28, 2), (1, 20), (28, 20)]:
    objects.append({"sprite": (FU, "tanaman_pakis"), "foot": [x, y, 1, 1]})
for x in [3, 9, 15, 21, 26]:
    objects.append({"sprite": (LF, "jendela_kayu"), "foot": [x, 1, 1, 1], "collide": False})

LAYOUT = {
    "id": "perpustakaan", "title": "Perpustakaan Al-Khawarizmi", "w": 30, "h": 22, "capacity": 40,
    "floor": {
        "base": [("lantai_parket_a", (LF, "lantai_parket_a")), ("lantai_parket_b", (LF, "lantai_parket_b")),
                 ("lantai_parket_c", (LF, "lantai_parket_c")), ("lantai_parket_d", (LF, "lantai_parket_d"))],
        "carpet": {"rect": [4, 8, 25, 18],
                   "tiles": [("karpet_navy_a", (LF, "karpet_navy_a")), ("karpet_navy_b", (LF, "karpet_navy_b"))]},
    },
    "wall": {"dark": ("panel_navy_gelap", (LF, "panel_navy_gelap")),
             "face": [("dinding_krem_a", (LF, "dinding_krem_a")), ("dinding_krem_b", (LF, "dinding_krem_b"))],
             "top_rows": 2, "openings": [[0, 10, 1, 2]]},
    "objects": objects,
    "doors": [{"rect": [0, 10, 1, 2], "target": "lobi", "spawn": "dari_perpustakaan", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2.5, 11]}],
    "zones": [{"name": "perpustakaan", "rect": [0, 0, 30, 22], "chatRadius": 3, "chatPublic": False}],
}
