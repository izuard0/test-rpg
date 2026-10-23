// Isi panel untuk tiap jenis benda interaktif. Teks NPC dan papan masih
// penampung sampai ada naskah dari pemilik proyek.

import type { Interactable } from "@mita/shared";
import { GAME_BASE } from "../world/loader";
import { esc, openPanel } from "./panel";

export interface MateriItem { title: string; file: string; week?: number }
export interface MateriCatalog { courses: { code: string; title: string; items: MateriItem[] }[] }

/** Label aksi yang tampil di penanda "[Space] ...". */
export function actionLabel(it: Interactable): string {
  const p = it.props;
  switch (it.kind) {
    case "door": return `Masuk · ${p.label ?? it.name}`;
    case "materi": return "Baca materi";
    case "terminal": return "Pakai komputer praktik";
    case "seat": return `Duduk · kursi ${p.seatId ?? ""}`;
    case "npc": return "Bicara";
    case "board": return "Baca papan";
    case "exhibit": return "Lihat pameran";
    case "info": return p.info === "web_informatika" ? "Buka situs Informatika" : "Tanya informasi";
    case "teacher_desk": return "Meja dosen";
    default: return "Periksa";
  }
}

const TEXT: Record<string, { title: string; body: string }> = {
  "npc:pustakawan": {
    title: "pustakawan.sh",
    body: `<p class="who">Pustakawan</p>
      <p>Selamat datang di <b>Perpustakaan Al-Khawarizmi</b>. Ini ruang tenang: obrolan hanya terdengar dalam radius 3 petak.</p>
      <ul>
        <li><b>Meja baca</b>: duduk di meja mana saja untuk membuka semua materi kuliah.</li>
        <li><b>Bilik komputer</b> di dekat pintu bawah untuk praktik SQL dan pseudocode.</li>
      </ul>`,
  },
  "board:pengumuman": {
    title: "pengumuman.txt",
    body: `<p>Belum ada pengumuman. Kelak papan ini menampilkan pengumuman prodi dan papan peringkat.</p>`,
  },
  "exhibit:prestasi": {
    title: "lemari_piala.md",
    body: `<p>Lemari prestasi mahasiswa Informatika. Isi daftar prestasi menyusul.</p>`,
  },
  "exhibit:robot": {
    title: "etalase_robot.md",
    body: `<p>Pameran proyek robotika dan IoT mahasiswa. Isi menyusul.</p>`,
  },
  "info:bantuan": {
    title: "resepsionis.sh",
    body: `<p class="who">Resepsionis</p><p>Butuh bantuan? Gerak dengan panah/WASD, tekan <kbd>Space</kbd> (atau <kbd>E</kbd>) di dekat benda yang ditandai panah, <kbd>Esc</kbd> untuk menutup jendela, <kbd>C</kbd> untuk mengubah karakter.</p>`,
  },
  "info:peta": {
    title: "peta_gedung.txt",
    body: `<pre class="map">
 ┌───────────┬─────────────┬───────────────┬──────────┐
 │ Lab       │ Ruang       │ Auditorium    │ Bilik    │
 │ Lovelace  │ Kolaborasi  │ Turing        │ Fokus    │
 ├───────────┴─────────────┴───────────────┴──────────┤
 │                    K O R I D O R                   │
 ├────────────────┬─────────────────────┬─────────────┤
 │ Lobi           │ Perpustakaan        │ Ruang Santai│
 │                │ Al-Khawarizmi       │ Diskusi B   │
 └──────┤pintu├───┴─────────────────────┴─────────────┘</pre>`,
  },
  "info:kafe": {
    title: "kafe.sh",
    body: `<p>Kopi dan teh tersedia. (Dekorasi; belum ada fitur.)</p>`,
  },
};

/** Situs resmi prodi, dibuka dari kios di lobi. */
export const WEB_INFORMATIKA = "https://informatika.untan.ac.id/";

export function openInfo(it: Interactable): void {
  if (it.props.info === "web_informatika") return openWeb(WEB_INFORMATIKA, "informatika.untan.ac.id");
  const sub = String(it.props.npc ?? it.props.board ?? it.props.exhibit ?? it.props.info ?? it.props.role ?? "");
  const t = TEXT[`${it.kind}:${sub}`] ?? { title: `${it.name}.txt`, body: `<p>${esc(it.name.replace(/_/g, " "))}</p>` };
  openPanel({ title: t.title, body: t.body });
}

/**
 * Jendela berisi situs luar (iframe). Bila situs itu menolak ditampilkan di dalam bingkai
 * (X-Frame-Options), isinya kosong: tombol "Buka di tab baru" selalu tersedia.
 */
export function openWeb(url: string, title: string): void {
  const wrap = document.createElement("div");
  wrap.className = "materi web";
  wrap.innerHTML = `<div class="bar"><span>${esc(title)} <span class="muted">· tidak tampil? buka di tab baru</span></span><a target="_blank" rel="noopener noreferrer">Buka di tab baru ↗</a></div>
    <iframe title="${esc(title)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"></iframe>`;
  wrap.querySelector("a")!.href = url;
  wrap.querySelector("iframe")!.src = url;
  openPanel({ title, body: wrap, wide: true });
}

/** Katalog materi (sama di keenam meja baca): folder per mata kuliah, berkas per pertemuan. */
export function openCatalog(catalog: MateriCatalog | undefined): void {
  const list = document.createElement("div");
  list.className = "files";
  const courses = catalog?.courses.filter((c) => c.items.length) ?? [];
  if (!courses.length) {
    list.innerHTML = `<p class="muted">Belum ada materi. Dosen dapat menaruh slide HTML di <code>bahan_ajar/&lt;Mata Kuliah&gt;/</code>.</p>`;
  }
  for (const course of courses) {
    const h = document.createElement("p");
    h.className = "folder";
    h.innerHTML = `<span class="ico">▸</span> ${esc(course.title)}/ <span class="muted">${course.items.length} berkas</span>`;
    list.append(h);
    for (const item of course.items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "file";
      const week = item.week ? `<span class="muted">${String(item.week).padStart(2, "0")}</span>` : "";
      b.innerHTML = `<span class="ico">▤</span>${week}<span>${esc(item.title)}</span>`;
      b.onclick = () => openMaterial(course.title, item);
      list.append(b);
    }
  }
  openPanel({ title: "~/perpustakaan/materi/", body: list });
  list.querySelector<HTMLButtonElement>(".file")?.focus();
}

export function openMaterial(courseTitle: string, item: MateriItem): void {
  const url = GAME_BASE + item.file.split("/").map(encodeURIComponent).join("/");
  const wrap = document.createElement("div");
  wrap.className = "materi";
  wrap.innerHTML = `<div class="bar"><span>${esc(courseTitle)} · ${esc(item.title)}</span><a target="_blank" rel="noopener">Buka di tab baru ↗</a></div><iframe title="Materi"></iframe>`;
  wrap.querySelector("a")!.href = url;
  wrap.querySelector("iframe")!.src = url;
  openPanel({ title: item.file.split("/").pop() ?? item.file, body: wrap, wide: true });
}

/** Terminal praktik dimuat terpisah (CodeMirror, worker) saat pertama kali dibuka. */
export function openTerminal(): void {
  import("../terminal/terminal")
    .then((m) => m.openTerminal())
    .catch((e: unknown) => openPanel({ title: "terminal — praktik", body: `<p class="term-error">Gagal memuat terminal: ${esc(String(e))}</p>` }));
}
