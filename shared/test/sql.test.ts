import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { compareResults, explainSqlError, keyIsOrdered, mysqlToSqlite } from "../src/index.js";

describe("penyesuaian MySQL -> SQLite", () => {
  it("menjalankan contoh DDL dari slide P09", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON");
    db.exec(mysqlToSqlite(`
CREATE TABLE Instruktur (
  instruktur_id INT AUTO_INCREMENT PRIMARY KEY,
  nama_instruktur VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE Kursus (
  kursus_id INT AUTO_INCREMENT PRIMARY KEY,
  nama_kursus VARCHAR(150) NOT NULL,
  jumlah_modul INT,
  instruktur_id INT NOT NULL,
  FOREIGN KEY (instruktur_id)
    REFERENCES Instruktur(instruktur_id)
);
INSERT INTO Instruktur (nama_instruktur, email) VALUES ('Budi', 'budi@kampus.ac.id');
INSERT INTO Kursus (nama_kursus, jumlah_modul, instruktur_id) VALUES ('Basis Data', 12, 1);
TRUNCATE TABLE Kursus;`));
    expect(db.exec("SELECT COUNT(*) FROM Kursus")[0].values).toEqual([[0]]);
    expect(db.exec(mysqlToSqlite("SHOW TABLES"))[0].values).toEqual([["Instruktur"], ["Kursus"]]);
    const desc = db.exec(mysqlToSqlite("DESCRIBE Instruktur;"))[0];
    expect(desc.columns).toEqual(["kolom", "tipe", "boleh_null", "kunci", "bawaan"]);
    // Seperti MySQL: kolom PRIMARY KEY tidak boleh NULL.
    expect(desc.values[0]).toEqual(["instruktur_id", "INTEGER", "NO", "PRI", null]);
    expect(() => db.exec("INSERT INTO Kursus (nama_kursus, instruktur_id) VALUES ('X', 99)")).toThrow(/FOREIGN KEY/);
  });

  it("tidak mengubah isi teks berkutip", () => {
    expect(mysqlToSqlite("SELECT 'TRUNCATE TABLE x' AS t")).toBe("SELECT 'TRUNCATE TABLE x' AS t");
  });

  it("menerjemahkan pesan galat", () => {
    expect(explainSqlError("no such table: mhs")).toMatch(/^Tabel mhs tidak ada/);
  });
});

describe("pemeriksa hasil", () => {
  const want = { columns: ["nama"], rows: [["Ani"], ["Budi"]] };
  it("mengabaikan alias dan urutan bila tidak ada ORDER BY", () => {
    expect(compareResults({ columns: ["n"], rows: [["Budi"], ["Ani"]] }, want, false).ok).toBe(true);
    expect(compareResults({ columns: ["n"], rows: [["Budi"], ["Ani"]] }, want, true).ok).toBe(false);
  });
  it("memberi alasan bila kolom atau baris berbeda", () => {
    expect(compareResults({ columns: ["a", "b"], rows: [] }, want, false).reason).toMatch(/kolom/);
    expect(compareResults({ columns: ["a"], rows: [["Ani"]] }, want, false).reason).toMatch(/baris/);
  });
  it("mendeteksi ORDER BY di query kunci", () => {
    expect(keyIsOrdered("SELECT * FROM t ORDER BY nama")).toBe(true);
    expect(keyIsOrdered("SELECT 'order by' FROM t -- ORDER BY x")).toBe(false);
  });
});

describe("komentar SQL", () => {
  it("isi komentar tidak ikut disesuaikan", () => {
    expect(mysqlToSqlite("-- pakai AUTO_INCREMENT\nSELECT 1; /* TRUNCATE x */")).toBe("-- pakai AUTO_INCREMENT\nSELECT 1; /* TRUNCATE x */");
  });
});
