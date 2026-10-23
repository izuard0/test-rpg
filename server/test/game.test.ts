import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { CLOSE_ACCOUNT_REVOKED, FLAG_SITTING, ROOM_KAMPUS, ROOM_KELAS, type ChatMessage, type JoinOptions, type Role, type S2C } from "@mita/shared";
import { buildApp } from "../src/app.js";
import { DuplicateError, MemoryStore } from "../src/auth/store.js";
import { hashPassword } from "../src/auth/password.js";
import { defaultGameOptions } from "../src/game/index.js";

const ROOT = resolve(import.meta.dirname, "../..");
let app: FastifyInstance;
let url: string;
const store = new MemoryStore();

beforeAll(async () => {
  app = await buildApp({
    clientDir: mkdtempSync(join(tmpdir(), "mita-")),
    game: { ...defaultGameOptions(ROOT), filesDir: mkdtempSync(join(tmpdir(), "mita-files-")) },
    store,
    admin: { username: "admin", password: "admin-uji-rahasia" },
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(async () => {
  await app.close();
});

const PW = "kata-sandi-uji";
let pwHash: Promise<string> | undefined;
/** Akun yang sudah disetujui admin, lalu masuk lewat API: mengembalikan token sesi. */
async function loginAs(id: string, name: string, role: Role) {
  try {
    const a = await store.create({ role, loginId: id, fullName: name, passwordHash: await (pwHash ??= hashPassword(PW)) });
    await store.update(a.id, { status: "disetujui" });
  } catch (e) {
    if (!(e instanceof DuplicateError)) throw e;
  }
  const res = await fetch(`${url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, password: PW }) });
  return ((await res.json()) as { token: string }).token;
}

/** Klien uji yang mengumpulkan semua pesan server. */
async function player(id: string, name: string, role: Role = "mahasiswa", room = ROOM_KAMPUS, extra: Partial<JoinOptions> = {}) {
  const c = new Client(url);
  const inbox: { type: string; msg: unknown }[] = [];
  const token = await loginAs(id, name, role);
  const r: Room = await c.joinOrCreate(room, { token, ...extra });
  for (const t of ["welcome", "add", "remove", "snap", "chat", "dots", "seat", "pmRequest", "pmStatus", "notice", "directory", "correct", "classState"]) {
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
  return { room: r, welcome, wait, none, inbox, sid: welcome.you, uid: welcome.uid, token };
}

const move = (p: Awaited<ReturnType<typeof player>>, x: number, y: number, flags = 0) => p.room.send("move", [x, y, 0, flags]);
/** Berjalan mengikuti jalur bebas rintangan (BFS per setengah petak) ke (x, y). */
async function walkPath(p: Awaited<ReturnType<typeof player>>, mapCode: string, x: number, y: number) {
  const { loadWorld } = await import("../src/game/world.js");
  const { footBox } = await import("@mita/shared");
  const w = loadWorld(join(ROOT, "maps")).rooms.get(mapCode)!;
  const step = 14;
  const key = (a: number, b: number) => `${a},${b}`;
  const snap = (v: number) => Math.round(v / step) * step;
  const start = [p.welcome.x, p.welcome.y];
  const goal = key(snap(x), snap(y));
  const prev = new Map<string, string | null>([[key(snap(start[0]), snap(start[1])), null]]);
  const q = [[snap(start[0]), snap(start[1])]];
  while (q.length && !prev.has(goal)) {
    const [cx, cy] = q.shift()!;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = cx + dx, ny = cy + dy, k = key(nx, ny);
      if (prev.has(k) || w.collision.blocked(footBox(nx, ny))) continue;
      prev.set(k, key(cx, cy));
      q.push([nx, ny]);
    }
  }
  if (!prev.has(goal)) throw new Error(`tidak ada jalur ke ${goal}`);
  const path: number[][] = [];
  for (let k: string | null = goal; k; k = prev.get(k) ?? null) path.unshift(k.split(",").map(Number));
  for (const [px, py] of path) {
    move(p, px, py);
    await new Promise((r) => setTimeout(r, 90));
  }
}

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
      // Berjalan bertahap (server membatasi kecepatan) dari titik muncul yang diacak server.
      let { x, y } = p.welcome;
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
  }, 20_000);

  it("sesi kelas: dosen di meja dosen memulai, mahasiswa dapat materi, obrolan Kelas, file bersama", async () => {
    const opt = { kelas: "kelas-b", spawn: "dari_lobi" };
    const dosen = await player("198001012005011002", "Dr. Sari Uji", "dosen", ROOM_KELAS, opt);
    const mhs = await player("2201201", "Nina Uji", "mahasiswa", ROOM_KELAS, opt);
    expect(mhs.welcome.kelas).toMatchObject({ active: false });
    const materi = { title: "SQL DDL", file: "bahan_ajar/Perancangan Basis Data/P09_SQL_DDL_slides.html", course: "Perancangan Basis Data" };

    // Belum di meja dosen: ditolak. Mahasiswa juga tidak bisa memulai.
    dosen.room.send("classStart", { materi });
    expect((await dosen.wait("notice")).text).toMatch(/meja dosen/);
    mhs.room.send("classStart", { materi });
    expect((await mhs.wait("notice")).text).toMatch(/Hanya dosen/);
    // Obrolan Kelas belum ada sebelum sesi dimulai.
    mhs.room.send("chat", { mode: "kelas", text: "halo" });
    expect((await mhs.wait("notice")).text).toMatch(/selama sesi/);

    // Dosen berjalan ke meja dosen lalu memulai kelas.
    const map = (await import("../src/game/world.js")).loadWorld(join(ROOT, "maps"));
    const desk = map.rooms.get("kelas-b")!.data.interactables.find((i) => i.kind === "teacher_desk")!;
    await walkPath(dosen, "kelas-b", desk.rect.x + desk.rect.w / 2, desk.rect.y + desk.rect.h + 10);
    dosen.room.send("classStart", { materi });
    const st = await mhs.wait("classState", (x) => x.event === "start");
    expect(st).toMatchObject({ active: true, dosenName: "Dr. Sari Uji", materi });

    // Obrolan Kelas sampai ke semua orang di ruang; yang datang terlambat menerima riwayatnya dan materinya.
    await new Promise((r) => setTimeout(r, 1100));
    dosen.room.send("chat", { mode: "kelas", text: "Silakan buka slide P09" });
    expect(((await mhs.wait("chat")) as ChatMessage).mode).toBe("kelas");
    const telat = await player("2201202", "Oki Uji", "mahasiswa", ROOM_KELAS, opt);
    expect(telat.welcome.kelas).toMatchObject({ active: true, materi });
    expect(telat.welcome.history.map((h) => h.text)).toContain("Silakan buka slide P09");

    // Unggah file: token milik orang lain ditolak, jenis terlarang ditolak, mahasiswa tidak bisa mengunggah.
    const up = (p: { room: Room; token: string }, name: string, body: Buffer, token = p.token, ttl = 15) =>
      fetch(`${url}/api/kelas/files?session=${p.room.sessionId}&ttl=${ttl}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream", authorization: `Bearer ${token}`, "x-file-name": encodeURIComponent(name) },
        body: new Uint8Array(body),
      });
    expect((await up(dosen, "data.csv", Buffer.from("a,b\n1,2"), mhs.token)).status).toBe(403);
    expect((await up(dosen, "virus.exe", Buffer.from("MZ...."))).status).toBe(400);
    expect((await up(dosen, "ganti-nama.pdf", Buffer.from([0x4d, 0x5a, 1, 2]))).status).toBe(400);
    expect((await up(mhs, "data.csv", Buffer.from("a,b"))).status).toBe(403);
    const ok = await up(dosen, "data nilai.csv", Buffer.from("nim,nilai\n2201201,90\n"));
    expect(ok.status).toBe(200);
    const { token } = (await ok.json()) as { token: string };
    const withFile = await mhs.wait("classState", (x) => x.event === "file");
    expect(withFile.files.map((f) => f.name)).toEqual(["data nilai.csv"]);

    // Unduh: peserta kelas bisa (sebagai lampiran), pemain di luar kelas tidak.
    const get = (p: { room: Room; token: string }, bearer = p.token) =>
      fetch(`${url}/api/files/${token}?session=${p.room.sessionId}`, { headers: { authorization: `Bearer ${bearer}` } });
    const dl = await get(mhs);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await dl.text()).toBe("nim,nilai\n2201201,90\n");
    const luar = await player("2201203", "Putu Uji");
    expect((await get(luar)).status).toBe(403);
    // sessionId peserta kelas tanpa token pemiliknya tidak cukup.
    expect((await get(mhs, luar.token)).status).toBe(403);
    expect((await fetch(`${url}/api/files/${token}?session=${mhs.room.sessionId}`)).status).toBe(403);

    // Dosen mengakhiri kelas: obrolan Kelas tertutup lagi.
    dosen.room.send("classEnd", {});
    expect(await mhs.wait("classState", (x) => x.event === "end")).toMatchObject({ active: false });
    await new Promise((r) => setTimeout(r, 1100));
    mhs.room.send("chat", { mode: "kelas", text: "masih?" });
    expect((await mhs.wait("notice")).text).toMatch(/selama sesi/);
    for (const p of [dosen, mhs, telat, luar]) await p.room.leave();
  }, 30_000);

  it("menolak token yang tidak sah dan mengeluarkan akun yang dicabut", async () => {
    await expect(new Client(url).joinOrCreate(ROOM_KAMPUS, { token: "token-palsu-yang-cukup-panjang-123" })).rejects.toThrow(/Sesi berakhir/);
    await expect(new Client(url).joinOrCreate(ROOM_KAMPUS, { id: "2201101", name: "Palsu", role: "dosen" })).rejects.toThrow();
    const p = await player("2201301", "Qori Uji");
    const left = new Promise<number>((res) => p.room.onLeave((code) => res(code)));
    const acc = (await store.byLoginId("2201301"))!;
    // Admin menonaktifkan akun lewat /panel: pemain langsung dikeluarkan dari game.
    const login = await fetch(`${url}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mita-panel": "1" },
      body: JSON.stringify({ username: "admin", password: "admin-uji-rahasia" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const act = await fetch(`${url}/api/admin/accounts/action`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mita-panel": "1", cookie },
      body: JSON.stringify({ ids: [acc.id], action: "nonaktifkan" }),
    });
    expect(await act.json()).toMatchObject({ done: 1 });
    expect((await p.wait("notice")).text).toMatch(/dicabut/);
    expect(await left).toBe(CLOSE_ACCOUNT_REVOKED);
    await expect(new Client(url).joinOrCreate(ROOM_KAMPUS, { token: p.token })).rejects.toThrow(/Sesi berakhir/);
  });
});
