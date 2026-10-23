// Data peta di sisi server: tabrakan, zona chat, kursi, titik muncul, kapasitas, dan
// letak kelas "tampak" di denah kampus (untuk mencerminkan pemain kelas ke kampus).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CollisionWorld, readRoom, type RoomData, type TiledMap } from "@mita/shared";

export interface WorldRoom {
  data: RoomData;
  collision: CollisionWorld;
  /** seatId -> titik kaki saat duduk. */
  seats: Map<number, { x: number; y: number }>;
}

export interface World {
  rooms: Map<string, WorldRoom>;
  /** Kode kelas -> pojok kiri atas ruang kelas itu di peta kampus (piksel). */
  mirrorOffset: Map<string, { x: number; y: number }>;
}

export function loadWorld(mapsDir: string): World {
  const rooms = new Map<string, WorldRoom>();
  for (const f of readdirSync(mapsDir).filter((f) => f.endsWith(".tmj"))) {
    const map = JSON.parse(readFileSync(join(mapsDir, f), "utf8")) as TiledMap;
    const data = readRoom(map);
    const code = f.replace(/\.tmj$/, "");
    const seats = new Map<number, { x: number; y: number }>();
    for (const it of data.interactables) {
      if (it.kind !== "seat") continue;
      seats.set(Number(it.props.seatId), { x: it.rect.x + it.rect.w / 2, y: it.rect.y + it.rect.h - 2 });
    }
    rooms.set(code, { data, collision: new CollisionWorld(data.width, data.height, data.collisions), seats });
  }
  const mirrorOffset = new Map<string, { x: number; y: number }>();
  for (const z of rooms.get("kampus")?.data.zones ?? []) {
    const m = z.name.match(/^(kelas-[a-z])\s*\(tampak\)$/);
    if (m) mirrorOffset.set(m[1], { x: z.rect.x, y: z.rect.y });
  }
  return { rooms, mirrorOffset };
}
