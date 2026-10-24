// Terminal praktik perpustakaan (docs/RANCANGAN.md bagian 5): daftar latihan bergaya
// penjelajah file, editor CodeMirror, dan hasil. Mode SQL memakai MySQL sungguhan di server
// bila tersedia (sesi per akun, kembali ke nol saat sesi berakhir), dengan sql.js di browser
// sebagai cadangan. Pseudocode (penerjemah sendiri, langkah demi langkah + tabel jejak)
// berjalan di browser, di Web Worker dengan batas waktu.
//
// Kode dan status "selesai" disimpan di memori selama tab terbuka; penyimpanan ke akun
// menyusul bersama login (tahap 5).

import { MySQL, sql as sqlLang, SQLite } from "@codemirror/lang-sql";
import { Compartment, EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, type DecorationSet } from "@codemirror/view";
import { basicSetup } from "codemirror";
import {
  compareOutput,
  compareResults,
  type Latihan,
  type LatihanBundle,
  type PseudoLatihan,
  type RunResult,
  type SqlLatihan,
} from "@mita/shared";
import { esc, openPanel } from "../ui/panel";
import { GAME_BASE } from "../world/loader";
import { pseudocode } from "./pseudo-lang";
import { PraktikFail, praktikAvailable, praktikCall, type PraktikRun } from "./praktik";
import { pseudoRunner, sqlRunner, TIME_LIMIT_MS } from "./runner";
import type { SqlResponse, SqlStatementResult } from "./sql.worker";

type Mode = "pseudocode" | "sql";
const SANDBOX = "sandbox";

const SANDBOX_CODE: Record<Mode, string> = {
  pseudocode: `{ Sandbox pseudocode: tulis bebas, lalu Jalankan atau Langkah. }
ALGORITMA:
   read(N)
   jumlah ← 0
   for i ← 1 to N do
      jumlah ← jumlah + i
   endfor
   write('Jumlah 1 sampai ', N, ' = ', jumlah)
`,
  sql: `-- Sandbox SQL. Tabel contoh di database akademik: mahasiswa, matakuliah, nilai.
-- Tabel contoh: mahasiswa, matakuliah, nilai. Tekan Ctrl+Enter untuk menjalankan.
SHOW TABLES;

SELECT m.nama, mk.nama AS matakuliah, n.nilai_huruf
FROM nilai n
JOIN mahasiswa m ON m.nim = n.nim
JOIN matakuliah mk ON mk.kode = n.kode
WHERE n.nilai_angka >= 85
ORDER BY m.nama;
`,
};

// ----- keadaan yang bertahan selama tab terbuka -----
const codes = new Map<string, string>();
const inputs = new Map<string, string>();
const done = new Set<string>();
let lastMode: Mode = "sql";
let lastItem = SANDBOX;
let sandboxDataset = "akademik";
let bundlePromise: Promise<LatihanBundle> | undefined;

function loadBundle(): Promise<LatihanBundle> {
  bundlePromise ??= fetch(GAME_BASE + "latihan.json", { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`latihan.json ${r.status}`);
    return r.json() as Promise<LatihanBundle>;
  });
  return bundlePromise;
}

// ----- sorotan baris di editor (baris aktif saat langkah, baris galat) -----
const setMarks = StateEffect.define<{ active?: number; error?: number }>();
const marks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const ranges = [];
      const doc = tr.state.doc;
      const { active, error } = e.value;
      if (active && active <= doc.lines) ranges.push(Decoration.line({ class: "cm-step-line" }).range(doc.line(active).from));
      if (error && error <= doc.lines) ranges.push(Decoration.line({ class: "cm-error-line" }).range(doc.line(error).from));
      ranges.sort((a, b) => a.from - b.from);
      deco = Decoration.set(ranges);
    }
    // Mengetik menghapus sorotan lama.
    if (tr.docChanged) deco = Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export async function openTerminal(): Promise<void> {
  const root = document.createElement("div");
  root.className = "terminal";
  root.innerHTML = `<p class="muted">Memuat terminal…</p>`;
  openPanel({ title: "terminal — praktik", body: root, wide: true, onClose: () => saveCurrent() });

  let bundle: LatihanBundle;
  // MySQL di server bila ada; bila gagal di tengah jalan, beralih ke sql.js untuk sisa sesi tab.
  let mysqlOn = false;
  let dbNow: string | null = "akademik";
  try {
    [bundle, mysqlOn] = await Promise.all([loadBundle(), praktikAvailable()]);
  } catch (e) {
    root.innerHTML = `<p class="term-error">Gagal memuat daftar latihan: ${esc(String(e))}</p>`;
    return;
  }

  let mode: Mode = lastMode;
  let item = lastItem;
  let view: EditorView | undefined;
  let saveCurrent = () => {};

  root.innerHTML = `
    <aside class="t-side">
      <div class="t-modes" role="tablist">
        <button type="button" data-mode="sql" role="tab">SQL</button>
        <button type="button" data-mode="pseudocode" role="tab">Pseudocode</button>
        <button type="button" disabled title="Python (Pyodide) menyusul">Python <small>segera</small></button>
      </div>
      <div class="t-list files"></div>
    </aside>
    <section class="t-main">
      <header class="t-head"></header>
      <div class="t-editor"></div>
      <div class="t-tools">
        <button type="button" class="primary run" title="Ctrl+Enter">▶ Jalankan</button>
        <button type="button" class="step">⏯ Langkah demi langkah</button>
        <button type="button" class="check">✓ Periksa jawaban</button>
        <span class="t-symbols"></span>
        <span class="t-spacer"></span>
        <span class="t-db" hidden></span>
        <select class="dataset" title="Database sandbox"></select>
        <button type="button" class="reset-data" title="Kembalikan database contoh ke isi awal">↺ Reset data</button>
        <button type="button" class="reset-code" title="Kembalikan kode awal">↺ Kode awal</button>
      </div>
      <label class="t-input"><span>Masukan <small>(untuk read(); pisahkan dengan spasi atau baris baru)</small></span><textarea rows="2" spellcheck="false"></textarea></label>
      <div class="t-out" aria-live="polite"></div>
    </section>`;

  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const list = $(".t-list"), head = $(".t-head"), out = $(".t-out");
  const inputBox = $<HTMLTextAreaElement>(".t-input textarea");
  const datasetSel = $<HTMLSelectElement>(".dataset");
  const langConf = new Compartment();

  for (const name of [...Object.keys(bundle.datasets), "kosong"]) {
    datasetSel.add(new Option(name === "kosong" ? "database kosong" : `database ${name}`, name));
  }
  datasetSel.value = sandboxDataset;

  const current = (): Latihan | undefined => bundle.items.find((x) => x.id === item);
  const key = () => `${mode}:${item}`;
  const startCode = () => (item === SANDBOX ? SANDBOX_CODE[mode] : current()?.kodeAwal ?? "");
  const datasetOf = (l: Latihan | undefined) => (l?.mode === "sql" ? l.dataset : sandboxDataset);
  const datasetSql = (name: string) => (name === "kosong" ? "" : bundle.datasets[name] ?? "");

  saveCurrent = () => {
    if (view) codes.set(key(), view.state.doc.toString());
    inputs.set(key(), inputBox.value);
    lastMode = mode;
    lastItem = item;
  };

  const language = (): Extension => (mode === "sql" ? sqlLang({ dialect: mysqlOn ? MySQL : SQLite, upperCaseKeywords: true }) : pseudocode);

  function mountEditor(doc: string) {
    const state = EditorState.create({
      doc,
      extensions: [
        basicSetup,
        langConf.of(language()),
        marks,
        keymap.of([{ key: "Mod-Enter", run: () => (void run(), true) }]),
        EditorView.theme({ "&": { height: "100%" }, ".cm-scroller": { fontFamily: "var(--mono)" } }),
      ],
    });
    if (view) view.setState(state);
    else view = new EditorView({ state, parent: $(".t-editor") });
  }

  function renderList() {
    root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
    list.replaceChildren();
    const entry = (id: string, label: string, sub = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "file";
      b.classList.toggle("on", id === item);
      const tick = done.has(id) ? `<span class="ok">✓</span>` : `<span class="ico">${id === SANDBOX ? "✎" : "▤"}</span>`;
      b.innerHTML = `${tick}<span>${esc(label)}${sub ? `<small class="muted">${esc(sub)}</small>` : ""}</span>`;
      b.onclick = () => select(id);
      list.append(b);
    };
    entry(SANDBOX, "sandbox", mode === "sql" ? "bebas bereksperimen" : "tulis bebas");
    const items = bundle.items.filter((x) => x.mode === mode);
    const h = document.createElement("p");
    h.className = "folder";
    h.innerHTML = `<span class="ico">▸</span> latihan/ <span class="muted">${items.filter((x) => done.has(x.id)).length}/${items.length} selesai</span>`;
    list.append(h);
    for (const l of items) entry(l.id, l.judul, l.mataKuliah);
  }

  function renderHead() {
    const l = current();
    if (!l) {
      head.innerHTML = `<h3>Sandbox ${mode === "sql" ? (mysqlOn ? "MySQL" : "SQL") : "pseudocode"}</h3>
        <p class="muted">${mode !== "sql"
          ? "Tulis program bebas. Isi kotak Masukan untuk perintah read()."
          : mysqlOn
            ? "MySQL 8 sungguhan di server, khusus untukmu. Mulai di database <code>akademik</code>; boleh <code>CREATE DATABASE</code>, <code>USE</code>, view, trigger, dan prosedur (<code>DELIMITER</code>). Semua kembali ke nol saat sesi berakhir: 30 menit tanpa query, keluar, atau tab ditutup."
            : "Database pribadi di browser ini (SQLite; sintaks MySQL umum diterima). Ubah sesuka hati; tekan Reset data untuk mengembalikan isi awal."}</p>`;
    } else {
      // Deskripsi latihan: teks biasa dengan `kode` dan daftar "- ".
      const html = esc(l.deskripsi)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .split("\n")
        .map((line) => (line.startsWith("- ") ? `<li>${line.slice(2)}</li>` : line ? `<p>${line}</p>` : ""))
        .join("")
        .replace(/(<li>.*?<\/li>)+/g, (m) => `<ul>${m}</ul>`);
      head.innerHTML = `<h3>${done.has(l.id) ? '<span class="ok">✓</span> ' : ""}${esc(l.judul)}</h3>${html}`;
    }
    const pseudo = mode === "pseudocode";
    $(".step").hidden = !pseudo;
    $(".check").hidden = !l;
    $(".t-input").hidden = !pseudo;
    datasetSel.hidden = !(mode === "sql" && !l) || mysqlOn;
    $(".t-db").hidden = !(mode === "sql" && !l && mysqlOn);
    $(".t-db").innerHTML = `MySQL · <code>${esc(dbNow ?? "(tanpa database)")}</code>`;
    $(".reset-data").hidden = mode !== "sql" || !!l;
    $(".t-symbols").replaceChildren(
      ...(pseudo ? ["←", "≠", "≤", "≥"] : []).map((s) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sym";
        b.textContent = s;
        b.title = `Sisipkan ${s}`;
        b.onclick = () => {
          view?.dispatch(view.state.replaceSelection(s));
          view?.focus();
        };
        return b;
      }),
    );
  }

  function select(id: string, newMode = mode) {
    saveCurrent();
    mode = newMode;
    item = id;
    renderList();
    renderHead();
    mountEditor(codes.get(key()) ?? startCode());
    view!.dispatch({ effects: langConf.reconfigure(language()) });
    const l = current();
    inputBox.value = inputs.get(key()) ?? (l?.mode === "pseudocode" ? l.uji[0]?.masukan ?? "" : mode === "pseudocode" ? "5" : "");
    out.innerHTML = `<p class="muted">${mode === "sql" ? "Hasil query tampil di sini." : "Keluaran program tampil di sini."}</p>`;
    saveCurrent();
  }

  // ----- menjalankan -----

  const busy = (on: boolean) => root.querySelectorAll<HTMLButtonElement>(".run, .step, .check").forEach((b) => (b.disabled = on));
  const mark = (m: { active?: number; error?: number }) => view?.dispatch({ effects: setMarks.of(m) });
  const timeoutMsg = () =>
    `<p class="term-error">⏱ Program dihentikan setelah ${TIME_LIMIT_MS / 1000} detik. Mungkin ada perulangan yang tidak pernah berhenti.${mode === "sql" ? " Database sandbox dikembalikan ke isi awal." : ""}</p>`;

  async function run() {
    const code = view!.state.doc.toString();
    busy(true);
    out.innerHTML = `<p class="muted">Menjalankan…</p>`;
    try {
      if (mode === "pseudocode") {
        const r = await pseudoRunner.run({ code, input: inputBox.value, trace: false });
        if (r.timeout) return void (out.innerHTML = timeoutMsg());
        out.innerHTML = pseudoOutput(r.value.output, r.value);
        mark({ error: r.value.error?.line });
      } else if (mysqlOn) {
        const l = current() as SqlLatihan | undefined;
        const r = await viaMysql(() => (l ? praktikCall("/api/praktik/latihan", { id: l.id, code, periksa: false }) : praktikCall("/api/praktik/run", { code })));
        if (r) out.innerHTML = (r.notice ? `<p class="term-warn">${esc(r.notice)}</p>` : "") + sqlOutput({ statements: r.statements });
        else if (r === null) await runSqlJs(code);
      } else await runSqlJs(code);
    } finally {
      busy(false);
    }
  }

  /**
   * Memanggil MySQL server. null = server tidak terjangkau, beralih ke sql.js (cadangan);
   * undefined = galat lain yang sudah ditampilkan (mis. sesi berakhir, perintah masih berjalan).
   */
  async function viaMysql(call: () => Promise<PraktikRun>): Promise<PraktikRun | null | undefined> {
    try {
      const r = await call();
      if (r.db !== undefined) dbNow = r.db;
      renderHead();
      return r;
    } catch (e) {
      if (e instanceof PraktikFail && (e.status === 0 || e.status === 503 || e.status >= 500)) {
        mysqlOn = false;
        renderHead();
        view?.dispatch({ effects: langConf.reconfigure(language()) });
        out.insertAdjacentHTML("afterbegin", `<p class="term-warn">Server MySQL tidak terjangkau. Memakai mesin SQL cadangan di browser.</p>`);
        return null;
      }
      out.innerHTML = `<p class="term-error">${esc(e instanceof Error ? e.message : String(e))}</p>`;
      return undefined;
    }
  }

  /** sql.js di browser; peringatan "beralih ke cadangan" (bila ada) tetap ditampilkan di atas. */
  async function runSqlJs(code: string) {
    const warn = out.querySelector(".term-warn")?.outerHTML ?? "";
    const l = current() as SqlLatihan | undefined;
    const ds = datasetOf(l);
    const r = await sqlRunner.run({ op: "run", datasetName: ds, datasetSql: datasetSql(ds), code, fresh: !!l, persiapan: l?.persiapan });
    out.innerHTML = warn + (r.timeout ? timeoutMsg() : sqlOutput(r.value));
  }

  async function check() {
    const l = current();
    if (!l) return;
    const code = view!.state.doc.toString();
    busy(true);
    out.innerHTML = `<p class="muted">Memeriksa…</p>`;
    try {
      let verdict: { ok: boolean; html: string };
      if (l.mode === "pseudocode") verdict = await checkPseudo(l, code);
      else verdict = await checkSql(l, code);
      if (verdict.ok) done.add(l.id);
      out.innerHTML = `<div class="verdict ${verdict.ok ? "pass" : "fail"}">${verdict.ok ? "✓ Benar! Latihan selesai." : "✗ Belum tepat."}</div>${verdict.html}`;
      renderList();
      renderHead();
    } finally {
      busy(false);
    }
  }

  async function checkPseudo(l: PseudoLatihan, code: string) {
    const rows: string[] = [];
    let ok = true;
    for (const [i, u] of l.uji.entries()) {
      const r = await pseudoRunner.run({ code, input: u.masukan, trace: false });
      let res: { ok: boolean; reason?: string };
      if (r.timeout) res = { ok: false, reason: `melewati batas ${TIME_LIMIT_MS / 1000} detik` };
      else if (!r.value.ok) res = { ok: false, reason: `baris ${r.value.error!.line}: ${r.value.error!.message}` };
      else res = compareOutput(r.value.output, u.keluaran);
      ok &&= res.ok;
      rows.push(`<tr class="${res.ok ? "pass" : "fail"}"><td>${res.ok ? "✓" : "✗"} Uji ${i + 1}</td><td><code>${esc(u.masukan) || "<i>(kosong)</i>"}</code></td><td>${res.ok ? "sesuai" : esc(res.reason ?? "")}</td></tr>`);
      if (!res.ok && !r.timeout && !r.value.ok) mark({ error: r.value.error!.line });
    }
    return { ok, html: `<table class="t-table"><thead><tr><th>Uji</th><th>Masukan</th><th>Hasil</th></tr></thead><tbody>${rows.join("")}</tbody></table>` };
  }

  async function checkSql(l: SqlLatihan, code: string) {
    if (mysqlOn) {
      const m = await viaMysql(() => praktikCall("/api/praktik/latihan", { id: l.id, code, periksa: true }));
      if (m === undefined) return { ok: false, html: out.innerHTML };
      if (m) {
        const err = m.statements.find((x) => x.error);
        if (err) return { ok: false, html: `<p class="term-error">${esc(err.error!)}</p>` };
        const ddl = !!l.periksa;
        if (!m.ok) return { ok: false, html: `<p>${esc(m.reason ?? "Hasil belum sesuai.")}</p>${ddl ? "" : sqlOutput({ statements: m.statements })}` };
        return { ok: true, html: ddl ? "<p>Struktur tabel sesuai.</p>" : sqlOutput({ statements: m.statements }) };
      }
    }
    const r = await sqlRunner.run({ op: "run", datasetName: l.dataset, datasetSql: datasetSql(l.dataset), code, fresh: true, persiapan: l.persiapan, periksa: l.periksa });
    if (r.timeout) return { ok: false, html: timeoutMsg() };
    const res = r.value;
    const failed = res.statements.find((s) => s.error) ?? (res.error ? { error: res.error } : undefined);
    if (failed) return { ok: false, html: `<p class="term-error">${esc(failed.error!)}</p>` };
    let got;
    if (l.periksa) got = res.periksa ?? [];
    else {
      const last = [...res.statements].reverse().find((s) => s.columns);
      got = last ? [{ columns: last.columns!, rows: last.rows! }] : [];
    }
    for (const [i, want] of l.harapan.entries()) {
      const c = compareResults(got[i], want, l.urut);
      if (!c.ok) {
        const hint = l.periksa ? "Struktur tabel belum sesuai permintaan soal." : esc(c.reason ?? "");
        return { ok: false, html: `<p>${hint}</p>${l.periksa ? "" : sqlOutput(res)}` };
      }
    }
    return { ok: true, html: l.periksa ? "<p>Struktur tabel sesuai.</p>" : sqlOutput(res) };
  }

  // ----- langkah demi langkah -----

  async function step() {
    const code = view!.state.doc.toString();
    busy(true);
    out.innerHTML = `<p class="muted">Menyiapkan jejak…</p>`;
    let r;
    try {
      r = await pseudoRunner.run({ code, input: inputBox.value, trace: true });
    } finally {
      busy(false);
    }
    if (r.timeout) return void (out.innerHTML = timeoutMsg());
    const res = r.value;
    if (!res.trace.length) {
      out.innerHTML = pseudoOutput(res.output, res);
      mark({ error: res.error?.line });
      return;
    }
    let pos = 0;
    out.innerHTML = `
      <div class="t-stepbar">
        <button type="button" data-s="first" title="Awal">⏮</button>
        <button type="button" data-s="prev" title="Mundur">◀</button>
        <button type="button" data-s="play" title="Putar otomatis">▶</button>
        <button type="button" data-s="next" title="Maju">▶|</button>
        <button type="button" data-s="last" title="Akhir">⏭</button>
        <span class="t-pos"></span>
        <input type="range" min="0" max="${res.trace.length - 1}" value="0" aria-label="Langkah">
      </div>
      <div class="t-split"><div class="t-trace"></div><pre class="t-console"></pre></div>`;
    const vars = res.varOrder.filter((v) => res.trace.some((t) => v in t.vars));
    const traceEl = out.querySelector<HTMLElement>(".t-trace")!;
    const consoleEl = out.querySelector<HTMLElement>(".t-console")!;
    const slider = out.querySelector<HTMLInputElement>("input[type=range]")!;
    const posEl = out.querySelector<HTMLElement>(".t-pos")!;
    let timer: number | undefined;

    function show(p: number) {
      pos = Math.max(0, Math.min(res.trace.length - 1, p));
      const t = res.trace[pos];
      const atEnd = pos === res.trace.length - 1;
      slider.value = String(pos);
      posEl.textContent = `langkah ${pos + 1} / ${res.trace.length}${res.traceTruncated && atEnd ? " (jejak dipotong)" : ""} · baris ${t.line}${t.note ? ` · ${t.note}` : ""}`;
      mark({ active: t.line, error: atEnd ? res.error?.line : undefined });
      // Tabel jejak: satu baris per langkah sampai langkah sekarang (seperti tabel di slide).
      const from = Math.max(0, pos - 199);
      const rows = res.trace.slice(from, pos + 1).map((s, k) => {
        const i = from + k;
        const prev = i > 0 ? res.trace[i - 1].vars : {};
        const cells = vars.map((v) => `<td class="${s.vars[v] !== prev[v] ? "chg" : ""}">${esc(s.vars[v] ?? "")}</td>`).join("");
        return `<tr class="${i === pos ? "cur" : ""}"><td class="muted">${i + 1}</td><td class="muted">${s.line}</td>${cells}</tr>`;
      });
      traceEl.innerHTML = `<table class="t-table trace"><thead><tr><th>#</th><th>baris</th>${vars.map((v) => `<th>${esc(v)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
      traceEl.scrollTop = traceEl.scrollHeight;
      const lines = res.output.slice(0, t.out);
      consoleEl.innerHTML = lines.map(esc).join("\n") + (atEnd && res.error ? `\n<span class="term-error">baris ${res.error.line}: ${esc(res.error.message)}</span>` : "");
    }
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      out.querySelector<HTMLButtonElement>("[data-s=play]")!.textContent = "▶";
    };
    out.querySelectorAll<HTMLButtonElement>("[data-s]").forEach((b) => {
      b.onclick = () => {
        const s = b.dataset.s;
        if (s === "play") {
          if (timer) return stop();
          b.textContent = "⏸";
          timer = window.setInterval(() => (pos >= res.trace.length - 1 ? stop() : show(pos + 1)), 450);
          return;
        }
        stop();
        show(s === "first" ? 0 : s === "prev" ? pos - 1 : s === "next" ? pos + 1 : res.trace.length - 1);
      };
    });
    slider.oninput = () => {
      stop();
      show(Number(slider.value));
    };
    show(0);
  }

  // ----- tampilan hasil -----

  function pseudoOutput(lines: string[], r: RunResult): string {
    const body = lines.length ? `<pre class="t-console">${lines.map(esc).join("\n")}</pre>` : `<p class="muted">(tidak ada keluaran)</p>`;
    const err = r.error ? `<p class="term-error">Galat di baris ${r.error.line}: ${esc(r.error.message)}</p>` : "";
    return body + err + (r.ok ? `<p class="muted small">Selesai dalam ${r.steps.toLocaleString("id-ID")} langkah.</p>` : "");
  }

  function sqlOutput(res: SqlResponse): string {
    if (res.error && !res.statements.length) return `<p class="term-error">${esc(res.error)}</p>`;
    if (!res.statements.length) return `<p class="muted">Tidak ada perintah untuk dijalankan.</p>`;
    return res.statements.map(statementHtml).join("") + (res.error ? `<p class="term-error">${esc(res.error)}</p>` : "");
  }

  function statementHtml(s: SqlStatementResult): string {
    const q = s.sql ? `<p class="t-sql"><code>${esc(s.sql.length > 120 ? s.sql.slice(0, 117) + "…" : s.sql)}</code></p>` : "";
    if (s.error) return q + `<p class="term-error">${esc(s.error)}</p>`;
    if (!s.columns) return q + `<p class="ok-line">OK${s.changes ? ` · ${s.changes} baris terpengaruh` : ""}</p>`;
    const rows = s.rows!.map((r) => `<tr>${r.map((v) => `<td>${v === null ? '<i class="muted">NULL</i>' : esc(String(v))}</td>`).join("")}</tr>`).join("");
    return q + `<div class="t-result"><table class="t-table"><thead><tr>${s.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted small">${s.rows!.length} baris${s.truncated ? " (dipotong; hanya 500 baris pertama yang ditampilkan)" : ""}</p>`;
  }

  // ----- tombol -----
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => (b.onclick = () => select(SANDBOX, b.dataset.mode as Mode)));
  $(".run").onclick = () => void run();
  $(".step").onclick = () => void step();
  $(".check").onclick = () => void check();
  $(".reset-code").onclick = () => {
    if (!confirm("Kembalikan kode awal? Kode yang sudah ditulis akan hilang.")) return;
    mountEditor(startCode());
    codes.delete(key());
  };
  $(".reset-data").onclick = async () => {
    if (mysqlOn) {
      if (!confirm("Hapus semua database praktikmu dan kembalikan akademik ke isi awal?")) return;
      const r = await viaMysql(() => praktikCall("/api/praktik/reset"));
      if (r) return void (out.innerHTML = `<p class="ok-line">Semua database praktikmu dihapus; akademik dikembalikan ke isi awal.</p>`);
      if (r === undefined) return;
    }
    await sqlRunner.run({ op: "reset", datasetName: sandboxDataset, datasetSql: "" });
    out.innerHTML = `<p class="ok-line">Database ${esc(sandboxDataset)} dikembalikan ke isi awal.</p>`;
  };
  datasetSel.onchange = () => {
    sandboxDataset = datasetSel.value;
    out.innerHTML = `<p class="muted">Memakai ${esc(datasetSel.selectedOptions[0].text)}.</p>`;
  };
  // Tombol game (WASD, E, Space) tidak boleh bocor saat mengetik di terminal.
  // Esc tetap diteruskan agar jendela bisa ditutup.
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") e.stopPropagation();
  });

  select(item, mode);
  view!.focus();
}
