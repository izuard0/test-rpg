// Pewarnaan sintaks pseudocode untuk CodeMirror (notasi slide Logika Komputasional).

import { StreamLanguage, type StreamParser } from "@codemirror/language";

const KW = new Set([
  "program", "deklarasi", "algoritma", "const", "array", "of", "if", "then", "else", "endif",
  "for", "to", "downto", "step", "do", "endfor", "while", "endwhile", "repeat", "until",
]);
const OPWORD = new Set(["and", "or", "not", "xor", "div", "mod"]);
const BUILTIN = new Set(["read", "write", "abs", "sqrt", "round", "trunc", "floor", "ceil", "length", "max", "min"]);
const ATOM = new Set(["true", "false"]);
const TYPE = new Set(["integer", "real", "boolean", "string", "char"]);

interface State {
  comment: boolean;
}

const parser: StreamParser<State> = {
  startState: () => ({ comment: false }),
  token(stream, state) {
    if (state.comment) {
      if (stream.skipTo("}")) {
        stream.next();
        state.comment = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.eat("{")) {
      state.comment = true;
      return "comment";
    }
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^'[^']*'?/) || stream.match(/^"[^"]*"?/)) return "string";
    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return "number";
    if (stream.match(/^(←|<-|:=|≠|<>|!=|≤|<=|≥|>=|[=<>+\-*/^])/)) return "operator";
    const w = stream.match(/^[\p{L}_][\p{L}\p{N}_]*/u) as RegExpMatchArray | null;
    if (w) {
      const lower = w[0].toLowerCase();
      if (KW.has(lower)) return "keyword";
      if (OPWORD.has(lower)) return "operatorKeyword";
      if (BUILTIN.has(lower)) return "function(variableName)";
      if (ATOM.has(lower)) return "atom";
      if (TYPE.has(lower)) return "typeName";
      return "variableName";
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { block: { open: "{", close: "}" } } },
};

export const pseudocode = StreamLanguage.define(parser);
