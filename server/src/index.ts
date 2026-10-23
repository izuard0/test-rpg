import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { PrismaStore } from "./auth/store.js";
import { defaultGameOptions } from "./game/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const clientDir = resolve(process.env.CLIENT_DIR ?? resolve(here, "../../client/dist"));
// Folder berisi maps/*.tmj dan export/character/config.json (repo saat dev, /app di Docker).
const dataRoot = resolve(process.env.DATA_DIR ?? resolve(here, "../.."));

const app = await buildApp({
  clientDir,
  version: process.env.APP_VERSION,
  logger: true,
  game: defaultGameOptions(dataRoot, clientDir),
  // Tanpa DATABASE_URL akun hanya di memori (untuk mencoba lokal).
  store: process.env.DATABASE_URL ? new PrismaStore(process.env.DATABASE_URL) : undefined,
  admin: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    app.log.info(`${sig}: berhenti`);
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ port, host });
