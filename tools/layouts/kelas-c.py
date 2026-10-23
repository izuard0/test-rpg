"""Tata letak Auditorium Turing (kelas-c), 28x21 petak, 6 meja x 5 baris x 2 kursi = 60 + 2 penonton. Satuan: petak.

Layar proyektor besar, TV pendamping, meja dosen, dan podium di panggung depan; karpet auditorium biru-abu."""

CF = "classroom_floor_wall"
CR = "classroom_front"
AU = "auditorium_seats"
LF_ = "library_floor_wall"
LFU = "library_furniture"

objects = [
    {"sprite": (AU, "layar_proyektor_besar"), "foot": [9, 3, 10, 1], "scale": 2, "collide": False,
     "type": "board", "name": "layar_utama"},
    {"sprite": (CR, "tv_nyala"), "foot": [4, 2, 3, 1], "scale": 1.4, "collide": False},
    {"sprite": (CR, "tv_nyala"), "foot": [21, 2, 3, 1], "scale": 1.4, "collide": False},
    {"sprite": (AU, "podium_laptop"), "foot": [6, 5, 2, 1], "scale": 1.5, "type": "teacher_desk", "name": "podium",
     "props": {"role": "dosen"}, "interact": [6, 6, 2, 1]},
    {"sprite": (CR, "meja_dosen"), "foot": [12, 5, 4, 1], "scale": 1.45},
    {"sprite": (AU, "speaker_ganda"), "foot": [2, 4, 2, 1], "scale": 1.8, "collide": False},
    {"sprite": (AU, "speaker_ganda"), "foot": [24, 4, 2, 1], "scale": 1.8, "collide": False},
    {"sprite": (AU, "rak_perangkat"), "foot": [1, 6, 1, 1], "scale": 1.6},
    {"sprite": (AU, "rak_perangkat"), "foot": [26, 6, 1, 1], "scale": 1.6},
    {"sprite": (CR, "jam_oranye"), "foot": [25, 1, 1, 1], "scale": 1.4, "collide": False},
    {"sprite": (CR, "ac"), "foot": [2, 1, 2, 1], "scale": 1.5, "collide": False},
    {"sprite": (CF, "pintu_kelas"), "foot": [0, 17, 1, 1], "scale": 1.5, "collide": False, "door": True},
    {"sprite": (LFU, "tanaman_pakis"), "foot": [1, 19, 2, 1], "scale": 1.6},
    {"sprite": (LFU, "tanaman_pakis"), "foot": [25, 19, 2, 1], "scale": 1.6},
]
seat = 0
for r, y in enumerate([9, 11, 13, 15, 17]):
    for c, x in enumerate([2, 6, 10, 15, 19, 23]):
        objects.append({"sprite": (AU, "meja_komputer_nyala"), "foot": [x, y, 3, 1], "scale": 1.05})
        for k, cx in enumerate([x, x + 2]):
            seat += 1
            objects.append({"sprite": (AU, "kursi_putar"), "foot": [cx, y + 1, 1, 1], "scale": 1.1, "type": "seat",
                            "name": f"kursi_{seat}", "collide": False,
                            "props": {"seatId": seat, "row": r + 1, "col": c * 2 + k + 1},
                            "interact": [cx, y + 1, 1, 1]})

BIRU = [("karpet_biru_a", (LF_, "karpet_navy_a")), ("karpet_biru_b", (LF_, "karpet_navy_b"))]
LAYOUT = {
    "id": "kelas-c", "title": "Auditorium Turing", "w": 28, "h": 21, "capacity": 62,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [[2, 8, 25, 18]], "tiles": BIRU},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 3, "face_rows": 2, "openings": [[0, 17, 1, 2]]},
    "objects": objects,
    "doors": [{"rect": [0, 17, 1, 2], "target": "kampus", "spawn": "dari_kelas_c", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2, 18]}],
    "zones": [{"name": "kelas-c", "rect": [0, 0, 28, 21], "chatRadius": 3, "chatPublic": False}],
}
