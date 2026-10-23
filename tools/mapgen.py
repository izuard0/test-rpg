"""Pembuat peta Tiled (.tmj) dari spesifikasi tata letak (docs/PETA.md).

Tiga bagian:
  build_room(layout)   -> menulis maps/<id>.tmj + set tile di maps/tilesets/
  validate(tmj)        -> memeriksa berkas peta (gid, gambar, id objek)
  render(tmj, out)     -> menggambar peta DARI berkas .tmj (bukan dari spesifikasi),
                          sehingga sekaligus menguji berkas yang dihasilkan

Satuan spesifikasi adalah petak; berkas peta memakai piksel (petak = tile di
tools/character_config.json). Tile objek Tiled berpatokan pada tepi BAWAH-kiri.
"""
import json
import os
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TL = ROOT / "export" / "tiles"
MAPS = ROOT / "maps"
TS = MAPS / "tilesets"
T = json.loads((ROOT / "tools" / "character_config.json").read_text(encoding="utf-8"))["tile"]
TILED = "1.10.2"
BG = "#1b2a41"


# ------------------------------------------------------------------ util
def sprite_path(sheet, name):
    hits = sorted((TL / sheet / "sprites").glob(f"*_{name}.png"))
    if not hits:
        raise FileNotFoundError(f"sprite tidak ditemukan: {sheet}/{name}")
    return hits[0]


def props(d):
    out = []
    for k, v in (d or {}).items():
        t = "bool" if isinstance(v, bool) else "int" if isinstance(v, int) else "float" if isinstance(v, float) else "string"
        out.append({"name": k, "type": t, "value": v})
    return out


def rel(path, start):
    return os.path.relpath(path, start).replace("\\", "/")


# ------------------------------------------------------------------ set tile
def clean_tile(name, im):
    """Buang garis tepi bawaan sprite yang membentuk kisi/garis saat petak diulang."""
    if name == "panel_navy_gelap":                       # baris atas dan kolom kanan lebih terang
        return im.crop((0, 5, 22, im.height))
    if name.startswith("karpet_navy_") and "sudut" not in name:   # garis cokelat dekat tepi atas/bawah
        a = np.array(im)
        h = a.shape[0]
        brown = lambda row: (row[:, 0].astype(int) > row[:, 2].astype(int) + 25).mean() > .5
        for y in list(range(0, 3)):
            if brown(a[y]):
                a[y] = a[3]
        for y in list(range(h - 3, h)):
            if brown(a[y]):
                a[y] = a[h - 4]
        return Image.fromarray(a)
    return im


def build_floor_tileset(tiles, name="floor-wall"):
    """tiles: [(nama, (lembar, sprite))]. Tiap sprite dinormalisasi ke T x T (nearest)."""
    TS.mkdir(parents=True, exist_ok=True)
    cols = 8
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * T, rows * T), (0, 0, 0, 0))
    ids, info, notes = {}, [], []
    for i, (tname, (sh, sp)) in enumerate(tiles):
        im = Image.open(sprite_path(sh, sp)).convert("RGBA")
        src = im.size
        im = clean_tile(tname, im).resize((T, T), Image.NEAREST)
        holes = float((np.array(im)[..., 3] < 255).mean())
        if holes:
            notes.append(f"{tname}: {holes * 100:.0f}% piksel transparan")
        sheet.paste(im, ((i % cols) * T, (i // cols) * T))
        ids[tname] = i
        info.append({"id": i, "properties": props({"name": tname, "sumber": f"{sh}/{sp} {src[0]}x{src[1]}"})})
    sheet.save(TS / f"{name}.png", optimize=True)
    tsj = {"columns": cols, "image": f"{name}.png", "imageheight": rows * T, "imagewidth": cols * T,
           "margin": 0, "name": name, "spacing": 0, "tilecount": len(tiles), "tiledversion": TILED,
           "tileheight": T, "tilewidth": T, "type": "tileset", "version": "1.10", "tiles": info}
    (TS / f"{name}.tsj").write_text(json.dumps(tsj, indent=1), encoding="utf-8")
    return ids, notes


def build_object_tileset(sprites, name):
    """Set 'kumpulan gambar': tiap sprite satu tile dengan gambarnya sendiri."""
    TS.mkdir(parents=True, exist_ok=True)
    ids, tiles, mw, mh = {}, [], 0, 0
    for i, key in enumerate(sprites):
        path = sprite_path(*key)
        w, h = Image.open(path).size
        mw, mh = max(mw, w), max(mh, h)
        ids[key] = i
        tiles.append({"id": i, "image": rel(path, TS), "imageheight": h, "imagewidth": w,
                      "properties": props({"name": key[1], "lembar": key[0]})})
    tsj = {"columns": 0, "grid": {"height": 1, "orientation": "orthogonal", "width": 1}, "margin": 0,
           "name": name, "spacing": 0, "tilecount": len(tiles), "tiledversion": TILED,
           "tileheight": mh, "tilewidth": mw, "type": "tileset", "version": "1.10", "tiles": tiles}
    (TS / f"{name}.tsj").write_text(json.dumps(tsj, indent=1), encoding="utf-8")
    return ids


# ------------------------------------------------------------------ bangun peta
def merge_runs(solid):
    """Grid boolean -> daftar persegi (x, y, w, h) petak: run per baris, lalu gabung vertikal."""
    H, W = len(solid), len(solid[0])
    rects, open_ = [], {}
    for y in range(H + 1):
        runs, x = [], 0
        while y < H and x < W:
            if solid[y][x]:
                x0 = x
                while x < W and solid[y][x]:
                    x += 1
                runs.append((x0, x))
            else:
                x += 1
        # gabung: run yang sama dengan baris sebelumnya memperpanjang persegi
        new_open = {}
        for r in runs:
            if r in open_:
                new_open[r] = (open_[r][0], open_[r][1] + 1)
            else:
                new_open[r] = (y, 1)
        for r, (y0, hh) in open_.items():
            if r not in new_open:
                rects.append((r[0], y0, r[1] - r[0], hh))
        open_ = new_open
    return rects


def build_room(L):
    rid, W, H = L["id"], L["w"], L["h"]
    rng = random.Random(7)
    floor_names = {}
    for n, sp in L["floor"]["base"]:
        floor_names[n] = sp
    for n, sp in L["floor"]["carpet"]["tiles"]:
        floor_names[n] = sp
    for n, sp in L["wall"]["face"] + [L["wall"]["dark"]]:
        floor_names[n] = sp
    ftiles = [(n, sp) for n, sp in floor_names.items()]
    fids, notes = build_floor_tileset(ftiles, name=f"{rid}-floor-wall")

    sprites = []
    for o in L["objects"]:
        if o.get("sprite") and o["sprite"] not in sprites:
            sprites.append(o["sprite"])
    oids = build_object_tileset(sprites, name=f"{rid}-objects")
    first_obj = 1 + len(ftiles)

    # lapisan petak
    floor = [[0] * W for _ in range(H)]
    base = [n for n, _ in L["floor"]["base"]]
    cx0, cy0, cx1, cy1 = L["floor"]["carpet"]["rect"]
    carpet = [n for n, _ in L["floor"]["carpet"]["tiles"]]
    for y in range(H):
        for x in range(W):
            in_c = cx0 <= x <= cx1 and cy0 <= y <= cy1
            floor[y][x] = 1 + fids[rng.choice(carpet if in_c else base)]
    walls = [[0] * W for _ in range(H)]
    solid = [[False] * W for _ in range(H)]
    opening = {(x, y) for (ox, oy, ow, oh) in L["wall"]["openings"]
               for x in range(ox, ox + ow) for y in range(oy, oy + oh)}
    dark = 1 + fids[L["wall"]["dark"][0]]
    face = [1 + fids[n] for n, _ in L["wall"]["face"]]
    top = L["wall"]["top_rows"]
    for y in range(H):
        for x in range(W):
            edge = y < top or x == 0 or x == W - 1 or y == H - 1
            if not edge or (x, y) in opening:
                continue
            solid[y][x] = True
            walls[y][x] = rng.choice(face) if (y == top - 1 and 0 < x < W - 1) else dark

    nid = {"layer": 1, "obj": 1}

    def new_obj():
        nid["obj"] += 1
        return nid["obj"] - 1

    def layer(name, **kw):
        nid["layer"] += 1
        return {"id": nid["layer"] - 1, "name": name, "opacity": 1, "visible": True, "x": 0, "y": 0, **kw}

    def tilelayer(name, grid):
        return layer(name, type="tilelayer", width=W, height=H, data=[v for row in grid for v in row])

    def objlayer(name, objs):
        return layer(name, type="objectgroup", draworder="topdown", objects=objs)

    below, objects, above, collision, interact, spawn, zones = [], [], [], [], [], [], []
    for o in L["objects"]:
        fx, fy, fw, fh = o["foot"]
        if o.get("sprite"):
            w, h = Image.open(sprite_path(*o["sprite"])).size
            ob = {"id": new_obj(), "gid": first_obj + oids[o["sprite"]], "name": o["sprite"][1],
                  "type": o.get("type", "decor"), "width": w, "height": h, "rotation": 0, "visible": True,
                  "x": fx * T + (fw * T - w) // 2, "y": (fy + fh) * T, "properties": props(o.get("props"))}
            {"below": below, "above": above}.get(o.get("layer"), objects).append(ob)
        if o.get("collide", True) and o.get("sprite"):
            collision.append({"id": new_obj(), "name": o["sprite"][1], "type": "collision", "x": fx * T, "y": fy * T,
                              "width": fw * T, "height": fh * T, "rotation": 0, "visible": True})
        if o.get("interact"):
            ix, iy, iw, ih = o["interact"]
            interact.append({"id": new_obj(), "name": o.get("name") or (o["sprite"][1] if o.get("sprite") else o["type"]),
                             "type": o["type"], "x": ix * T, "y": iy * T, "width": iw * T, "height": ih * T,
                             "rotation": 0, "visible": True, "properties": props(o.get("props"))})
    for (x, y, w, h) in merge_runs(solid):
        collision.append({"id": new_obj(), "name": "dinding", "type": "collision", "x": x * T, "y": y * T,
                          "width": w * T, "height": h * T, "rotation": 0, "visible": True})
    for d in L.get("doors", []):
        x, y, w, h = d["rect"]
        interact.append({"id": new_obj(), "name": d.get("label", "pintu"), "type": "door", "x": x * T, "y": y * T,
                         "width": w * T, "height": h * T, "rotation": 0, "visible": True,
                         "properties": props({"target": d["target"], "spawn": d["spawn"], "label": d.get("label", "")})})
    for s in L.get("spawns", []):
        spawn.append({"id": new_obj(), "name": s["name"], "type": "spawn", "point": True,
                      "x": round(s["tile"][0] * T), "y": round(s["tile"][1] * T), "width": 0, "height": 0,
                      "rotation": 0, "visible": True, "properties": props({"name": s["name"]})})
    for z in L.get("zones", []):
        x, y, w, h = z["rect"]
        zones.append({"id": new_obj(), "name": z["name"], "type": "zone", "x": x * T, "y": y * T, "width": w * T,
                      "height": h * T, "rotation": 0, "visible": True,
                      "properties": props({"name": z["name"], "chatRadius": z["chatRadius"], "chatPublic": z["chatPublic"]})})

    layers = [tilelayer("floor", floor), tilelayer("walls", walls), objlayer("below", below),
              objlayer("objects", objects), objlayer("above", above), objlayer("collision", collision),
              objlayer("interact", interact), objlayer("spawn", spawn), objlayer("zones", zones)]
    tmj = {"compressionlevel": -1, "height": H, "width": W, "tilewidth": T, "tileheight": T, "infinite": False,
           "orientation": "orthogonal", "renderorder": "right-down", "type": "map", "version": "1.10",
           "tiledversion": TILED, "backgroundcolor": BG, "nextlayerid": nid["layer"], "nextobjectid": nid["obj"],
           "properties": props({"roomId": rid, "title": L["title"], "capacity": L["capacity"], "tile": T}),
           "tilesets": [{"firstgid": 1, "source": f"tilesets/{rid}-floor-wall.tsj"},
                        {"firstgid": first_obj, "source": f"tilesets/{rid}-objects.tsj"}],
           "layers": layers}
    MAPS.mkdir(parents=True, exist_ok=True)
    path = MAPS / f"{rid}.tmj"
    path.write_text(json.dumps(tmj, indent=1), encoding="utf-8")
    return path, notes


# ------------------------------------------------------------------ validasi
def _tilesets(m, base):
    out = []
    for ts in m["tilesets"]:
        d = json.loads((base / ts["source"]).read_text(encoding="utf-8"))
        out.append((ts["firstgid"], d, (base / ts["source"]).parent))
    return out


def validate(tmj_path):
    err = []
    base = Path(tmj_path).parent
    m = json.loads(Path(tmj_path).read_text(encoding="utf-8"))
    sets = _tilesets(m, base)
    ranges = [(fg, fg + d["tilecount"] - 1) for fg, d, _ in sets]
    ok = lambda g: g == 0 or any(a <= g <= b for a, b in ranges)
    for fg, d, folder in sets:
        for t in d.get("tiles", []):
            if "image" in t and not (folder / t["image"]).exists():
                err.append(f"gambar tidak ada: {t['image']}")
        if "image" in d and not (folder / d["image"]).exists():
            err.append(f"gambar set tidak ada: {d['image']}")
    ids, lids = set(), set()
    for L in m["layers"]:
        if L["id"] in lids:
            err.append(f"id lapisan ganda: {L['id']}")
        lids.add(L["id"])
        if L["type"] == "tilelayer":
            if len(L["data"]) != m["width"] * m["height"]:
                err.append(f"{L['name']}: panjang data salah")
            bad = [g for g in L["data"] if not ok(g)]
            if bad:
                err.append(f"{L['name']}: gid tak dikenal {sorted(set(bad))[:5]}")
        else:
            for o in L["objects"]:
                if o["id"] in ids:
                    err.append(f"id objek ganda: {o['id']}")
                ids.add(o["id"])
                if "gid" in o and not ok(o["gid"]):
                    err.append(f"{L['name']}/{o.get('name')}: gid {o['gid']} tak dikenal")
    if m["nextobjectid"] <= max(ids, default=0) or m["nextlayerid"] <= max(lids):
        err.append("nextobjectid/nextlayerid terlalu kecil")
    return err


# ------------------------------------------------------------------ gambar
def render(tmj_path, out_path, debug=False, scale=2):
    base = Path(tmj_path).parent
    m = json.loads(Path(tmj_path).read_text(encoding="utf-8"))
    tw, th = m["tilewidth"], m["tileheight"]
    W, H = m["width"] * tw, m["height"] * th
    img = Image.new("RGBA", (W, H), m["backgroundcolor"])
    sets = _tilesets(m, base)
    cache = {}

    def tile_img(gid):
        if gid in cache:
            return cache[gid]
        for fg, d, folder in reversed(sets):
            if gid >= fg:
                lid = gid - fg
                if "image" in d:
                    sheet = cache.setdefault(("sheet", id(d)), Image.open(folder / d["image"]).convert("RGBA"))
                    c, r = lid % d["columns"], lid // d["columns"]
                    im = sheet.crop((c * tw, r * th, (c + 1) * tw, (r + 1) * th))
                else:
                    t = next(t for t in d["tiles"] if t["id"] == lid)
                    im = Image.open(folder / t["image"]).convert("RGBA")
                cache[gid] = im
                return im
        raise KeyError(gid)

    for L in m["layers"]:
        if L["type"] == "tilelayer":
            for i, g in enumerate(L["data"]):
                if g:
                    img.alpha_composite(tile_img(g), ((i % m["width"]) * tw, (i // m["width"]) * th))
        elif L["name"] in ("below", "objects", "above"):
            for o in sorted(L["objects"], key=lambda o: o["y"]):
                im = tile_img(o["gid"])
                img.alpha_composite(im, (int(o["x"]), int(o["y"]) - im.height))
    if debug:
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        for L in m["layers"]:
            if L["type"] != "objectgroup":
                continue
            for o in L["objects"]:
                x, y, w, h = o["x"], o["y"], o.get("width", 0), o.get("height", 0)
                if L["name"] == "collision":
                    d.rectangle([x, y, x + w - 1, y + h - 1], fill=(220, 40, 40, 70), outline=(220, 40, 40, 255))
                elif L["name"] == "interact":
                    col = (250, 200, 30, 255) if o["type"] == "door" else (40, 200, 220, 255)
                    d.rectangle([x, y, x + w - 1, y + h - 1], fill=col[:3] + (60,), outline=col)
                elif L["name"] == "spawn":
                    d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(60, 220, 90, 255), outline=(0, 0, 0, 255))
                elif L["name"] == "zones":
                    d.rectangle([x, y, x + w - 1, y + h - 1], outline=(255, 255, 255, 200))
        img = Image.alpha_composite(img, ov)
    img.convert("RGB").resize((W * scale, H * scale), Image.NEAREST).save(out_path)
