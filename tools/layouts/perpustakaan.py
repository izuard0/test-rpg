"""Tata letak Perpustakaan Al-Khawarizmi (docs/PETA.md bagian 4), 36 x 28 petak. Satuan: petak.

Enam rak buku dibagi menjadi dua sayap (kiri x=2,6,10 dan kanan x=20,24,28) mengapit gerbang tengah dari koridor
(x=15..18) yang lurus dengan lorong tengah di antara dua kolom meja baca. Kios di dinding kanan dicerminkan
(flip=True) agar layarnya menghadap ke dalam ruangan.

Interaksi (keputusan pemilik proyek, 23 Okt 2026, docs/PETA.md no. 2 dan 3):
- materi dibuka dari **keenam meja baca**; setiap meja membuka katalog yang sama (semua mata kuliah),
  supaya pemain tidak menumpuk di satu meja;
- terminal praktik ada di **bilik belajar tiga komputer** di baris bawah;
- rak buku dan kios dinding kini hanya dekorasi."""

LF = "library_floor_wall"
BS = "library_bookshelves"
FU = "library_furniture"
TE = "library_terminals"
LOF = "lobby_furniture"

SHELVES = [  # (x, sprite, kode mata kuliah, warna, judul) — 3 di sayap kiri, 3 di sayap kanan
    (2, "rak_biru", "logika-komputasional", "biru", "Logika Komputasional"),
    (6, "rak_biru_2", "logika-komputasional", "biru", "Logika Komputasional"),
    (10, "rak_oranye", "kecerdasan-buatan", "oranye", "Kecerdasan Buatan"),
    (20, "rak_oranye", "kecerdasan-buatan", "oranye", "Kecerdasan Buatan"),
    (24, "rak_hijau", "", "hijau", "Segera hadir"),
    (28, "rak_hijau_2", "", "hijau", "Segera hadir"),
]

objects = []


def put(spr, foot, scale=2, **kw):
    objects.append({"sprite": spr, "foot": foot, "scale": scale, **kw})


# jendela kayu mengapit gerbang tengah di dinding atas
for x in [13, 19]:
    put((LF, "jendela_kayu"), [x, 2, 2, 1], scale=1.8, collide=False)

# 6 rak buku utama (3 kiri, 3 kanan); dekorasi (warna rak tetap menandai mata kuliah)
for i, (x, spr, course, color, title) in enumerate(SHELVES, 1):
    put((BS, spr), [x, 4, 3, 1], scale=1.85, name=f"rak_{i}")

# 4 kios di sisi kanan: dicerminkan (flip=True) supaya layar menghadap KIRI; dekorasi
for i, y in enumerate([7, 11, 15, 19], 1):
    put((TE, "kios_nyala_a"), [32, y, 2, 1], scale=2, flip=True, name=f"kios_{i}")

# 6 meja baca besar (2 kolom x 3 baris, mengapit lorong tengah x=15..18). Tiap meja membuka katalog materi
# yang sama; titik interaksi = bagian meja yang bertabrakan, jadi bisa didekati dari keempat sisi.
meja = 0
for x in (8, 20):
    for y in (8, 13, 18):
        meja += 1
        put((FU, "meja_baca_panjang"), [x, y, 6, 4], scale=1.55, collide_rect=[x, y + 1, 6, 2],
            type="materi", name=f"meja_baca_{meja}", props={"tableId": meja}, interact=[x, y + 1, 6, 2])

# meja pustakawan & NPC di kiri bawah
put((FU, "meja_pustakawan"), [2, 21, 5, 3], scale=2)
objects.append({"type": "npc", "name": "pustakawan", "foot": [3, 20, 1, 1], "interact": [3, 24, 2, 1],
                "props": {"npc": "pustakawan", "dialog": "tutorial-perpustakaan"}})
put((FU, "papan_tulis_beroda"), [2, 15, 3, 1], scale=1.8)

# area belajar mandiri & pojok baca di baris bawah
put((TE, "bilik_belajar_tiga"), [9, 24, 5, 2], scale=1.75, type="terminal", name="komputer_praktik",
    props={"mode": "terminal"}, interact=[9, 24, 5, 2])
put((FU, "troli_buku"), [16, 24, 3, 2], scale=1.75)
put((FU, "sofa_tunggal_biru_1"), [21, 24, 2, 2], scale=1.85)
put((LOF, "meja_bulat"), [24, 25, 2, 1], scale=1.85)
put((FU, "sofa_tunggal_biru_2"), [27, 24, 2, 2], scale=1.85)

for (x, y) in [(32, 4), (1, 25), (32, 25)]:
    put((FU, "tanaman_pakis"), [x, y, 2, 1], scale=2)

LAYOUT = {
    "id": "perpustakaan", "title": "Perpustakaan Al-Khawarizmi", "w": 36, "h": 28, "capacity": 40,
    "floor": {
        "base": [(f"lantai_parket_{c}", (LF, f"lantai_parket_{c}")) for c in "abcd"],
        "carpet": {"rect": [7, 7, 28, 22],
                   "tiles": [("karpet_navy_a", (LF, "karpet_navy_a")), ("karpet_navy_b", (LF, "karpet_navy_b"))]},
    },
    "wall": {"dark": ("panel_navy_gelap", (LF, "panel_navy_gelap")),
             "face": [("dinding_krem_a", (LF, "dinding_krem_a")), ("dinding_krem_b", (LF, "dinding_krem_b"))],
             "top_rows": 4, "face_rows": 3, "openings": [[0, 10, 1, 3]]},
    "objects": objects,
    "doors": [{"rect": [0, 10, 1, 3], "target": "kampus", "spawn": "dari_perpustakaan", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2.5, 11.5]}],
    "zones": [{"name": "perpustakaan", "rect": [0, 0, 36, 28], "chatRadius": 3, "chatPublic": False}],
}
