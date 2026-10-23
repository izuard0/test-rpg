// Halaman awal: judul, lalu Masuk atau Daftar. Selesai saat pemain berhasil masuk.

import { PASSWORD_MIN, ROLE_ID_LABEL, type FieldErrors, type Role } from "@mita/shared";
import { AuthError, type Account, type AuthService } from "../auth";

type Screen = "home" | "login" | "register";

export function showTitle(auth: AuthService): Promise<Account> {
  const el = document.getElementById("title")!;
  el.hidden = false;

  return new Promise((resolve) => {
    const done = (acc: Account) => resolve(acc);

    const testBadge = auth.testMode
      ? `<p class="test-mode" role="note"><b>Mode uji.</b> Akun hanya tersimpan di browser ini dan belum diverifikasi ke daftar kelas.</p>`
      : "";

    function render(screen: Screen) {
      const card = screen === "home" ? home() : screen === "login" ? login() : register();
      el.replaceChildren(card);
      card.querySelector<HTMLElement>("[autofocus]")?.focus();
    }

    function brand(): string {
      return `<header class="brand">
          <h1>MITA</h1>
          <p>Mayantara Interaktif Tatap-maya Akademik</p>
          <p class="sub">Gedung Prodi Informatika</p>
        </header>`;
    }

    function home(): HTMLElement {
      const card = document.createElement("section");
      card.className = "title-card";
      card.innerHTML = `${brand()}
        <div class="actions">
          <button class="primary" data-go="login" autofocus>Masuk</button>
          <button class="secondary" data-go="register">Daftar akun baru</button>
        </div>${testBadge}`;
      card.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((b) => (b.onclick = () => render(b.dataset.go as Screen)));
      return card;
    }

    function field(name: string, label: string, attrs: string, hint = ""): string {
      return `<label class="field" data-field="${name}"><span>${label}</span><input name="${name}" ${attrs}>
        ${hint ? `<small class="hint">${hint}</small>` : ""}<small class="err" hidden></small></label>`;
    }

    function form(title: string, inner: string, submit: string, swap: string): HTMLElement {
      const card = document.createElement("section");
      card.className = "title-card";
      card.innerHTML = `${brand()}
        <form novalidate>
          <h2>${title}</h2>
          ${inner}
          <p class="form-error" role="alert" hidden></p>
          <button class="primary" type="submit">${submit}</button>
        </form>
        <p class="swap">${swap}</p>
        <button class="link back" type="button">← Kembali</button>${testBadge}`;
      card.querySelector<HTMLButtonElement>(".back")!.onclick = () => render("home");
      card.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((b) => (b.onclick = () => render(b.dataset.go as Screen)));
      // Tombol game tidak boleh ikut bereaksi saat mengetik.
      card.addEventListener("keydown", (e) => e.stopPropagation());
      return card;
    }

    function showErrors(card: HTMLElement, err: unknown) {
      const fields: FieldErrors = err instanceof AuthError ? err.fields : {};
      card.querySelectorAll<HTMLElement>("[data-field]").forEach((f) => {
        const msg = fields[f.dataset.field as keyof FieldErrors];
        const small = f.querySelector<HTMLElement>(".err")!;
        small.textContent = msg ?? "";
        small.hidden = !msg;
        f.classList.toggle("invalid", !!msg);
      });
      const box = card.querySelector<HTMLElement>(".form-error")!;
      box.textContent = err instanceof Error ? err.message : String(err);
      box.hidden = false;
      card.querySelector<HTMLElement>(".invalid input")?.focus();
    }

    async function submitting(card: HTMLElement, run: () => Promise<Account>) {
      const btn = card.querySelector<HTMLButtonElement>("button[type=submit]")!;
      btn.disabled = true;
      try {
        done(await run());
      } catch (e) {
        showErrors(card, e);
        btn.disabled = false;
      }
    }

    function login(): HTMLElement {
      const card = form(
        "Masuk",
        field("id", "NIM / NIP", `inputmode="numeric" autocomplete="username" autofocus required`) +
          field("password", "Kata sandi", `type="password" autocomplete="current-password" required`),
        "Masuk",
        `Belum punya akun? <button class="link" type="button" data-go="register">Daftar</button>`,
      );
      const f = card.querySelector("form")!;
      f.onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(f);
        void submitting(card, () => auth.login(String(d.get("id")), String(d.get("password"))));
      };
      return card;
    }

    function register(): HTMLElement {
      let role: Role = "mahasiswa";
      const card = form(
        "Daftar akun",
        `<div class="role" role="radiogroup" aria-label="Peran">
            <button type="button" role="radio" data-role="mahasiswa" aria-checked="true">Mahasiswa</button>
            <button type="button" role="radio" data-role="dosen" aria-checked="false">Dosen</button>
          </div>` +
          field("id", `<span class="id-label">NIM</span>`, `inputmode="numeric" autocomplete="username" autofocus required`) +
          field("fullName", "Nama lengkap", `autocomplete="name" maxlength="60" required`, "Sesuai daftar kelas. Nama ini tampil di atas kepala avatar.") +
          field("password", "Kata sandi", `type="password" autocomplete="new-password" required`, `Minimal ${PASSWORD_MIN} karakter.`) +
          field("password2", "Ulangi kata sandi", `type="password" autocomplete="new-password" required`),
        "Lanjut: buat avatar →",
        `Sudah punya akun? <button class="link" type="button" data-go="login">Masuk</button>`,
      );
      card.querySelectorAll<HTMLButtonElement>("[data-role]").forEach((b) => {
        b.onclick = () => {
          role = b.dataset.role as Role;
          card.querySelectorAll("[data-role]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
          card.querySelector(".id-label")!.textContent = ROLE_ID_LABEL[role];
        };
      });
      const f = card.querySelector("form")!;
      f.onsubmit = (e) => {
        e.preventDefault();
        const d = new FormData(f);
        const s = (k: string) => String(d.get(k) ?? "");
        void submitting(card, () =>
          auth.register({ role, id: s("id"), fullName: s("fullName"), password: s("password"), password2: s("password2") }),
        );
      };
      return card;
    }

    render("home");
  });
}

/** Menghapus formulir; `keepBackground` mempertahankan gambar latar (mis. di belakang kreator avatar). */
export function hideTitle(keepBackground = false): void {
  const el = document.getElementById("title")!;
  el.replaceChildren();
  el.hidden = !keepBackground;
}
