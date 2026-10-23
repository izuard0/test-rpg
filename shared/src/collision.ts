// Gerak pemain dan tabrakan dengan rintangan persegi (docs/PETA.md bagian 3).
// Pemain berpijak pada kotak kaki 12 × 8 px; antarpemain tidak bertabrakan.

import type { Interactable, Rect } from "./tiled.js";

export const FOOT_W = 12;
export const FOOT_H = 8;

/** Kotak kaki untuk titik kaki (fx, fy): tengah bawah karakter. */
export function footBox(fx: number, fy: number): Rect {
  return { x: fx - FOOT_W / 2, y: fy - FOOT_H, w: FOOT_W, h: FOOT_H };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Indeks grid sederhana agar pemeriksaan tabrakan tidak menyapu semua rintangan
 * (peta kampus punya ± 200 persegi; server kelak menghitung untuk ± 150 pemain).
 */
export class CollisionWorld {
  private readonly cells = new Map<number, Rect[]>();

  constructor(
    readonly width: number,
    readonly height: number,
    rects: Rect[],
    private readonly cell = 112,
  ) {
    for (const r of rects) {
      for (const key of this.keys(r)) {
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(r);
      }
    }
  }

  private *keys(r: Rect): Generator<number> {
    const c = this.cell;
    const x0 = Math.floor(r.x / c), x1 = Math.floor((r.x + r.w - 0.001) / c);
    const y0 = Math.floor(r.y / c), y1 = Math.floor((r.y + r.h - 0.001) / c);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) yield cy * 10000 + cx;
  }

  /** Benar bila kotak menabrak rintangan atau keluar dari dunia. */
  blocked(box: Rect): boolean {
    if (box.x < 0 || box.y < 0 || box.x + box.w > this.width || box.y + box.h > this.height) return true;
    for (const key of this.keys(box)) {
      for (const r of this.cells.get(key) ?? []) if (overlaps(box, r)) return true;
    }
    return false;
  }

  /**
   * Menggeser titik kaki sejauh (dx, dy). Sumbu diperiksa terpisah sehingga
   * pemain "meluncur" di sepanjang dinding, bukan berhenti total.
   */
  move(fx: number, fy: number, dx: number, dy: number): { x: number; y: number } {
    let x = fx, y = fy;
    if (dx && !this.blocked(footBox(x + dx, y))) x += dx;
    else if (dx) x = this.slide(x, y, dx, true);
    if (dy && !this.blocked(footBox(x, y + dy))) y += dy;
    else if (dy) y = this.slide(x, y, dy, false);
    return { x, y };
  }

  // Maju sedekat mungkin ke rintangan (per piksel) agar tidak ada celah tersisa.
  private slide(x: number, y: number, d: number, horizontal: boolean): number {
    const step = Math.sign(d);
    let moved = 0;
    while (Math.abs(moved + step) <= Math.abs(d)) {
      const box = horizontal ? footBox(x + moved + step, y) : footBox(x, y + moved + step);
      if (this.blocked(box)) break;
      moved += step;
    }
    return (horizontal ? x : y) + moved;
  }
}

/** Jarak titik ke persegi (0 bila di dalamnya). */
export function distanceToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * Benda terdekat yang bisa dipakai: titik kaki harus dalam `reach` piksel
 * (bawaan 1 petak) dari persegi interaksinya.
 */
export function nearestInteractable<T extends Interactable>(
  items: readonly T[],
  fx: number,
  fy: number,
  reach: number,
): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = distanceToRect(fx, fy, it.rect);
    if (d <= reach && d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}
