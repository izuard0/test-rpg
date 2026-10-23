"""Tata letak Auditorium Turing (kelas-c), 28x21 petak, 6 meja x 5 baris x 2 kursi = 60 + 2 penonton. Satuan: petak.

Layar proyektor besar dan podium di depan; meja komputer dan kursi 1x."""

CF = "classroom_floor_wall"
CR = "classroom_front"
AU = "auditorium_seats"
LOF = "lobby_furniture"

objects = [
    {"sprite": (AU, "layar_proyektor_besar"), "foot": [9, 4, 10, 1], "scale": 2, "collide": False,
     "type": "board", "name": "layar_utama"},
    {"sprite": (AU, "podium_laptop"), "foot": [4, 6, 1, 1], "type": "teacher_desk", "name": "podium",
     "props": {"role": "dosen"}, "interact": [4, 7, 1, 1]},
    {"sprite": (AU, "speaker_ganda"), "foot": [2, 3, 2, 1], "collide": False},
    {"sprite": (AU, "speaker_ganda"), "foot": [24, 3, 2, 1], "collide": False},
    {"sprite": (CR, "jam_oranye"), "foot": [24, 1, 1, 1], "collide": False},
    {"sprite": (CR, "ac"), "foot": [4, 1, 2, 1], "collide": False},
    {"sprite": (CF, "pintu_kelas"), "foot": [0, 17, 1, 1], "collide": False, "door": True},
    {"sprite": (LOF, "tanaman_a"), "foot": [1, 19, 1, 1]},
    {"sprite": (LOF, "tanaman_a"), "foot": [26, 19, 1, 1]},
]
seat = 0
for r, y in enumerate([9, 11, 13, 15, 17]):
    for c, x in enumerate([2, 6, 10, 15, 19, 23]):
        objects.append({"sprite": (AU, "meja_komputer_nyala"), "foot": [x, y, 3, 1]})
        for k, cx in enumerate([x, x + 2]):
            seat += 1
            objects.append({"sprite": (AU, "kursi_putar"), "foot": [cx, y + 1, 1, 1], "type": "seat",
                            "name": f"kursi_{seat}", "collide": False,
                            "props": {"seatId": seat, "row": r + 1, "col": c * 2 + k + 1},
                            "interact": [cx, y + 1, 1, 1]})

LAYOUT = {
    "id": "kelas-c", "title": "Auditorium Turing", "w": 28, "h": 21, "capacity": 62,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [-1, -1, -1, -1], "tiles": [("lantai_a", (CF, "lantai_a"))]},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 2, "openings": [[0, 17, 1, 2]]},
    "objects": objects,
    "doors": [{"rect": [0, 17, 1, 2], "target": "kampus", "spawn": "dari_kelas_c", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2, 18]}],
    "zones": [{"name": "kelas-c", "rect": [0, 0, 28, 21], "chatRadius": 3, "chatPublic": False}],
}
