// Parser pseudocode -> pohon sintaks. Struktur program mengikuti slide:
//   PROGRAM Nama            (opsional)
//   DEKLARASI               (opsional: const, variabel bertipe, larik)
//   ALGORITMA:              (opsional bila tanpa DEKLARASI; isi program)

import { PseudoError, tokenize, type Token } from "./lexer.js";

export type TypeName = "integer" | "real" | "boolean" | "string" | "char";

export type Expr =
  | { k: "num"; v: number; line: number }
  | { k: "str"; v: string; line: number }
  | { k: "bool"; v: boolean; line: number }
  | { k: "var"; name: string; text: string; line: number }
  | { k: "index"; name: string; text: string; idx: Expr[]; line: number }
  | { k: "call"; name: string; args: Expr[]; line: number }
  | { k: "un"; op: string; e: Expr; line: number }
  | { k: "bin"; op: string; a: Expr; b: Expr; line: number };

export type Target = Extract<Expr, { k: "var" } | { k: "index" }>;

export type Stmt =
  | { k: "assign"; target: Target; e: Expr; line: number }
  | { k: "read"; targets: Target[]; line: number }
  | { k: "write"; args: Expr[]; line: number }
  | { k: "if"; cond: Expr; then: Stmt[]; else: Stmt[]; line: number; elseLine?: number }
  | { k: "for"; v: Target; from: Expr; to: Expr; down: boolean; step?: Expr; body: Stmt[]; line: number }
  | { k: "while"; cond: Expr; body: Stmt[]; line: number }
  | { k: "repeat"; body: Stmt[]; cond: Expr; line: number; untilLine: number };

export interface VarDecl {
  name: string;
  text: string;
  type: TypeName;
  /** Batas larik per dimensi; kosong = bukan larik. */
  dims: { lo: Expr; hi: Expr }[];
  line: number;
}

export interface Program {
  name?: string;
  consts: { name: string; text: string; e: Expr; line: number }[];
  vars: VarDecl[];
  body: Stmt[];
}

const TYPES = new Set(["integer", "real", "boolean", "string", "char"]);

class Parser {
  private p = 0;
  constructor(private readonly t: Token[]) {}

  private get cur(): Token {
    return this.t[this.p];
  }
  private peek(n = 1): Token {
    return this.t[Math.min(this.p + n, this.t.length - 1)];
  }
  private is(kind: Token["kind"], value?: string): boolean {
    return this.cur.kind === kind && (value === undefined || this.cur.value === value);
  }
  private kw(...words: string[]): boolean {
    return this.cur.kind === "kw" && words.includes(this.cur.value);
  }
  private next(): Token {
    return this.t[this.p++];
  }
  private skipNl(): void {
    while (this.is("nl")) this.p++;
  }
  private describe(tok: Token): string {
    if (tok.kind === "eof") return "akhir program";
    if (tok.kind === "nl") return "akhir baris";
    return `"${tok.text}"`;
  }
  private expect(kind: Token["kind"], value: string, what = `"${value}"`): Token {
    if (!this.is(kind, value)) throw new PseudoError(`Diharapkan ${what}, tetapi menemukan ${this.describe(this.cur)}.`, this.cur.line);
    return this.next();
  }
  private endOfStatement(): void {
    if (this.is("nl") || this.is("eof")) return;
    // Pernyataan boleh langsung diikuti kata penutup blok (mis. "... else", "... endif").
    if (this.kw("else", "endif", "endfor", "endwhile", "until")) return;
    throw new PseudoError(`Satu baris berisi lebih dari satu perintah, atau ada sisa ${this.describe(this.cur)}.`, this.cur.line);
  }

  program(): Program {
    const prog: Program = { consts: [], vars: [], body: [] };
    this.skipNl();
    if (this.kw("program")) {
      this.next();
      if (this.is("id")) prog.name = this.next().text;
      this.skipNl();
    }
    const hasSections = this.t.some((x) => x.kind === "kw" && x.value === "algoritma");
    if (this.kw("deklarasi")) {
      this.next();
      if (this.is("op", ":")) this.next();
      this.skipNl();
      while (!this.kw("algoritma") && !this.is("eof")) {
        this.declaration(prog);
        this.skipNl();
      }
    }
    if (this.kw("algoritma")) {
      this.next();
      if (this.is("op", ":")) this.next();
    } else if (hasSections) {
      throw new PseudoError(`Diharapkan "ALGORITMA:", tetapi menemukan ${this.describe(this.cur)}.`, this.cur.line);
    }
    prog.body = this.block([]);
    if (!this.is("eof")) throw new PseudoError(`${this.describe(this.cur)} tanpa pasangan pembuka.`, this.cur.line);
    return prog;
  }

  private declaration(prog: Program): void {
    const line = this.cur.line;
    if (this.kw("const")) {
      this.next();
      const id = this.expect("id", this.cur.value, "nama konstanta");
      this.expect("op", "=", '"=" setelah nama konstanta');
      prog.consts.push({ name: id.value, text: id.text, e: this.expr(), line });
      this.endOfStatement();
      return;
    }
    const names: Token[] = [this.expect("id", this.cur.value, "nama variabel")];
    while (this.is("op", ",")) {
      this.next();
      names.push(this.expect("id", this.cur.value, "nama variabel"));
    }
    this.expect("op", ":", '":" lalu tipe data');
    const dims: VarDecl["dims"] = [];
    if (this.kw("array")) {
      this.next();
      this.expect("op", "[", '"["');
      do {
        if (this.is("op", ",")) this.next();
        const lo = this.expr();
        this.expect("op", "..", '".." di antara batas bawah dan atas larik');
        dims.push({ lo, hi: this.expr() });
      } while (this.is("op", ","));
      this.expect("op", "]", '"]"');
      this.expect("kw", "of", '"of" lalu tipe elemen');
    }
    const tt = this.cur;
    if (!(tt.kind === "kw" && TYPES.has(tt.value))) {
      throw new PseudoError(`Tipe data tidak dikenal: ${this.describe(tt)}. Pakai integer, real, boolean, string, atau char.`, tt.line);
    }
    this.next();
    for (const n of names) prog.vars.push({ name: n.value, text: n.text, type: tt.value as TypeName, dims, line });
    this.endOfStatement();
  }

  /** Daftar pernyataan sampai salah satu kata penutup (tidak dikonsumsi). */
  private block(enders: string[]): Stmt[] {
    const out: Stmt[] = [];
    for (;;) {
      this.skipNl();
      if (this.is("eof") || (this.cur.kind === "kw" && enders.includes(this.cur.value))) return out;
      if (this.kw("else", "endif", "endfor", "endwhile", "until")) {
        throw new PseudoError(`"${this.cur.text}" tanpa pasangan pembuka yang sesuai.`, this.cur.line);
      }
      out.push(this.statement());
    }
  }

  private statement(): Stmt {
    const line = this.cur.line;
    if (this.kw("read")) {
      this.next();
      this.expect("op", "(", '"(" setelah read');
      const targets: Target[] = [];
      if (!this.is("op", ")")) {
        do {
          if (this.is("op", ",")) this.next();
          targets.push(this.target());
        } while (this.is("op", ","));
      }
      this.expect("op", ")", '")"');
      this.endOfStatement();
      return { k: "read", targets, line };
    }
    if (this.kw("write")) {
      this.next();
      this.expect("op", "(", '"(" setelah write');
      const args: Expr[] = [];
      if (!this.is("op", ")")) {
        do {
          if (this.is("op", ",")) this.next();
          args.push(this.expr());
        } while (this.is("op", ","));
      }
      this.expect("op", ")", '")"');
      this.endOfStatement();
      return { k: "write", args, line };
    }
    if (this.kw("if")) {
      this.next();
      const cond = this.expr();
      this.expect("kw", "then", '"then" setelah kondisi if');
      const then = this.block(["else", "endif"]);
      let els: Stmt[] = [];
      let elseLine: number | undefined;
      if (this.kw("else")) {
        elseLine = this.next().line;
        // "else if" adalah if bersarang di dalam else, jadi masing-masing tetap ditutup endif sendiri.
        els = this.block(["endif"]);
      }
      this.expect("kw", "endif", '"endif" untuk menutup if');
      this.endOfStatement();
      return { k: "if", cond, then, else: els, line, elseLine };
    }
    if (this.kw("for")) {
      this.next();
      const v = this.target();
      this.expectAssign("for");
      const from = this.expr();
      let down = false;
      if (this.kw("downto")) {
        down = true;
        this.next();
      } else this.expect("kw", "to", '"to" atau "downto"');
      const to = this.expr();
      let step: Expr | undefined;
      if (this.kw("step")) {
        this.next();
        step = this.expr();
      }
      this.expect("kw", "do", '"do" setelah batas for');
      const body = this.block(["endfor"]);
      this.expect("kw", "endfor", '"endfor" untuk menutup for');
      this.endOfStatement();
      return { k: "for", v, from, to, down, step, body, line };
    }
    if (this.kw("while")) {
      this.next();
      const cond = this.expr();
      this.expect("kw", "do", '"do" setelah kondisi while');
      const body = this.block(["endwhile"]);
      this.expect("kw", "endwhile", '"endwhile" untuk menutup while');
      this.endOfStatement();
      return { k: "while", cond, body, line };
    }
    if (this.kw("repeat")) {
      this.next();
      const body = this.block(["until"]);
      const untilLine = this.expect("kw", "until", '"until" untuk menutup repeat').line;
      const cond = this.expr();
      this.endOfStatement();
      return { k: "repeat", body, cond, line, untilLine };
    }
    if (this.is("id")) {
      const target = this.target();
      if (this.is("op", "=")) {
        throw new PseudoError(`Untuk mengisi variabel pakai "←" (atau "<-"), bukan "=". "=" dipakai untuk membandingkan.`, this.cur.line);
      }
      this.expectAssign();
      const e = this.expr();
      this.endOfStatement();
      return { k: "assign", target, e, line };
    }
    throw new PseudoError(`Perintah tidak dikenal: ${this.describe(this.cur)}.`, line);
  }

  private expectAssign(where?: string): void {
    if (!this.is("op", "←")) {
      throw new PseudoError(`Diharapkan "←" (atau "<-")${where ? ` pada ${where}` : ""}, tetapi menemukan ${this.describe(this.cur)}.`, this.cur.line);
    }
    this.next();
  }

  private target(): Target {
    const tok = this.cur;
    if (tok.kind !== "id") throw new PseudoError(`Diharapkan nama variabel, tetapi menemukan ${this.describe(tok)}.`, tok.line);
    this.next();
    if (this.is("op", "[")) {
      this.next();
      const idx = [this.expr()];
      while (this.is("op", ",")) {
        this.next();
        idx.push(this.expr());
      }
      this.expect("op", "]", '"]"');
      return { k: "index", name: tok.value, text: tok.text, idx, line: tok.line };
    }
    return { k: "var", name: tok.value, text: tok.text, line: tok.line };
  }

  // ----- ekspresi: or/xor < and < not < perbandingan < + - < * / div mod < ^ < unary -
  expr(): Expr {
    let a = this.andExpr();
    while (this.kw("or", "xor")) {
      const op = this.next();
      a = { k: "bin", op: op.value, a, b: this.andExpr(), line: op.line };
    }
    return a;
  }
  private andExpr(): Expr {
    let a = this.notExpr();
    while (this.kw("and")) {
      const op = this.next();
      a = { k: "bin", op: "and", a, b: this.notExpr(), line: op.line };
    }
    return a;
  }
  private notExpr(): Expr {
    if (this.kw("not")) {
      const op = this.next();
      return { k: "un", op: "not", e: this.notExpr(), line: op.line };
    }
    return this.cmp();
  }
  private cmp(): Expr {
    const a = this.add();
    if (this.cur.kind === "op" && ["=", "≠", "<", ">", "≤", "≥"].includes(this.cur.value)) {
      const op = this.next();
      return { k: "bin", op: op.value, a, b: this.add(), line: op.line };
    }
    return a;
  }
  private add(): Expr {
    let a = this.mul();
    while (this.is("op", "+") || this.is("op", "-")) {
      const op = this.next();
      a = { k: "bin", op: op.value, a, b: this.mul(), line: op.line };
    }
    return a;
  }
  private mul(): Expr {
    let a = this.pow();
    while (this.is("op", "*") || this.is("op", "/") || this.kw("div", "mod")) {
      const op = this.next();
      a = { k: "bin", op: op.value, a, b: this.pow(), line: op.line };
    }
    return a;
  }
  private pow(): Expr {
    const a = this.unary();
    if (this.is("op", "^")) {
      const op = this.next();
      return { k: "bin", op: "^", a, b: this.pow(), line: op.line };
    }
    return a;
  }
  private unary(): Expr {
    if (this.is("op", "-") || this.is("op", "+")) {
      const op = this.next();
      return { k: "un", op: op.value, e: this.unary(), line: op.line };
    }
    return this.primary();
  }
  private primary(): Expr {
    const tok = this.cur;
    if (tok.kind === "num") {
      this.next();
      return { k: "num", v: Number(tok.value), line: tok.line };
    }
    if (tok.kind === "str") {
      this.next();
      return { k: "str", v: tok.value, line: tok.line };
    }
    if (this.kw("true", "false")) {
      this.next();
      return { k: "bool", v: tok.value === "true", line: tok.line };
    }
    if (this.is("op", "(")) {
      this.next();
      const e = this.expr();
      this.expect("op", ")", '")"');
      return e;
    }
    if (tok.kind === "id") {
      if (this.peek().kind === "op" && this.peek().value === "(") {
        this.next();
        this.next();
        const args: Expr[] = [];
        if (!this.is("op", ")")) {
          do {
            if (this.is("op", ",")) this.next();
            args.push(this.expr());
          } while (this.is("op", ","));
        }
        this.expect("op", ")", '")"');
        return { k: "call", name: tok.value, args, line: tok.line };
      }
      return this.target();
    }
    throw new PseudoError(`Diharapkan nilai atau ekspresi, tetapi menemukan ${this.describe(tok)}.`, tok.line);
  }
}

export function parse(src: string): Program {
  return new Parser(tokenize(src)).program();
}
