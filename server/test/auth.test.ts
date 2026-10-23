// Uji API akun dan panel admin. Dijalankan pada MemoryStore, dan juga pada PostgreSQL
// bila TEST_DATABASE_URL diatur (database itu dikosongkan dulu; jangan pakai database produksi).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore, PrismaStore, type AccountStore } from "../src/auth/store.js";

const ADMIN = { username: "pemilik", password: "sandi-admin-panjang" };
const TEST_DB = process.env.TEST_DATABASE_URL;

const stores: [string, () => Promise<AccountStore>][] = [["memori", async () => new MemoryStore()]];
if (TEST_DB) {
  stores.push([
    "postgres",
    async () => {
      const pg = await import("pg");
      const c = new pg.default.Client({ connectionString: TEST_DB });
      await c.connect();
      await c.query("TRUNCATE accounts, sessions");
      await c.end();
      return new PrismaStore(TEST_DB);
    },
  ]);
}

describe.each(stores)("akun & panel admin (%s)", (_name, makeStore) => {
  let app: FastifyInstance;
  let cookie = "";

  beforeAll(async () => {
    app = await buildApp({ clientDir: mkdtempSync(join(tmpdir(), "mita-")), store: await makeStore(), admin: ADMIN });
  });
  afterAll(async () => {
    await app.close();
  });

  const call = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.inject({ method: method as "GET", url, payload: body as object, headers });
    return { status: res.statusCode, body: res.json() as Record<string, unknown>, headers: res.headers };
  };
  const register = (id: string, role = "mahasiswa", fullName = "Ani Lestari", password = "rahasia123") =>
    call("POST", "/api/auth/register", { role, id, fullName, password });
  const login = (id: string, password = "rahasia123") => call("POST", "/api/auth/login", { id, password });
  const admin = (method: string, url: string, body?: unknown) => call(method, url, body, { cookie, "x-mita-panel": "1" });
  const uidOf = async (loginId: string) => {
    const r = await admin("GET", "/api/admin/accounts");
    return (r.body.accounts as { uid: string; id: string }[]).find((a) => a.id === loginId)!.uid;
  };

  it("daftar -> menunggu persetujuan; NIM ganda dan isian salah ditolak", async () => {
    expect(await register("2201001")).toMatchObject({ status: 201, body: { status: "menunggu" } });
    expect((await register("22.010-01")).status).toBe(409);
    const bad = await register("12", "mahasiswa", "", "pendek");
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fields as object).sort()).toEqual(["fullName", "id", "password"]);
    // Sandi benar tetapi belum disetujui: pesan status; sandi salah: pesan umum.
    expect(await login("2201001")).toMatchObject({ status: 403, body: { status: "menunggu" } });
    expect(await login("2201001", "salah-sandi")).toMatchObject({ status: 401 });
    expect(await login("9999999")).toMatchObject({ status: 401, body: { error: "NIM/NIP atau kata sandi salah." } });
  });

  it("panel admin: login, header wajib, setujui, tolak, nonaktifkan", async () => {
    expect((await call("GET", "/api/admin/accounts")).status).toBe(401);
    expect((await call("POST", "/api/admin/login", ADMIN)).status).toBe(403); // tanpa header x-mita-panel
    expect((await call("POST", "/api/admin/login", { ...ADMIN, password: "salah" }, { "x-mita-panel": "1" })).status).toBe(401);
    const ok = await call("POST", "/api/admin/login", ADMIN, { "x-mita-panel": "1" });
    expect(ok.status).toBe(200);
    const set = String(ok.headers["set-cookie"]);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    cookie = set.split(";")[0];
    expect((await admin("GET", "/api/admin/me")).body).toMatchObject({ enabled: true, admin: "pemilik" });

    await register("198001012005011001", "dosen", "Dr. Joko Widodo");
    await register("2201002", "mahasiswa", "Budi Santoso");
    const list = await admin("GET", "/api/admin/accounts");
    const rows = list.body.accounts as { id: string; status: string; role: string; passwordHash?: string }[];
    expect(rows.map((r) => r.id).sort()).toEqual(["198001012005011001", "2201001", "2201002"]);
    expect(rows.every((r) => r.status === "menunggu" && !("passwordHash" in r))).toBe(true);

    const [ani, joko, budi] = await Promise.all(["2201001", "198001012005011001", "2201002"].map(uidOf));
    expect((await admin("POST", "/api/admin/accounts/action", { ids: [ani, joko], action: "setujui" })).body).toMatchObject({ done: 2 });
    expect((await admin("POST", "/api/admin/accounts/action", { ids: [budi], action: "tolak" })).body).toMatchObject({ done: 1 });
    expect(await login("2201002", "rahasia123")).toMatchObject({ status: 403, body: { status: "ditolak" } });

    // Peran dosen berasal dari database.
    const j = await login("198001012005011001");
    expect(j.status).toBe(200);
    expect(j.body.account).toMatchObject({ role: "dosen", fullName: "Dr. Joko Widodo", character: null });

    // Nonaktifkan: sesi yang sudah ada langsung tidak berlaku.
    const a = await login("2201001");
    const auth = { authorization: `Bearer ${a.body.token}` };
    expect((await call("GET", "/api/auth/me", undefined, auth)).status).toBe(200);
    await admin("POST", "/api/admin/accounts/action", { ids: [ani], action: "nonaktifkan" });
    expect((await call("GET", "/api/auth/me", undefined, auth)).status).toBe(401);
    expect(await login("2201001")).toMatchObject({ status: 403, body: { status: "nonaktif" } });
    // Akun aktif tidak bisa langsung dihapus; yang ditolak bisa (NIM bebas untuk daftar ulang).
    await admin("POST", "/api/admin/accounts/action", { ids: [ani], action: "aktifkan" });
    expect((await admin("POST", "/api/admin/accounts/action", { ids: [ani], action: "hapus" })).body).toMatchObject({ done: 0, skipped: ["Ani Lestari"] });
    expect((await admin("POST", "/api/admin/accounts/action", { ids: [budi], action: "hapus" })).body).toMatchObject({ done: 1 });
    expect((await register("2201002", "mahasiswa", "Budi Santoso")).status).toBe(201);
  });

  it("karakter disimpan di server; reset sandi oleh admin memaksa ganti sandi", async () => {
    const a = await login("2201001");
    const auth = { authorization: `Bearer ${a.body.token}` };
    const ch = await call("PUT", "/api/auth/character", { choice: { gender: "P", head: "bukan-kepala" } }, auth);
    expect(ch.status).toBe(200);
    expect((ch.body.account as { character: { gender: string } }).character.gender).toBe("P");
    expect((await call("GET", "/api/auth/me", undefined, auth)).body.account).toMatchObject({ character: { gender: "P" } });

    const reset = await admin("POST", "/api/admin/accounts/reset-password", { id: await uidOf("2201001") });
    const temp = String(reset.body.password);
    expect(temp).toMatch(/^[a-z2-9]{10}$/);
    expect((await call("GET", "/api/auth/me", undefined, auth)).status).toBe(401); // sesi lama dicabut
    expect((await login("2201001")).status).toBe(401);
    const t = await login("2201001", temp);
    expect(t.body.account).toMatchObject({ mustChangePassword: true });
    const auth2 = { authorization: `Bearer ${t.body.token}` };
    expect((await call("POST", "/api/auth/password", { current: "salah", password: "sandi-baru-123" }, auth2)).status).toBe(400);
    expect((await call("POST", "/api/auth/password", { current: temp, password: "sandi-baru-123" }, auth2)).body.account).toMatchObject({ mustChangePassword: false });
    expect((await login("2201001", "sandi-baru-123")).status).toBe(200);
  });

  it("admin memberi tag: dirapikan, divalidasi, ikut di data akun", async () => {
    const id = await uidOf("2201001");
    expect((await admin("POST", "/api/admin/accounts/tag", { ids: [id], tag: "  [Asdos]  " })).body).toMatchObject({ done: 1, tag: "Asdos" });
    expect((await admin("POST", "/api/admin/accounts/tag", { ids: [id], tag: "tag yang terlalu panjang" })).status).toBe(400);
    expect((await admin("POST", "/api/admin/accounts/tag", { ids: [id], tag: "<b>x</b>" })).status).toBe(400);
    expect((await login("2201001", "sandi-baru-123")).body.account).toMatchObject({ tag: "Asdos" });
    expect((await admin("POST", "/api/admin/accounts/tag", { ids: [id], tag: "" })).body).toMatchObject({ done: 1, tag: null });
    expect((await login("2201001", "sandi-baru-123")).body.account).toMatchObject({ tag: null });
  });

  it("login admin dikunci setelah 5 kali gagal dari IP yang sama", async () => {
    for (let i = 0; i < 4; i++) await call("POST", "/api/admin/login", { ...ADMIN, password: `salah${i}` }, { "x-mita-panel": "1" });
    expect((await call("POST", "/api/admin/login", ADMIN, { "x-mita-panel": "1" })).status).toBe(200); // berhasil = hitungan direset
    for (let i = 0; i < 5; i++) await call("POST", "/api/admin/login", { ...ADMIN, password: `salah${i}` }, { "x-mita-panel": "1" });
    const locked = await call("POST", "/api/admin/login", ADMIN, { "x-mita-panel": "1" });
    expect(locked.status).toBe(429);
    expect(locked.headers["retry-after"]).toBeTruthy();
  });
});

describe("panel admin tanpa env", () => {
  it("nonaktif bila ADMIN_PASSWORD kosong atau terlalu pendek", async () => {
    const app = await buildApp({ clientDir: mkdtempSync(join(tmpdir(), "mita-")), admin: { username: "x", password: "pendek" } });
    expect((await app.inject({ url: "/api/admin/me" })).json()).toEqual({ enabled: false, admin: null });
    const r = await app.inject({ method: "POST", url: "/api/admin/login", headers: { "x-mita-panel": "1" }, payload: { username: "x", password: "pendek" } });
    expect(r.statusCode).toBe(503);
    await app.close();
  });
});
