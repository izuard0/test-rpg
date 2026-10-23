// Notifikasi singkat di tengah atas layar (mis. "Dosen memulai kelas"). Tidak memaksa:
// pemain bisa mengabaikannya dan membuka lagi lewat panel Bahan kelas.

export interface ToastAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

export function toast(title: string, body: string, actions: ToastAction[] = [], ms = 12_000): void {
  let box = document.getElementById("toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    box.setAttribute("aria-live", "polite");
    document.getElementById("ui")!.append(box);
  }
  const el = document.createElement("div");
  el.className = "toast";
  const h = document.createElement("b");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  const row = document.createElement("div");
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = a.label;
    if (a.primary) b.className = "primary";
    b.onclick = () => {
      a.run();
      el.remove();
    };
    row.append(b);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "x";
  close.setAttribute("aria-label", "Tutup");
  close.textContent = "✕";
  close.onclick = () => el.remove();
  el.append(close, h, p, row);
  box.prepend(el);
  while (box.children.length > 3) box.lastElementChild!.remove();
  setTimeout(() => el.remove(), ms);
}
