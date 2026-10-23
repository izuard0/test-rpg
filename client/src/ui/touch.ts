// Tombol layar untuk HP/tablet: arah dan tombol aksi. Keadaannya dibaca scene tiap frame.

export const touchDirs = new Set<"up" | "down" | "left" | "right">();
let actionHandler: (() => void) | null = null;

export function onTouchAction(fn: () => void): void {
  actionHandler = fn;
}

export function mountTouchPad(): void {
  const pad = document.getElementById("pad");
  if (!pad) return;
  pad.querySelectorAll<HTMLButtonElement>("button[data-d]").forEach((b) => {
    const d = b.dataset.d as "up" | "down" | "left" | "right";
    b.addEventListener("pointerdown", (e) => {
      touchDirs.add(d);
      b.setPointerCapture(e.pointerId);
    });
    for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => touchDirs.delete(d));
  });
  pad.querySelector<HTMLButtonElement>("button[data-a]")?.addEventListener("click", () => actionHandler?.());
}
