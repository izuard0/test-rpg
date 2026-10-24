// Uji terminal praktik MySQL. Bagian teks SQL selalu jalan; bagian MySQL butuh
// TEST_MYSQL_URL (user dengan hak seperti mita_praktik, lihat README) dan dilewati bila kosong.

import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Praktik } from "../src/praktik/index.js";
import { hidePrefix, rewriteDbNames, splitScript } from "../src/praktik/sql-text.js";

describe("teks SQL praktik", () => {
  it("memecah skrip, termasuk DELIMITER untuk prosedur", () => {
    expect(splitScript("SELECT 1; SELECT ';' AS x;\n-- komentar;\nSELECT 2")).toEqual(["SELECT 1", "SELECT ';' AS x", "-- komentar;\nSELECT 2"]);
    const proc = "DELIMITER //\nCREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\n  SELECT 2;\nEND //\nDELIMITER ;\nCALL p();";
    expect(splitScript(proc)).toEqual(["CREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\n  SELECT 2;\nEND", "CALL p()"]);
  });

  it("menulis ulang nama database milik sesi", () => {
    const known = new Set(["akademik", "toko"]);
    const P = "p_0123456789_";
    expect(rewriteDbNames("CREATE DATABASE IF NOT EXISTS toko", P, known)).toMatchObject({ sql: "CREATE DATABASE IF NOT EXISTS `p_0123456789_toko`", kind: { op: "create", name: "toko" } });
    expect(rewriteDbNames("use `toko`", P, known).sql).toBe("use `p_0123456789_toko`");
    expect(rewriteDbNames("SELECT * FROM akademik.mahasiswa m JOIN toko.`produk` p", P, known).sql).toBe(
      "SELECT * FROM `p_0123456789_akademik`.mahasiswa m JOIN `p_0123456789_toko`.`produk` p",
    );
    // Alias tabel (m.nama) dan teks berkutip tidak diubah.
    expect(rewriteDbNames("SELECT m.nama, 'toko.x' FROM mahasiswa m", P, known).sql).toBe("SELECT m.nama, 'toko.x' FROM mahasiswa m");
    expect(rewriteDbNames("SHOW TABLES FROM toko", P, known).sql).toBe("SHOW TABLES FROM `p_0123456789_toko`");
    expect(rewriteDbNames("DROP DATABASE mysql", P, known).error).toMatch(/tidak sah/);
    expect(hidePrefix("Table 'p_0123456789_toko.x' doesn't exist for 'p_0123456789'@'%'", P, "p_0123456789")).toBe("Table 'toko.x' doesn't exist for kamu");
  });
});

const URL_ = process.env.TEST_MYSQL_URL;
describe.skipIf(!URL_)("praktik MySQL sungguhan", () => {
  let p: Praktik;
  beforeAll(async () => {
    p = new Praktik(URL_!, resolve(import.meta.dirname, "../../latihan"));
    await p.init();
    expect(p.available).toBe(true);
  });
  afterAll(async () => {
    await p.close();
  });

  const texts = (r: { statements: { error?: string; rows?: unknown[][] }[] }) => r.statements.map((s) => s.error ?? JSON.stringify(s.rows ?? "ok"));

  it("sandbox berisi akademik; CREATE DATABASE, USE, SHOW DATABASES tanpa awalan", async () => {
    const r = await p.run("a1", "SELECT COUNT(*) FROM mahasiswa; CREATE DATABASE toko; USE toko; CREATE TABLE produk (id INT PRIMARY KEY, nama VARCHAR(20)); INSERT INTO produk VALUES (1,'pena'); SELECT DATABASE(); SHOW DATABASES;");
    expect(r.statements.every((s) => !s.error)).toBe(true);
    expect(r.statements[0].rows).toEqual([["8"]]);
    expect(r.statements[5].rows).toEqual([["toko"]]);
    expect(r.statements[6].rows!.flat()).toEqual(expect.arrayContaining(["akademik", "toko"]));
    expect(JSON.stringify(r)).not.toMatch(/p_[0-9a-f]{10}/);
    expect(r).toMatchObject({ db: "toko" });
    // Rujukan lintas database dan prosedur (DELIMITER).
    const q = await p.run("a1", "SELECT nama FROM akademik.mahasiswa ORDER BY nim LIMIT 1;\nDELIMITER //\nCREATE PROCEDURE jumlah() BEGIN SELECT COUNT(*) AS n FROM produk; END //\nDELIMITER ;\nCALL jumlah();");
    expect(texts(q)).toEqual(['[["Ani Lestari"]]', '"ok"', '[["1"]]']);
  });

  it("sesi terpisah: tidak bisa membuka database sesi lain", async () => {
    await p.run("b1", "SELECT 1");
    const other = [...(p as unknown as { sessions: Map<string, { prefix: string }> }).sessions.entries()].find(([k]) => k === "a1")![1].prefix;
    const r = await p.run("b1", `SELECT * FROM \`${other}toko\`.produk`);
    expect(r.statements[0].error).toMatch(/1142|1044|akses|tidak diizinkan/i);
  });

  it("menghentikan query lama, menolak perintah berbahaya, membatasi baris", async () => {
    const t0 = Date.now();
    const r = await p.run("a1", "SELECT SLEEP(20)");
    expect(Date.now() - t0).toBeLessThan(9000);
    expect(r.statements[0].error ?? JSON.stringify(r.statements[0].rows)).toMatch(/5 detik|\[\["1"\]\]/);
    expect((await p.run("a1", "SET GLOBAL max_connections = 1")).statements[0].error).toMatch(/tidak bisa diubah/);
    expect((await p.run("a1", "GRANT ALL ON *.* TO 'x'@'%'")).statements[0].error).toMatch(/tidak tersedia/);
    expect((await p.run("a1", "SET SESSION sql_select_limit = DEFAULT")).statements[0].error).toMatch(/tidak bisa diubah/);
    const big = await p.run("a1", "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 800) SELECT i FROM n");
    expect(big.statements[0].rows).toHaveLength(500);
    expect(big.statements[0].truncated).toBe(true);
  }, 20_000);

  it("latihan diperiksa di MySQL (SELECT dan DDL)", async () => {
    expect((await p.latihanRun("a1", "sql/02_angkatan_2023", "SELECT nama FROM mahasiswa WHERE angkatan = 2023 ORDER BY nama;", true)).ok).toBe(true);
    const wrongOrder = await p.latihanRun("a1", "sql/02_angkatan_2023", "SELECT nama FROM mahasiswa WHERE angkatan = 2023 ORDER BY nama DESC;", true);
    expect(wrongOrder.ok).toBe(false);
    const ddl = "CREATE TABLE Instruktur (instruktur_id INT AUTO_INCREMENT PRIMARY KEY, nama_instruktur VARCHAR(100) NOT NULL, email VARCHAR(100) UNIQUE);";
    expect((await p.latihanRun("a1", "sql/04_ddl_instruktur", ddl, true)).ok).toBe(true);
    expect((await p.latihanRun("a1", "sql/04_ddl_instruktur", ddl.replace(" UNIQUE", ""), true)).ok).toBe(false);
    const alter = "ALTER TABLE Mahasiswa ADD COLUMN telepon VARCHAR(15) AFTER email;\nALTER TABLE Mahasiswa ADD CONSTRAINT uq_telepon UNIQUE (telepon);\nALTER TABLE Mahasiswa MODIFY COLUMN nama_mahasiswa VARCHAR(150) NOT NULL;";
    expect((await p.latihanRun("a1", "sql/06_alter_mahasiswa", alter, true)).ok).toBe(true);
    const fk = "CREATE TABLE Kursus (kursus_id INT AUTO_INCREMENT PRIMARY KEY, nama_kursus VARCHAR(150) NOT NULL, jumlah_modul INT, instruktur_id INT NOT NULL, FOREIGN KEY (instruktur_id) REFERENCES Instruktur(instruktur_id));";
    expect((await p.latihanRun("a1", "sql/05_ddl_kursus_fk", fk, true)).ok).toBe(true);
    // Database sementara latihan tidak tertinggal; database aktif kembali seperti semula.
    const after = await p.run("a1", "SHOW DATABASES; SELECT DATABASE();");
    expect(after.statements[0].rows!.flat().some((x) => String(x).startsWith("latihan_"))).toBe(false);
    expect(after.statements[1].rows).toEqual([["toko"]]);
  }, 30_000);

  it("reset dan akhir sesi menghapus semuanya", async () => {
    const r = await p.reset("a1");
    expect(r.databases).toEqual(["akademik"]);
    expect((await p.run("a1", "USE toko")).statements[0].error).toMatch(/1044|1049|tidak ada|akses/i);
    await p.end("a1");
    await p.end("b1");
    expect(p.sessionCount).toBe(0);
  });

  it("sesi diam lebih dari 30 menit dihapus penyapu", async () => {
    await p.run("c1", "SELECT 1");
    await p.sweepNow(Date.now() + 31 * 60_000);
    expect(p.sessionCount).toBe(0);
  });
});
