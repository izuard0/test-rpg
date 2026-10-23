// Akun pemain di server (tahap 5): daftar -> menunggu persetujuan admin -> masuk.
// Peran (mahasiswa/dosen) dan nama diambil dari database, tidak pernah dari klien.
//
// Sesi login memakai token acak di header Authorization; browser menyimpannya per tab
// (sessionStorage), jadi menutup tab = keluar. Server hanya menyimpan hash token.

import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  PASSWORD_MIN,
  STATUS_MESSAGE,
  normalizeId,
  normalizeName,
  validateRegistration,
  type AccountView,
  type CharacterChoice,
  type Registration,
} from "@mita/shared";
import { Limiter } from "./limit.js";
import { dummyHash, hashPassword, verifyPassword } from "./password.js";
import { DuplicateError, type AccountRecord, type AccountStore } from "./store.js";

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("base64url");

export const accountView = (a: AccountRecord): AccountView => ({
  role: a.role,
  id: a.loginId,
  fullName: a.fullName,
  character: a.character,
  mustChangePassword: a.mustChangePassword,
  tag: a.tag,
});

export class Accounts {
  private readonly revokeListeners: ((accountId: string) => void)[] = [];
  /** Diisi panel admin: permintaan dari admin yang sedang masuk (mis. skrip uji beban). */
  isAdmin: (req: FastifyRequest) => boolean = () => false;

  constructor(
    readonly store: AccountStore,
    /** Merapikan pilihan avatar dari klien (opsi yang tidak dikenal diganti bawaan). */
    readonly sanitizeChoice: (c: Partial<CharacterChoice>) => CharacterChoice,
  ) {}

  async createSession(accountId: string, now = Date.now()): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.store.createSession(sha256(token), accountId, new Date(now + SESSION_TTL_MS));
    return token;
  }

  /** Akun yang boleh bermain untuk token ini (sesi aktif dan akun disetujui). */
  async fromToken(token: unknown): Promise<AccountRecord | null> {
    if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
    const a = await this.store.sessionAccount(sha256(token), new Date());
    return a && a.status === "disetujui" ? a : null;
  }

  async endSession(token: string): Promise<void> {
    await this.store.deleteSession(sha256(token));
  }

  /** Mencabut semua sesi akun (dinonaktifkan, dihapus, reset sandi) dan mengeluarkannya dari game. */
  async revoke(accountId: string): Promise<void> {
    await this.store.deleteSessionsOf(accountId);
    for (const fn of this.revokeListeners) fn(accountId);
  }

  onRevoke(fn: (accountId: string) => void): void {
    this.revokeListeners.push(fn);
  }

  /** Dipanggil panel admin setelah tag akun berubah (game memperbarui name tag yang daring). */
  tagChanged: (accountId: string, tag: string | null) => void = () => undefined;
}

const bearer = (req: FastifyRequest) => /^Bearer (\S+)$/.exec(String(req.headers.authorization ?? ""))?.[1];

export function registerAuthRoutes(app: FastifyInstance, accounts: Accounts): void {
  const { store } = accounts;
  // Satu lab kampus biasanya keluar lewat SATU IP (NAT), jadi batas per IP dibuat longgar
  // (satu kelas bisa mendaftar bersamaan); perlindungan utama tiap akun adalah batas per NIM.
  // Gagal masuk: 10 per NIM dan 200 per IP tiap 15 menit. Daftar: 150 per IP per jam (kecuali admin).
  const failById = new Limiter(10, 15 * 60_000);
  const failByIp = new Limiter(200, 15 * 60_000);
  const registerByIp = new Limiter(150, 60 * 60_000);
  const tooMany = (reply: FastifyReply, secs: number) =>
    reply.code(429).header("Retry-After", String(secs)).send({ error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(secs / 60)} menit.` });

  async function authed(req: FastifyRequest, reply: FastifyReply): Promise<AccountRecord | undefined> {
    const a = await accounts.fromToken(bearer(req));
    if (!a) {
      reply.code(401).send({ error: "Sesi berakhir. Silakan masuk lagi." });
      return undefined;
    }
    return a;
  }

  app.get("/api/auth/info", async () => ({ persistent: store.persistent }));

  app.post("/api/auth/register", async (req, reply) => {
    const limited = !accounts.isAdmin(req);
    if (limited && registerByIp.blocked(req.ip)) return tooMany(reply, registerByIp.retryAfter(req.ip));
    const b = (req.body ?? {}) as Partial<Registration>;
    const r: Registration = {
      role: b.role === "dosen" ? "dosen" : "mahasiswa",
      id: String(b.id ?? ""),
      fullName: String(b.fullName ?? ""),
      password: String(b.password ?? ""),
    };
    const fields = validateRegistration(r);
    if (Object.keys(fields).length) return reply.code(400).send({ error: "Periksa kembali isian yang ditandai.", fields });
    if (limited) registerByIp.hit(req.ip);
    try {
      await store.create({ role: r.role, loginId: normalizeId(r.id), fullName: normalizeName(r.fullName), passwordHash: await hashPassword(r.password) });
    } catch (e) {
      if (e instanceof DuplicateError) return reply.code(409).send({ error: "NIM/NIP ini sudah terdaftar. Silakan masuk.", fields: { id: "Sudah terdaftar." } });
      throw e;
    }
    return reply.code(201).send({ status: "menunggu" });
  });

  app.post("/api/auth/login", async (req, reply) => {
    const b = (req.body ?? {}) as { id?: unknown; password?: unknown };
    const loginId = normalizeId(String(b.id ?? "")).slice(0, 30);
    const password = String(b.password ?? "").slice(0, 200);
    if (failByIp.blocked(req.ip)) return tooMany(reply, failByIp.retryAfter(req.ip));
    if (failById.blocked(loginId)) return tooMany(reply, failById.retryAfter(loginId));
    const a = loginId ? await store.byLoginId(loginId) : null;
    // Pesan sama untuk akun tidak ada dan sandi salah: tidak membocorkan NIM terdaftar.
    const ok = await verifyPassword(password, a?.passwordHash ?? (await dummyHash()));
    if (!a || !ok) {
      failByIp.hit(req.ip);
      failById.hit(loginId);
      return reply.code(401).send({ error: "NIM/NIP atau kata sandi salah." });
    }
    failById.reset(loginId);
    if (a.status !== "disetujui") return reply.code(403).send({ error: STATUS_MESSAGE[a.status], status: a.status });
    const now = new Date();
    await store.deleteExpiredSessions(now);
    await store.update(a.id, { lastLoginAt: now });
    return { token: await accounts.createSession(a.id), account: accountView(a) };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const a = await authed(req, reply);
    return a && { account: accountView(a) };
  });

  app.put("/api/auth/character", async (req, reply) => {
    const a = await authed(req, reply);
    if (!a) return;
    const choice = (req.body as { choice?: Partial<CharacterChoice> } | null)?.choice;
    if (!choice || typeof choice !== "object") return reply.code(400).send({ error: "Pilihan avatar tidak sah." });
    const updated = await store.update(a.id, { character: accounts.sanitizeChoice(choice) });
    return { account: accountView(updated!) };
  });

  app.post("/api/auth/password", async (req, reply) => {
    const a = await authed(req, reply);
    if (!a) return;
    const b = (req.body ?? {}) as { current?: unknown; password?: unknown };
    const pw = String(b.password ?? "");
    if (!(await verifyPassword(String(b.current ?? ""), a.passwordHash))) {
      return reply.code(400).send({ error: "Kata sandi lama salah.", fields: { current: "Kata sandi lama salah." } });
    }
    const fields = validateRegistration({ role: a.role, id: a.loginId, fullName: a.fullName, password: pw });
    if (fields.password) return reply.code(400).send({ error: fields.password, fields: { password: fields.password } });
    if (pw.length < PASSWORD_MIN) return reply.code(400).send({ error: "Kata sandi terlalu pendek." });
    const updated = await store.update(a.id, { passwordHash: await hashPassword(pw), mustChangePassword: false });
    return { account: accountView(updated!) };
  });

  app.post("/api/auth/logout", async (req) => {
    const t = bearer(req);
    if (t) await accounts.endSession(t);
    return { ok: true };
  });
}
