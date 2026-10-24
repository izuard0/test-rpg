// Terminal praktik MySQL sungguhan (di server MySQL terpisah, env PRAKTIK_MYSQL_URL).
//
// Tiap akun yang memakai terminal mendapat SESI: user MySQL sementara (p_<id>) yang hanya
// berhak atas database berawalan p_<id>_. Mahasiswa mengetik nama biasa ("toko"); nama
// fisiknya "p_<id>_toko" dan awalan itu disembunyikan dari keluaran. Sesi berakhir (semua
// database + user dihapus, kembali ke nol) setelah 30 menit tanpa query, saat keluar, saat
// tab ditutup, atau saat akun dicabut admin. Saat server mulai, sisa sesi lama dibersihkan.
//
// Pengaman: query dihentikan setelah 5 detik, hasil maks. 500 baris, 2 koneksi per user,
// batas query per jam, kuota ukuran 50 MB per sesi, tanpa hak global (FILE, SUPER, GRANT).

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import mysql, { type Connection, type FieldPacket, type Pool, type ResultSetHeader } from "mysql2/promise";
import { parse as parseYaml } from "yaml";
import { compareResults, keyIsOrdered, type ResultSet, type SqlStatementResult } from "@mita/shared";
import { hidePrefix, rewriteDbNames, splitScript, validDbName } from "./sql-text.js";

export const IDLE_MS = 30 * 60_000;
export const QUERY_MS = 5000;
export const MAX_ROWS = 500;
export const MAX_DBS = 10;
export const QUOTA_BYTES = 50 * 1024 * 1024;
const MAX_STATEMENTS = 60;
const MAX_CODE = 20_000;
const DEFAULT_DB = "akademik";

/** Hak tingkat database untuk user sementara (tanpa EVENT, tanpa GRANT OPTION). */
const DB_PRIVILEGES =
  "SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, CREATE VIEW, SHOW VIEW, " +
  "CREATE ROUTINE, ALTER ROUTINE, EXECUTE, TRIGGER, CREATE TEMPORARY TABLES, LOCK TABLES";

/** Perintah yang ditolak dengan pesan ramah (hak akses MySQL tetap pengaman utamanya). */
const BLOCKED: [RegExp, string][] = [
  [/^\s*(SET\s+(GLOBAL|PERSIST)|SET\s+@@(GLOBAL|PERSIST))/i, "Pengaturan server tidak bisa diubah dari terminal praktik."],
  [/\b(sql_select_limit|max_execution_time)\b/i, "Batas terminal praktik tidak bisa diubah."],
  [/^\s*(CREATE|DROP|ALTER|RENAME)\s+USER\b|^\s*(GRANT|REVOKE)\b/i, "Pengelolaan user dan hak akses tidak tersedia di terminal praktik."],
  [/^\s*(LOAD\s+DATA|LOAD\s+XML)\b|\bINTO\s+(OUTFILE|DUMPFILE)\b|\bLOAD_FILE\s*\(/i, "Membaca/menulis berkas di server tidak diizinkan."],
  [/^\s*(KILL|SHUTDOWN|RESTART|FLUSH|RESET|PURGE|INSTALL|UNINSTALL)\b/i, "Perintah administrasi server tidak tersedia."],
  [/^\s*(CREATE|ALTER|DROP)\s+(DEFINER\s*=\s*\S+\s+)?EVENT\b/i, "EVENT (jadwal otomatis) tidak tersedia di terminal praktik."],
];

/** Penjelasan galat MySQL dalam bahasa Indonesia, diikuti pesan asli. */
const HINTS: Record<number, string> = {
  1046: "Belum memilih database. Jalankan USE nama_database; dulu.",
  1049: "Database itu tidak ada. Lihat daftarnya dengan SHOW DATABASES;",
  1050: "Tabel itu sudah ada. Hapus dulu dengan DROP TABLE, atau tekan Reset data.",
  1054: "Kolom itu tidak ada di tabel yang dipakai.",
  1062: "Nilai ganda (melanggar UNIQUE / PRIMARY KEY).",
  1064: "Kesalahan penulisan SQL. Periksa kata kunci, koma, dan tanda kurung di dekat bagian yang disebut.",
  1007: "Database dengan nama itu sudah ada.",
  1008: "Database itu tidak ada, jadi tidak bisa dihapus.",
  1048: "Kolom itu tidak boleh kosong (NOT NULL).",
  1146: "Tabel itu tidak ada. Periksa ejaannya (nama tabel peka huruf besar/kecil), atau jalankan SHOW TABLES;",
  1451: "Baris ini masih dirujuk tabel lain (FOREIGN KEY).",
  1452: "Nilai rujukan tidak ada di tabel induk (FOREIGN KEY).",
  3819: "Melanggar CHECK constraint.",
  1044: "Tidak punya akses ke database itu. Di terminal praktik kamu hanya bisa memakai database buatanmu sendiri.",
  1142: "Perintah itu tidak diizinkan di terminal praktik.",
  1227: "Perintah itu butuh hak admin server, tidak tersedia di terminal praktik.",
  1317: `Query dihentikan karena melewati ${QUERY_MS / 1000} detik.`,
  3024: `Query dihentikan karena melewati ${QUERY_MS / 1000} detik.`,
  1226: "Batas pemakaian terminal per jam tercapai. Coba lagi nanti.",
};

interface Sess {
  id: string;
  user: string;
  prefix: string;
  password: string;
  conn?: Connection;
  /** Nama logis database milik sesi (huruf kecil -> nama asli). */
  dbs: Map<string, string>;
  current: string | null;
  lastUsed: number;
  busy: boolean;
  /** Pesan untuk dikirim pada permintaan berikutnya (mis. sesi direset karena kuota). */
  notice?: string;
}

interface LatihanSql {
  dataset: string;
  persiapan?: string;
  kunci: string;
  periksaMysql?: string;
  urut: boolean;
}

export interface RunReply {
  statements: SqlStatementResult[];
  /** Database aktif (nama logis) setelah perintah dijalankan. */
  db: string | null;
  databases: string[];
  notice?: string;
}

export interface CheckReply {
  ok: boolean;
  reason?: string;
  statements: SqlStatementResult[];
}

export class PraktikError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const cell = (v: unknown): string | number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "bigint") return v.toString();
  if (Buffer.isBuffer(v)) return v.length <= 64 && /^[\x20-\x7e]*$/.test(v.toString("latin1")) ? v.toString("latin1") : `[biner ${v.length} byte]`;
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
};

export class Praktik {
  private readonly admin: Pool;
  private readonly host: string;
  private readonly port: number;
  private readonly sessions = new Map<string, Sess>();
  private readonly creating = new Map<string, Promise<Sess>>();
  private readonly datasets = new Map<string, string>();
  private readonly latihan = new Map<string, LatihanSql>();
  private readonly kunciCache = new Map<string, ResultSet[]>();
  private timer?: NodeJS.Timeout;
  available = false;

  constructor(url: string, latihanDir: string, private readonly log: (msg: string) => void = () => undefined) {
    const u = new URL(url);
    this.host = u.hostname;
    this.port = Number(u.port || 3306);
    this.admin = mysql.createPool({
      host: this.host,
      port: this.port,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      connectionLimit: 4,
      multipleStatements: false,
    });
    this.loadLatihan(latihanDir);
  }

  private loadLatihan(dir: string): void {
    const data = join(dir, "data");
    if (existsSync(data)) for (const f of readdirSync(data)) if (f.endsWith(".sql")) this.datasets.set(f.slice(0, -4), readFileSync(join(data, f), "utf8"));
    const sql = join(dir, "sql");
    if (!existsSync(sql)) return;
    for (const f of readdirSync(sql).filter((x) => x.endsWith(".yaml")).sort()) {
      const y = parseYaml(readFileSync(join(sql, f), "utf8")) as Record<string, unknown>;
      if (!y?.kunci) continue;
      const kunci = String(y.kunci);
      this.latihan.set(`sql/${f.slice(0, -5)}`, {
        dataset: String(y.dataset ?? "kosong"),
        persiapan: y.persiapan ? String(y.persiapan) : undefined,
        kunci,
        periksaMysql: y.periksaMysql ? String(y.periksaMysql) : undefined,
        urut: !!y.periksaMysql || keyIsOrdered(kunci),
      });
    }
  }

  /** Menyambung, membersihkan sisa sesi lama, dan memulai penyapu sesi diam. */
  async init(): Promise<void> {
    try {
      await this.admin.query("SELECT 1");
      await this.cleanupAll();
      this.available = true;
      this.log(`Praktik MySQL siap (${this.host}:${this.port}).`);
    } catch (e) {
      this.available = false;
      this.log(`Praktik MySQL tidak tersedia: ${(e as Error).message}`);
    }
    this.timer = setInterval(() => void this.sweep(), 60_000);
    this.timer.unref();
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    for (const id of [...this.sessions.keys()]) await this.end(id).catch(() => undefined);
    await this.admin.end().catch(() => undefined);
  }

  // ---------- sesi ----------

  private async cleanupAll(): Promise<void> {
    const [rows] = await this.admin.query("SHOW DATABASES LIKE 'p\\_%'");
    const ids = new Set<string>();
    for (const r of rows as Record<string, string>[]) {
      const name = Object.values(r)[0];
      const m = /^p_([0-9a-f]{10})_/.exec(name);
      if (!m) continue;
      ids.add(m[1]);
      await this.admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    }
    for (const id of ids) await this.admin.query("DROP USER IF EXISTS ?@'%'", [`p_${id}`]);
    if (ids.size) this.log(`Praktik MySQL: ${ids.size} sesi lama dibersihkan.`);
  }

  private async session(accountId: string): Promise<Sess> {
    const s = this.sessions.get(accountId);
    if (s) return s;
    let p = this.creating.get(accountId);
    if (!p) {
      p = this.createSession(accountId).finally(() => this.creating.delete(accountId));
      this.creating.set(accountId, p);
    }
    return p;
  }

  private async createSession(accountId: string): Promise<Sess> {
    const id = randomBytes(5).toString("hex");
    const s: Sess = {
      id,
      user: `p_${id}`,
      prefix: `p_${id}_`,
      password: randomBytes(18).toString("base64url"),
      dbs: new Map(),
      current: null,
      lastUsed: Date.now(),
      busy: false,
    };
    await this.admin.query("CREATE USER ?@'%' IDENTIFIED BY ? WITH MAX_USER_CONNECTIONS 2 MAX_QUERIES_PER_HOUR 5000", [s.user, s.password]);
    await this.admin.query(`GRANT ${DB_PRIVILEGES} ON \`p\\_${id}\\_%\`.* TO ?@'%'`, [s.user]);
    this.sessions.set(accountId, s);
    try {
      await this.loadDataset(s, DEFAULT_DB, DEFAULT_DB);
      await this.exec(s, `USE \`${s.prefix}${DEFAULT_DB}\``);
      s.current = DEFAULT_DB;
    } catch (e) {
      await this.end(accountId);
      throw e;
    }
    return s;
  }

  private async conn(s: Sess): Promise<Connection> {
    if (s.conn) return s.conn;
    const c = await mysql.createConnection({
      host: this.host,
      port: this.port,
      user: s.user,
      password: s.password,
      multipleStatements: false,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      rowsAsArray: true,
    });
    await c.query(`SET SESSION sql_select_limit = ${MAX_ROWS + 1}, max_execution_time = ${QUERY_MS}`);
    c.on("error", () => {
      if (s.conn === c) s.conn = undefined;
    });
    s.conn = c;
    if (s.current && s.dbs.has(s.current.toLowerCase())) await c.query(`USE \`${s.prefix}${s.current}\``).catch(() => undefined);
    return c;
  }

  /** Menjalankan satu pernyataan (sudah ditulis ulang) dengan batas waktu. */
  private async exec(s: Sess, sql: string): Promise<{ sets: ResultSet[]; changes: number; truncated: boolean }> {
    const c = await this.conn(s);
    const thread = c.threadId;
    const killer = setTimeout(() => void this.admin.query(`KILL QUERY ${thread}`).catch(() => undefined), QUERY_MS + 500);
    try {
      const [res, fields] = (await c.query(sql)) as [unknown, FieldPacket[] | FieldPacket[][] | undefined];
      const sets: ResultSet[] = [];
      let changes = 0;
      let truncated = false;
      const addSet = (rows: unknown[][], f: FieldPacket[]) => {
        if (rows.length > MAX_ROWS) truncated = true;
        sets.push({ columns: f.map((x) => x.name), rows: rows.slice(0, MAX_ROWS).map((r) => r.map(cell)) });
      };
      if (Array.isArray(fields) && fields.length && Array.isArray(fields[0])) {
        // CALL prosedur: beberapa hasil sekaligus.
        (res as unknown[]).forEach((r, i) => {
          const f = (fields as FieldPacket[][])[i];
          if (Array.isArray(r) && f) addSet(r as unknown[][], f);
          else if (r && typeof r === "object") changes += (r as ResultSetHeader).affectedRows ?? 0;
        });
      } else if (Array.isArray(res) && fields) addSet(res as unknown[][], fields as FieldPacket[]);
      else changes = (res as ResultSetHeader)?.affectedRows ?? 0;
      return { sets, changes, truncated };
    } finally {
      clearTimeout(killer);
    }
  }

  private explain(s: Sess, e: unknown): string {
    const err = e as { errno?: number; message?: string; sqlState?: string };
    const msg = hidePrefix(String(err.message ?? e), s.prefix, s.user);
    const hint = err.errno ? HINTS[err.errno] : undefined;
    const code = err.errno ? `ERROR ${err.errno}${err.sqlState ? ` (${err.sqlState})` : ""}: ` : "";
    return hint ? `${hint} (${code}${msg})` : `${code}${msg}`;
  }

  private async loadDataset(s: Sess, logical: string, dataset: string): Promise<void> {
    const phys = `\`${s.prefix}${logical}\``;
    await this.exec(s, `CREATE DATABASE ${phys}`);
    s.dbs.set(logical.toLowerCase(), logical);
    await this.exec(s, `USE ${phys}`);
    const sql = dataset === "kosong" ? "" : this.datasets.get(dataset) ?? "";
    for (const st of splitScript(sql)) await this.exec(s, st);
  }

  async end(accountId: string): Promise<void> {
    const s = this.sessions.get(accountId);
    if (!s) return;
    this.sessions.delete(accountId);
    s.conn?.destroy();
    const [rows] = await this.admin.query("SHOW DATABASES LIKE ?", [`p\\_${s.id}\\_%`]);
    for (const r of rows as Record<string, string>[]) await this.admin.query(`DROP DATABASE IF EXISTS \`${Object.values(r)[0]}\``);
    await this.admin.query("DROP USER IF EXISTS ?@'%'", [s.user]);
  }

  async reset(accountId: string): Promise<RunReply> {
    await this.end(accountId);
    const s = await this.session(accountId);
    return { statements: [], db: s.current, databases: [...s.dbs.values()] };
  }

  private async sweep(now = Date.now()): Promise<void> {
    for (const [acc, s] of this.sessions) if (!s.busy && now - s.lastUsed > IDLE_MS) await this.end(acc).catch(() => undefined);
    if (!this.sessions.size) return;
    // Kuota ukuran: sesi yang melewati batas direset.
    try {
      const [rows] = await this.admin.query(
        "SELECT table_schema AS s, SUM(data_length + index_length) AS b FROM information_schema.tables WHERE table_schema LIKE 'p\\_%' GROUP BY table_schema",
      );
      const size = new Map<string, number>();
      for (const r of rows as { s: string; b: string }[]) {
        const id = /^p_([0-9a-f]{10})_/.exec(r.s)?.[1];
        if (id) size.set(id, (size.get(id) ?? 0) + Number(r.b));
      }
      for (const [acc, s] of this.sessions) {
        if ((size.get(s.id) ?? 0) <= QUOTA_BYTES) continue;
        await this.end(acc);
        const fresh = await this.session(acc);
        fresh.notice = `Database praktikmu melebihi ${QUOTA_BYTES / 1024 / 1024} MB, jadi direset ke awal.`;
      }
    } catch {
      // abaikan; dicoba lagi menit berikutnya
    }
  }

  // ---------- menjalankan ----------

  private async withSession<T>(accountId: string, fn: (s: Sess) => Promise<T>): Promise<T> {
    if (!this.available) throw new PraktikError("Server MySQL praktik tidak tersedia.", 503);
    const s = await this.session(accountId);
    if (s.busy) throw new PraktikError("Perintah sebelumnya masih berjalan.", 429);
    s.busy = true;
    try {
      return await fn(s);
    } finally {
      s.busy = false;
      s.lastUsed = Date.now();
    }
  }

  /** Menjalankan skrip; berhenti pada galat pertama (seperti klien mysql dengan --force mati). */
  private async runScript(s: Sess, code: string, out: SqlStatementResult[]): Promise<ResultSet | undefined> {
    if (code.length > MAX_CODE) throw new PraktikError(`Kode terlalu panjang (maks. ${MAX_CODE.toLocaleString("id-ID")} karakter).`);
    const statements = splitScript(code);
    if (statements.length > MAX_STATEMENTS) throw new PraktikError(`Terlalu banyak perintah sekaligus (maks. ${MAX_STATEMENTS}).`);
    let last: ResultSet | undefined;
    for (const raw of statements) {
      const shown = raw.replace(/^(\s*(--[^\n]*\n?|#[^\n]*\n?|\/\*[\s\S]*?\*\/))+/, "").trim();
      const blocked = BLOCKED.find(([re]) => re.test(shown));
      if (blocked) {
        out.push({ sql: shown, error: blocked[1] });
        return last;
      }
      const rw = rewriteDbNames(raw, s.prefix, new Set(s.dbs.keys()));
      if (rw.error) {
        out.push({ sql: shown, error: rw.error });
        return last;
      }
      if (rw.kind?.op === "create" && !s.dbs.has(rw.kind.name.toLowerCase()) && s.dbs.size >= MAX_DBS) {
        out.push({ sql: shown, error: `Maksimal ${MAX_DBS} database per sesi. Hapus yang tidak dipakai dengan DROP DATABASE.` });
        return last;
      }
      try {
        const r = await this.exec(s, rw.sql);
        if (rw.kind?.op === "create") s.dbs.set(rw.kind.name.toLowerCase(), rw.kind.name);
        if (rw.kind?.op === "drop") {
          s.dbs.delete(rw.kind.name.toLowerCase());
          if (s.current?.toLowerCase() === rw.kind.name.toLowerCase()) s.current = null;
        }
        if (rw.kind?.op === "use") s.current = s.dbs.get(rw.kind.name.toLowerCase()) ?? rw.kind.name;
        const hide = (v: string | number | null) => (typeof v === "string" ? hidePrefix(v, s.prefix, s.user) : v);
        if (!r.sets.length) out.push({ sql: shown, changes: r.changes });
        for (const set of r.sets) {
          const columns = set.columns.map((c) => hidePrefix(c, s.prefix, s.user));
          const rows = set.rows.map((row) => row.map(hide));
          out.push({ sql: shown, columns, rows, truncated: r.truncated });
          last = { columns, rows };
        }
      } catch (e) {
        out.push({ sql: shown, error: this.explain(s, e) });
        if ((e as { fatal?: boolean }).fatal) s.conn = undefined;
        return last;
      }
    }
    return last;
  }

  async run(accountId: string, code: string): Promise<RunReply> {
    return this.withSession(accountId, async (s) => {
      const statements: SqlStatementResult[] = [];
      const notice = s.notice;
      s.notice = undefined;
      await this.runScript(s, code, statements);
      return { statements, db: s.current, databases: [...s.dbs.values()], ...(notice ? { notice } : {}) };
    });
  }

  /**
   * Latihan: kode dijalankan di database baru berisi dataset soal (+ persiapan). Saat
   * `periksa`, kunci juga dijalankan di database baru lain lalu hasilnya dibandingkan
   * (hasil SELECT terakhir, atau hasil `periksaMysql` untuk latihan DDL).
   */
  async latihanRun(accountId: string, id: string, code: string, periksa: boolean): Promise<CheckReply> {
    const l = this.latihan.get(id);
    if (!l) throw new PraktikError("Latihan tidak ditemukan.", 404);
    return this.withSession(accountId, async (s) => {
      const statements: SqlStatementResult[] = [];
      const back = s.current;
      const temp: string[] = [];
      const fresh = async () => {
        const name = `latihan_${randomBytes(3).toString("hex")}`;
        temp.push(name);
        await this.loadDataset(s, name, l.dataset);
        if (l.persiapan) for (const st of splitScript(l.persiapan)) await this.exec(s, st);
        s.current = name;
      };
      try {
        await fresh();
        const got = await this.runScript(s, code, statements);
        if (!periksa) return { ok: false, statements };
        if (statements.some((x) => x.error)) return { ok: false, reason: "Masih ada galat.", statements };
        const mine = l.periksaMysql ? await this.resultsOf(s, l.periksaMysql) : got ? [got] : [];
        let want = this.kunciCache.get(id);
        if (!want) {
          await fresh();
          const keyOut: SqlStatementResult[] = [];
          const keyLast = await this.runScript(s, l.kunci, keyOut);
          const bad = keyOut.find((x) => x.error);
          if (bad) throw new PraktikError(`Kunci latihan galat di MySQL: ${bad.error}`, 500);
          want = l.periksaMysql ? await this.resultsOf(s, l.periksaMysql) : keyLast ? [keyLast] : [];
          this.kunciCache.set(id, want);
        }
        if (!want.length) return { ok: false, reason: "Latihan ini belum punya pemeriksa MySQL.", statements };
        for (const [i, w] of want.entries()) {
          const c = compareResults(mine[i], w, l.urut);
          if (!c.ok) return { ok: false, reason: l.periksaMysql ? "Struktur tabel belum sesuai permintaan soal." : c.reason, statements };
        }
        return { ok: true, statements };
      } finally {
        for (const name of temp) {
          await this.exec(s, `DROP DATABASE IF EXISTS \`${s.prefix}${name}\``).catch(() => undefined);
          s.dbs.delete(name);
        }
        s.current = back && s.dbs.has(back.toLowerCase()) ? back : null;
        if (s.current) await this.exec(s, `USE \`${s.prefix}${s.current}\``).catch(() => undefined);
      }
    });
  }

  private async resultsOf(s: Sess, script: string): Promise<ResultSet[]> {
    const out: ResultSet[] = [];
    for (const st of splitScript(script)) out.push(...(await this.exec(s, st)).sets);
    return out;
  }

  /** Untuk uji: jumlah sesi aktif. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Untuk uji: memaksa penyapuan dengan waktu tertentu. */
  sweepNow(now = Date.now()): Promise<void> {
    return this.sweep(now);
  }

  static validDbName = validDbName;
}
