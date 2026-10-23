"""Tata letak Ruang Kolaborasi (kelas-b), 24x21 petak, 9 meja heksagon x 5 kursi = 45 + 2 penonton. Satuan: petak.

Meja heksagon (smart_class_pods, 1x) sudah memuat kursinya; kursi logis ditandai lewat area interaksi.
Hanya bagian tengah meja yang bertabrakan, sehingga kursi di atas/bawah bisa dijangkau."""

CF = "classroom_floor_wall"
CR = "classroom_front"
SP = "smart_class_pods"
LOF = "lobby_furniture"

objects = [
    {"sprite": (CR, "papan_tulis"), "foot": [4, 1, 3, 1], "type": "board", "name": "papan_tulis", "collide": False},
    {"sprite": (CR, "tv_nyala"), "foot": [10, 1, 2, 1], "collide": False},
    {"sprite": (CR, "layar_proyektor"), "foot": [15, 2, 3, 1], "collide": False},
    {"sprite": (CR, "jam_oranye"), "foot": [20, 1, 1, 1], "collide": False},
    {"sprite": (CR, "meja_dosen"), "foot": [10, 4, 3, 1], "type": "teacher_desk", "name": "meja_dosen",
     "props": {"role": "dosen"}, "interact": [10, 5, 3, 1]},
    {"sprite": (CF, "pintu_kelas"), "foot": [0, 17, 1, 1], "collide": False, "door": True},
    {"sprite": (LOF, "tanaman_a"), "foot": [1, 19, 1, 1]},
    {"sprite": (LOF, "tanaman_a"), "foot": [22, 19, 1, 1]},
]
seat = 0
for r, y in enumerate([7, 11, 15]):
    for c, x in enumerate([3, 10, 17]):
        objects.append({"sprite": (SP, "meja_heksagon_nyala"), "foot": [x, y, 3, 3], "collide_rect": [x, y + 1, 3, 1]})
        for k, (sx, sy) in enumerate([(x + 1, y), (x, y + 1), (x + 2, y + 1), (x + 1, y + 2), (x + 2, y)]):
            seat += 1
            objects.append({"type": "seat", "name": f"kursi_{seat}", "foot": [sx, sy, 1, 1], "interact": [sx, sy, 1, 1],
                            "props": {"seatId": seat, "row": r + 1, "col": c + 1, "pod": r * 3 + c + 1}})

LAYOUT = {
    "id": "kelas-b", "title": "Ruang Kolaborasi", "w": 24, "h": 21, "capacity": 47,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [-1, -1, -1, -1], "tiles": [("lantai_a", (CF, "lantai_a"))]},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 2, "openings": [[0, 17, 1, 2]]},
    "objects": objects,
    "doors": [{"rect": [0, 17, 1, 2], "target": "kampus", "spawn": "dari_kelas_b", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2, 18]}],
    "zones": [{"name": "kelas-b", "rect": [0, 0, 24, 21], "chatRadius": 3, "chatPublic": False}],
}
