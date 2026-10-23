// Kreator karakter: versi game dari panel prototipe (tanpa alat setel kepala).

import { allowedSets, defaultChoice, headPalette, sanitizeChoice, type CharacterChoice, type Gender } from "@mita/shared";
import type { CharacterAssembler } from "../char/assembler";
import { DIRECTIONS } from "../char/assembler";
import { closePanel, esc, openPanel } from "./panel";

export interface CreatorOptions {
  /** Nama lengkap pemilik akun (hanya ditampilkan; tidak bisa diubah di sini). */
  name: string;
  /** Pilihan sekarang; `null` = avatar baru. */
  choice: CharacterChoice | null;
  /** Langkah wajib setelah registrasi: jendela tidak bisa ditutup. */
  required?: boolean;
  /** Menyimpan pilihan; galat yang dilempar ditampilkan di bawah tombol. */
  onSave: (choice: CharacterChoice) => Promise<void> | void;
}

export function openCreator(asm: CharacterAssembler, opts: CreatorOptions): void {
  const cfg = asm.cfg;
  let st: CharacterChoice = opts.choice ? sanitizeChoice(cfg, opts.choice) : defaultChoice(cfg, "L");

  const root = document.createElement("div");
  root.className = "creator";
  root.innerHTML = `
    <div class="preview"><div class="dirs"></div>
      <div class="name"><span class="muted small">Nama di atas kepala</span><b>${esc(opts.name)}</b></div>
      <button class="primary save" type="button">${opts.required ? "Simpan & masuk ke kampus" : "Simpan avatar"}</button>
      <p class="form-error" role="alert" hidden></p>
    </div>
    <div class="options">
      <h3>Jenis kelamin</h3><div class="chips" data-k="gender"></div>
      <h3>Kepala</h3><div class="grid heads"></div>
      <h3 class="hc-title"></h3><div class="sw hc"></div>
      <h3>Baju</h3><div class="grid sets"></div>
      <p class="muted small hijab-note">Untuk kepala berhijab, baju yang tersedia sementara Hoodie dan Flanel.</p>
      <h3>Warna atasan</h3><div class="sw top"></div>
      <h3>Warna kulit</h3><div class="sw skin"></div>
      <h3>Aksesori</h3>
      <div class="acc"><span>Kacamata</span><div class="chips" data-slot="glasses"></div></div>
      <div class="acc"><span>Kepala</span><div class="chips" data-slot="headgear"></div></div>
      <div class="acc"><span>Tas</span><div class="chips" data-slot="bag"></div></div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  const canvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const paint = (c: HTMLCanvasElement, choice: CharacterChoice, dir = DIRECTIONS[0], footY = c.height - 3) => {
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    asm.draw(ctx, choice, c.width / 2, footY, dir, 1);
  };
  const chip = (label: string, on: boolean, click: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.classList.toggle("on", on);
    b.onclick = click;
    return b;
  };
  const swatch = (color: string | null, on: boolean, click: () => void, title?: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.style.background = color ?? "linear-gradient(135deg,#eee,#999)";
    b.title = title ?? color ?? "warna asli";
    b.classList.toggle("on", on);
    b.onclick = click;
    return b;
  };
  const set = (patch: Partial<CharacterChoice>) => {
    st = sanitizeChoice(cfg, { ...st, ...patch });
    render();
  };

  function render() {
    const g = cfg.genders[st.gender];
    const dirs = $(".dirs");
    dirs.replaceChildren(...DIRECTIONS.map((d) => { const c = canvas(48, 76); paint(c, st, d); return c; }));

    $("[data-k=gender]").replaceChildren(
      ...(["L", "P"] as Gender[]).map((k) => chip(cfg.genders[k].label, st.gender === k, () => {
        st = defaultChoice(cfg, k);
        render();
      })),
    );

    $(".heads").replaceChildren(...g.heads.filter((h) => asm.atlas.heads[h]).map((h) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.classList.toggle("on", st.head === h);
      // Potret: karakter digambar lebih rendah supaya hanya kepala yang terlihat.
      const c = canvas(40, 40);
      paint(c, { ...st, head: h, set: allowedSets(cfg, st.gender, h).includes(st.set) ? st.set : allowedSets(cfg, st.gender, h)[0] }, "down", 70);
      b.append(c, document.createTextNode(cfg.headLabels[h] ?? h));
      b.onclick = () => set({ head: h });
      return b;
    }));

    const pal = headPalette(cfg, st.gender, st.head);
    const cat = cfg.colorCategories[cfg.headCategory[st.head] ?? ""];
    $(".hc-title").textContent = cat?.title ?? "";
    $(".hc-title").hidden = !pal;
    $(".hc").replaceChildren(...(pal && cat ? pal.map((c) => swatch(c, st[cat.key] === c, () => set({ [cat.key]: c }))) : []));

    $(".sets").replaceChildren(...allowedSets(cfg, st.gender, st.head).filter((s) => asm.atlas.sets[s]).map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt tall";
      b.classList.toggle("on", st.set === s);
      const c = canvas(40, 66);
      paint(c, { ...st, set: s });
      b.append(c, document.createTextNode(asm.atlas.sets[s].label));
      b.onclick = () => set({ set: s });
      return b;
    }));
    $(".hijab-note").hidden = cfg.headCategory[st.head] !== "hijab";

    $(".top").replaceChildren(...g.top.map((c) => swatch(c, st.topColor === c, () => set({ topColor: c }))));
    $(".skin").replaceChildren(...cfg.skinTones.map((rgb, i) => swatch(`rgb(${rgb.join(",")})`, st.skin === i, () => set({ skin: i }), `Kulit ${i + 1}`)));

    root.querySelectorAll<HTMLElement>("[data-slot]").forEach((box) => {
      const slot = box.dataset.slot as "glasses" | "headgear" | "bag";
      const labelOf = (k: string) => (asm.atlas.acc[k] ?? asm.atlas.bags[k])?.label ?? k;
      box.replaceChildren(
        chip("Tidak ada", st[slot] === null, () => set({ [slot]: null })),
        ...cfg.accessories[slot].map((k) => chip(labelOf(k), st[slot] === k, () => set({ [slot]: k }))),
      );
    });
  }

  const saveBtn = $<HTMLButtonElement>(".save");
  saveBtn.onclick = async () => {
    const err = $(".form-error");
    saveBtn.disabled = true;
    err.hidden = true;
    try {
      await opts.onSave(st);
      closePanel();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : String(e);
      err.hidden = false;
      saveBtn.disabled = false;
    }
  };

  render();
  openPanel({ title: "kreator-karakter", body: root, wide: true, closable: !opts.required });
}
