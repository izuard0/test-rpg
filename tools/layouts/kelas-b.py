"""Tata letak Ruang Kolaborasi (kelas-b), 24x23 petak, 9 meja heksagon x 5 kursi = 45 + 2 penonton. Satuan: petak.

Meja heksagon (smart_class_pods) diperbesar ke 1.25x agar seimbang dengan ruang dan perabot depan kelas."""

CF = "classroom_floor_wall"
CR = "classroom_front"
LF_ = "library_floor_wall"
LFU = "library_furniture"
SP = "smart_class_pods"
LOF = "lobby_furniture"

objects = [
    {"sprite": (CR, "papan_tulis"), "foot": [9, 2, 6, 1], "scale": 1.6, "type": "board", "name": "papan_tulis", "collide": False},
    {"sprite": (CR, "layar_proyektor"), "foot": [3, 2, 4, 1], "scale": 1.35, "collide": False},
    {"sprite": (CR, "tv_nyala"), "foot": [17, 2, 3, 1], "scale": 1.4, "collide": False},
    {"sprite": (CR, "jam_oranye"), "foot": [21, 1, 1, 1], "scale": 1.4, "collide": False},
    {"sprite": (CR, "meja_dosen"), "foot": [9, 4, 4, 1], "scale": 1.45, "type": "teacher_desk", "name": "meja_dosen",
     "props": {"role": "dosen"}, "interact": [9, 5, 4, 1]},
    {"sprite": (CR, "podium"), "foot": [14, 4, 2, 1], "scale": 1.45},
    {"sprite": (SP, "papan_tulis_kecil"), "foot": [2, 5, 2, 1], "scale": 1.6},
    {"sprite": (SP, "papan_tulis_kecil"), "foot": [20, 5, 2, 1], "scale": 1.6},
    {"sprite": (CF, "pintu_kelas"), "foot": [0, 19, 1, 1], "scale": 1.5, "collide": False, "door": True},
    {"sprite": (LFU, "tanaman_pakis"), "foot": [1, 20, 2, 1], "scale": 1.6},
    {"sprite": (LFU, "tanaman_pakis"), "foot": [21, 20, 2, 1], "scale": 1.6},
]
seat = 0
for r, y in enumerate([8, 13, 18]):
    for c, x in enumerate([3, 10, 17]):
        objects.append({"sprite": (SP, "meja_heksagon_nyala"), "foot": [x, y, 4, 3], "scale": 1.25,
                        "collide_rect": [x, y + 1, 4, 1]})
        for k, (sx, sy) in enumerate([(x + 1, y), (x, y + 1), (x + 2, y + 1), (x + 1, y + 2), (x + 2, y)]):
            seat += 1
            objects.append({"type": "seat", "name": f"kursi_{seat}", "foot": [sx, sy, 1, 1], "interact": [sx, sy, 1, 1],
                            "props": {"seatId": seat, "row": r + 1, "col": c + 1, "pod": r * 3 + c + 1}})

TERAKOTA = [("karpet_terakota_a", (LF_, "karpet_navy_a")), ("karpet_terakota_b", (LF_, "karpet_navy_b"))]
LAYOUT = {
    "id": "kelas-b", "title": "Ruang Kolaborasi", "w": 24, "h": 23, "capacity": 47,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [[2, 7, 21, 20]], "tiles": TERAKOTA},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 3, "face_rows": 2, "openings": [[0, 19, 1, 2]]},
    "objects": objects,
    "doors": [{"rect": [0, 19, 1, 2], "target": "kampus", "spawn": "dari_kelas_b", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2, 20]}],
    "zones": [{"name": "kelas-b", "rect": [0, 0, 24, 23], "chatRadius": 3, "chatPublic": False}],
}
