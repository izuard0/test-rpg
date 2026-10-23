import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CollisionWorld, footBox, nearestInteractable, readRoom, zoneAt, type TiledMap } from "../src/index.js";

const loadMap = (code: string) =>
  JSON.parse(readFileSync(new URL(`../../maps/${code}.tmj`, import.meta.url), "utf8")) as TiledMap;

describe("CollisionWorld", () => {
  const world = new CollisionWorld(280, 280, [{ x: 100, y: 100, w: 56, h: 28 }]);

  it("menahan pemain di depan rintangan tanpa celah", () => {
    // Kaki di x=90 (kotak 84..96), bergerak ke kanan menuju rintangan di x=100.
    const p = world.move(90, 110, 10, 0);
    expect(p.x).toBe(94);
    expect(world.blocked(footBox(p.x, p.y))).toBe(false);
  });

  it("meluncur di sepanjang dinding saat bergerak diagonal", () => {
    const p = world.move(90, 110, 10, 5);
    expect(p).toEqual({ x: 94, y: 115 });
  });

  it("tidak bisa keluar dari tepi dunia", () => {
    expect(world.move(8, 20, -20, 0).x).toBe(6);
  });
});

describe("peta hasil skrip", () => {
  for (const code of ["kampus", "kelas-a", "kelas-b", "kelas-c"]) {
    it(`${code}: titik muncul tidak berada di dalam rintangan`, () => {
      const room = readRoom(loadMap(code));
      const world = new CollisionWorld(room.width, room.height, room.collisions);
      expect(Object.keys(room.spawns).length).toBeGreaterThan(0);
      for (const [name, s] of Object.entries(room.spawns)) {
        expect(world.blocked(footBox(s.x, s.y)), name).toBe(false);
      }
    });

    it(`${code}: setiap pintu menuju titik muncul yang ada`, () => {
      const room = readRoom(loadMap(code));
      for (const door of room.interactables.filter((i) => i.kind === "door")) {
        const target = readRoom(loadMap(String(door.props.target)));
        expect(target.spawns[String(door.props.spawn)], `${code} -> ${door.props.target}`).toBeDefined();
      }
    });
  }

  it("kampus: rak buku terjangkau dari titik interaksinya", () => {
    const room = readRoom(loadMap("kampus"));
    const shelf = room.interactables.find((i) => i.name === "rak_1")!;
    const fx = shelf.rect.x + shelf.rect.w / 2;
    const fy = shelf.rect.y + shelf.rect.h + 20;
    expect(nearestInteractable(room.interactables, fx, fy, room.tile)?.name).toBe("rak_1");
  });

  it("kampus: zona terkecil yang menang", () => {
    const room = readRoom(loadMap("kampus"));
    const s = room.spawns.awal;
    expect(zoneAt(room, s.x, s.y)?.name).toBe("lobi");
  });
});
