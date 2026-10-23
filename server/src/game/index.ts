// Memasang server game (Colyseus) pada server HTTP Fastify yang sama: satu alamat,
// tanpa CORS dan tanpa WebSocket lintas-origin (docs/RANCANGAN.md, Deploy).
//
// Fastify tetap menangani semua HTTP; hanya /matchmake/* diteruskan ke Colyseus
// (sebelum Fastify membaca body), dan WebSocket upgrade ditangani transport Colyseus.

import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Server, createNodeMatchmakingMiddleware, matchMaker } from "@colyseus/core";
import { setTransport } from "@colyseus/core/Transport";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { FastifyInstance } from "fastify";
import { FILE_MAX_BYTES, FILE_TTL_MINUTES, ROOM_KAMPUS, ROOM_KELAS, type CharacterConfig, type Materi } from "@mita/shared";
import { FileError, FileStore } from "./files.js";
import { GameRoom, roomsByCode, setGameContext } from "./GameRoom.js";
import { hub } from "./hub.js";
import { loadWorld } from "./world.js";

export interface GameOptions {
  mapsDir: string;
  characterConfig: string;
  /** Katalog materi hasil build klien (client/dist/game/materi.json), untuk memvalidasi materi kelas. */
  catalogPath?: string;
  /**
   * Kode yang harus dimasukkan dosen sebelum bisa membagikan file (env KODE_DOSEN).
   * Pengaman sementara selama akun masih mode uji; kosong = berbagi file dimatikan.
   */
  kodeDosen?: string;
  filesDir?: string;
}

function loadCatalog(path: string | undefined): Map<string, Materi> {
  const out = new Map<string, Materi>();
  if (!path || !existsSync(path)) return out;
  const cat = JSON.parse(readFileSync(path, "utf8")) as { courses: { title: string; items: { title: string; file: string }[] }[] };
  for (const c of cat.courses) for (const it of c.items) out.set(it.file, { title: it.title, file: it.file, course: c.title });
  return out;
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function attachGame(app: FastifyInstance, opts: GameOptions): Promise<Server> {
  const cfg = JSON.parse(readFileSync(opts.characterConfig, "utf8")) as CharacterConfig;
  const files = new FileStore(opts.filesDir);
  setGameContext({ world: loadWorld(opts.mapsDir), cfg, runSpeed: cfg.movement.runSpeed, files, catalog: loadCatalog(opts.catalogPath) });
  const kode = opts.kodeDosen?.trim() ?? "";

  const transport = new WebSocketTransport({ noServer: true, maxPayload: 8 * 1024 });
  transport.attachToServer(app.server);
  const game = new Server({ transport, greet: false, gracefullyShutdown: false, logger: { info() {}, warn: console.warn, error: console.error, debug() {} } });
  game.define(ROOM_KAMPUS, GameRoom);
  game.define(ROOM_KELAS, GameRoom).filterBy(["kelas"]);
  setTransport(transport);

  const matchmake = createNodeMatchmakingMiddleware();
  app.addHook("onRequest", (req, reply, done) => {
    if (!req.url.startsWith("/matchmake/")) return done();
    reply.hijack();
    void matchmake(req.raw, reply.raw, () => {
      reply.raw.statusCode = 404;
      reply.raw.end();
    });
  });
  app.get("/health/game", async () => ({ players: hub.sessions.size, fileBytes: files.usedBytes }));

  // ----- berbagi file dosen -> mahasiswa di kelas yang sama -----

  /** Sesi Colyseus pemain di ruang kelas (dari parameter ?session=). */
  const sessionOf = (sessionId: unknown) => {
    for (const room of roomsByCode.values()) {
      const s = typeof sessionId === "string" ? room.sessionById(sessionId) : undefined;
      if (s) return { room, s };
    }
    return undefined;
  };

  app.post("/api/kode-dosen", async (req, reply) => {
    const body = (req.body ?? {}) as { kode?: string };
    if (!kode) return reply.code(503).send({ ok: false, error: "Berbagi file belum diaktifkan di server (KODE_DOSEN belum diatur)." });
    return { ok: sameSecret(String(body.kode ?? ""), kode) };
  });

  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: FILE_MAX_BYTES + 1024 }, (_req, body, done) => done(null, body));
  app.post("/api/kelas/files", { bodyLimit: FILE_MAX_BYTES + 1024 }, async (req, reply) => {
    const q = req.query as { session?: string; ttl?: string };
    if (!kode) return reply.code(503).send({ error: "Berbagi file belum diaktifkan di server (KODE_DOSEN belum diatur)." });
    if (!sameSecret(String(req.headers["x-kode-dosen"] ?? ""), kode)) return reply.code(403).send({ error: "Kode dosen salah." });
    const found = sessionOf(q.session);
    if (!found || !found.room.isClass) return reply.code(403).send({ error: "Unggah hanya bisa dari dalam kelas." });
    if (found.s.role !== "dosen") return reply.code(403).send({ error: "Hanya dosen yang bisa membagikan file." });
    const ttl = Number(q.ttl);
    if (!FILE_TTL_MINUTES.includes(ttl as (typeof FILE_TTL_MINUTES)[number])) return reply.code(400).send({ error: "Masa berlaku harus 15, 30, atau 60 menit." });
    const name = decodeURIComponent(String(req.headers["x-file-name"] ?? ""));
    try {
      const f = files.add(found.room.isClass ? found.s.room.code : "", name, req.body as Buffer, ttl, found.s.name);
      found.room.announceFiles("file");
      return { token: f.token, name: f.name, expiresAt: f.expiresAt };
    } catch (e) {
      if (e instanceof FileError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  });

  app.get("/api/files/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const f = files.get(token);
    if (!f) return reply.code(410).send({ error: "File sudah kedaluwarsa atau tidak ada." });
    // Hanya pemain yang sedang berada di kelas itu (siapa pun perannya) yang boleh mengunduh.
    const found = sessionOf((req.query as { session?: string }).session);
    if (!found || found.s.room.code !== f.room) return reply.code(403).send({ error: "File ini hanya untuk peserta kelas." });
    // Selalu diunduh, tidak pernah ditampilkan di situs (isi file tidak bisa menjalankan skrip di origin game).
    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="${f.name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store")
      .header("Content-Security-Policy", "sandbox")
      .send(readFileSync(f.path));
  });

  const sweeper = setInterval(() => {
    for (const code of files.sweep()) roomsByCode.get(code)?.announceFiles();
  }, 15_000);
  sweeper.unref();
  app.addHook("onClose", async () => {
    // Shutdown matchmaker menunggu semua ruang dibuang; dibatasi agar penutupan tidak menggantung.
    await Promise.race([matchMaker.gracefullyShutdown().catch(() => undefined), new Promise((r) => setTimeout(r, 2000))]);
    transport.shutdown();
  });
  await matchMaker.accept();
  return game;
}

export function defaultGameOptions(root: string, clientDir?: string): GameOptions {
  return {
    mapsDir: join(root, "maps"),
    characterConfig: join(root, "export/character/config.json"),
    catalogPath: clientDir ? join(clientDir, "game/materi.json") : undefined,
    kodeDosen: process.env.KODE_DOSEN,
  };
}
