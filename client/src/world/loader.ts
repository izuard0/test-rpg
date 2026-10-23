// Memuat peta Tiled beserta set tile eksternal (.tsj) dan gambarnya.
// Phaser tidak bisa membaca set tile eksternal, jadi set tile digabungkan
// ke dalam data peta sebelum diserahkan ke Phaser.

import Phaser from "phaser";
import { gidIndex, type TiledMap, type TiledTileset } from "@mita/shared";

export const GAME_BASE = "game/";

/** Menggabungkan jalur relatif gaya POSIX ("maps/tilesets/../x.png" -> "maps/x.png"). */
export function joinPath(fromFile: string, rel: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

export interface LoadedTileset {
  firstgid: number;
  data: TiledTileset;
  /** Kunci tekstur untuk set berpetak (satu gambar). */
  imageKey?: string;
  /** Kunci tekstur per id tile untuk set kumpulan gambar. */
  tileKeys: Map<number, string>;
}

export interface LoadedMap {
  code: string;
  map: TiledMap;
  tilesets: LoadedTileset[];
  /** Kunci cache tilemap Phaser (data peta dengan set tile tertanam). */
  tilemapKey: string;
}

/** Menjalankan satu putaran loader Phaser dan menunggu sampai selesai. */
function runLoader(scene: Phaser.Scene, queue: (load: Phaser.Loader.LoaderPlugin) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const load = scene.load;
    const failed: string[] = [];
    const onError = (file: Phaser.Loader.File) => failed.push(file.src);
    queue(load);
    if (load.list.size === 0) return resolve();
    load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    load.once(Phaser.Loader.Events.COMPLETE, () => {
      load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      if (failed.length) reject(new Error(`Gagal memuat: ${failed.join(", ")}`));
      else resolve();
    });
    load.start();
  });
}

const textureKey = (path: string) => `img:${path}`;

export async function loadMap(scene: Phaser.Scene, code: string): Promise<LoadedMap> {
  const mapPath = `maps/${code}.tmj`;
  const tilemapKey = `tilemap:${code}`;
  const jsonKey = `json:${mapPath}`;
  await runLoader(scene, (load) => {
    if (!scene.cache.json.exists(jsonKey)) load.json(jsonKey, GAME_BASE + mapPath);
  });
  const map = scene.cache.json.get(jsonKey) as TiledMap;

  const tsPaths = map.tilesets.map((t) => joinPath(mapPath, t.source));
  await runLoader(scene, (load) => {
    for (const p of tsPaths) if (!scene.cache.json.exists(`json:${p}`)) load.json(`json:${p}`, GAME_BASE + p);
  });

  const tilesets: LoadedTileset[] = map.tilesets.map((ref, i) => {
    const data = scene.cache.json.get(`json:${tsPaths[i]}`) as TiledTileset;
    const ts: LoadedTileset = { firstgid: ref.firstgid, data, tileKeys: new Map() };
    if (data.image) ts.imageKey = textureKey(joinPath(tsPaths[i], data.image));
    for (const t of data.tiles ?? []) if (t.image) ts.tileKeys.set(t.id, textureKey(joinPath(tsPaths[i], t.image)));
    return ts;
  });

  await runLoader(scene, (load) => {
    const keys = new Set<string>();
    for (const ts of tilesets) {
      if (ts.imageKey) keys.add(ts.imageKey);
      for (const k of ts.tileKeys.values()) keys.add(k);
    }
    for (const k of keys) if (!scene.textures.exists(k)) load.image(k, GAME_BASE + k.slice(4));
  });

  if (!scene.cache.tilemap.exists(tilemapKey)) {
    // Set tile ditanam; set kumpulan gambar tidak dipakai lapisan petak, jadi cukup
    // set berpetak yang diserahkan ke Phaser (menghindari peringatan parser).
    const embedded = {
      ...map,
      tilesets: tilesets.filter((t) => t.data.image).map((t) => ({ ...t.data, firstgid: t.firstgid })),
      layers: map.layers.filter((l) => l.type === "tilelayer"),
    };
    scene.cache.tilemap.add(tilemapKey, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: embedded });
  }
  return { code, map, tilesets, tilemapKey };
}

/** Kunci tekstur untuk gid sebuah objek tile, atau `undefined` bila tidak dikenal. */
export function textureForGid(loaded: LoadedMap, gid: number): string | undefined {
  const g = gidIndex(gid);
  let ts: LoadedTileset | undefined;
  for (const t of loaded.tilesets) if (t.firstgid <= g && (!ts || t.firstgid > ts.firstgid)) ts = t;
  return ts?.tileKeys.get(g - ts.firstgid);
}

export const MARKER_KEY = "ui:panah_bawah";

/** Katalog materi untuk rak buku (materi/materi.json) dan ikon UI di dunia game. */
export async function loadWorldUi(scene: Phaser.Scene): Promise<void> {
  await runLoader(scene, (load) => {
    if (!scene.cache.json.exists("materi")) load.json("materi", GAME_BASE + "materi/materi.json");
    if (!scene.textures.exists(MARKER_KEY)) load.image(MARKER_KEY, GAME_BASE + "export/ui/items/sprites/29_panah_bawah.png");
  });
}
