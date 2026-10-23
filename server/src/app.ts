// Aplikasi HTTP: menyajikan hasil build klien dan cek kesehatan.
// Tahap berikutnya menambahkan Colyseus (multipemain) dan API (login, materi, nilai)
// di proses yang sama: satu alamat, tanpa CORS (docs/RANCANGAN.md, Deploy).

import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { attachGame, type GameOptions } from "./game/index.js";

export interface AppOptions {
  /** Folder hasil `vite build` (client/dist). */
  clientDir: string;
  version?: string;
  logger?: boolean;
  /** Server multipemain (Colyseus); tanpa opsi ini hanya HTTP. */
  game?: GameOptions;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  // forceCloseConnections: koneksi keep-alive dan WebSocket ikut ditutup saat server berhenti.
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, forceCloseConnections: true });
  const startedAt = Date.now();

  // Dipakai health check Coolify / Docker.
  app.get("/health", async () => ({
    status: "ok",
    version: opts.version ?? "dev",
    uptime: Math.round((Date.now() - startedAt) / 1000),
  }));

  if (opts.game) await attachGame(app, opts.game);

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
