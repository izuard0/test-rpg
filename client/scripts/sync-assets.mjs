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

// Materi: bahan_ajar/<Mata Kuliah>/*.html disalin apa adanya, lalu katalognya dibuat otomatis
// (judul dari <title>, urutan minggu dari nama berkas). Dosen cukup menaruh berkas di folder itu.
const BAHAN = join(ROOT, "bahan_ajar");
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const courses = [];
if (existsSync(BAHAN)) {
  for (const dir of readdirSync(BAHAN, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const items = [];
    for (const f of readdirSync(join(BAHAN, dir)).filter((f) => /\.html?$/i.test(f)).sort()) {
      const abs = join(BAHAN, dir, f);
      copy(abs);
      const html = readFileSync(abs, "utf8");
      const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? f).replace(/\s*·\s*Kuliah\s*$/i, "").trim();
      const week = Number(f.match(/(?:minggu|pertemuan|p)[_\s-]*0*(\d+)/i)?.[1]) || undefined;
      items.push({ title, file: relative(ROOT, abs).split("\\").join("/"), week });
    }
    items.sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || a.title.localeCompare(b.title, "id"));
    courses.push({ code: slug(dir), title: dir, items });
  }
}
writeFileSync(join(OUT, "materi.json"), JSON.stringify({ courses }));

writeFileSync(join(OUT, "maps.json"), JSON.stringify(maps.map((f) => f.replace(/\.tmj$/, ""))));
console.log(`sync-assets: ${copied.size} berkas, ${maps.length} peta -> ${relative(ROOT, OUT)}`);
