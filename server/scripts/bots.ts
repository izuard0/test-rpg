// Uji beban: N pemain tiruan masuk ke ruang kampus, berjalan acak di lobi, dan
// sesekali chat. Jalankan server dengan MITA_TICK_LOG=1 untuk melihat durasi tick.
//
//   npx tsx server/scripts/bots.ts [url] [jumlah] [detik]
//   npx tsx server/scripts/bots.ts https://mita.example.ac.id 100 60
//
// Akun bot memakai NIM 2299000xxx dan nama "Bot Uji xxx" (mode uji, tidak tersimpan).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import { CollisionWorld, DIRS, FLAG_MOVING, ROOM_KAMPUS, footBox, readRoom, type TiledMap } from "@mita/shared";

const url = process.argv[2] ?? "http://127.0.0.1:3000";
const count = Number(process.argv[3] ?? 100);
const seconds = Number(process.argv[4] ?? 60);

const map = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../maps/kampus.tmj"), "utf8")) as TiledMap;
const room = readRoom(map);
const world = new CollisionWorld(room.width, room.height, room.collisions);
const lobi = room.zones.find((z) => z.name === "lobi")!.rect;

interface Bot {
  room: Room;
  x: number;
  y: number;
  dx: number;
  dy: number;
  snaps: number;
  seen: number;
  chats: number;
}

const bots: Bot[] = [];
const t0 = Date.now();
let failed = 0;
const lines = ["halo", "ada yang ke perpustakaan?", "tugas P09 sudah?", "semangat!", "kuis jam berapa?"];

for (let i = 0; i < count; i++) {
  const c = new Client(url);
  try {
    const r = await c.joinOrCreate(ROOM_KAMPUS, { id: `2299${String(i).padStart(6, "0")}`, name: `Bot Uji ${i + 1}`, role: "mahasiswa" });
    const bot: Bot = { room: r, x: 0, y: 0, dx: 0, dy: 0, snaps: 0, seen: 0, chats: 0 };
    r.onMessage("welcome", (w: { x: number; y: number }) => {
      bot.x = w.x;
      bot.y = w.y;
    });
    r.onMessage("snap", (s: number[]) => {
      bot.snaps++;
      bot.seen += s.length / 5;
    });
    r.onMessage("chat", () => bot.chats++);
    for (const t of ["add", "remove", "dots", "seat", "notice", "correct", "pmStatus", "pmRequest", "directory"]) r.onMessage(t, () => undefined);
    bots.push(bot);
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`bot ${i + 1} gagal masuk:`, (e as Error).message);
  }
}
console.log(`${bots.length}/${count} bot masuk dalam ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Gerak acak di lobi (arah baru tiap ± 2 detik), 10 kali per detik, kecepatan jalan.
const speed = 80 / 10;
const mover = setInterval(() => {
  for (const b of bots) {
    if (!b.x) continue;
    if (Math.random() < 0.05 || (!b.dx && !b.dy)) {
      const a = Math.random() * Math.PI * 2;
      b.dx = Math.cos(a) * speed;
      b.dy = Math.sin(a) * speed;
    }
    let nx = b.x + b.dx, ny = b.y + b.dy;
    const outside = nx < lobi.x + 20 || ny < lobi.y + 40 || nx > lobi.x + lobi.w - 20 || ny > lobi.y + lobi.h - 20;
    if (outside || world.blocked(footBox(nx, ny))) {
      b.dx = -b.dx;
      b.dy = -b.dy;
      nx = b.x;
      ny = b.y;
    }
    b.x = nx;
    b.y = ny;
    const dir = Math.abs(b.dx) > Math.abs(b.dy) ? (b.dx < 0 ? 1 : 2) : b.dy < 0 ? 3 : 0;
    b.room.send("move", [Math.round(b.x), Math.round(b.y), DIRS[dir] ? dir : 0, FLAG_MOVING]);
  }
}, 100);
// Rata-rata tiap bot chat Sekitar sekali per ± 30 detik.
const talker = setInterval(() => {
  for (const b of bots) if (Math.random() < 1 / 30) b.room.send("chat", { mode: "sekitar", text: lines[(Math.random() * lines.length) | 0] });
}, 1000);

await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(mover);
clearInterval(talker);
const snaps = bots.reduce((a, b) => a + b.snaps, 0);
const seen = bots.reduce((a, b) => a + b.seen, 0);
const chats = bots.reduce((a, b) => a + b.chats, 0);
console.log(`cuplikan diterima per bot per detik: ${(snaps / bots.length / seconds).toFixed(1)} (target 10)`);
console.log(`rata-rata pemain lain per cuplikan: ${(seen / Math.max(1, snaps)).toFixed(1)}`);
console.log(`pesan chat diterima total: ${chats}`);
await Promise.all(bots.map((b) => b.room.leave().catch(() => undefined)));
process.exit(failed ? 1 : 0);
