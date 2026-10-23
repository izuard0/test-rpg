// Menyalin aset yang dipakai klien ke client/public/game/, dengan struktur
// folder yang sama seperti di repo. Jalur relatif di berkas Tiled
// (mis. "../../export/tiles/...") jadi tetap benar tanpa diubah.
//
// Yang disalin hanya yang dirujuk: peta maps/*.tmj, set tile-nya, gambar yang
// disebut set tile, paket karakter, dan materi. Pratinjau dan aset mentah tidak.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "client/public/game");

rmSync(OUT, { recursive: true, force: true });
const copied = new Set();
function copy(abs) {
  const rel = relative(ROOT, abs);
  if (rel.startsWith("..")) throw new Error(`Aset di luar repo: ${abs}`);
  if (copied.has(rel)) return;
  if (!existsSync(abs)) throw new Error(`Aset tidak ditemukan: ${rel}`);
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(abs, dest);
  copied.add(rel);
}

const maps = readdirSync(join(ROOT, "maps")).filter((f) => f.endsWith(".tmj"));
for (const file of maps) {
  const mapPath = join(ROOT, "maps", file);
  copy(mapPath);
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  for (const ts of map.tilesets) {
    const tsPath = resolve(dirname(mapPath), ts.source);
    copy(tsPath);
    const tileset = JSON.parse(readFileSync(tsPath, "utf8"));
    if (tileset.image) copy(resolve(dirname(tsPath), tileset.image));
    for (const t of tileset.tiles ?? []) if (t.image) copy(resolve(dirname(tsPath), t.image));
  }
}
for (const f of ["bg_title.png", "bg_register.jpg", "bg_loading.jpg"]) copy(join(ROOT, "assets/backgrounds", f));
// Ikon UI (penanda interaksi, kelak lencana dan emote).
for (const f of readdirSync(join(ROOT, "export/ui/items/sprites"))) copy(join(ROOT, "export/ui/items/sprites", f));
for (const f of ["atlas.png", "atlas.json", "config.json", "head_adjust.json"]) copy(join(ROOT, "export/character", f));

const materi = join(ROOT, "materi");
if (existsSync(materi)) cpSync(materi, join(OUT, "materi"), { recursive: true });

writeFileSync(join(OUT, "maps.json"), JSON.stringify(maps.map((f) => f.replace(/\.tmj$/, ""))));
console.log(`sync-assets: ${copied.size} berkas, ${maps.length} peta -> ${relative(ROOT, OUT)}`);
