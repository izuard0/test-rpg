import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { FLAG_SITTING, ROOM_KAMPUS, ROOM_KELAS, type ChatMessage, type JoinOptions, type S2C } from "@mita/shared";
import { buildApp } from "../src/app.js";
import { defaultGameOptions } from "../src/game/index.js";

const ROOT = resolve(import.meta.dirname, "../..");
let app: FastifyInstance;
let url: string;

beforeAll(async () => {
  app = await buildApp({ clientDir: mkdtempSync(join(tmpdir(), "mita-")), game: defaultGameOptions(ROOT) });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(async () => {
  await app.close();
});

/** Klien uji yang mengumpulkan semua pesan server. */
async function player(id: string, name: string, role: JoinOptions["role"] = "mahasiswa", room = ROOM_KAMPUS, extra: Partial<JoinOptions> = {}) {
  const c = new Client(url);
  const inbox: { type: string; msg: unknown }[] = [];
  const r: Room = await c.joinOrCreate(room, { id, name, role, choice: undefined, ...extra });
  for (const t of ["welcome", "add", "remove", "snap", "chat", "dots", "seat", "pmRequest", "pmStatus", "notice", "directory", "correct"]) {
    r.onMessage(t, (msg) => inbox.push({ type: t, msg }));
  }
  const wait = async <K extends keyof S2C>(type: K, pred: (m: S2C[K]) => boolean = () => true, ms = 3000): Promise<S2C[K]> => {
    const t0 = Date.now();
    for (;;) {
      const hit = inbox.find((x) => x.type === type && pred(x.msg as S2C[K]));
      if (hit) {
        inbox.splice(inbox.indexOf(hit), 1);
        return hit.msg as S2C[K];
      }
      if (Date.now() - t0 > ms) throw new Error(`${name}: tidak menerima "${type}" dalam ${ms} ms`);
      await new Promise((res) => setTimeout(res, 20));
    }
  };
  const welcome = await wait("welcome");
  const none = async (type: keyof S2C, pred: (m: never) => boolean = () => true, ms = 400) => {
    await new Promise((res) => setTimeout(res, ms));
    return !inbox.some((x) => x.type === type && pred(x.msg as never));
  };
  return { room: r, welcome, wait, none, inbox, sid: welcome.you, uid: welcome.uid };
}

const move = (p: Awaited<ReturnType<typeof player>>, x: number, y: number, flags = 0) => p.room.send("move", [x, y, 0, flags]);
/** Berjalan bertahap ke (x, y): server menolak lompatan yang terlalu jauh. */
async function walk(p: Awaited<ReturnType<typeof player>>, x: number, y: number) {
  let cx = p.welcome.x, cy = p.welcome.y;
  while (Math.hypot(x - cx, y - cy) > 1) {
    cx += Math.sign(x - cx) * Math.min(12, Math.abs(x - cx));
    cy += Math.sign(y - cy) * Math.min(12, Math.abs(y - cy));
    move(p, cx, cy);
    await new Promise((r) => setTimeout(r, 90));
  }
}

describe("multipemain", () => {
  it("pemain saling melihat dan posisi hanya dikirim untuk yang di sekitar", async () => {
    const a = await player("2201101", "Ani Uji");
    const b = await player("2201102", "Budi Uji");
    expect((await a.wait("add")).name).toBe("Budi Uji");
    expect(b.welcome.players.map((p) => p.name)).toContain("Ani Uji");
    // Keduanya di titik muncul yang sama: saling ada di cuplikan.
    const snap = await a.wait("snap", (s) => s.includes(b.sid));
    expect(snap[snap.indexOf(b.sid) + 1]).toBeGreaterThan(0);
    await a.room.leave();
    expect((await b.wait("remove")).sid).toBe(a.sid);
    await b.room.leave();
  });

  it("gerak terlalu jauh dalam sekali kirim ditolak server", async () => {
    const a = await player("2201103", "Cici Uji");
    const b = await player("2201104", "Dodi Uji");
    const start = a.welcome.players.find((p) => p.sid === a.sid)!;
    expect(start).toBeTruthy();
    move(b, 5, 5); // teleport ke pojok peta
    await new Promise((r) => setTimeout(r, 250));
    const snap = await a.wait("snap", (s) => s.includes(b.sid));
    expect(snap[snap.indexOf(b.sid) + 1]).not.toBe(5);
    // Server mengembalikan Dodi ke posisi sahnya.
    expect((await b.wait("correct")).x).not.toBe(5);
    await a.room.leave();
    await b.room.leave();
  });

  it("chat Sekitar sampai ke yang dekat, Global ke seluruh kampus, dengan saringan kata", async () => {
    const a = await player("2201105", "Eka Uji");
    const b = await player("2201106", "Fajar Uji");
    await walk(b, a.welcome.x + 10, a.welcome.y);
    a.room.send("chat", { mode: "sekitar", text: "halo   semua" });
    const got = (await b.wait("chat")) as ChatMessage;
    expect(got).toMatchObject({ mode: "sekitar", fromName: "Eka Uji", text: "halo semua" });
    await new Promise((r) => setTimeout(r, 1100));
    a.room.send("chat", { mode: "global", text: "dasar goblok" });
    expect(((await b.wait("chat")) as ChatMessage).text).toBe("dasar ******");
    // Batas Global kampus 1 pesan / 10 detik.
    await new Promise((r) => setTimeout(r, 1100));
    a.room.send("chat", { mode: "global", text: "lagi" });
    expect((await a.wait("notice")).text).toMatch(/tunggu/);
    // Pemain baru menerima riwayat Global dari memori.
    const c = await player("2201107", "Gita Uji");
    expect(c.welcome.history.map((h) => h.text)).toContain("dasar ******");
    for (const p of [a, b, c]) await p.room.leave();
  });

  it("pesan pribadi: mahasiswa ke dosen perlu izin; dosen ke mahasiswa langsung", async () => {
    const mhs = await player("2201108", "Hana Uji");
    const lain = await player("2201109", "Iwan Uji");
    const dosen = await player("198001012005011001", "Dr. Joko Uji", "dosen");
    await new Promise((r) => setTimeout(r, 200));

    // Mahasiswa ke mahasiswa: langsung, dan pemain lain tidak menerima isinya.
    mhs.room.send("chat", { mode: "pribadi", to: lain.uid, text: "rahasia" });
    expect(((await lain.wait("chat")) as ChatMessage).text).toBe("rahasia");
    expect(await dosen.none("chat", (m: ChatMessage) => m.text === "rahasia")).toBe(true);

    // Mahasiswa ke dosen tanpa izin: ditolak.
    await new Promise((r) => setTimeout(r, 1100));
    mhs.room.send("chat", { mode: "pribadi", to: dosen.uid, text: "pak" });
    expect((await mhs.wait("notice")).text).toMatch(/permintaan/);

    // Minta izin -> dosen menerima permintaan -> menolak -> tidak bisa langsung minta lagi.
    mhs.room.send("pmAsk", { to: dosen.uid, text: "Pak, mau tanya tugas P09" });
    expect(await dosen.wait("pmRequest")).toMatchObject({ from: mhs.uid, text: "Pak, mau tanya tugas P09" });
    expect((await mhs.wait("pmStatus")).state).toBe("pending");
    dosen.room.send("pmAnswer", { from: mhs.uid, accept: false });
    expect((await mhs.wait("pmStatus")).state).toBe("declined");
    mhs.room.send("pmAsk", { to: dosen.uid, text: "lagi" });
    expect((await mhs.wait("notice")).text).toMatch(/ditolak/);

    // Dosen memulai chat: langsung bisa, dan mahasiswa boleh membalas.
    dosen.room.send("chat", { mode: "pribadi", to: mhs.uid, text: "Silakan, ada apa?" });
    expect(((await mhs.wait("chat", (m) => m.from !== mhs.sid)) as ChatMessage).text).toBe("Silakan, ada apa?");
    await new Promise((r) => setTimeout(r, 1100));
    mhs.room.send("chat", { mode: "pribadi", to: dosen.uid, text: "Terima kasih, Pak" });
    expect(((await dosen.wait("chat", (m) => m.text === "Terima kasih, Pak")) as ChatMessage).fromName).toBe("Hana Uji");

    // Dosen menutup percakapan: mahasiswa perlu izin lagi.
    dosen.room.send("pmClose", { peer: mhs.uid });
    expect((await mhs.wait("pmStatus", (m) => m.state === "closed")).peer).toBe(dosen.uid);
    await new Promise((r) => setTimeout(r, 1100));
    mhs.room.send("chat", { mode: "pribadi", to: dosen.uid, text: "pak?" });
    expect((await mhs.wait("notice")).text).toMatch(/permintaan/);
    for (const p of [mhs, lain, dosen]) await p.room.leave();
  });

  it("kursi kelas hanya untuk satu orang, dan isi kelas tampak dari kampus", async () => {
    const watcher = await player("2201110", "Kiki Uji");
    const a = await player("2201111", "Lala Uji", "mahasiswa", ROOM_KELAS, { kelas: "kelas-a", spawn: "dari_lobi" });
    const b = await player("2201112", "Mira Uji", "mahasiswa", ROOM_KELAS, { kelas: "kelas-a", spawn: "dari_lobi" });
    expect(b.welcome.room).toBe("kelas-a");

    // Mendekati kursi 30 (baris paling belakang, dekat pintu) lalu duduk.
    const seats: { seatId: number; x: number; y: number }[] = [];
    const map = (await import("../src/game/world.js")).loadWorld(join(ROOT, "maps"));
    for (const [seatId, p] of map.rooms.get("kelas-a")!.seats) seats.push({ seatId, ...p });
    const seat = seats.sort((p, q) => Math.hypot(p.x - 56, p.y - 504) - Math.hypot(q.x - 56, q.y - 504))[0];
    const walk = async (p: typeof a) => {
      // Berjalan bertahap (server membatasi kecepatan).
      let { x, y } = { x: 56, y: 504 };
      for (let i = 0; i < 40 && Math.hypot(seat.x - x, seat.y - y) > 20; i++) {
        x += Math.sign(seat.x - x) * Math.min(12, Math.abs(seat.x - x));
        y += Math.sign(seat.y - y) * Math.min(12, Math.abs(seat.y - y));
        move(p, x, y);
        await new Promise((r) => setTimeout(r, 90));
      }
    };
    await walk(a);
    a.room.send("sit", { seatId: seat.seatId });
    expect(await b.wait("seat", (m) => m.sid === a.sid)).toMatchObject({ seatId: seat.seatId });
    await walk(b);
    b.room.send("sit", { seatId: seat.seatId });
    expect((await b.wait("notice")).text).toMatch(/sudah diduduki/);
    move(a, seat.x, seat.y, FLAG_SITTING);

    // Pemain di kampus melihat Lala (cermin) dengan posisi digeser ke ruang kelas tampak.
    const add = await watcher.wait("add", (p) => p.sid === a.sid);
    expect(add.mirror).toBe("kelas-a");
    // Kursi Lala cukup jauh dari titik muncul kampus; yang diuji: profil cermin terkirim dan
    // hilang lagi saat ia keluar kelas.
    await a.room.leave();
    expect((await watcher.wait("remove", (m) => m.sid === a.sid)).sid).toBe(a.sid);
    expect((await b.wait("seat", (m) => m.seatId === seat.seatId && m.sid === null)).sid).toBeNull();
    for (const p of [watcher, b]) await p.room.leave();
  });

  it("ruang penuh menolak pemain baru, bukan membuat ruang kedua", async () => {
    // Lab Lovelace: 30 kursi + 2 = 32 orang.
    const ps = [];
    for (let i = 0; i < 32; i++) ps.push(await player(`23019${String(i).padStart(3, "0")}`, `Penuh ${i}`, "mahasiswa", ROOM_KELAS, { kelas: "kelas-a" }));
    await expect(player("2301999", "Terlambat", "mahasiswa", ROOM_KELAS, { kelas: "kelas-a" })).rejects.toThrow(/penuh/);
    await ps[0].room.leave();
    const masuk = await player("2301999", "Terlambat", "mahasiswa", ROOM_KELAS, { kelas: "kelas-a" });
    expect(masuk.welcome.players).toHaveLength(32);
    for (const p of [...ps.slice(1), masuk]) await p.room.leave();
  });

  it("menolak identitas yang tidak sah", async () => {
    await expect(player("ab", "X")).rejects.toThrow();
  });
});
