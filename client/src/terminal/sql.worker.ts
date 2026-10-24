// Web Worker SQL: sql.js (SQLite via WebAssembly). Setiap mahasiswa punya database
// sendiri di browsernya. Database sandbox per dataset bertahan sampai "Reset data";
// latihan selalu memakai database baru agar hasil pemeriksaan tidak dipengaruhi sandbox.

import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { emulateAlter, execScript, explainSqlError, mysqlToSqlite, needsAlterEmulation, splitStatements, type ResultSet, type SqlStatementResult } from "@mita/shared";

export interface SqlRequest {
  op: "run" | "reset";
  /** SQL dataset (isi latihan/data/<nama>.sql) atau "" untuk database kosong. */
  datasetName: string;
  datasetSql: string;
  code?: string;
  /** true = database baru (latihan); false = database sandbox yang bertahan. */
  fresh?: boolean;
  persiapan?: string;
  periksa?: string;
}

export type { SqlStatementResult };

export interface SqlResponse {
  statements: SqlStatementResult[];
  /** Hasil query pemeriksa (latihan DDL). */
  periksa?: ResultSet[];
  error?: string;
}

const MAX_ROWS = 500;
let SQL: SqlJsStatic | undefined;
const sandboxes = new Map<string, Database>();

async function engine(): Promise<SqlJsStatic> {
  return (SQL ??= await initSqlJs({ locateFile: () => wasmUrl }));
}

function create(S: SqlJsStatic, datasetSql: string): Database {
  const db = new S.Database();
  db.run("PRAGMA foreign_keys = ON");
  if (datasetSql) db.exec(mysqlToSqlite(datasetSql));
  return db;
}

function execute(db: Database, code: string): SqlStatementResult[] {
  const out: SqlStatementResult[] = [];
  // Pernyataan dijalankan satu per satu: ALTER TABLE gaya MySQL yang tidak didukung SQLite
  // (MODIFY, CHANGE, ADD CONSTRAINT, AFTER, ...) diemulasi dengan membangun ulang tabel.
  for (const piece of splitStatements(mysqlToSqlite(code))) {
    const shown = displaySql(piece);
    try {
      if (needsAlterEmulation(piece)) {
        emulateAlter(db, piece);
        out.push({ sql: shown, changes: 0 });
        continue;
      }
      for (const stmt of db.iterateStatements(piece)) {
        const columns = stmt.getColumnNames();
        const rows: ResultSet["rows"] = [];
        let truncated = false;
        try {
          while (stmt.step()) {
            if (rows.length < MAX_ROWS) rows.push(stmt.get() as ResultSet["rows"][number]);
            else truncated = true;
          }
        } finally {
          stmt.free();
        }
        out.push(columns.length ? { sql: shown, columns, rows, truncated } : { sql: shown, changes: db.getRowsModified() });
      }
    } catch (e) {
      out.push({ sql: shown, error: explainSqlError(String((e as Error).message ?? e)) });
      return out;
    }
  }
  return out;
}

/** Teks pernyataan untuk ditampilkan: perintah asli (SHOW/DESCRIBE), tanpa komentar pembuka. */
function displaySql(raw: string): string {
  return raw.match(/\/\*asli:(.*?)\*\//)?.[1] ?? raw.replace(/^(\s*(--[^\n]*\n?|\/\*[\s\S]*?\*\/))+/, "").trim();
}

self.onmessage = async (e: MessageEvent<{ id: number; req: SqlRequest }>) => {
  const { id, req } = e.data;
  let res: SqlResponse;
  try {
    const S = await engine();
    if (req.op === "reset") {
      sandboxes.get(req.datasetName)?.close();
      sandboxes.delete(req.datasetName);
      res = { statements: [] };
    } else {
      let db: Database;
      if (req.fresh) db = create(S, req.datasetSql);
      else {
        db = sandboxes.get(req.datasetName) ?? create(S, req.datasetSql);
        sandboxes.set(req.datasetName, db);
      }
      if (req.persiapan) execScript(db, mysqlToSqlite(req.persiapan));
      const statements = execute(db, req.code ?? "");
      res = { statements };
      if (req.periksa && !statements.some((s) => s.error)) {
        try {
          res.periksa = execScript(db, mysqlToSqlite(req.periksa)).map((r) => ({ columns: r.columns, rows: r.values as ResultSet["rows"] }));
        } catch (err) {
          res.error = explainSqlError(String((err as Error).message));
        }
      }
      if (req.fresh) db.close();
    }
  } catch (err) {
    res = { statements: [], error: explainSqlError(String((err as Error).message ?? err)) };
  }
  self.postMessage({ id, res });
};
