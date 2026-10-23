"""Tata letak Lab Lovelace (kelas-a), 20x18 petak, 30 kursi + 2 penonton (docs/PETA.md). Satuan: petak."""

CF = "classroom_floor_wall"
CR = "classroom_front"
LB = "lab_computer_desks"
DR = "lobby_doors"

objects = [
    {"sprite": (CR, "papan_tulis"), "foot": [8, 1, 3, 1], "type": "board", "name": "papan_tulis", "collide": False},
    {"sprite": (CR, "tv_nyala"), "foot": [2, 1, 2, 1], "collide": False},
    {"sprite": (CR, "ac"), "foot": [14, 1, 2, 1], "collide": False},
    {"sprite": (CR, "jam_oranye"), "foot": [17, 1, 1, 1], "collide": False},
    {"sprite": (CR, "meja_dosen"), "foot": [8, 4, 3, 1], "type": "teacher_desk", "name": "meja_dosen",
     "props": {"role": "dosen"}, "interact": [8, 5, 3, 1]},
    {"sprite": (CR, "podium"), "foot": [12, 4, 1, 1]},
    {"sprite": (CF, "pintu_kelas"), "foot": [0, 16, 1, 1], "collide": False},
]
seat = 0
for r, y in enumerate([6, 8, 10, 12, 14]):
    for c, x in enumerate([3, 8, 13]):
        objects.append({"sprite": (LB, "meja_komputer_nyala"), "foot": [x, y, 3, 1]})
        for k, cx in enumerate([x, x + 2]):
            seat += 1
            objects.append({"sprite": (LB, "kursi_putar_a"), "foot": [cx, y + 1, 1, 1], "type": "seat",
                            "name": f"kursi_{seat}", "collide": False,
                            "props": {"seatId": seat, "row": r + 1, "col": c * 2 + k + 1},
                            "interact": [cx, y + 1, 1, 1]})

LAYOUT = {
    "id": "kelas-a", "title": "Lab Lovelace", "w": 20, "h": 18, "capacity": 32,
    "floor": {
        "base": [(f"lantai_{s}", (CF, f"lantai_{s}")) for s in "abcd"],
        "carpet": {"rect": [-1, -1, -1, -1], "tiles": [("lantai_a", (CF, "lantai_a"))]},
    },
    "wall": {"dark": ("panel_gelap_a", (CF, "panel_gelap_a")),
             "face": [("dinding_biru_a", (CF, "dinding_biru_a")), ("dinding_biru_b", (CF, "dinding_biru_b"))],
             "top_rows": 2, "openings": [[0, 15, 1, 2]]},
    "objects": objects,
    "doors": [{"rect": [0, 15, 1, 2], "target": "lobi", "spawn": "dari_lab_lovelace", "label": "Ke Lobi"}],
    "spawns": [{"name": "dari_lobi", "tile": [2, 16]}],
    "zones": [{"name": "kelas-a", "rect": [0, 0, 20, 18], "chatRadius": 3, "chatPublic": False}],
}
