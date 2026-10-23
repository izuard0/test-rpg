"""Tata letak Perpustakaan Al-Khawarizmi (docs/PETA.md bagian 4), 36 x 28 petak. Satuan: petak.

Aturan skala: rak, terminal, tanaman, pustakawan 2x (dekorasi/besar); meja baca, bilik belajar, troli,
sofa 1x (benda yang dipakai/diduduki). Di peta `kampus` tata letak ini digeser (lihat kampus.py)."""

LF = "library_floor_wall"
BS = "library_bookshelves"
FU = "library_furniture"
TE = "library_terminals"

SHELVES = [  # (x, sprite, kode mata kuliah, warna, judul)
    (2, "rak_biru", "logika-komputasional", "biru", "Logika Komputasional"),
    (7, "rak_biru_2", "logika-komputasional", "biru", "Logika Komputasional"),
    (12, "rak_oranye", "kecerdasan-buatan", "oranye", "Kecerdasan Buatan"),
    (17, "rak_oranye", "kecerdasan-buatan", "oranye", "Kecerdasan Buatan"),
    (22, "rak_hijau", "", "hijau", "Segera hadir"),
    (27, "rak_hijau_2", "", "hijau", "Segera hadir"),
]

objects = []


def put(spr, foot, scale=2, **kw):
    objects.append({"sprite": spr, "foot": foot, "scale": scale, **kw})


for x in [5, 10, 15, 20, 25]:                                   # jendela di sela rak
    put((LF, "jendela_kayu"), [x, 2, 2, 1], collide=False)
for i, (x, spr, course, color, title) in enumerate(SHELVES, 1):
    put((BS, spr), [x, 5, 3, 1], type="shelf", name=f"rak_{i}",
        props={"shelfId": i, "course": course, "color": color, "title": title}, interact=[x, 6, 3, 1])
for i, y in enumerate([7, 11, 15, 19], 1):
    put((TE, "kios_nyala_a"), [33, y, 2, 1], type="terminal", name=f"terminal_{i}",
        props={"terminalId": i, "mode": "terminal"}, interact=[31, y, 2, 1])
for x in (9, 16, 23):                                           # 9 meja baca 1x (3 kolom x 3 baris)
    for y in (10, 15, 20):
        put((FU, "meja_baca_panjang"), [x, y, 4, 3], scale=1)
put((FU, "meja_pustakawan"), [2, 21, 5, 3])
objects.append({"type": "npc", "name": "pustakawan", "foot": [3, 20, 1, 1], "interact": [3, 24, 2, 1],
                "props": {"npc": "pustakawan", "dialog": "tutorial-perpustakaan"}})   # sprite NPC belum ada
put((TE, "bilik_belajar_tiga"), [14, 24, 3, 2], scale=1)
put((FU, "troli_buku"), [21, 24, 2, 1], scale=1)
put((FU, "sofa_tunggal_biru_1"), [26, 24, 1, 1], scale=1)
put((FU, "sofa_tunggal_biru_2"), [28, 24, 1, 1], scale=1)
put((FU, "papan_tulis_beroda"), [2, 16, 2, 1])
for (x, y) in [(33, 4), (1, 26), (33, 26)]:
    put((FU, "tanaman_pakis"), [x, y, 2, 1])

LAYOUT = {
    "id": "perpustakaan", "title": "Perpustakaan Al-Khawarizmi", "w": 36, "h": 28, "capacity": 40,
    "floor": {
        "base": [(f"lantai_parket_{c}", (LF, f"lantai_parket_{c}")) for c in "abcd"],
        "carpet": {"rect": [8, 9, 29, 25],
                   "tiles": [("karpet_navy_a", (LF, "karpet_navy_a")), ("karpet_navy_b", (LF, "karpet_navy_b"))]},
    },
    "wall": {"dark": ("panel_navy_gelap", (LF, "panel_navy_gelap")),
             "face": [("dinding_krem_a", (LF, "dinding_krem_a")), ("dinding_krem_b", (LF, "dinding_krem_b"))],
             "top_rows": 3, "face_rows": 2, "openings": [[0, 10, 1, 3]]},
    "objects": objects,
    "doors": [{"rect": [0, 10, 1, 3], "target": "kampus", "spawn": "dari_perpustakaan", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2.5, 11.5]}],
    "zones": [{"name": "perpustakaan", "rect": [0, 0, 36, 28], "chatRadius": 3, "chatPublic": False}],
}
