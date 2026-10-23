// Bantuan SQL untuk terminal: mesin di browser adalah SQLite (sql.js), sedangkan slide
// Perancangan Basis Data memakai gaya MySQL. Penyesuaian kecil di sini membuat contoh
// slide (AUTO_INCREMENT, TRUNCATE, SHOW TABLES, DESCRIBE) bisa dijalankan apa adanya.

export interface ResultSet {
  columns: string[];
  rows: (string | number | null)[][];
}

/** Menjalankan `fn` hanya di luar teks berkutip dan komentar, agar isinya tidak ikut diubah. */
function outsideQuotes(sql: string, fn: (s: string) => string): string {
  return sql
    .split(/('(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|--[^\n]*|\/\*[\s\S]*?\*\/)/)
    .map((part, i) => (i % 2 === 1 ? (part.startsWith("`") ? `"${part.slice(1, -1)}"` : part) : fn(part)))
    .join("");
}

/** Mengubah sintaks MySQL yang umum di kuliah menjadi padanan SQLite. */
export function mysqlToSqlite(sql: string): string {
  return outsideQuotes(sql, (s) =>
    s
      // id INT AUTO_INCREMENT PRIMARY KEY  ->  id INTEGER PRIMARY KEY AUTOINCREMENT
      .replace(/\b(INT|INTEGER|BIGINT|SMALLINT|MEDIUMINT|TINYINT)(\s*\(\s*\d+\s*\))?(\s+UNSIGNED)?(\s+NOT\s+NULL)?\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, "INTEGER PRIMARY KEY AUTOINCREMENT")
      .replace(/\b(INT|INTEGER|BIGINT|SMALLINT|MEDIUMINT|TINYINT)(\s*\(\s*\d+\s*\))?(\s+UNSIGNED)?(\s+NOT\s+NULL)?\s+PRIMARY\s+KEY\s+AUTO_INCREMENT\b/gi, "INTEGER PRIMARY KEY AUTOINCREMENT")
      // AUTO_INCREMENT di tempat lain (PK ditulis terpisah): SQLite tetap memberi nomor otomatis lewat rowid.
      .replace(/\s+AUTO_INCREMENT\b(\s*=\s*\d+)?/gi, "")
      .replace(/\bUNSIGNED\b/gi, "")
      .replace(/\bTRUNCATE\s+(TABLE\s+)?/gi, "DELETE FROM ")
      // Opsi tabel MySQL: ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ...
      .replace(/\)\s*(ENGINE|DEFAULT\s+CHARSET|CHARSET|COLLATE)\s*=?\s*[\w-]+([\s,]*(ENGINE|DEFAULT\s+CHARSET|CHARSET|COLLATE)\s*=?\s*[\w-]+)*/gi, ")")
      // Perintah asli disimpan sebagai komentar /*asli:...*/ agar terminal menampilkannya, bukan terjemahannya.
      .replace(/\bSHOW\s+TABLES\b/gi, "SELECT name AS tabel FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name /*asli:SHOW TABLES*/")
      .replace(/\b(?:DESCRIBE|DESC)\s+(\w+)\s*(;|$)/gi, (_m, t: string, end: string) =>
        `SELECT name AS kolom, type AS tipe, CASE "notnull" WHEN 1 THEN 'NO' ELSE 'YES' END AS boleh_null, CASE pk WHEN 0 THEN '' ELSE 'PRI' END AS kunci, dflt_value AS bawaan FROM pragma_table_info('${t}') /*asli:DESCRIBE ${t}*/${end}`),
  );
}

/** Pesan galat SQLite diterjemahkan seperlunya agar mudah dipahami mahasiswa. */
export function explainSqlError(message: string): string {
  const m = message.replace(/^Error:\s*/, "");
  const rules: [RegExp, (x: RegExpMatchArray) => string][] = [
    [/no such table: (\S+)/i, (x) => `Tabel ${x[1]} tidak ada. Periksa ejaannya, atau jalankan SHOW TABLES.`],
    [/no such column: (\S+)/i, (x) => `Kolom ${x[1]} tidak ada di tabel yang dipakai.`],
    [/table (\S+) already exists/i, (x) => `Tabel ${x[1]} sudah ada. Hapus dulu dengan DROP TABLE, atau tekan Reset data.`],
    [/UNIQUE constraint failed: (\S+)/i, (x) => `Nilai ganda pada ${x[1]} (melanggar UNIQUE / PRIMARY KEY).`],
    [/NOT NULL constraint failed: (\S+)/i, (x) => `${x[1]} tidak boleh kosong (NOT NULL).`],
    [/FOREIGN KEY constraint failed/i, () => "Melanggar FOREIGN KEY: nilai rujukan tidak ada di tabel induk, atau baris induk masih dirujuk."],
    [/CHECK constraint failed: (.+)/i, (x) => `Melanggar CHECK: ${x[1]}.`],
    [/near "(\w+)": syntax error/i, (x) => `Kesalahan penulisan di dekat "${x[1]}".`],
    [/incomplete input/i, () => "Perintah belum lengkap (mungkin kurang tanda kurung atau ;)."],
  ];
  for (const [re, f] of rules) {
    const x = m.match(re);
    if (x) return `${f(x)} (${m})`;
  }
  return m;
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6)));
  return String(v);
};

/**
 * Membandingkan hasil query mahasiswa dengan hasil yang diharapkan: banyak kolom dan isi
 * baris harus sama; nama kolom (alias) diabaikan; urutan baris diabaikan kecuali `ordered`.
 */
export function compareResults(got: ResultSet | undefined, want: ResultSet, ordered: boolean): { ok: boolean; reason?: string } {
  if (!got) return { ok: false, reason: "Tidak ada hasil SELECT untuk diperiksa." };
  if (got.columns.length !== want.columns.length) {
    return { ok: false, reason: `Banyak kolom ${got.columns.length}, seharusnya ${want.columns.length} (${want.columns.join(", ")}).` };
  }
  if (got.rows.length !== want.rows.length) {
    return { ok: false, reason: `Banyak baris ${got.rows.length}, seharusnya ${want.rows.length}.` };
  }
  const key = (r: ResultSet["rows"][number]) => r.map(cell).join("\u0001");
  const a = got.rows.map(key), b = want.rows.map(key);
  if (!ordered) {
    a.sort();
    b.sort();
  }
  const i = a.findIndex((x, k) => x !== b[k]);
  if (i >= 0) {
    return { ok: false, reason: ordered ? `Baris ke-${i + 1} berbeda (urutan juga diperiksa).` : "Isi baris berbeda dari yang diharapkan." };
  }
  return { ok: true };
}

/** `ORDER BY` di query kunci berarti urutan baris ikut dinilai (docs/RANCANGAN.md bagian 5). */
export function keyIsOrdered(sql: string): boolean {
  const code = sql
    .split(/('(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`)/)
    .filter((_, i) => i % 2 === 0)
    .join(" ")
    .replace(/--[^\n]*/g, "");
  return /\border\s+by\b/i.test(code);
}
