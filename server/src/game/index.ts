// Memasang server game (Colyseus) pada server HTTP Fastify yang sama: satu alamat,
// tanpa CORS dan tanpa WebSocket lintas-origin (docs/RANCANGAN.md, Deploy).
//
// Fastify tetap menangani semua HTTP; hanya /matchmake/* diteruskan ke Colyseus
// (sebelum Fastify membaca body), dan WebSocket upgrade ditangani transport Colyseus.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Server, createNodeMatchmakingMiddleware, matchMaker } from "@colyseus/core";
import { setTransport } from "@colyseus/core/Transport";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { FastifyInstance } from "fastify";
import { ROOM_KAMPUS, ROOM_KELAS, type CharacterConfig } from "@mita/shared";
import { GameRoom, setGameContext } from "./GameRoom.js";
import { hub } from "./hub.js";
import { loadWorld } from "./world.js";

export interface GameOptions {
  mapsDir: string;
  characterConfig: string;
}

export async function attachGame(app: FastifyInstance, opts: GameOptions): Promise<Server> {
  const cfg = JSON.parse(readFileSync(opts.characterConfig, "utf8")) as CharacterConfig;
  setGameContext({ world: loadWorld(opts.mapsDir), cfg, runSpeed: cfg.movement.runSpeed });

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
  app.get("/health/game", async () => ({ players: hub.sessions.size }));
  app.addHook("onClose", async () => {
    // Shutdown matchmaker menunggu semua ruang dibuang; dibatasi agar penutupan tidak menggantung.
    await Promise.race([matchMaker.gracefullyShutdown().catch(() => undefined), new Promise((r) => setTimeout(r, 2000))]);
    transport.shutdown();
  });
  await matchMaker.accept();
  return game;
}

export function defaultGameOptions(root: string): GameOptions {
  return { mapsDir: join(root, "maps"), characterConfig: join(root, "export/character/config.json") };
}
