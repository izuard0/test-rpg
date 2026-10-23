// Aplikasi HTTP: hasil build klien, API akun, panel admin, dan server game (Colyseus)
// di proses yang sama: satu alamat, tanpa CORS (docs/RANCANGAN.md, Deploy).

import { existsSync, readFileSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { sanitizeChoice, type CharacterConfig } from "@mita/shared";
import { registerAdminRoutes, type AdminOptions } from "./admin/index.js";
import { Accounts, registerAuthRoutes } from "./auth/index.js";
import { MemoryStore, type AccountStore } from "./auth/store.js";
import { attachGame, type GameOptions } from "./game/index.js";

export interface AppOptions {
  /** Folder hasil `vite build` (client/dist). */
  clientDir: string;
  version?: string;
  logger?: boolean;
  /** Server multipemain (Colyseus); tanpa opsi ini hanya HTTP. */
  game?: GameOptions;
  /** Penyimpanan akun; bawaan: memori (hilang saat server mulai ulang). */
  store?: AccountStore;
  admin?: AdminOptions;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  // forceCloseConnections: koneksi keep-alive dan WebSocket ikut ditutup saat server berhenti.
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, forceCloseConnections: true });
  const startedAt = Date.now();
  // Galat tak terduga (mis. database mati): detail hanya di log server, bukan ke browser.
  app.setErrorHandler((err: { statusCode?: number; message: string }, req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? "Terjadi gangguan di server. Coba lagi sebentar lagi." : err.message });
  });

  // Dipakai health check Coolify / Docker.
  app.get("/health", async () => ({
    status: "ok",
    version: opts.version ?? "dev",
    uptime: Math.round((Date.now() - startedAt) / 1000),
  }));

  const store = opts.store ?? new MemoryStore();
  if (!store.persistent) app.log.warn("DATABASE_URL belum diatur: akun disimpan di memori dan hilang saat server mulai ulang.");
  const cfg = opts.game ? (JSON.parse(readFileSync(opts.game.characterConfig, "utf8")) as CharacterConfig) : undefined;
  const accounts = new Accounts(store, (c) => (cfg ? sanitizeChoice(cfg, c) : (c as ReturnType<typeof sanitizeChoice>)));
  registerAuthRoutes(app, accounts);
  registerAdminRoutes(app, accounts, opts.admin ?? {}, opts.clientDir);
  app.addHook("onClose", () => store.close());

  if (opts.game) await attachGame(app, opts.game, accounts);

  if (existsSync(opts.clientDir)) {
    await app.register(fastifyStatic, {
      root: opts.clientDir,
      // index.html jangan di-cache agar rilis baru langsung terpakai; berkas lain
      // aman di-cache karena aset build Vite bernama hash.
      setHeaders(res, path) {
        if (path.endsWith(".html") || path.endsWith(".json") || path.endsWith(".tmj") || path.endsWith(".tsj")) {
          res.header("Cache-Control", "no-cache");
        }
      },
    });
  } else {
    app.log.warn(`Folder klien tidak ada: ${opts.clientDir} (jalankan npm run build)`);
  }
  return app;
}
