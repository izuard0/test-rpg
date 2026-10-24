// Rute HTTP terminal praktik MySQL. Semua butuh token login (akun disetujui admin).

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Accounts } from "../auth/index.js";
import { PraktikError, type Praktik } from "./index.js";

const bearer = (req: FastifyRequest) => /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ""))?.[1];

export function registerPraktikRoutes(app: FastifyInstance, accounts: Accounts, praktik: Praktik | undefined): void {
  async function guard(req: FastifyRequest, reply: FastifyReply, run: (accountId: string) => Promise<unknown>) {
    const acc = await accounts.fromToken(bearer(req));
    if (!acc) return reply.code(401).send({ error: "Sesi berakhir. Silakan masuk lagi." });
    if (!praktik?.available) return reply.code(503).send({ error: "Server MySQL praktik tidak tersedia." });
    try {
      return await run(acc.id);
    } catch (e) {
      if (e instanceof PraktikError) return reply.code(e.status).send({ error: e.message });
      throw e;
    }
  }

  app.get("/api/praktik/info", async () => ({ mysql: !!praktik?.available }));

  app.post("/api/praktik/run", (req, reply) =>
    guard(req, reply, (id) => praktik!.run(id, String((req.body as { code?: unknown } | null)?.code ?? ""))),
  );

  app.post("/api/praktik/reset", (req, reply) => guard(req, reply, (id) => praktik!.reset(id)));

  app.post("/api/praktik/latihan", (req, reply) => {
    const b = (req.body ?? {}) as { id?: unknown; code?: unknown; periksa?: unknown };
    return guard(req, reply, (id) => praktik!.latihanRun(id, String(b.id ?? ""), String(b.code ?? ""), !!b.periksa));
  });

  // Dipanggil saat tab ditutup (navigator.sendBeacon tidak bisa memasang header: token di body).
  app.post("/api/praktik/end", async (req, reply) => {
    const token = typeof req.body === "string" ? req.body.trim() : bearer(req);
    const acc = await accounts.fromToken(token);
    if (acc && praktik) await praktik.end(acc.id).catch(() => undefined);
    return reply.code(204).send();
  });
}
