// Sesi kelas (tahap 4): panel dosen di meja dosen (pilih materi, mulai/akhiri kelas,
// bagikan file) dan panel "Bahan kelas" untuk semua orang di ruang kelas.
//
// File bersama hanya bisa diunggah dosen (akun yang disetujui admin), disimpan sementara
// di server, dan hanya bisa diunduh peserta kelas itu.

import { FILE_EXTENSIONS, FILE_MAX_BYTES, FILE_TTL_MINUTES, allowedFileExt, type ClassState, type Materi, type SharedFile } from "@mita/shared";
import { net, serverUrl } from "../net/net";
import { openMaterial, type MateriCatalog } from "./content";
import { esc, isPanelOpen, openPanel } from "./panel";

/** Pembuka slide kelas (diisi WorldScene: memilih mode presentasi/ikut/bebas sesuai keadaan kelas). */
let slideOpener: ((m: Materi) => void) | null = null;
export function setSlideOpener(fn: (m: Materi) => void): void {
  slideOpener = fn;
}

export function openSlide(m: Materi): void {
  if (slideOpener) slideOpener(m);
  else openMaterial(m.course, { title: m.title, file: m.file });
}

/** Aksi presentasi di panel meja dosen. */
export interface PresentActions {
  start: () => void;
  resume: () => void;
  end: () => void;
}

/** Unduh lewat fetch (agar token login ikut di header), lalu simpan sebagai berkas. */
export async function downloadFile(f: SharedFile): Promise<void> {
  const sid = net.sessionId;
  if (!sid) return;
  const res = await fetch(`${serverUrl()}/api/files/${encodeURIComponent(f.token)}?session=${encodeURIComponent(sid)}`, { headers: net.authHeaders() }).catch(() => null);
  if (!res?.ok) {
    const msg = ((await res?.json().catch(() => null)) as { error?: string } | null)?.error;
    alert(msg ?? "Gagal mengunduh file.");
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtLeft = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m >= 1 ? `${m} menit lagi` : "segera kedaluwarsa";
};

function filesHtml(files: SharedFile[]): string {
  if (!files.length) return `<p class="muted">Belum ada file yang dibagikan.</p>`;
  return files
    .map(
      (f) => `<div class="kfile"><span class="ico">⬇</span><span class="nm">${esc(f.name)}<small class="muted">${fmtSize(f.size)} · dari ${esc(f.fromName)} · ${fmtLeft(f.expiresAt - Date.now())}</small></span>
        <button type="button" data-dl="${esc(f.token)}">Unduh</button></div>`,
    )
    .join("");
}

function bindDownloads(root: HTMLElement, files: SharedFile[]): void {
  root.querySelectorAll<HTMLButtonElement>("[data-dl]").forEach((b) => {
    const f = files.find((x) => x.token === b.dataset.dl);
    if (f) b.onclick = () => void downloadFile(f);
  });
}

/** Panel untuk semua peserta: materi yang sedang dibuka dosen + file bersama. */
export function openBahanKelas(state: ClassState, title: string): void {
  const root = document.createElement("div");
  root.className = "kelas-panel";
  if (!state.active) {
    root.innerHTML = `<p>Belum ada sesi kelas di ${esc(title)}. Notifikasi muncul saat dosen memulai kelas di meja dosen.</p>${state.files.length ? `<h3>File yang masih tersedia</h3><div class="flist">${filesHtml(state.files)}</div>` : ""}`;
  } else {
    root.innerHTML = `<p class="who">Dipimpin ${esc(state.dosenName ?? "dosen")}</p>
      <div class="kmateri"><span class="ico">▤</span><span><b>${esc(state.materi?.title ?? "")}</b><small class="muted">${esc(state.materi?.course ?? "")}</small></span>
        <button type="button" class="primary open">Buka slide</button></div>
      <h3>File bersama</h3><div class="flist">${filesHtml(state.files)}</div>
      <p class="muted small">Gunakan mode chat <b>Kelas</b> untuk berdiskusi dengan dosen dan teman sekelas.</p>`;
    root.querySelector<HTMLButtonElement>(".open")!.onclick = () => state.materi && openSlide(state.materi);
  }
  bindDownloads(root, state.files);
  openPanel({ title: "bahan-kelas/", body: root });
}

/** Panel dosen di meja dosen. `refresh` dipanggil ulang saat classState berubah. */
export function openDosenPanel(state: ClassState, myUid: string, catalog: MateriCatalog | undefined, roomTitle: string, present?: PresentActions): void {
  const root = document.createElement("div");
  root.className = "kelas-panel dosen";
  const items: Materi[] = (catalog?.courses ?? []).flatMap((c) => c.items.map((it) => ({ title: it.title, file: it.file, course: c.title })));
  const mine = state.active && state.dosenUid === myUid;
  const other = state.active && !mine;
  const options = items.map((m, i) => `<option value="${i}"${state.materi?.file === m.file ? " selected" : ""}>${esc(m.course)} · ${esc(m.title)}</option>`).join("");

  root.innerHTML = `
    <p class="who">${esc(roomTitle)} · ${state.active ? `kelas berjalan${other ? ` (dipimpin ${esc(state.dosenName ?? "")})` : ""}` : "belum dimulai"}</p>
    ${other ? `<p>Kelas ini sedang dipimpin dosen lain.</p>` : `
    <label class="field"><span>Materi dari bahan ajar</span><select class="pilih-materi">${options || "<option disabled>Belum ada materi di bahan_ajar/</option>"}</select></label>
    <div class="actions-row">
      ${mine ? `<button type="button" class="change">Ganti materi</button><button type="button" class="danger end">Akhiri kelas</button>` : `<button type="button" class="primary start">Mulai kelas</button>`}
      ${state.materi && !mine ? `<button type="button" class="open">Buka slide</button>` : ""}
    </div>
    ${
      mine
        ? `<div class="actions-row present">${
            state.presenting
              ? `<span class="live">● Presentasi berjalan · slide ${state.slide ?? 1}</span><button type="button" class="primary resume">Lanjutkan presentasi</button><button type="button" class="danger stop">Akhiri presentasi</button>`
              : `<button type="button" class="primary present">▶ Presentasikan</button><button type="button" class="open">Buka slide sendiri</button>`
          }</div>
    <p class="muted small">Presentasikan: slide terbuka otomatis di layar semua mahasiswa di ruangan dan mengikuti slide-mu. Mahasiswa hanya bisa mundur untuk membaca ulang.</p>`
        : ""
    }
    <p class="muted small">Saat kelas dimulai, semua orang di ruangan mendapat notifikasi untuk membuka slide, dan mode chat <b>Kelas</b> terbuka.</p>`}
    ${mine ? `
    <h3>Bagikan file ke mahasiswa di kelas ini</h3>
    <div class="share">
      <input type="file" class="file" accept="${FILE_EXTENSIONS.map((e) => "." + e).join(",")}">
      <label>Berlaku <select class="ttl">${FILE_TTL_MINUTES.map((m) => `<option value="${m}">${m} menit</option>`).join("")}</select></label>
      <button type="button" class="primary upload">Bagikan</button>
    </div>
    <p class="muted small">Maks. ${FILE_MAX_BYTES / 1024 / 1024} MB: ${FILE_EXTENSIONS.join(", ")}. File dihapus dari server setelah kedaluwarsa.</p>
    <p class="up-status" role="status"></p>
    <h3>File yang sedang dibagikan</h3><div class="flist">${filesHtml(state.files)}</div>` : ""}`;

  const sel = root.querySelector<HTMLSelectElement>(".pilih-materi");
  const chosen = () => (sel ? items[Number(sel.value)] : undefined);
  root.querySelector<HTMLButtonElement>(".start")?.addEventListener("click", () => {
    const m = chosen();
    if (m) net.send("classStart", { materi: m });
  });
  root.querySelector<HTMLButtonElement>(".change")?.addEventListener("click", () => {
    const m = chosen();
    if (m) net.send("classMateri", { materi: m });
  });
  root.querySelector<HTMLButtonElement>(".end")?.addEventListener("click", () => {
    if (confirm("Akhiri kelas? Obrolan Kelas akan ditutup.")) net.send("classEnd", {});
  });
  root.querySelector<HTMLButtonElement>(".open")?.addEventListener("click", () => state.materi && openSlide(state.materi));
  root.querySelector<HTMLButtonElement>(".present")?.addEventListener("click", () => present?.start());
  root.querySelector<HTMLButtonElement>(".resume")?.addEventListener("click", () => present?.resume());
  root.querySelector<HTMLButtonElement>(".stop")?.addEventListener("click", () => present?.end());
  root.querySelector<HTMLButtonElement>(".upload")?.addEventListener("click", () => void upload(root));
  root.addEventListener("keydown", (e) => e.key !== "Escape" && e.stopPropagation());
  bindDownloads(root, state.files);
  openPanel({ title: "meja-dosen/", body: root, wide: true });
}

async function upload(root: HTMLElement): Promise<void> {
  const status = root.querySelector<HTMLElement>(".up-status")!;
  const file = root.querySelector<HTMLInputElement>(".file")!.files?.[0];
  const ttl = root.querySelector<HTMLSelectElement>(".ttl")!.value;
  const say = (t: string, bad = false) => {
    status.textContent = t;
    status.classList.toggle("bad", bad);
  };
  if (!file) return say("Pilih file dulu.", true);
  if (!allowedFileExt(file.name)) return say("Jenis file ini tidak boleh dibagikan.", true);
  if (file.size > FILE_MAX_BYTES) return say(`File terlalu besar (maks. ${FILE_MAX_BYTES / 1024 / 1024} MB).`, true);
  const sid = net.sessionId;
  if (!sid) return say("Tidak tersambung ke server.", true);
  say(`Mengunggah ${file.name}…`);
  try {
    const res = await fetch(`${serverUrl()}/api/kelas/files?session=${encodeURIComponent(sid)}&ttl=${ttl}`, {
      method: "POST",
      headers: { ...net.authHeaders(), "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
      body: file,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return say(body.error ?? `Gagal (${res.status}).`, true);
    say(`${file.name} dibagikan ke kelas (berlaku ${ttl} menit).`);
  } catch {
    say("Gagal mengunggah: koneksi terputus.", true);
  }
}

/** Memperbarui daftar file di panel yang sedang terbuka tanpa membangun ulang panelnya. */
export function refreshFileLists(state: ClassState): void {
  document.querySelectorAll<HTMLElement>(".kelas-panel .flist").forEach((el) => {
    el.innerHTML = filesHtml(state.files);
    bindDownloads(el, state.files);
  });
}

/** Panel kelas yang terbuka (untuk dibangun ulang saat state berubah), bila ada. */
export function kelasPanelOpen(): "dosen" | "bahan" | null {
  if (!isPanelOpen()) return null;
  return document.querySelector(".kelas-panel.dosen") ? "dosen" : document.querySelector(".kelas-panel") ? "bahan" : null;
}
