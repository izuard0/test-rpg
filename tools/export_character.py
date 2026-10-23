"""Membuat paket karakter siap pakai untuk klien: export/character/

Masukan : prototype/karakter/atlas.png + atlas.json (hasil process_character.py),
          tools/character_config.json, tools/head_adjust.json
Keluaran: export/character/{atlas.png, atlas.json, config.json, head_adjust.json}

Atlas ramping: varian ukuran kepala (_s95 ... _s80) dibuang karena belum ada
gaya yang memakainya (lihat head_adjust.json: tidak ada kunci "scale").
Skrip juga memeriksa bahwa semua pilihan di konfigurasi ada di atlas; bila ada
yang hilang, skrip berhenti dengan kode keluar 1.
"""
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "prototype" / "karakter"
OUT = ROOT / "export" / "character"
SCALED = re.compile(r"_s\d+$")


def validate(meta, cfg, adj):
    err = []
    heads, sets, acc, bags = meta["heads"], meta["sets"], meta["acc"], meta["bags"]
    for g, G in cfg["genders"].items():
        for h in G["heads"]:
            if h not in heads:
                err.append(f"{g}: kepala '{h}' tidak ada di atlas")
            if h not in cfg["headCategory"]:
                err.append(f"{g}: kepala '{h}' belum punya kategori warna")
        for s in G["sets"]:
            if s not in sets:
                err.append(f"{g}: baju '{s}' tidak ada di atlas")
            if G["btype"] == "b" and s + "_b" not in sets:
                err.append(f"{g}: baju '{s}' tidak punya varian ramping '{s}_b'")
        d = G["def"]
        if d["head"] not in G["heads"] or d["set"] not in G["sets"]:
            err.append(f"{g}: setelan bawaan tidak ada di daftar pilihan")
        if d["head"].startswith("hijab") and d["set"] not in cfg["hijabSets"]:
            err.append(f"{g}: setelan bawaan berhijab memakai baju yang tidak boleh")
    for s in cfg["hijabSets"]:
        if s not in sets:
            err.append(f"hijabSets: '{s}' tidak ada di atlas")
    for slot, lst in cfg["accessories"].items():
        for a in lst:
            if a not in acc and a not in bags:
                err.append(f"aksesori '{a}' ({slot}) tidak ada di atlas")
    for g, styles in adj.items():
        if g.startswith("_") or g == "locked":
            continue
        for h, dirs in styles.items():
            if "scale" in dirs:
                err.append(f"head_adjust {g}/{h}: ada 'scale', tapi atlas ramping tidak punya varian ukuran")
    return err


def main():
    meta = json.loads((SRC / "atlas.json").read_text())
    cfg = json.loads((ROOT / "tools" / "character_config.json").read_text(encoding="utf-8"))
    adj = json.loads((ROOT / "tools" / "head_adjust.json").read_text(encoding="utf-8"))
    errors = validate(meta, cfg, adj)
    if errors:
        print("GAGAL, konfigurasi tidak cocok dengan atlas:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    atlas = np.array(Image.open(SRC / "atlas.png").convert("RGBA"))
    keep = {k: f for k, f in meta["frames"].items() if not SCALED.search(k)}
    # susun ulang (rak, tinggi menurun)
    W = 512
    order = sorted(keep.items(), key=lambda kv: (-kv[1]["h"], kv[0]))
    places, x, y, rowh = {}, 0, 0, 0
    for k, f in order:
        if x + f["w"] > W:
            x, y, rowh = 0, y + rowh + 1, 0
        places[k] = {"x": x, "y": y, "w": f["w"], "h": f["h"]}
        x += f["w"] + 1
        rowh = max(rowh, f["h"])
    H = (y + rowh + 1 + 3) // 4 * 4
    out = np.zeros((H, W, 4), np.uint8)
    for k, p in places.items():
        f = keep[k]
        out[p["y"]:p["y"] + p["h"], p["x"]:p["x"] + p["w"]] = atlas[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]]

    slim = {k: v for k, v in meta.items() if k not in ("frames", "headScale", "accScale")}
    slim["frames"] = places
    slim["tile"] = cfg["tile"]
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out).save(OUT / "atlas.png", optimize=True)
    (OUT / "atlas.json").write_text(json.dumps(slim, indent=1))
    shutil.copyfile(ROOT / "tools" / "character_config.json", OUT / "config.json")
    shutil.copyfile(ROOT / "tools" / "head_adjust.json", OUT / "head_adjust.json")

    full = (SRC / "atlas.png").stat().st_size
    print(f"sprite: {len(places)} (dibuang {len(meta['frames']) - len(places)} varian ukuran)")
    print(f"atlas : {W}x{H} px, {(OUT / 'atlas.png').stat().st_size // 1024} KB (penuh: {full // 1024} KB)")
    print(f"tulis : {OUT}")


if __name__ == "__main__":
    main()
