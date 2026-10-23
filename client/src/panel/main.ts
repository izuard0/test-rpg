// Panel admin (/panel): menyetujui akun mahasiswa dan dosen, menolak, menonaktifkan,
// menghapus, dan me-reset kata sandi. Semua persetujuan manual (keputusan 23 Okt 2026).
// Login admin dari env server ADMIN_USERNAME + ADMIN_PASSWORD; sesi berupa cookie httpOnly.

import "./panel.css";

type Status = "menunggu" | "disetujui" | "ditolak" | "nonaktif";
type Action = "setujui" | "tolak" | "nonaktifkan" | "aktifkan" | "hapus";

interface Row {
  uid: string;
  id: string;
  fullName: string;
  role: "mahasiswa" | "dosen";
  status: Status;
  hasCharacter: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  reviewedAt: string | null;
  lastLoginAt: string | null;
}

const app = document.getElementById("app")!;
const whoEl = document.querySelector<HTMLElement>(".top .who")!;
const logoutBtn = document.querySelector<HTMLButtonElement>(".top .logout")!;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "x-mita-panel": "1", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Gagal (${res.status}).`, res.status);
  return data;
}

// ---------- masuk ----------

function showLogin(enabled: boolean, message = ""): void {
  whoEl.hidden = logoutBtn.hidden = true;
  if (!enabled) {
    app.innerHTML = `<section class="card narrow">
      <h1>Panel admin belum aktif</h1>
      <p>Atur environment variable <code>ADMIN_USERNAME</code> dan <code>ADMIN_PASSWORD</code>
      (minimal 12 karakter) di server, lalu deploy ulang.</p></section>`;
    return;
  }
  app.innerHTML = `<section class="card narrow">
    <h1>Masuk sebagai admin</h1>
    <form novalidate>
      <label>Username<input name="username" autocomplete="username" required autofocus></label>
      <label>Kata sandi<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="error" role="alert" ${message ? "" : "hidden"}>${esc(message)}</p>
      <button class="primary" type="submit">Masuk</button>
    </form></section>`;
  const f = app.querySelector("form")!;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    const btn = f.querySelector<HTMLButtonElement>("button")!;
    btn.disabled = true;
    try {
      await api("POST", "/api/admin/login", { username: d.get("username"), password: d.get("password") });
      await showAccounts();
    } catch (err) {
      showLogin(true, err instanceof Error ? err.message : String(err));
    }
  };
}

// ---------- daftar akun ----------

const TABS: { key: Status | "semua"; label: string }[] = [
  { key: "menunggu", label: "Menunggu" },
  { key: "disetujui", label: "Disetujui" },
  { key: "ditolak", label: "Ditolak" },
  { key: "nonaktif", label: "Nonaktif" },
  { key: "semua", label: "Semua" },
];

/** Aksi yang tersedia untuk tiap status (sama dengan aturan di server). */
const ACTIONS: Record<Status, Action[]> = {
  menunggu: ["setujui", "tolak", "hapus"],
  disetujui: ["nonaktifkan"],
  ditolak: ["setujui", "hapus"],
  nonaktif: ["aktifkan", "hapus"],
};
const ACTION_LABEL: Record<Action, string> = { setujui: "Setujui", tolak: "Tolak", nonaktifkan: "Nonaktifkan", aktifkan: "Aktifkan", hapus: "Hapus" };
const ACTION_CLASS: Record<Action, string> = { setujui: "primary", tolak: "danger", nonaktifkan: "danger", aktifkan: "", hapus: "danger ghost" };
const CONFIRM: Partial<Record<Action, string>> = {
  tolak: "Tolak pendaftaran {n}? Pengguna tidak bisa masuk; NIM/NIP tetap terpakai sampai akunnya dihapus.",
  nonaktifkan: "Nonaktifkan {n}? Pengguna langsung dikeluarkan dari game dan tidak bisa masuk.",
  hapus: "Hapus {n} secara permanen? Avatar ikut terhapus, dan NIM/NIP bisa dipakai mendaftar lagi.",
};

const state = {
  tab: "menunggu" as Status | "semua",
  query: "",
  rows: [] as Row[],
  persistent: true,
  selected: new Set<string>(),
  flash: "",
};

async function showAccounts(): Promise<void> {
  const me = await api<{ enabled: boolean; admin: string | null }>("GET", "/api/admin/me");
  if (!me.admin) return showLogin(me.enabled);
  whoEl.textContent = me.admin;
  whoEl.hidden = logoutBtn.hidden = false;
  await reload();
}

async function reload(): Promise<void> {
  try {
    const r = await api<{ persistent: boolean; accounts: Row[] }>("GET", "/api/admin/accounts");
    state.rows = r.accounts;
    state.persistent = r.persistent;
    const uids = new Set(r.accounts.map((a) => a.uid));
    for (const id of state.selected) if (!uids.has(id)) state.selected.delete(id);
    render();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return showLogin(true, "Sesi admin berakhir. Silakan masuk lagi.");
    state.flash = e instanceof Error ? e.message : String(e);
    render();
  }
}

function visibleRows(): Row[] {
  const q = state.query.trim().toLowerCase();
  return state.rows.filter(
    (r) => (state.tab === "semua" || r.status === state.tab) && (!q || r.fullName.toLowerCase().includes(q) || r.id.includes(q)),
  );
}

function render(): void {
  const counts = Object.fromEntries(TABS.map((t) => [t.key, t.key === "semua" ? state.rows.length : state.rows.filter((r) => r.status === t.key).length]));
  // Nama yang sama dipakai lebih dari satu akun: perlu diperiksa (nama bisa kembar, tetapi juga bisa akun ganda).
  const nameCount = new Map<string, number>();
  for (const r of state.rows) nameCount.set(r.fullName.toLowerCase(), (nameCount.get(r.fullName.toLowerCase()) ?? 0) + 1);
  const rows = visibleRows();
  const allChecked = rows.length > 0 && rows.every((r) => state.selected.has(r.uid));
  const sel = state.rows.filter((r) => state.selected.has(r.uid));
  const bulk = (["setujui", "tolak", "nonaktifkan", "aktifkan", "hapus"] as Action[]).filter((a) => sel.some((r) => ACTIONS[r.status].includes(a)));

  app.innerHTML = `
    ${state.persistent ? "" : `<p class="warn"><b>Mode uji:</b> server belum tersambung ke database (DATABASE_URL). Akun hilang saat server dimulai ulang.</p>`}
    ${state.flash ? `<p class="flash" role="status">${esc(state.flash)}</p>` : ""}
    <nav class="tabs" role="tablist">${TABS.map(
      (t) => `<button type="button" role="tab" data-tab="${t.key}" aria-selected="${state.tab === t.key}">${t.label}<span class="count${t.key === "menunggu" && counts[t.key] ? " hot" : ""}">${counts[t.key]}</span></button>`,
    ).join("")}</nav>
    <div class="toolbar">
      <input type="search" class="search" placeholder="Cari nama atau NIM/NIP" value="${esc(state.query)}" aria-label="Cari akun">
      <button type="button" class="refresh" title="Muat ulang daftar">↻ Muat ulang</button>
    </div>
    <div class="bulk" ${sel.length ? "" : "hidden"}>
      <span><b>${sel.length}</b> dipilih</span>
      ${bulk.map((a) => `<button type="button" class="${ACTION_CLASS[a]}" data-bulk="${a}">${ACTION_LABEL[a]}</button>`).join("")}
      <button type="button" class="ghost clear">Batal pilih</button>
    </div>
    ${
      rows.length
        ? `<div class="table-wrap"><table>
      <thead><tr>
        <th class="ck"><input type="checkbox" class="all" aria-label="Pilih semua" ${allChecked ? "checked" : ""}></th>
        <th>Nama lengkap</th><th>NIM / NIP</th><th>Peran</th><th>Status</th><th>Daftar</th><th>Terakhir masuk</th><th class="act">Aksi</th>
      </tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr data-uid="${r.uid}">
        <td class="ck"><input type="checkbox" class="one" aria-label="Pilih ${esc(r.fullName)}" ${state.selected.has(r.uid) ? "checked" : ""}></td>
        <td><b>${esc(r.fullName)}</b>${(nameCount.get(r.fullName.toLowerCase()) ?? 0) > 1 ? ` <span class="tag warn-tag" title="Ada akun lain dengan nama yang sama">nama sama</span>` : ""}${r.mustChangePassword ? ` <span class="tag">sandi sementara</span>` : ""}</td>
        <td class="mono">${esc(r.id)}</td>
        <td><span class="role ${r.role}">${r.role === "dosen" ? "Dosen" : "Mahasiswa"}</span></td>
        <td><span class="status ${r.status}">${r.status}</span></td>
        <td class="muted">${fmt(r.createdAt)}</td>
        <td class="muted">${fmt(r.lastLoginAt)}</td>
        <td class="act">${ACTIONS[r.status].map((a) => `<button type="button" class="${ACTION_CLASS[a]}" data-act="${a}">${ACTION_LABEL[a]}</button>`).join("")}
          ${r.status === "disetujui" ? `<button type="button" class="ghost" data-reset>Reset sandi</button>` : ""}</td>
      </tr>`,
        )
        .join("")}</tbody></table></div>`
        : `<p class="empty">${state.query ? "Tidak ada akun yang cocok." : state.tab === "menunggu" ? "Tidak ada pendaftaran yang menunggu. 🎉" : "Belum ada akun di sini."}</p>`
    }
    <p class="muted small">Periksa NIM/NIP dan nama lengkap dengan daftar kelas sebelum menyetujui. Akun <b>dosen</b> mendapat hak lebih (memulai kelas, membagikan file), jadi pastikan NIP-nya benar.</p>`;

  app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => {
    b.onclick = () => {
      state.tab = b.dataset.tab as Status | "semua";
      state.selected.clear();
      state.flash = "";
      render();
    };
  });
  const search = app.querySelector<HTMLInputElement>(".search")!;
  search.oninput = () => {
    state.query = search.value;
    render();
    const s = app.querySelector<HTMLInputElement>(".search")!;
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  };
  app.querySelector<HTMLButtonElement>(".refresh")!.onclick = () => void reload();
  app.querySelector<HTMLInputElement>(".all")?.addEventListener("change", (e) => {
    for (const r of rows) (e.target as HTMLInputElement).checked ? state.selected.add(r.uid) : state.selected.delete(r.uid);
    render();
  });
  app.querySelectorAll<HTMLInputElement>(".one").forEach((c) => {
    c.onchange = () => {
      const uid = c.closest("tr")!.dataset.uid!;
      c.checked ? state.selected.add(uid) : state.selected.delete(uid);
      render();
    };
  });
  app.querySelector<HTMLButtonElement>(".clear")?.addEventListener("click", () => {
    state.selected.clear();
    render();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-bulk]").forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.bulk as Action;
      void act(a, sel.filter((r) => ACTIONS[r.status].includes(a)));
    };
  });
  app.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((b) => {
    const r = state.rows.find((x) => x.uid === b.closest("tr")!.dataset.uid)!;
    b.onclick = () => void act(b.dataset.act as Action, [r]);
  });
  app.querySelectorAll<HTMLButtonElement>("[data-reset]").forEach((b) => {
    const r = state.rows.find((x) => x.uid === b.closest("tr")!.dataset.uid)!;
    b.onclick = () => void resetPassword(r);
  });
}

async function act(action: Action, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const who = rows.length === 1 ? rows[0].fullName : `${rows.length} akun`;
  const q = CONFIRM[action];
  if (q && !confirm(q.replace("{n}", who))) return;
  try {
    const r = await api<{ done: number; skipped: string[] }>("POST", "/api/admin/accounts/action", { ids: rows.map((x) => x.uid), action });
    state.flash = `${ACTION_LABEL[action]}: ${r.done} akun.${r.skipped.length ? ` Dilewati: ${r.skipped.join(", ")}.` : ""}`;
    for (const x of rows) state.selected.delete(x.uid);
  } catch (e) {
    state.flash = e instanceof Error ? e.message : String(e);
  }
  await reload();
}

async function resetPassword(r: Row): Promise<void> {
  if (!confirm(`Reset kata sandi ${r.fullName} (${r.id})? Kata sandi lama tidak berlaku lagi dan pengguna dikeluarkan dari game.`)) return;
  try {
    const { password } = await api<{ password: string }>("POST", "/api/admin/accounts/reset-password", { id: r.uid });
    showDialog(
      "Kata sandi sementara",
      `<p>Berikan kata sandi ini kepada <b>${esc(r.fullName)}</b> secara langsung (jangan di grup). Setelah masuk, ia wajib membuat kata sandi baru.</p>
       <p class="secret"><code>${esc(password)}</code> <button type="button" class="copy">Salin</button></p>
       <p class="muted small">Kata sandi ini hanya ditampilkan sekali.</p>`,
      (box) => {
        box.querySelector<HTMLButtonElement>(".copy")!.onclick = async (e) => {
          await navigator.clipboard?.writeText(password).catch(() => undefined);
          (e.target as HTMLButtonElement).textContent = "Tersalin";
        };
      },
    );
  } catch (e) {
    state.flash = e instanceof Error ? e.message : String(e);
  }
  await reload();
}

function showDialog(title: string, html: string, bind: (box: HTMLElement) => void): void {
  const back = document.createElement("div");
  back.className = "backdrop";
  back.innerHTML = `<section class="card dialog" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>${html}<div class="row"><button type="button" class="primary ok">Selesai</button></div></section>`;
  const close = () => back.remove();
  back.querySelector<HTMLButtonElement>(".ok")!.onclick = close;
  back.addEventListener("keydown", (e) => e.key === "Escape" && close());
  document.body.append(back);
  bind(back);
  back.querySelector<HTMLButtonElement>(".ok")!.focus();
}

logoutBtn.onclick = async () => {
  await api("POST", "/api/admin/logout").catch(() => undefined);
  state.rows = [];
  state.selected.clear();
  showLogin(true);
};

// Pendaftaran baru muncul sendiri tanpa memuat ulang halaman.
setInterval(() => {
  const typing = document.activeElement?.classList.contains("search");
  if (!logoutBtn.hidden && !typing && !document.querySelector(".backdrop") && document.visibilityState === "visible") void reload();
}, 30_000);

showAccounts().catch((e) => {
  app.innerHTML = `<section class="card narrow"><h1>Tidak bisa memuat panel</h1><p>${esc(e instanceof Error ? e.message : String(e))}</p></section>`;
});
