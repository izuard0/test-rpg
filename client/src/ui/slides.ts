// Penampil slide kelas dengan presentasi bersama (tahap 4).
//
// Slide di bahan_ajar/ memakai pola yang sama: nomor slide di hash alamat ("#5") dan
// pindah halaman dengan tombol panah. Slide disajikan dari origin yang sama, jadi game
// bisa membaca nomor slide dosen dan menggerakkan slide mahasiswa tanpa mengubah berkasnya.
//
// Mode:
//   bebas      membaca sendiri (di luar presentasi)
//   presentasi dosen pemimpin: setiap pindah slide dikirim ke server
//   ikut       mahasiswa: mengikuti dosen; hanya boleh MUNDUR, tidak bisa maju melewati
//              slide dosen; tombol "Ikuti dosen" untuk kembali ke slide dosen

import type { Materi } from "@mita/shared";
import { net } from "../net/net";
import { GAME_BASE } from "../world/loader";
import { esc, openPanel } from "./panel";

export type SlideMode = "bebas" | "presentasi" | "ikut";

interface Viewer {
  mode: SlideMode;
  materi: Materi;
  iframe: HTMLIFrameElement;
  bar: HTMLElement;
  dosenName: string;
  /** Slide dosen terakhir yang diketahui (mode ikut). */
  dosenSlide: number;
  /** Nomor slide terakhir yang dikirim (mode presentasi). */
  sent: number;
  /** Sedang menggerakkan slide lewat kode (penjaga tombol tidak boleh memblokir). */
  driving: boolean;
  onEnd?: () => void;
}

let v: Viewer | null = null;
let timer: number | undefined;

const FORWARD = new Set(["ArrowRight", "PageDown", " ", "End"]);

const deckUrl = (m: Materi, n: number) => GAME_BASE + m.file.split("/").map(encodeURIComponent).join("/") + (n > 1 ? `#${n}` : "");

function deckWin(): Window | null {
  try {
    const w = v?.iframe.contentWindow;
    return w && w.document.readyState !== "loading" ? w : null;
  } catch {
    return null;
  }
}

function deckSlide(w: Window): number {
  return parseInt(w.location.hash.slice(1), 10) || 1;
}

/** Menggerakkan slide ke nomor `n` dengan menekan panah di dalam slide. */
function goTo(n: number): void {
  const w = deckWin();
  if (!w || !v) return;
  v.driving = true;
  try {
    for (let i = 0; i < 300; i++) {
      const cur = deckSlide(w);
      if (cur === n) break;
      w.dispatchEvent(new (w as Window & typeof globalThis).KeyboardEvent("keydown", { key: cur < n ? "ArrowRight" : "ArrowLeft", cancelable: true }));
      if (deckSlide(w) === cur) break; // sudah di ujung
    }
  } finally {
    v.driving = false;
  }
}

/** Mode ikut: tombol maju di dalam slide diblokir bila sudah di slide dosen. */
function installGuards(): void {
  const w = deckWin();
  if (!w) return;
  const blocked = () => !!v && v.mode === "ikut" && !v.driving && deckSlide(w) >= v.dosenSlide;
  w.addEventListener(
    "keydown",
    (e) => {
      if (!v || v.mode !== "ikut" || v.driving || !FORWARD.has(e.key)) return;
      if (e.key === "End" || blocked()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  w.document.addEventListener(
    "click",
    (e) => {
      if ((e.target as Element | null)?.closest?.("#nextBtn") && blocked()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}

function renderBar(): void {
  if (!v) return;
  const w = deckWin();
  const n = w ? deckSlide(w) : v.mode === "ikut" ? v.dosenSlide : 1;
  const title = `<span class="t">${esc(v.materi.course)} · ${esc(v.materi.title)}</span>`;
  if (v.mode === "presentasi") {
    v.bar.innerHTML = `<span class="live">● Presentasi</span>${title}<span class="n">slide ${n}</span>
      <button type="button" data-k="prev" title="Slide sebelumnya">◀</button><button type="button" data-k="next" title="Slide berikutnya">▶</button>
      <button type="button" class="danger" data-k="end">Akhiri presentasi</button>`;
  } else if (v.mode === "ikut") {
    const following = n >= v.dosenSlide;
    v.bar.innerHTML = following
      ? `<span class="live">● Mengikuti ${esc(v.dosenName)}</span>${title}<span class="n">slide ${n}</span>`
      : `<span class="off">Tidak mengikuti dosen</span>${title}<span class="n">slide ${n} · dosen di ${v.dosenSlide}</span>
         <button type="button" class="primary" data-k="follow">Ikuti dosen</button>`;
  } else {
    v.bar.innerHTML = `${title}<a target="_blank" rel="noopener">Buka di tab baru ↗</a>`;
    v.bar.querySelector("a")!.href = deckUrl(v.materi, n);
  }
  v.bar.querySelectorAll<HTMLButtonElement>("[data-k]").forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.k;
      const cur = deckWin() ? deckSlide(deckWin()!) : 1;
      if (k === "prev") goTo(cur - 1);
      else if (k === "next") goTo(cur + 1);
      else if (k === "follow" && v) goTo(v.dosenSlide);
      else if (k === "end") v?.onEnd?.();
      tick();
      v?.iframe.focus();
    };
  });
}

let lastBar = "";
function tick(): void {
  if (!v) return;
  const w = deckWin();
  if (!w) return;
  const n = deckSlide(w);
  if (v.mode === "presentasi" && n !== v.sent) {
    v.sent = n;
    net.send("classSlide", { n });
  }
  // Cadangan bila ada cara maju yang lolos dari penjaga (mis. gesekan layar sentuh).
  if (v.mode === "ikut" && n > v.dosenSlide) goTo(v.dosenSlide);
  const key = `${v.mode}|${deckSlide(w)}|${v.dosenSlide}`;
  if (key !== lastBar) {
    lastBar = key;
    renderBar();
  }
}

export function openSlideViewer(materi: Materi, mode: SlideMode, opts: { slide?: number; dosenName?: string; onEnd?: () => void } = {}): void {
  const start = Math.max(1, opts.slide ?? 1);
  const wrap = document.createElement("div");
  wrap.className = "materi slides";
  const bar = document.createElement("div");
  bar.className = "bar";
  const iframe = document.createElement("iframe");
  iframe.title = "Slide";
  iframe.src = deckUrl(materi, start);
  wrap.append(bar, iframe);
  window.clearInterval(timer);
  v = { mode, materi, iframe, bar, dosenName: opts.dosenName ?? "dosen", dosenSlide: start, sent: mode === "presentasi" ? start : 0, driving: false, onEnd: opts.onEnd };
  const mine = v;
  lastBar = "";
  iframe.addEventListener("load", () => {
    if (v !== mine) return;
    installGuards();
    // Bila slide dosen berubah selagi slide dimuat.
    if (v.mode === "ikut") goTo(v.dosenSlide);
    iframe.focus();
    tick();
  });
  openPanel({
    title: materi.file.split("/").pop() ?? materi.file,
    body: wrap,
    wide: true,
    onClose: () => {
      if (v === mine) {
        v = null;
        window.clearInterval(timer);
      }
    },
  });
  renderBar();
  timer = window.setInterval(tick, 200);
}

/** Mode penampil yang sedang terbuka (null = tidak ada). */
export function slideViewerMode(): SlideMode | null {
  return v?.mode ?? null;
}

export function slideViewerMateri(): Materi | null {
  return v?.materi ?? null;
}

/** Dosen pindah slide: penampil mahasiswa yang sedang mengikuti ikut pindah. */
export function dosenMovedSlide(n: number): void {
  if (!v || v.mode !== "ikut") return;
  const w = deckWin();
  const wasFollowing = !w || deckSlide(w) >= v.dosenSlide;
  v.dosenSlide = n;
  // Yang sedang membaca ulang slide sebelumnya dibiarkan; yang mengikuti dibawa ke slide dosen.
  // Bila dosen mundur melewati posisi mahasiswa, mahasiswa ikut mundur (tidak boleh di depan dosen).
  if (wasFollowing || (w && deckSlide(w) > n)) goTo(n);
  tick();
}

/** Presentasi selesai: penampil tetap terbuka tetapi bebas dibaca sendiri. */
export function presentationEnded(): void {
  if (!v || v.mode === "bebas") return;
  v.mode = "bebas";
  lastBar = "";
  tick();
  renderBar();
}
