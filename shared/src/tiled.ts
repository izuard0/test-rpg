// Tipe berkas Tiled (.tmj / .tsj) sebatas yang dipakai game, dan pembaca
// lapisan objek menjadi data ruangan. Dipakai klien sekarang, server kelak
// (tabrakan dan interaksi harus sama di kedua sisi).

export type TiledValue = string | number | boolean;

export interface TiledProperty {
  name: string;
  type: string;
  value: TiledValue;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  visible?: boolean;
  point?: boolean;
  gid?: number;
  properties?: TiledProperty[];
}

export interface TiledTileLayer {
  type: "tilelayer";
  name: string;
  width: number;
  height: number;
  data: number[];
  visible?: boolean;
}

export interface TiledObjectLayer {
  type: "objectgroup";
  name: string;
  objects: TiledObject[];
  visible?: boolean;
}

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export interface TiledTilesetRef {
  firstgid: number;
  source: string;
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  backgroundcolor?: string;
  layers: TiledLayer[];
  tilesets: TiledTilesetRef[];
  properties?: TiledProperty[];
}

/** Set tile eksternal (.tsj): satu gambar berpetak, atau kumpulan gambar. */
export interface TiledTileset {
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  margin?: number;
  spacing?: number;
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  tiles?: { id: number; image?: string; imagewidth?: number; imageheight?: number; properties?: TiledProperty[] }[];
}

// Bit pembalik di gid Tiled (horizontal, vertikal, diagonal, heksagonal 120°).
export const GID_FLIP_H = 0x80000000;
export const GID_FLIP_V = 0x40000000;
const GID_MASK = 0x0fffffff;

export function gidIndex(gid: number): number {
  return gid & GID_MASK;
}

export function props(o: { properties?: TiledProperty[] } | undefined): Record<string, TiledValue> {
  const out: Record<string, TiledValue> = {};
  for (const p of o?.properties ?? []) out[p.name] = p.value;
  return out;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Interactable {
  id: number;
  /** Jenis benda: door, shelf, terminal, seat, npc, board, exhibit, info, teacher_desk. */
  kind: string;
  name: string;
  rect: Rect;
  props: Record<string, TiledValue>;
}

export interface Zone {
  name: string;
  rect: Rect;
  chatRadius: number;
  chatPublic: boolean;
}

export interface RoomData {
  id: string;
  title: string;
  /** Ukuran dunia dalam piksel. */
  width: number;
  height: number;
  tile: number;
  capacity: number;
  collisions: Rect[];
  interactables: Interactable[];
  spawns: Record<string, { x: number; y: number }>;
  zones: Zone[];
}

function objectLayer(map: TiledMap, name: string): TiledObject[] {
  const layer = map.layers.find((l) => l.name === name);
  return layer && layer.type === "objectgroup" ? layer.objects : [];
}

const rectOf = (o: TiledObject): Rect => ({ x: o.x, y: o.y, w: o.width, h: o.height });

/** Membaca lapisan collision, interact, spawn, dan zones menjadi data ruangan. */
export function readRoom(map: TiledMap): RoomData {
  const mp = props(map);
  const spawns: RoomData["spawns"] = {};
  for (const o of objectLayer(map, "spawn")) {
    const name = String(props(o).name ?? o.name);
    spawns[name] = { x: o.x, y: o.y };
  }
  return {
    id: String(mp.roomId ?? ""),
    title: String(mp.title ?? ""),
    width: map.width * map.tilewidth,
    height: map.height * map.tileheight,
    tile: map.tilewidth,
    capacity: Number(mp.capacity ?? 0),
    collisions: objectLayer(map, "collision").map(rectOf),
    interactables: objectLayer(map, "interact").map((o) => ({
      id: o.id,
      kind: o.type,
      name: o.name,
      rect: rectOf(o),
      props: props(o),
    })),
    spawns,
    zones: objectLayer(map, "zones").map((o) => {
      const p = props(o);
      return {
        name: String(p.name ?? o.name),
        rect: rectOf(o),
        chatRadius: Number(p.chatRadius ?? 3),
        chatPublic: p.chatPublic === true,
      };
    }),
  };
}

/**
 * Zona tempat sebuah titik berada. Zona yang lebih kecil menang karena zona
 * bisa bertumpuk (mis. `luar` meliputi seluruh peta, `lobi` ada di dalamnya).
 */
export function zoneAt(room: RoomData, x: number, y: number): Zone | undefined {
  let best: Zone | undefined;
  for (const z of room.zones) {
    const r = z.rect;
    if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
    if (!best || r.w * r.h < best.rect.w * best.rect.h) best = z;
  }
  return best;
}
