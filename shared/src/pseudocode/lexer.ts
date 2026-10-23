// Pemindai (lexer) pseudocode notasi Munir seperti di slide Logika Komputasional.
// Simbol Unicode (← ≠ ≤ ≥) dan padanan ASCII (<- <> != <= >=) sama-sama diterima,
// karena tidak semua papan ketik bisa mengetik simbol.

export type TokKind = "num" | "str" | "id" | "kw" | "op" | "nl" | "eof";

export interface Token {
  kind: TokKind;
  /** Kata kunci dan nama disimpan dalam huruf kecil; `text` menyimpan aslinya. */
  value: string;
  text: string;
  line: number;
  col: number;
}

export class PseudoError extends Error {
  constructor(message: string, readonly line: number) {
    super(message);
  }
}

export const KEYWORDS = new Set([
  "program", "deklarasi", "algoritma", "const", "array", "of",
  "if", "then", "else", "endif", "for", "to", "downto", "step", "do", "endfor",
  "while", "endwhile", "repeat", "until", "read", "write",
  "and", "or", "not", "xor", "div", "mod", "true", "false",
  "integer", "real", "boolean", "string", "char",
]);

const OPS: [string, string][] = [
  ["<-", "←"], ["←", "←"], [":=", "←"],
  ["<>", "≠"], ["!=", "≠"], ["≠", "≠"],
  ["<=", "≤"], ["≤", "≤"], [">=", "≥"], ["≥", "≥"],
  ["..", ".."],
  ["<", "<"], [">", ">"], ["=", "="], ["+", "+"], ["-", "-"], ["−", "-"], ["*", "*"], ["×", "*"],
  ["/", "/"], ["^", "^"], ["(", "("], [")", ")"], ["[", "["], ["]", "]"], [",", ","], [":", ":"],
];

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0, line = 1, col = 1;
  const push = (kind: TokKind, value: string, text: string, l = line, c = col) => out.push({ kind, value, text, line: l, col: c });
  const adv = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === "\n") {
        line++;
        col = 1;
      } else col++;
      i++;
    }
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\n") {
      push("nl", "\n", "\n");
      adv(1);
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      adv(1);
      continue;
    }
    // Komentar { ... } boleh lebih dari satu baris; // sampai akhir baris juga diterima.
    if (ch === "{") {
      const start = line;
      const end = src.indexOf("}", i);
      if (end < 0) throw new PseudoError("Komentar { belum ditutup dengan }.", start);
      adv(end - i + 1);
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") adv(1);
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "‘" || ch === "“") {
      const close = ch === "‘" ? "’" : ch === "“" ? "”" : ch;
      const l = line, c = col;
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== close && src[j] !== "\n") s += src[j++];
      if (src[j] !== close) throw new PseudoError("Teks belum ditutup dengan tanda kutip.", l);
      push("str", s, src.slice(i, j + 1), l, c);
      adv(j - i + 1);
      continue;
    }
    if (/[0-9]/.test(ch)) {
      // Desimal wajib berdigit setelah titik, jadi "1..N" (batas larik) terbaca 1, .., N.
      const text = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(src.slice(i))![0];
      push("num", text, text);
      adv(text.length);
      continue;
    }
    if (/[\p{L}_]/u.test(ch)) {
      const m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))!;
      const lower = m[0].toLowerCase();
      push(KEYWORDS.has(lower) ? "kw" : "id", lower, m[0]);
      adv(m[0].length);
      continue;
    }
    const op = OPS.find(([s]) => src.startsWith(s, i));
    if (op) {
      push("op", op[1], op[0]);
      adv(op[0].length);
      continue;
    }
    throw new PseudoError(`Simbol tidak dikenal: "${ch}".`, line);
  }
  push("nl", "\n", "");
  push("eof", "", "");
  return out;
}
