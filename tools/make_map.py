"""Bangun peta Tiled: python tools/make_map.py <kode ruangan>   (mis. perpustakaan)

Membaca tools/layouts/<kode>.py, menulis maps/<kode>.tmj + set tile, memvalidasi,
lalu membuat pratinjau di maps/preview/ (bersih dan versi debug).
"""
import importlib.util
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mapgen  # noqa: E402


def main(room):
    spec = importlib.util.spec_from_file_location(room, mapgen.ROOT / "tools" / "layouts" / f"{room}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    path, notes = mapgen.build_room(mod.LAYOUT)
    errors = mapgen.validate(path)
    prev = mapgen.MAPS / "preview"
    prev.mkdir(exist_ok=True)
    big = mod.LAYOUT["w"] * mod.LAYOUT["h"] > 3000          # peta besar: skala 1 agar gambar tidak raksasa
    sc = 1 if big else 2
    mapgen.render(path, prev / f"{room}.png", scale=sc)
    mapgen.render(path, prev / f"{room}-debug.png", debug=True, scale=sc)
    if any(r.get("name") for r in mod.LAYOUT.get("regions", [])) or mod.LAYOUT.get("zones"):
        mapgen.render_annotated(path, prev / f"{room}-denah.png", scale=sc)
    print("peta  :", path)
    for n in notes:
        print("catatan:", n)
    if errors:
        print("GALAT validasi:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("validasi: OK;", "pratinjau:", prev / f"{room}.png")


if __name__ == "__main__":
    main(sys.argv[1])
