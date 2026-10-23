// Halaman admin /panel: menyetujui, menolak, menonaktifkan akun, dan me-reset kata sandi.
// Satu akun admin dari env ADMIN_USERNAME + ADMIN_PASSWORD (hanya pemilik server yang tahu).
//
// Sesi admin = cookie httpOnly + SameSite=Strict, disimpan di memori (mulai ulang server =
// masuk lagi). Gagal masuk 5x per IP (atau 30x total) mengunci login admin 15 menit.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TAG_MAX, normalizeTag } from "@mita/shared";
import { accountView, type Accounts } from "../auth/index.js";
import { Limiter } from "../auth/limit.js";
import { hashPassword, tempPassword } from "../auth/password.js";
import type { AccountRecord, AccountStatus } from "../auth/store.js";

export interface AdminOptions {
  username?: string;
  password?: string;
}

export const ADMIN_PASSWORD_MIN = 12;
const COOKIE = "mita_admin";
const SESSION_MS = 8 * 60 * 60 * 1000;

export type AdminAction = "setujui" | "tolak" | "nonaktifkan" | "aktifkan" | "hapus";

/** Status asal yang boleh untuk tiap aksi, dan status hasilnya. */
const TRANSITIONS: Record<Exclude<AdminAction, "hapus">, { from: AccountStatus[]; to: AccountStatus }> = {
  setujui: { from: ["menunggu", "ditolak"], to: "disetujui" },
  tolak: { from: ["menunggu"], to: "ditolak" },
  nonaktifkan: { from: ["disetujui"], to: "nonaktif" },
  aktifkan: { from: ["nonaktif"], to: "disetujui" },
};
// Akun yang masih aktif harus dinonaktifkan dulu sebelum dihapus (mencegah salah klik).
const DELETABLE: AccountStatus[] = ["menunggu", "ditolak", "nonaktif"];

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const cookieOf = (req: FastifyRequest, name: string) =>
  String(req.headers.cookie ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === name)?.[1];

const adminRow = (a: AccountRecord) => ({
  ...accountView(a),
  uid: a.id,
  status: a.status,
  hasCharacter: !!a.character,
  createdAt: a.createdAt.toISOString(),
  reviewedAt: a.reviewedAt?.toISOString() ?? null,
  lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
});

export function registerAdminRoutes(app: FastifyInstance, accounts: Accounts, opts: AdminOptions, clientDir: string): void {
  const username = opts.username?.trim() ?? "";
  const password = opts.password ?? "";
  const enabled = !!username && password.length >= ADMIN_PASSWORD_MIN;
  if (!enabled) app.log.warn(`Panel admin nonaktif: atur ADMIN_USERNAME dan ADMIN_PASSWORD (min. ${ADMIN_PASSWORD_MIN} karakter).`);
  const sessions = new Map<string, number>(); // token -> kedaluwarsa
  const failByIp = new Limiter(5, 15 * 60_000);
  const failAll = new Limiter(30, 15 * 60_000);
  const { store } = accounts;

  const isAdmin = (req: FastifyRequest) => {
    const t = cookieOf(req, COOKIE);
    const exp = t ? sessions.get(t) : undefined;
    if (!t || !exp) return false;
    if (exp <= Date.now()) {
      sessions.delete(t);
      return false;
    }
    return true;
  };
  accounts.isAdmin = (req) => enabled && isAdmin(req);
  const cookie = (req: FastifyRequest, value: string, maxAge: number) =>
    `${COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${req.protocol === "https" ? "; Secure" : ""}`;

  // Halaman panel: tidak boleh di-cache, dibingkai situs lain, atau diindeks mesin pencari.
  const page = (_req: FastifyRequest, reply: FastifyReply) => {
    if (!existsSync(join(clientDir, "panel.html"))) return reply.code(404).send({ error: "Klien belum dibangun (npm run build)." });
    return reply
      .header("Cache-Control", "no-store")
      .header("X-Frame-Options", "DENY")
      .header("Content-Security-Policy", "frame-ancestors 'none'")
      .header("X-Robots-Tag", "noindex, nofollow")
      .header("Referrer-Policy", "no-referrer")
      .sendFile("panel.html", clientDir);
  };
  app.get("/panel", page);
  // Tanpa garis miring akhir: aset build memakai alamat relatif ("./assets/...").
  app.get("/panel/", (_req, reply) => reply.redirect("/panel"));

  // Semua API admin: tanpa cache; permintaan yang mengubah data wajib membawa header khusus
  // (formulir dari situs lain tidak bisa menambahkannya), selain cookie SameSite=Strict.
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/admin/")) return;
    reply.header("Cache-Control", "no-store");
    if (req.method !== "GET" && req.headers["x-mita-panel"] !== "1") return reply.code(403).send({ error: "Permintaan ditolak." });
    if (!req.url.startsWith("/api/admin/login") && !req.url.startsWith("/api/admin/me") && !isAdmin(req)) {
      return reply.code(401).send({ error: "Silakan masuk sebagai admin." });
    }
  });

  app.get("/api/admin/me", async (req) => ({ enabled, admin: enabled && isAdmin(req) ? username : null }));

  app.post("/api/admin/login", async (req, reply) => {
    if (!enabled) return reply.code(503).send({ error: "Panel admin belum diaktifkan di server." });
    if (failByIp.blocked(req.ip) || failAll.blocked("*")) {
      const secs = Math.max(failByIp.retryAfter(req.ip), failAll.blocked("*") ? failAll.retryAfter("*") : 0);
      return reply.code(429).header("Retry-After", String(secs)).send({ error: `Terlalu banyak percobaan gagal. Login admin dikunci ${Math.ceil(secs / 60)} menit.` });
    }
    const b = (req.body ?? {}) as { username?: unknown; password?: unknown };
    // Keduanya selalu dibandingkan agar waktu respons tidak membocorkan mana yang salah.
    const okUser = sameText(String(b.username ?? ""), username);
    const okPass = sameText(String(b.password ?? ""), password);
    if (!okUser || !okPass) {
      failByIp.hit(req.ip);
      failAll.hit("*");
      app.log.warn(`Login admin gagal dari ${req.ip}`);
      return reply.code(401).send({ error: "Username atau kata sandi admin salah." });
    }
    failByIp.reset(req.ip);
    const now = Date.now();
    for (const [t, exp] of sessions) if (exp <= now) sessions.delete(t);
    const token = randomBytes(32).toString("base64url");
    sessions.set(token, now + SESSION_MS);
    app.log.info(`Admin masuk dari ${req.ip}`);
    return reply.header("Set-Cookie", cookie(req, token, SESSION_MS / 1000)).send({ admin: username });
  });

  app.post("/api/admin/logout", async (req, reply) => {
    const t = cookieOf(req, COOKIE);
    if (t) sessions.delete(t);
    return reply.header("Set-Cookie", cookie(req, "", 0)).send({ ok: true });
  });

  app.get("/api/admin/accounts", async () => ({ persistent: store.persistent, accounts: (await store.list()).map(adminRow) }));

  app.post("/api/admin/accounts/action", async (req, reply) => {
    const b = (req.body ?? {}) as { ids?: unknown; action?: unknown };
    const action = String(b.action) as AdminAction;
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
    if (!(action in TRANSITIONS) && action !== "hapus") return reply.code(400).send({ error: "Aksi tidak dikenal." });
    if (!ids.length) return reply.code(400).send({ error: "Pilih akun dulu." });
    let done = 0;
    const skipped: string[] = [];
    for (const id of ids) {
      const a = await store.byId(id);
      if (!a) continue;
      if (action === "hapus") {
        if (!DELETABLE.includes(a.status)) {
          skipped.push(a.fullName);
          continue;
        }
        await accounts.revoke(a.id);
        await store.delete(a.id);
        done++;
        continue;
      }
      const t = TRANSITIONS[action];
      if (!t.from.includes(a.status)) {
        skipped.push(a.fullName);
        continue;
      }
      await store.update(a.id, { status: t.to, reviewedAt: new Date() });
      if (t.to !== "disetujui") await accounts.revoke(a.id);
      done++;
    }
    app.log.info(`Admin: ${action} ${done} akun`);
    return { done, skipped };
  });

  app.post("/api/admin/accounts/tag", async (req, reply) => {
    const b = (req.body ?? {}) as { ids?: unknown; tag?: unknown };
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
    const tag = normalizeTag(String(b.tag ?? ""));
    if (tag === null) return reply.code(400).send({ error: `Tag maksimal ${TAG_MAX} karakter: huruf, angka, spasi, dan . - _ & +.` });
    if (!ids.length) return reply.code(400).send({ error: "Pilih akun dulu." });
    let done = 0;
    for (const id of ids) {
      const a = await store.update(id, { tag: tag || null });
      if (!a) continue;
      accounts.tagChanged(a.id, a.tag);
      done++;
    }
    app.log.info(`Admin: tag "${tag}" untuk ${done} akun`);
    return { done, tag: tag || null };
  });

  app.post("/api/admin/accounts/reset-password", async (req, reply) => {
    const id = String((req.body as { id?: unknown } | null)?.id ?? "");
    const a = await store.byId(id);
    if (!a) return reply.code(404).send({ error: "Akun tidak ditemukan." });
    const pw = tempPassword();
    await store.update(a.id, { passwordHash: await hashPassword(pw), mustChangePassword: true });
    await accounts.revoke(a.id);
    app.log.info(`Admin: reset kata sandi ${a.loginId}`);
    return { password: pw };
  });
}

