// Teks SQL dari terminal praktik MySQL: memecah skrip menjadi pernyataan (mendukung
// DELIMITER seperti klien mysql, untuk stored procedure/trigger), dan menulis ulang nama
// database logis mahasiswa ("toko") menjadi nama fisik sesinya ("p_ab12cd34ef_toko").

export interface Token {
  t: "ws" | "comment" | "str" | "bq" | "word" | "punct";
  v: string;
}

/** Memecah satu pernyataan menjadi token (string, komentar, dan `nama` tidak dipotong). */
export function tokenize(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const rest = sql.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\s+/))) out.push({ t: "ws", v: m[0] });
    else if ((m = rest.match(/^(--(\s[^\n]*|$|\n)|#[^\n]*|\/\*[\s\S]*?(\*\/|$))/))) out.push({ t: "comment", v: m[0] });
    else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== c) j += sql[j] === "\\" ? 2 : 1;
      // '' di dalam string = tanda kutip
      while (sql[j] === c && sql[j + 1] === c) {
        j += 2;
        while (j < sql.length && sql[j] !== c) j += sql[j] === "\\" ? 2 : 1;
      }
      out.push({ t: "str", v: sql.slice(i, j + 1) });
    } else if (c === "`") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "`" && sql[j + 1] !== "`")) j += sql[j] === "`" ? 2 : 1;
      out.push({ t: "bq", v: sql.slice(i, j + 1) });
    } else if ((m = rest.match(/^[A-Za-z0-9_$\u0080-￿]+/))) out.push({ t: "word", v: m[0] });
    else out.push({ t: "punct", v: c });
    i += out[out.length - 1].v.length || 1;
  }
  return out;
}

/**
 * Memecah skrip menjadi pernyataan. Baris `DELIMITER //` mengganti pemisah (seperti klien
 * mysql), sehingga badan CREATE PROCEDURE ... BEGIN ...; ... END // tetap utuh.
 */
export function splitScript(script: string): string[] {
  const out: string[] = [];
  let delim = ";";
  let buf = "";
  let i = 0;
  const push = () => {
    if (buf.trim() && tokenize(buf).some((t) => t.t !== "ws" && t.t !== "comment")) out.push(buf.trim());
    buf = "";
  };
  while (i < script.length) {
    // DELIMITER hanya dikenali di awal pernyataan.
    if (!buf.trim()) {
      const m = script.slice(i).match(/^\s*DELIMITER[ \t]+(\S+)[ \t]*(\r?\n|$)/i);
      if (m) {
        delim = m[1];
        i += m[0].length;
        buf = "";
        continue;
      }
    }
    const c = script[i];
    const rest = script.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^(--(\s[^\n]*|$)|#[^\n]*|\/\*[\s\S]*?(\*\/|$))/))) {
      buf += m[0];
      i += m[0].length;
    } else if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      for (;;) {
        while (j < script.length && script[j] !== c) j += script[j] === "\\" && c !== "`" ? 2 : 1;
        if (script[j] === c && script[j + 1] === c) j += 2;
        else break;
      }
      buf += script.slice(i, j + 1);
      i = j + 1;
    } else if (rest.startsWith(delim)) {
      push();
      i += delim.length;
    } else {
      buf += c;
      i++;
    }
  }
  push();
  return out;
}

const unquote = (tok: Token) => (tok.t === "bq" ? tok.v.slice(1, -1).replace(/``/g, "`") : tok.v);
const SYSTEM_DBS = new Set(["information_schema", "performance_schema", "mysql", "sys"]);

/** Nama database logis yang sah: huruf, angka, garis bawah; maks. 32 karakter. */
export const validDbName = (name: string) => /^[A-Za-z0-9_]{1,32}$/.test(name) && !SYSTEM_DBS.has(name.toLowerCase());

export interface Rewritten {
  sql: string;
  /** Jenis perintah tingkat database (untuk melacak daftar database sesi). */
  kind?: { op: "create" | "drop" | "use"; name: string; ifExists?: boolean };
  error?: string;
}

/**
 * Menulis ulang nama database di satu pernyataan:
 *   CREATE/DROP/ALTER DATABASE|SCHEMA x, USE x, SHOW ... FROM|IN x, SHOW CREATE DATABASE x,
 *   dan rujukan bertitik x.tabel bila x adalah database milik sesi.
 */
export function rewriteDbNames(sql: string, prefix: string, known: Set<string>): Rewritten {
  const toks = tokenize(sql);
  const sig = toks.map((t, i) => ({ t, i })).filter((x) => x.t.t !== "ws" && x.t.t !== "comment");
  const up = (k: number) => (sig[k] && sig[k].t.t === "word" ? sig[k].t.v.toUpperCase() : "");
  const phys = (name: string) => "`" + prefix + name + "`";
  const replaceAt = (k: number, name: string) => {
    toks[sig[k].i] = { t: "bq", v: phys(name) };
  };
  let kind: Rewritten["kind"];

  const nameAt = (k: number): string | undefined => {
    const t = sig[k]?.t;
    return t && (t.t === "word" || t.t === "bq") ? unquote(t) : undefined;
  };

  // CREATE / DROP / ALTER DATABASE|SCHEMA [IF [NOT] EXISTS] nama
  if (["CREATE", "DROP", "ALTER"].includes(up(0)) && ["DATABASE", "SCHEMA"].includes(up(1))) {
    let k = 2;
    let ifExists = false;
    if (up(k) === "IF") {
      ifExists = true;
      k += up(k + 1) === "NOT" ? 3 : 2;
    }
    const name = nameAt(k);
    if (!name || !validDbName(name)) return { sql, error: `Nama database "${name ?? ""}" tidak sah. Pakai huruf, angka, dan garis bawah (maks. 32 karakter).` };
    replaceAt(k, name);
    kind = up(0) === "ALTER" ? undefined : { op: up(0) === "CREATE" ? "create" : "drop", name, ifExists };
  } else if (up(0) === "USE") {
    const name = nameAt(1);
    if (!name) return { sql, error: "Tulis nama database setelah USE." };
    if (!validDbName(name)) return { sql, error: `Database ${name} tidak bisa dipakai di terminal praktik.` };
    replaceAt(1, name);
    kind = { op: "use", name };
  } else if (up(0) === "SHOW") {
    // SHOW CREATE DATABASE x / SHOW ... FROM|IN x (TABLES, COLUMNS, INDEX, TABLE STATUS, ...)
    if (up(1) === "CREATE" && ["DATABASE", "SCHEMA"].includes(up(2)) && nameAt(3)) replaceAt(3, nameAt(3)!);
    for (let k = 1; k < sig.length - 1; k++) {
      if (["FROM", "IN"].includes(up(k))) {
        const name = nameAt(k + 1);
        if (name && known.has(name.toLowerCase()) && sig[k + 2]?.t.v !== ".") replaceAt(k + 1, name);
      }
    }
  }

  // Rujukan bertitik: akademik.mahasiswa, `toko`.`produk`
  for (let k = 0; k < sig.length - 2; k++) {
    if (sig[k + 1].t.v !== ".") continue;
    if (k > 0 && sig[k - 1].t.v === ".") continue; // bagian tengah a.b.c
    const name = nameAt(k);
    if (name && known.has(name.toLowerCase()) && toks[sig[k].i].v !== phys(name)) replaceAt(k, name);
  }
  return { sql: toks.map((t) => t.v).join(""), kind };
}

/** Menyembunyikan awalan fisik (dan nama user sementara) dari teks yang tampil ke mahasiswa. */
export function hidePrefix(text: string, prefix: string, user: string): string {
  return text
    .split(prefix)
    .join("")
    .replace(new RegExp(`'${user}'@'[^']*'`, "g"), "kamu")
    .split(user)
    .join("kamu");
}
