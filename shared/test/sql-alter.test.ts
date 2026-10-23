import initSqlJs, { type Database } from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import { emulateAlter, mysqlToSqlite, needsAlterEmulation, splitStatements } from "../src/index.js";

let db: Database;
const run = (sql: string) => {
  for (const s of splitStatements(mysqlToSqlite(sql))) {
    if (needsAlterEmulation(s)) emulateAlter(db, s);
    else db.exec(s);
  }
};
const cols = (t: string) => db.exec(`SELECT name, type, "notnull" FROM pragma_table_info('${t}')`)[0].values;
const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON");
  run(`CREATE TABLE Mahasiswa (
    nim CHAR(10) PRIMARY KEY,
    nama_mahasiswa VARCHAR(100) NOT NULL,
    email VARCHAR(100)
  );
  INSERT INTO Mahasiswa VALUES ('2201001', 'Ani', 'ani@kampus.ac.id'), ('2201002', 'Budi', NULL);`);
});

// Perintah-perintah di bawah disalin dari slide Perancangan Basis Data P09.
describe("ALTER TABLE gaya MySQL (slide P09)", () => {
  it("ADD COLUMN ... AFTER menaruh kolom di posisi yang diminta, data tetap", () => {
    run("ALTER TABLE Mahasiswa\n  ADD COLUMN no_hp VARCHAR(15) AFTER email;");
    run("ALTER TABLE Mahasiswa ADD COLUMN angkatan SMALLINT AFTER nama_mahasiswa;");
    expect(cols("Mahasiswa").map((c) => c[0])).toEqual(["nim", "nama_mahasiswa", "angkatan", "email", "no_hp"]);
    expect(rows("SELECT nim, nama_mahasiswa, email FROM Mahasiswa ORDER BY nim")).toEqual([
      ["2201001", "Ani", "ani@kampus.ac.id"],
      ["2201002", "Budi", null],
    ]);
  });

  it("RENAME COLUMN, ADD CONSTRAINT UNIQUE, lalu DROP COLUMN yang ber-UNIQUE", () => {
    run("ALTER TABLE Mahasiswa ADD COLUMN no_hp VARCHAR(15) AFTER email;");
    run("ALTER TABLE Mahasiswa\n  RENAME COLUMN no_hp TO telepon;");
    run("ALTER TABLE Mahasiswa\n  ADD CONSTRAINT uq_telepon UNIQUE (telepon);");
    run("UPDATE Mahasiswa SET telepon = '0811' WHERE nim = '2201001'");
    expect(() => run("UPDATE Mahasiswa SET telepon = '0811' WHERE nim = '2201002'")).toThrow(/UNIQUE/);
    run("ALTER TABLE Mahasiswa\n  DROP COLUMN telepon;");
    expect(cols("Mahasiswa").map((c) => c[0])).toEqual(["nim", "nama_mahasiswa", "email"]);
  });

  it("MODIFY COLUMN mengubah tipe; lupa NOT NULL berarti NOT NULL hilang", () => {
    run("ALTER TABLE Mahasiswa\n  MODIFY COLUMN nama_mahasiswa VARCHAR(150) NOT NULL;");
    expect(cols("Mahasiswa")[1]).toEqual(["nama_mahasiswa", "VARCHAR(150)", 1]);
    run("ALTER TABLE Mahasiswa\n  MODIFY COLUMN nama_mahasiswa VARCHAR(150);  -- lupa NOT NULL");
    expect(cols("Mahasiswa")[1]).toEqual(["nama_mahasiswa", "VARCHAR(150)", 0]);
  });

  it("ADD CONSTRAINT CHECK ditolak bila data lama melanggar, dan tabel tidak berubah", () => {
    run("ALTER TABLE Mahasiswa ADD COLUMN angkatan SMALLINT;");
    run("UPDATE Mahasiswa SET angkatan = 1999 WHERE nim = '2201002'");
    expect(() => run("ALTER TABLE Mahasiswa ADD CONSTRAINT chk_angkatan CHECK (angkatan >= 2000);")).toThrow(/CHECK/);
    expect(rows("SELECT COUNT(*) FROM Mahasiswa")).toEqual([[2]]);
    run("UPDATE Mahasiswa SET angkatan = 2022");
    run("ALTER TABLE Mahasiswa ADD CONSTRAINT chk_angkatan CHECK (angkatan >= 2000);");
    expect(() => run("UPDATE Mahasiswa SET angkatan = 1990")).toThrow(/CHECK/);
    run("ALTER TABLE Mahasiswa DROP CONSTRAINT chk_angkatan;");
    run("UPDATE Mahasiswa SET angkatan = 1990");
    // Menghapus kolom ikut menghapus CHECK yang memakainya.
    run("ALTER TABLE Mahasiswa ADD CONSTRAINT chk2 CHECK (angkatan > 0); ALTER TABLE Mahasiswa DROP COLUMN angkatan;");
    expect(cols("Mahasiswa").map((c) => c[0])).toEqual(["nim", "nama_mahasiswa", "email"]);
  });

  it("CHANGE COLUMN mengganti nama + tipe, FOREIGN KEY tabel lain tetap terjaga", () => {
    run(`CREATE TABLE KRS (nim CHAR(10) NOT NULL, kode_mk CHAR(6) NOT NULL, PRIMARY KEY (nim, kode_mk),
         FOREIGN KEY (nim) REFERENCES Mahasiswa(nim));
         INSERT INTO KRS VALUES ('2201001', 'INF201');`);
    run("ALTER TABLE Mahasiswa CHANGE COLUMN email email_kampus VARCHAR(120);");
    expect(cols("Mahasiswa").map((c) => c[0])).toEqual(["nim", "nama_mahasiswa", "email_kampus"]);
    expect(rows("SELECT email_kampus FROM Mahasiswa WHERE nim = '2201001'")).toEqual([["ani@kampus.ac.id"]]);
    expect(() => run("INSERT INTO KRS VALUES ('9999999', 'INF201')")).toThrow(/FOREIGN KEY/);
  });

  it("bentuk yang belum didukung memberi pesan jelas", () => {
    expect(() => run("ALTER TABLE Mahasiswa ALGORITHM = INPLACE;")).toThrow(/belum didukung/);
  });

  it("RENAME biasa tetap memakai ALTER bawaan SQLite", () => {
    expect(needsAlterEmulation("ALTER TABLE Mahasiswa RENAME COLUMN email TO surel")).toBe(false);
    expect(needsAlterEmulation("ALTER TABLE Mahasiswa MODIFY email TEXT")).toBe(true);
  });
});
