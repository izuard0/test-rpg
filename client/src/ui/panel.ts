// Jendela panel bergaya terminal (dialog, daftar materi, dsb.) di atas kanvas.

let current: { el: HTMLElement; onClose?: () => void } | null = null;

export interface PanelOptions {
  title: string;
  body: string | Node;
  /** Lebar besar, untuk materi atau terminal. */
  wide?: boolean;
  onClose?: () => void;
}

export function isPanelOpen(): boolean {
  return current !== null;
}

export function closePanel(): void {
  if (!current) return;
  const { el, onClose } = current;
  current = null;
  el.remove();
  onClose?.();
}

export function openPanel(opts: PanelOptions): HTMLElement {
  closePanel();
  const root = document.getElementById("ui")!;
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML = `
    <section class="window${opts.wide ? " wide" : ""}" role="dialog" aria-modal="true">
      <header class="titlebar">
        <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <h2></h2>
        <button class="close" type="button" aria-label="Tutup">✕</button>
      </header>
      <div class="content"></div>
    </section>`;
  backdrop.querySelector("h2")!.textContent = opts.title;
  const content = backdrop.querySelector<HTMLElement>(".content")!;
  if (typeof opts.body === "string") content.innerHTML = opts.body;
  else content.append(opts.body);
  backdrop.querySelector(".close")!.addEventListener("click", closePanel);
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) closePanel();
  });
  root.append(backdrop);
  current = { el: backdrop, onClose: opts.onClose };
  backdrop.querySelector<HTMLElement>(".close")!.focus();
  return content;
}

addEventListener("keydown", (e) => {
  if (e.key === "Escape" && current) {
    e.preventDefault();
    closePanel();
  }
});

/** Meloloskan teks agar aman disisipkan ke HTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
