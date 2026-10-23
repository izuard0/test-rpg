// Penerjemah pseudocode. Menjalankan seluruh program sekaligus dan mencatat jejak
// (baris aktif + nilai variabel) agar klien bisa memutar ulang langkah demi langkah.
// Dijalankan di Web Worker dengan batas waktu; batas langkah di sini jaring kedua.

import { PseudoError } from "./lexer.js";
import { parse, type Expr, type Program, type Stmt, type Target, type TypeName } from "./parser.js";

export type Scalar = number | string | boolean;

interface ArrayVal {
  kind: "array";
  type: TypeName;
  /** Batas per dimensi; `null` = larik tanpa deklarasi (batas bebas). */
  bounds: { lo: number; hi: number }[] | null;
  data: Map<string, Scalar>;
}

type Value = Scalar | ArrayVal;

export interface TraceStep {
  line: number;
  /** Nilai variabel SESUDAH baris ini dijalankan, sudah diformat untuk ditampilkan. */
  vars: Record<string, string>;
  /** Banyak baris keluaran sampai langkah ini. */
  out: number;
  /** Catatan singkat untuk baris kendali (mis. "kondisi: true"). */
  note?: string;
}

export interface RunOptions {
  /** Masukan untuk read(), dipisah spasi atau baris baru. */
  input?: string;
  maxSteps?: number;
  maxOutput?: number;
  /** Simpan jejak sampai sekian langkah (0 = tanpa jejak). */
  traceLimit?: number;
}

export interface RunResult {
  ok: boolean;
  output: string[];
  error?: { message: string; line: number };
  trace: TraceStep[];
  traceTruncated: boolean;
  steps: number;
  /** Nama variabel sesuai urutan kemunculan, dengan ejaan aslinya (untuk kolom tabel jejak). */
  varOrder: string[];
}

export function formatValue(v: Scalar): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    // Real ditampilkan paling banyak 4 angka di belakang koma, tanpa nol di ujung.
    return String(Number(v.toFixed(4)));
  }
  return v;
}

const isArray = (v: Value | undefined): v is ArrayVal => typeof v === "object" && v !== null && v.kind === "array";

class Machine {
  private readonly env = new Map<string, Value>();
  private readonly types = new Map<string, TypeName>();
  private readonly consts = new Set<string>();
  private readonly spelling = new Map<string, string>();
  private readonly order: string[] = [];
  private readonly input: string[];
  readonly output: string[] = [];
  readonly trace: TraceStep[] = [];
  traceTruncated = false;
  steps = 0;

  constructor(private readonly prog: Program, private readonly opt: Required<RunOptions>) {
    this.input = opt.input.split(/\s+/).filter(Boolean);
  }

  private remember(name: string, text: string): void {
    if (!this.spelling.has(name)) {
      this.spelling.set(name, text);
      this.order.push(name);
    }
  }

  get varOrder(): string[] {
    return this.order.map((n) => this.spelling.get(n) ?? n);
  }

  private snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of this.order) {
      if (this.consts.has(name)) continue;
      const v = this.env.get(name);
      if (v === undefined) continue;
      const label = this.spelling.get(name) ?? name;
      if (isArray(v)) {
        if (v.bounds && v.bounds.length === 1) {
          const { lo, hi } = v.bounds[0];
          const cells: string[] = [];
          let last = lo - 1;
          for (let i = lo; i <= hi; i++) if (v.data.has(String(i))) last = i;
          for (let i = lo; i <= Math.min(last, lo + 11); i++) cells.push(v.data.has(String(i)) ? formatValue(v.data.get(String(i))!) : "?");
          out[label] = `[${cells.join(", ")}${last > lo + 11 ? ", …" : ""}]`;
        } else {
          out[label] = `{${[...v.data].slice(0, 8).map(([k, x]) => `${k}: ${formatValue(x)}`).join(", ")}}`;
        }
      } else out[label] = formatValue(v);
    }
    return out;
  }

  private tick(line: number, note?: string): void {
    this.steps++;
    if (this.steps > this.opt.maxSteps) {
      throw new PseudoError(`Program berhenti setelah ${this.opt.maxSteps.toLocaleString("id-ID")} langkah. Mungkin perulangannya tidak pernah berhenti.`, line);
    }
    if (this.opt.traceLimit) {
      if (this.trace.length < this.opt.traceLimit) this.trace.push({ line, vars: this.snapshot(), out: this.output.length, note });
      else this.traceTruncated = true;
    }
  }

  run(): void {
    for (const c of this.prog.consts) {
      this.remember(c.name, c.text);
      this.env.set(c.name, this.eval(c.e));
      this.consts.add(c.name);
    }
    for (const d of this.prog.vars) {
      this.remember(d.name, d.text);
      this.types.set(d.name, d.type);
      if (d.dims.length) {
        const bounds = d.dims.map((dim) => ({ lo: this.int(this.eval(dim.lo), d.line, "batas larik"), hi: this.int(this.eval(dim.hi), d.line, "batas larik") }));
        this.env.set(d.name, { kind: "array", type: d.type, bounds, data: new Map() });
      }
    }
    this.block(this.prog.body);
  }

  private block(list: Stmt[]): void {
    for (const s of list) this.stmt(s);
  }

  private stmt(s: Stmt): void {
    switch (s.k) {
      case "assign":
        this.assign(s.target, this.eval(s.e), s.line);
        this.tick(s.line);
        return;
      case "read":
        for (const t of s.targets) {
          const tok = this.input.shift();
          if (tok === undefined) throw new PseudoError("Masukan habis: read() meminta nilai, tetapi kotak Masukan sudah kosong.", s.line);
          this.assign(t, this.parseInput(tok, t), s.line);
        }
        this.tick(s.line);
        return;
      case "write": {
        const parts = s.args.map((a) => {
          const v = this.eval(a);
          if (isArray(v)) throw new PseudoError("Larik tidak bisa ditulis langsung; tulis elemennya, mis. write(nilai[i]).", s.line);
          return { v, lit: a.k === "str" };
        });
        // Antar-nilai dipisah satu spasi, kecuali teks yang sudah diakhiri/diawali spasi.
        let line = "";
        parts.forEach((p, i) => {
          const text = formatValue(p.v);
          if (i > 0 && !/\s$/.test(line) && !(p.lit && /^\s/.test(text))) line += " ";
          line += text;
        });
        this.output.push(line);
        if (this.output.length > this.opt.maxOutput) {
          throw new PseudoError(`Keluaran melebihi ${this.opt.maxOutput} baris; program dihentikan.`, s.line);
        }
        this.tick(s.line);
        return;
      }
      case "if": {
        const c = this.bool(this.eval(s.cond), s.line, "kondisi if");
        this.tick(s.line, `kondisi: ${c}`);
        this.block(c ? s.then : s.else);
        return;
      }
      case "while":
        for (;;) {
          const c = this.bool(this.eval(s.cond), s.line, "kondisi while");
          this.tick(s.line, `kondisi: ${c}`);
          if (!c) return;
          this.block(s.body);
        }
      case "repeat":
        for (;;) {
          this.block(s.body);
          const c = this.bool(this.eval(s.cond), s.untilLine, "kondisi until");
          this.tick(s.untilLine, `kondisi until: ${c}`);
          if (c) return;
        }
      case "for": {
        const from = this.int(this.eval(s.from), s.line, "batas awal for");
        const to = this.int(this.eval(s.to), s.line, "batas akhir for");
        const step = s.step ? Math.abs(this.int(this.eval(s.step), s.line, "langkah for")) : 1;
        if (step === 0) throw new PseudoError("Langkah for tidak boleh 0.", s.line);
        for (let i = from; s.down ? i >= to : i <= to; i += s.down ? -step : step) {
          this.assign(s.v, i, s.line);
          this.tick(s.line);
          this.block(s.body);
        }
        return;
      }
    }
  }

  // ----- variabel

  private lookup(name: string, text: string, line: number): Value {
    const v = this.env.get(name);
    if (v === undefined) {
      if (this.types.has(name)) throw new PseudoError(`Variabel ${text} dipakai sebelum diberi nilai.`, line);
      throw new PseudoError(`Variabel ${text} belum pernah diberi nilai.`, line);
    }
    return v;
  }

  private key(arr: ArrayVal, idx: number[], text: string, line: number): string {
    if (arr.bounds) {
      if (idx.length !== arr.bounds.length) throw new PseudoError(`Larik ${text} berdimensi ${arr.bounds.length}, tetapi diberi ${idx.length} indeks.`, line);
      idx.forEach((i, d) => {
        const { lo, hi } = arr.bounds![d];
        if (i < lo || i > hi) throw new PseudoError(`Indeks ${text}[${idx.join(", ")}] di luar batas ${lo}..${hi}.`, line);
      });
    }
    return idx.join(",");
  }

  private assign(t: Target, v: Value, line: number): void {
    if (this.consts.has(t.name)) throw new PseudoError(`${t.text} adalah konstanta dan tidak bisa diubah.`, line);
    this.remember(t.name, t.text);
    if (t.k === "index") {
      let arr = this.env.get(t.name);
      if (arr === undefined) {
        // Larik tanpa DEKLARASI (sering di slide: "anggap nim[1..N] sudah terisi").
        arr = { kind: "array", type: "real", bounds: null, data: new Map() };
        this.env.set(t.name, arr);
      }
      if (!isArray(arr)) throw new PseudoError(`${t.text} bukan larik.`, line);
      if (isArray(v)) throw new PseudoError("Elemen larik tidak bisa diisi larik.", line);
      const idx = t.idx.map((e) => this.int(this.eval(e), line, "indeks larik"));
      arr.data.set(this.key(arr, idx, t.text, line), this.check(arr.bounds ? arr.type : undefined, v, `${t.text}[${idx.join(", ")}]`, line));
      return;
    }
    const cur = this.env.get(t.name);
    if (isArray(cur)) throw new PseudoError(`${t.text} adalah larik; isi elemennya, mis. ${t.text}[1] ← ...`, line);
    if (isArray(v)) throw new PseudoError("Larik tidak bisa disalin dengan ←.", line);
    this.env.set(t.name, this.check(this.types.get(t.name), v, t.text, line));
  }

  /** Pemeriksaan tipe untuk variabel yang dideklarasikan. */
  private check(type: TypeName | undefined, v: Scalar, text: string, line: number): Scalar {
    if (!type) return v;
    if (type === "integer") {
      if (typeof v !== "number" || !Number.isInteger(v)) throw new PseudoError(`${text} bertipe integer, tidak bisa diisi ${formatValue(v)}.`, line);
    } else if (type === "real") {
      if (typeof v !== "number") throw new PseudoError(`${text} bertipe real, tidak bisa diisi ${JSON.stringify(v)}.`, line);
    } else if (type === "boolean") {
      if (typeof v !== "boolean") throw new PseudoError(`${text} bertipe boolean, tidak bisa diisi ${formatValue(v)}.`, line);
    } else if (typeof v !== "string") return formatValue(v);
    return v;
  }

  private parseInput(tok: string, t: Target): Scalar {
    const decl = this.types.get(t.name);
    const arr = this.env.get(t.name);
    const type = isArray(arr) && arr.bounds ? arr.type : decl;
    if (type === "string" || type === "char") return tok;
    const lower = tok.toLowerCase();
    if (lower === "true" || lower === "false") return lower === "true";
    const n = Number(tok.replace(",", "."));
    if (!Number.isNaN(n)) return n;
    if (type === "integer" || type === "real") throw new PseudoError(`Masukan "${tok}" bukan bilangan, padahal ${t.text} bertipe ${type}.`, t.line);
    return tok;
  }

  // ----- ekspresi

  private num(v: Value, line: number, what: string): number {
    if (typeof v !== "number") throw new PseudoError(`${what} harus bilangan, tetapi bernilai ${isArray(v) ? "larik" : formatValue(v)}.`, line);
    return v;
  }
  private int(v: Value, line: number, what: string): number {
    const n = this.num(v, line, what);
    if (!Number.isInteger(n)) throw new PseudoError(`${what} harus bilangan bulat, tetapi bernilai ${formatValue(n)}.`, line);
    return n;
  }
  private bool(v: Value, line: number, what: string): boolean {
    if (typeof v !== "boolean") throw new PseudoError(`${what} harus bernilai true/false, tetapi bernilai ${isArray(v) ? "larik" : formatValue(v)}.`, line);
    return v;
  }

  eval(e: Expr): Value {
    switch (e.k) {
      case "num":
      case "str":
      case "bool":
        return e.v;
      case "var":
        return this.lookup(e.name, e.text, e.line);
      case "index": {
        const arr = this.lookup(e.name, e.text, e.line);
        if (!isArray(arr)) throw new PseudoError(`${e.text} bukan larik.`, e.line);
        const idx = e.idx.map((x) => this.int(this.eval(x), e.line, "indeks larik"));
        const v = arr.data.get(this.key(arr, idx, e.text, e.line));
        if (v === undefined) throw new PseudoError(`${e.text}[${idx.join(", ")}] belum diberi nilai.`, e.line);
        return v;
      }
      case "un": {
        const v = this.eval(e.e);
        if (e.op === "not") return !this.bool(v, e.line, "operand not");
        const n = this.num(v, e.line, `operand ${e.op}`);
        return e.op === "-" ? -n : n;
      }
      case "call":
        return this.call(e);
      case "bin":
        return this.binary(e);
    }
  }

  private call(e: Extract<Expr, { k: "call" }>): Value {
    const args = e.args.map((a) => this.eval(a));
    const n = (i: number) => this.num(args[i], e.line, `argumen ${e.name}`);
    const need = (k: number) => {
      if (args.length !== k) throw new PseudoError(`${e.name}() membutuhkan ${k} argumen.`, e.line);
    };
    switch (e.name) {
      case "abs": need(1); return Math.abs(n(0));
      case "sqrt": need(1); if (n(0) < 0) throw new PseudoError("sqrt() dari bilangan negatif.", e.line); return Math.sqrt(n(0));
      case "round": need(1); return Math.round(n(0));
      case "trunc": need(1); return Math.trunc(n(0));
      case "floor": need(1); return Math.floor(n(0));
      case "ceil": need(1); return Math.ceil(n(0));
      case "length": {
        need(1);
        const v = args[0];
        if (typeof v === "string") return v.length;
        throw new PseudoError("length() hanya untuk teks.", e.line);
      }
      case "max": case "min": {
        if (!args.length) throw new PseudoError(`${e.name}() membutuhkan argumen.`, e.line);
        const xs = args.map((_, i) => n(i));
        return e.name === "max" ? Math.max(...xs) : Math.min(...xs);
      }
      default:
        throw new PseudoError(`Fungsi ${e.name}() tidak dikenal. Yang tersedia: abs, sqrt, round, trunc, floor, ceil, length, max, min.`, e.line);
    }
  }

  private binary(e: Extract<Expr, { k: "bin" }>): Value {
    if (e.op === "and" || e.op === "or") {
      // Evaluasi pendek: (i ≤ N) and (nim[i] = x) tidak membaca nim[N+1].
      const a = this.bool(this.eval(e.a), e.line, `operand ${e.op}`);
      if (e.op === "and" && !a) return false;
      if (e.op === "or" && a) return true;
      return this.bool(this.eval(e.b), e.line, `operand ${e.op}`);
    }
    const a = this.eval(e.a), b = this.eval(e.b);
    if (isArray(a) || isArray(b)) throw new PseudoError("Larik tidak bisa dihitung langsung; pakai elemennya.", e.line);
    switch (e.op) {
      case "xor": return this.bool(a, e.line, "operand xor") !== this.bool(b, e.line, "operand xor");
      case "=": return a === b;
      case "≠": return a !== b;
      case "<": case ">": case "≤": case "≥": {
        if (typeof a !== typeof b || typeof a === "boolean") throw new PseudoError(`Tidak bisa membandingkan ${formatValue(a)} dengan ${formatValue(b)}.`, e.line);
        const x = a as number | string, y = b as number | string;
        return e.op === "<" ? x < y : e.op === ">" ? x > y : e.op === "≤" ? x <= y : x >= y;
      }
      case "+":
        if (typeof a === "string" || typeof b === "string") return formatValue(a) + formatValue(b);
        return this.num(a, e.line, "operand +") + this.num(b, e.line, "operand +");
      case "-": return this.num(a, e.line, "operand -") - this.num(b, e.line, "operand -");
      case "*": return this.num(a, e.line, "operand *") * this.num(b, e.line, "operand *");
      case "^": return this.num(a, e.line, "operand ^") ** this.num(b, e.line, "operand ^");
      case "/": {
        const d = this.num(b, e.line, "pembagi");
        if (d === 0) throw new PseudoError("Pembagian dengan nol.", e.line);
        return this.num(a, e.line, "operand /") / d;
      }
      case "div": case "mod": {
        const x = this.int(a, e.line, `operand ${e.op}`), y = this.int(b, e.line, `operand ${e.op}`);
        if (y === 0) throw new PseudoError(`${e.op} dengan nol.`, e.line);
        return e.op === "div" ? Math.trunc(x / y) : x % y;
      }
    }
    throw new PseudoError(`Operator ${e.op} tidak dikenal.`, e.line);
  }
}

export function runPseudocode(src: string, options: RunOptions = {}): RunResult {
  const opt: Required<RunOptions> = { input: "", maxSteps: 200_000, maxOutput: 1000, traceLimit: 0, ...options };
  let m: Machine | undefined;
  try {
    m = new Machine(parse(src), opt);
    m.run();
    return { ok: true, output: m.output, trace: m.trace, traceTruncated: m.traceTruncated, steps: m.steps, varOrder: m.varOrder };
  } catch (err) {
    const e = err instanceof PseudoError ? { message: err.message, line: err.line } : { message: String(err), line: 0 };
    return {
      ok: false,
      output: m?.output ?? [],
      error: e,
      trace: m?.trace ?? [],
      traceTruncated: m?.traceTruncated ?? false,
      steps: m?.steps ?? 0,
      varOrder: m?.varOrder ?? [],
    };
  }
}
