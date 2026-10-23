"""Tata letak Lab Lovelace (kelas-a), 20x21 petak, 30 kursi + 2 penonton (docs/PETA.md). Satuan: petak.

Meja komputer dan kursi disesuaikan skalanya agar proporsional dengan perangkat depan kelas (papan tulis, TV,
meja dosen, podium). Objek bertanda door=True dibuang saat dipakai di peta kampus."""

AU = "auditorium_seats"
CF = "classroom_floor_wall"
CR = "classroom_front"
LB = "lab_computer_desks"
LF_ = "library_floor_wall"
LOF = "lobby_furniture"

objects = [
    {"sprite": (CR, "papan_tulis"), "foot": [7, 2, 5, 1], "scale": 1.6, "type": "board", "name": "papan_tulis", "collide": False},
    {"sprite": (CR, "tv_nyala"), "foot": [2, 2, 3, 1], "scale": 1.4, "collide": False},
    {"sprite": (CR, "ac"), "foot": [14, 1, 3, 1], "scale": 1.5, "collide": False},
    {"sprite": (CR, "jam_oranye"), "foot": [18, 1, 1, 1], "scale": 1.4, "collide": False},
    {"sprite": (CR, "meja_dosen"), "foot": [7, 4, 4, 1], "scale": 1.45, "type": "teacher_desk", "name": "meja_dosen",
     "props": {"role": "dosen"}, "interact": [7, 5, 4, 1]},
    {"sprite": (CR, "podium"), "foot": [12, 4, 2, 1], "scale": 1.45},
    {"sprite": (AU, "rak_perangkat"), "foot": [17, 4, 1, 1], "scale": 1.5},
    {"sprite": (CR, "speaker"), "foot": [1, 4, 1, 1], "scale": 1.6},
    {"sprite": (CF, "pintu_kelas"), "foot": [0, 17, 1, 1], "scale": 1.5, "collide": False, "door": True},
    {"sprite": (LOF, "tanaman_d"), "foot": [1, 19, 1, 1], "scale": 2},
    {"sprite": (LOF, "tanaman_d"), "foot": [18, 19, 1, 1], "scale": 2},
]
seat = 0
for r, y in enumerate([7, 9, 11, 13, 15]):
    for c, x in enumerate([2, 8, 14]):
        objects.append({"sprite": (LB, "meja_komputer_nyala"), "foot": [x, y, 4, 1], "scale": 1.15})
        for k, cx in enumerate([x, x + 2]):
            seat += 1
            objects.append({"sprite": (LB, "kursi_putar_a"), "foot": [cx, y + 1, 2, 1], "scale": 1.15, "type": "seat",
                            "name": f"kursi_{seat}", "collide": False,
                            "props": {"seatId": seat, "row": r + 1, "col": c * 2 + k + 1},
                            "interact": [cx, y + 1, 1, 1]})

BIRU = [("karpet_biru_a", (LF_, "karpet_navy_a")), ("karpet_biru_b", (LF_, "karpet_navy_b"))]
LAYOUT = {
    "id": "kelas-a", "title": "Lab Lovelace", "w": 20, "h": 21, "capacity": 32,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [[6, 3, 13, 5], [7, 6, 12, 18]], "tiles": BIRU},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 3, "face_rows": 2, "openings": [[0, 17, 1, 2]]},
    "objects": objects,
    "doors": [{"rect": [0, 17, 1, 2], "target": "kampus", "spawn": "dari_lab_lovelace", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2, 18]}],
    "zones": [{"name": "kelas-a", "rect": [0, 0, 20, 21], "chatRadius": 3, "chatPublic": True}],
}
