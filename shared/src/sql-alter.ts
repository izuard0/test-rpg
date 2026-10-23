// Emulasi ALTER TABLE gaya MySQL di SQLite. SQLite hanya mendukung ADD COLUMN, RENAME,
// dan DROP COLUMN (dengan batasan), sedangkan slide P09 juga memakai MODIFY/CHANGE COLUMN,
// ADD COLUMN ... AFTER, ADD CONSTRAINT (UNIQUE/CHECK/FOREIGN KEY), dan DROP CONSTRAINT.
// Caranya mengikuti prosedur resmi SQLite (https://sqlite.org/lang_altertable.html#otheralter):
// buat tabel baru dengan struktur yang diubah, salin data, hapus tabel lama, ganti nama.
// Data yang melanggar constraint baru membuat perubahan dibatalkan, seperti di MySQL.

export interface MiniDb {
  exec(sql: string): { columns: string[]; values: unknown[][] }[];
}

const KEYWORD_ITEM = /^(constraint|primary|unique|check|foreign|key|index)\b/i;

/** Memisah teks pada `sep` tingkat teratas (di luar kurung, kutip, dan komentar). */
export function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "", q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      q = c === "[" ? "]" : c;
      cur += c;
      continue;
    }
    if (c === "-" && s[i + 1] === "-") {
      const end = s.indexOf("\n", i);
      const stop = end < 0 ? s.length : end;
      cur += s.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      const stop = end < 0 ? s.length : end + 2;
      cur += s.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** Memisah skrip SQL menjadi pernyataan; pernyataan kosong (hanya komentar) dibuang. */
export function splitStatements(sql: string): string[] {
  return splitTopLevel(sql, ";").filter((s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, "").trim());
}

const unquote = (id: string) => id.replace(/^["`[]|["`\]]$/g, "");
const quote = (id: string) => `"${unquote(id).replace(/"/g, '""')}"`;
const firstIdent = (item: string) => unquote(item.trim().match(/^("[^"]+"|`[^`]+`|\[[^\]]+\]|\S+)/)?.[0] ?? "").toLowerCase();
const isColumn = (item: string) => !KEYWORD_ITEM.test(item.trim());
/** Kolom yang disebut di daftar kolom sebuah constraint tabel, mis. UNIQUE (a, b). */
const constraintCols = (item: string) =>
  [...(item.match(/\(([^()]*)\)/)?.[1] ?? "").split(",")].map((c) => unquote(c.trim()).toLowerCase()).filter(Boolean);

const ALTER_RE = /^\s*alter\s+table\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s+([\s\S]+)$/i;

/** Benar bila pernyataan ini ALTER yang perlu diemulasi (bukan RENAME biasa). */
export function needsAlterEmulation(stmt: string): boolean {
  const m = stripComments(stmt).match(ALTER_RE);
  if (!m) return false;
  return splitTopLevel(m[2], ",").some((spec) => !/^\s*rename\b/i.test(spec));
}

function stripComments(s: string): string {
  return s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ").trim();
}

function one<T>(db: MiniDb, sql: string): T[][] {
  return (db.exec(sql)[0]?.values ?? []) as T[][];
}

/**
 * Menjalankan ALTER TABLE gaya MySQL dengan membangun ulang tabel.
 * Melempar Error berbahasa Indonesia bila perubahan tidak bisa dilakukan.
 */
export function emulateAlter(db: MiniDb, stmt: string): void {
  const m = stripComments(stmt).match(ALTER_RE);
  if (!m) throw new Error("Bukan perintah ALTER TABLE.");
  const table = unquote(m[1]);
  const row = one<string>(db, `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${sqlStr(table)} COLLATE NOCASE`)[0];
  if (!row) throw new Error(`no such table: ${table}`);
  const create = row[0];
  const open = create.indexOf("(");
  const close = create.lastIndexOf(")");
  const items = splitTopLevel(create.slice(open + 1, close), ",").map((s) => s.trim());
  const tail = create.slice(close + 1);
  const realName = one<string>(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${sqlStr(table)} COLLATE NOCASE`)[0][0];

  // Kolom baru -> kolom lama asal datanya.
  const source = new Map<string, string>();
  for (const it of items) if (isColumn(it)) source.set(firstIdent(it), firstIdent(it));
  let renameTo: string | undefined;
  const droppedCols: string[] = [];
  const renamedCols: [string, string][] = [];

  const colIndex = (name: string) => items.findIndex((it) => isColumn(it) && firstIdent(it) === name.toLowerCase());
  const needCol = (name: string) => {
    const i = colIndex(unquote(name));
    if (i < 0) throw new Error(`no such column: ${unquote(name)}`);
    return i;
  };
  const insertAt = (def: string, pos: string | undefined) => {
    const after = pos?.match(/^after\s+(\S+)$/i);
    if (pos && /^first$/i.test(pos)) items.splice(0, 0, def);
    else if (after) items.splice(needCol(after[1]) + 1, 0, def);
    else {
      // Tanpa posisi: setelah kolom terakhir (sebelum constraint tabel), seperti MySQL.
      let last = -1;
      items.forEach((it, i) => isColumn(it) && (last = i));
      items.splice(last + 1, 0, def);
    }
  };
  const splitPos = (def: string): [string, string | undefined] => {
    const p = def.match(/\s+(first|after\s+("[^"]+"|`[^`]+`|\w+))\s*$/i);
    return p ? [def.slice(0, p.index).trim(), p[1].trim()] : [def.trim(), undefined];
  };

  for (const rawSpec of splitTopLevel(m[2], ",")) {
    const spec = rawSpec.trim();
    let x: RegExpMatchArray | null;
    if ((x = spec.match(/^add\s+(constraint\s+\S+\s+)?(unique|primary\s+key|check|foreign\s+key)\b([\s\S]*)$/i))) {
      // ADD [CONSTRAINT nama] UNIQUE [KEY|INDEX] [nama_indeks] (kolom) / CHECK (...) / FOREIGN KEY ...
      let body = `${x[2]}${x[3]}`;
      body = body.replace(/^unique\s+(key|index)\s*/i, "UNIQUE ").replace(/^unique\s+(?!\()(\S+)\s*\(/i, "UNIQUE (");
      items.push(`${x[1] ? x[1].trim() + " " : ""}${body.trim()}`);
    } else if ((x = spec.match(/^add\s+(?:column\s+)?([\s\S]+)$/i))) {
      const [def, pos] = splitPos(x[1]);
      if (colIndex(firstIdent(def)) >= 0) throw new Error(`Kolom ${firstIdent(def)} sudah ada.`);
      insertAt(def, pos);
    } else if ((x = spec.match(/^modify\s+(?:column\s+)?([\s\S]+)$/i))) {
      const [def, pos] = splitPos(x[1]);
      const i = needCol(firstIdent(def));
      items.splice(i, 1);
      if (pos) insertAt(def, pos);
      else items.splice(i, 0, def);
    } else if ((x = spec.match(/^change\s+(?:column\s+)?("[^"]+"|`[^`]+`|\w+)\s+([\s\S]+)$/i))) {
      const oldName = unquote(x[1]).toLowerCase();
      const [def, pos] = splitPos(x[2]);
      const i = needCol(oldName);
      const newName = firstIdent(def);
      items.splice(i, 1);
      if (pos) insertAt(def, pos);
      else items.splice(i, 0, def);
      source.delete(oldName);
      source.set(newName, oldName);
      if (newName !== oldName) renamedCols.push([oldName, newName]);
    } else if ((x = spec.match(/^alter\s+(?:column\s+)?("[^"]+"|`[^`]+`|\w+)\s+(set\s+default\s+([\s\S]+)|drop\s+default)$/i))) {
      const i = needCol(x[1]);
      let def = items[i].replace(/\s+default\s+('(?:[^']|'')*'|\([^)]*\)|[^\s,]+)/i, "");
      if (x[3]) def += ` DEFAULT ${x[3].trim()}`;
      items[i] = def;
    } else if ((x = spec.match(/^drop\s+(?:column\s+)?(?!constraint\b|check\b|index\b|key\b|foreign\b|primary\b)("[^"]+"|`[^`]+`|\w+)$/i))) {
      const name = unquote(x[1]).toLowerCase();
      items.splice(needCol(name), 1);
      source.delete(name);
      droppedCols.push(name);
      // Constraint tabel yang menyebut kolom itu (UNIQUE (kolom), CHECK (kolom >= 0), ...) ikut dihapus.
      const word = new RegExp(`(^|[^\\w])["\`[]?${escapeRe(name)}["\`\\]]?($|[^\\w])`, "i");
      for (let i = items.length - 1; i >= 0; i--) {
        if (!isColumn(items[i]) && word.test(items[i].replace(/^constraint\s+\S+\s+/i, ""))) items.splice(i, 1);
      }
      if (!items.some(isColumn)) throw new Error("Tabel harus punya minimal satu kolom; pakai DROP TABLE untuk menghapus tabel.");
    } else if ((x = spec.match(/^drop\s+(?:constraint|check|index|key|foreign\s+key)\s+("[^"]+"|`[^`]+`|\w+)$/i))) {
      const name = unquote(x[1]).toLowerCase();
      const i = items.findIndex((it) => new RegExp(`^constraint\\s+["\`[]?${escapeRe(name)}["\`\\]]?\\s`, "i").test(it));
      if (i >= 0) items.splice(i, 1);
      else if (one(db, `SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ${sqlStr(name)} COLLATE NOCASE`).length) {
        db.exec(`DROP INDEX ${quote(name)}`);
      } else throw new Error(`Constraint ${name} tidak ditemukan di tabel ${realName}.`);
    } else if ((x = spec.match(/^drop\s+primary\s+key$/i))) {
      const i = items.findIndex((it) => /^(constraint\s+\S+\s+)?primary\s+key\b/i.test(it));
      if (i >= 0) items.splice(i, 1);
      else items.forEach((it, k) => (items[k] = isColumn(it) ? it.replace(/\s+primary\s+key(\s+autoincrement)?/i, "") : it));
    } else if ((x = spec.match(/^rename\s+(?:column\s+)?("[^"]+"|`[^`]+`|\w+)\s+to\s+("[^"]+"|`[^`]+`|\w+)$/i)) && !/^rename\s+to\b/i.test(spec)) {
      const i = needCol(x[1]);
      const oldName = unquote(x[1]).toLowerCase(), newName = unquote(x[2]);
      items[i] = items[i].replace(/^("[^"]+"|`[^`]+`|\[[^\]]+\]|\S+)/, quote(newName));
      source.delete(oldName);
      source.set(newName.toLowerCase(), oldName);
      renamedCols.push([oldName, newName.toLowerCase()]);
    } else if ((x = spec.match(/^rename\s+(?:to\s+|as\s+)?("[^"]+"|`[^`]+`|\w+)$/i))) {
      renameTo = unquote(x[1]);
    } else {
      throw new Error(`Bentuk ALTER TABLE ini belum didukung terminal: ${spec}`);
    }
  }

  const tmp = `__mita_baru_${Date.now() % 100000}`;
  const newCols = items.filter(isColumn).map(firstIdent);
  const copyPairs = newCols.filter((c) => source.has(c)).map((c) => [c, source.get(c)!] as const);
  const indexes = one<string>(db, `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ${sqlStr(realName)} AND sql IS NOT NULL`).map((r) => r[0]);

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`CREATE TABLE ${quote(tmp)} (\n  ${items.join(",\n  ")}\n)${tail}`);
    if (copyPairs.length) {
      db.exec(`INSERT INTO ${quote(tmp)} (${copyPairs.map(([n]) => quote(n)).join(", ")}) SELECT ${copyPairs.map(([, o]) => quote(o)).join(", ")} FROM ${quote(realName)}`);
    }
    db.exec(`DROP TABLE ${quote(realName)}`);
    const finalName = renameTo ?? realName;
    db.exec(`ALTER TABLE ${quote(tmp)} RENAME TO ${quote(finalName)}`);
    // Indeks lama dibuat ulang, kecuali yang memakai kolom yang dihapus.
    for (let sql of indexes) {
      const cols = constraintCols(sql);
      if (cols.some((c) => droppedCols.includes(c))) continue;
      for (const [o, n] of renamedCols) sql = sql.replace(new RegExp(`(["\`[]?)\\b${escapeRe(o)}\\b(["\`\\]]?)`, "gi"), `"${n}"`);
      db.exec(sql.replace(new RegExp(`\\bON\\s+["\`[]?${escapeRe(realName)}["\`\\]]?`, "i"), `ON ${quote(finalName)}`));
    }
    const fk = one(db, `PRAGMA foreign_key_check(${quote(finalName)})`);
    if (fk.length) throw new Error("FOREIGN KEY constraint failed");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Menjalankan skrip SQL (sudah lewat mysqlToSqlite) pernyataan demi pernyataan, dengan
 * emulasi ALTER TABLE. Mengembalikan hasil setiap pernyataan yang menghasilkan baris.
 */
export function execScript(db: MiniDb, sql: string): { columns: string[]; values: unknown[][] }[] {
  const out: { columns: string[]; values: unknown[][] }[] = [];
  for (const stmt of splitStatements(sql)) {
    if (needsAlterEmulation(stmt)) emulateAlter(db, stmt);
    else out.push(...db.exec(stmt));
  }
  return out;
}
