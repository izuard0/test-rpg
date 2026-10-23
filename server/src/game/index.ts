// Memasang server game (Colyseus) pada server HTTP Fastify yang sama: satu alamat,
// tanpa CORS dan tanpa WebSocket lintas-origin (docs/RANCANGAN.md, Deploy).
//
// Fastify tetap menangani semua HTTP; hanya /matchmake/* diteruskan ke Colyseus
// (sebelum Fastify membaca body), dan WebSocket upgrade ditangani transport Colyseus.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Server, createNodeMatchmakingMiddleware, matchMaker } from "@colyseus/core";
import { setTransport } from "@colyseus/core/Transport";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { FILE_MAX_BYTES, FILE_TTL_MINUTES, ROOM_KAMPUS, ROOM_KELAS, type CharacterConfig, type Materi } from "@mita/shared";
import type { Accounts } from "../auth/index.js";
import { FileError, FileStore } from "./files.js";
import { GameRoom, roomsByCode, setGameContext } from "./GameRoom.js";
import { hub } from "./hub.js";
import { loadWorld } from "./world.js";

export interface GameOptions {
  mapsDir: string;
  characterConfig: string;
  /** Katalog materi hasil build klien (client/dist/game/materi.json), untuk memvalidasi materi kelas. */
  catalogPath?: string;
  filesDir?: string;
}

function loadCatalog(path: string | undefined): Map<string, Materi> {
  const out = new Map<string, Materi>();
  if (!path || !existsSync(path)) return out;
  const cat = JSON.parse(readFileSync(path, "utf8")) as { courses: { title: string; items: { title: string; file: string }[] }[] };
  for (const c of cat.courses) for (const it of c.items) out.set(it.file, { title: it.title, file: it.file, course: c.title });
  return out;
}

export async function attachGame(app: FastifyInstance, opts: GameOptions, accounts: Accounts): Promise<Server> {
  const cfg = JSON.parse(readFileSync(opts.characterConfig, "utf8")) as CharacterConfig;
  const files = new FileStore(opts.filesDir);
  setGameContext({ world: loadWorld(opts.mapsDir), cfg, runSpeed: cfg.movement.runSpeed, files, catalog: loadCatalog(opts.catalogPath), accounts });
  // Akun dinonaktifkan / dihapus / sandinya di-reset admin: keluarkan dari game saat itu juga.
  accounts.onRevoke((accountId) => hub.kickAccount(accountId, "Sesimu dicabut admin. Silakan masuk lagi."));
  accounts.tagChanged = (accountId, tag) => hub.setTag(accountId, tag);

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

  /**
   * Sesi Colyseus pemain (parameter ?session=) yang dimiliki pemegang token login di
   * header Authorization. Keduanya wajib: sessionId saja tidak cukup sebagai bukti identitas.
   */
  const sessionOf = async (req: FastifyRequest) => {
    const sessionId = (req.query as { session?: unknown }).session;
    const token = /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ""))?.[1];
    if (typeof sessionId !== "string" || !token) return undefined;
    for (const room of roomsByCode.values()) {
      const s = room.sessionById(sessionId);
      if (!s) continue;
      const acc = await accounts.fromToken(token);
      return acc && acc.id === s.accountId ? { room, s } : undefined;
    }
    return undefined;
  };

  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: FILE_MAX_BYTES + 1024 }, (_req, body, done) => done(null, body));
  app.post("/api/kelas/files", { bodyLimit: FILE_MAX_BYTES + 1024 }, async (req, reply) => {
    const q = req.query as { session?: string; ttl?: string };
    const found = await sessionOf(req);
    if (!found || !found.room.isClass) return reply.code(403).send({ error: "Unggah hanya bisa dari dalam kelas." });
    // Peran sesi berasal dari akun yang disetujui admin (bukan pilihan klien).
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
    const found = await sessionOf(req);
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
  };
}
