import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const clientDir = resolve(process.env.CLIENT_DIR ?? resolve(here, "../../client/dist"));

const app = await buildApp({ clientDir, version: process.env.APP_VERSION, logger: true });

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    app.log.info(`${sig}: berhenti`);
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ port, host });
