// Mengompilasi latihan/<mode>/*.yaml menjadi client/public/game/latihan.json.
//
// - SQL: query `kunci` dijalankan di sini (sql.js di Node) dan yang dikirim ke browser
//   hanya HASIL yang diharapkan, bukan kuncinya (docs/RANCANGAN.md bagian 5).
// - Pseudocode: bila berkas memuat `kunci`, kunci itu diuji terhadap semua `uji`
//   supaya soal yang salah ketik ketahuan saat build, bukan saat dipakai mahasiswa.
// Galat apa pun menghentikan build dengan pesan yang menunjuk berkasnya.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, { type Database } from "sql.js";
import { parse as parseYaml } from "yaml";
import {
  compareOutput,
  execScript,
  keyIsOrdered,
  mysqlToSqlite,
  runPseudocode,
  type Latihan,
  type LatihanBundle,
  type ResultSet,
} from "@mita/shared";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "latihan");
const OUT = join(ROOT, "client/public/game/latihan.json");

const fail = (file: string, msg: string): never => {
  console.error(`\nbuild-latihan: ${file}: ${msg}\n`);
  process.exit(1);
};

const text = (v: unknown, file: string, field: string, required = true): string => {
  if (v === undefined || v === null) return required ? fail(file, `kolom "${field}" wajib diisi`) : "";
  return String(v).replace(/\s+$/, "") + (field === "kodeAwal" || field === "kunci" ? "\n" : "");
};

/** Semua hasil SELECT dari sekumpulan perintah, satu ResultSet per pernyataan yang mengembalikan baris. */
function resultSets(db: Database, sql: string): ResultSet[] {
  return execScript(db, mysqlToSqlite(sql)).map((r) => ({ columns: r.columns, rows: r.values as ResultSet["rows"] }));
}

async function main(): Promise<void> {
  const SQL = await initSqlJs();
  const datasets: Record<string, string> = {};
  const dataDir = join(SRC, "data");
  if (existsSync(dataDir)) {
    for (const f of readdirSync(dataDir).filter((f) => f.endsWith(".sql"))) datasets[basename(f, ".sql")] = readFileSync(join(dataDir, f), "utf8");
  }
  const freshDb = (dataset: string, file: string): Database => {
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON");
    if (dataset !== "kosong") {
      if (!datasets[dataset]) fail(file, `dataset "${dataset}" tidak ada di latihan/data/`);
      db.exec(mysqlToSqlite(datasets[dataset]));
    }
    return db;
  };

  const items: Latihan[] = [];
  for (const mode of ["pseudocode", "sql"] as const) {
    const dir = join(SRC, mode);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
      const file = `latihan/${mode}/${f}`;
      let y: Record<string, unknown>;
      try {
        y = parseYaml(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
      } catch (e) {
        fail(file, `YAML tidak valid: ${(e as Error).message}`);
        return;
      }
      const base = {
        id: `${mode}/${f.replace(/\.ya?ml$/, "")}`,
        judul: text(y.judul, file, "judul"),
        mataKuliah: y.mataKuliah ? String(y.mataKuliah) : undefined,
        deskripsi: text(y.deskripsi, file, "deskripsi"),
        kodeAwal: text(y.kodeAwal, file, "kodeAwal", false),
      };

      if (mode === "pseudocode") {
        if (!Array.isArray(y.uji) || !y.uji.length) fail(file, 'latihan pseudocode butuh "uji" (masukan + keluaran)');
        const uji = (y.uji as Record<string, unknown>[]).map((u, i) => ({
          masukan: u.masukan === undefined ? "" : String(u.masukan),
          keluaran: u.keluaran === undefined ? fail(file, `uji ke-${i + 1} tidak punya "keluaran"`) : String(u.keluaran).replace(/\n$/, "").split("\n"),
        }));
        if (y.kunci) {
          uji.forEach((u, i) => {
            const r = runPseudocode(String(y.kunci), { input: u.masukan });
            if (!r.ok) fail(file, `kunci galat pada uji ke-${i + 1}: baris ${r.error!.line}: ${r.error!.message}`);
            const c = compareOutput(r.output, u.keluaran);
            if (!c.ok) fail(file, `kunci tidak lolos uji ke-${i + 1}: ${c.reason}`);
          });
        }
        items.push({ ...base, mode, uji });
        continue;
      }

      const dataset = y.dataset ? String(y.dataset) : "akademik";
      const kunci = text(y.kunci, file, "kunci");
      const persiapan = y.persiapan ? String(y.persiapan) : undefined;
      const periksa = y.periksa ? String(y.periksa) : undefined;
      const db = freshDb(dataset, file);
      let harapan: ResultSet[];
      try {
        if (persiapan) execScript(db, mysqlToSqlite(persiapan));
        const fromKey = resultSets(db, kunci);
        harapan = periksa ? resultSets(db, periksa) : fromKey.slice(-1);
      } catch (e) {
        fail(file, `kunci/periksa galat di SQLite: ${(e as Error).message}`);
        return;
      } finally {
        db.close();
      }
      if (!harapan.length) fail(file, periksa ? '"periksa" tidak menghasilkan baris apa pun' : 'kunci harus diakhiri SELECT (atau tambahkan "periksa")');
      items.push({ ...base, mode, dataset, persiapan, periksa, harapan, urut: periksa ? true : keyIsOrdered(kunci) });
    }
  }

  const bundle: LatihanBundle = { datasets, items };
  writeFileSync(OUT, JSON.stringify(bundle));
  console.log(`build-latihan: ${items.length} latihan, ${Object.keys(datasets).length} dataset -> client/public/game/latihan.json`);
}

void main();
