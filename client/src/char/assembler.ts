// Perakit karakter: port dari prototipe (tools/build_sim.py, fungsi `recolor`
// dan `drawChar`) mengikuti docs/KARAKTER.md. Hasilnya satu lembar sprite per
// tampilan (4 arah × 3 frame) yang dibangun SEKALI per kombinasi pilihan.

import type { CharacterChoice, CharacterConfig, Direction } from "@mita/shared";

interface FrameRect { x: number; y: number; w: number; h: number }
interface BodyMeta { key: string; neckX: number; attachY: number; tintBelow: number }
interface HeadMeta { key: string; neckX: number; neckY: number }
interface AccMeta { key: string; ax: number; ay: number }

export interface CharacterAtlas {
  frames: Record<string, FrameRect>;
  sets: Record<string, { label: string } & Record<Direction, BodyMeta[]>>;
  heads: Record<string, Record<Direction, HeadMeta>>;
  acc: Record<string, { label: string } & Record<Direction, AccMeta | null>>;
  bags: Record<string, { label: string } & Record<Direction, (AccMeta & { w: number }) | null>>;
  overlap: number;
}

export type HeadAdjust = { locked?: string[] } & Record<string, Record<string, Partial<Record<Direction, { dx?: number; dy?: number }>>>>;

/** Ukuran sel lembar sprite. Titik kaki berada di (CELL_W / 2, FOOT_Y). */
export const CELL_W = 48;
export const CELL_H = 80;
export const FOOT_Y = 76;
export const DIRECTIONS: Direction[] = ["down", "left", "right", "up"];

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export class CharacterAssembler {
  private readonly raw = new Map<string, HTMLCanvasElement>();
  private readonly tinted = new Map<string, HTMLCanvasElement>();
  private readonly skinRef: number;

  constructor(
    private readonly img: HTMLImageElement,
    readonly atlas: CharacterAtlas,
    readonly cfg: CharacterConfig,
    private readonly headAdj: HeadAdjust,
  ) {
    this.skinRef = lum(...cfg.recolor.skinReference);
  }

  private sprite(key: string): HTMLCanvasElement {
    let c = this.raw.get(key);
    if (c) return c;
    const f = this.atlas.frames[key];
    if (!f) throw new Error(`Sprite karakter tidak ada di atlas: ${key}`);
    c = document.createElement("canvas");
    c.width = f.w;
    c.height = f.h;
    c.getContext("2d")!.drawImage(this.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    this.raw.set(key, c);
    return c;
  }

  /** Pewarnaan kulit dan bagian abu-abu (docs/KARAKTER.md bagian 4), di-cache. */
  private recolor(key: string, tint: string | null, tintBelow: number, skin: number): HTMLCanvasElement {
    const id = `${key}|${tint}|${tintBelow}|${skin}`;
    const hit = this.tinted.get(id);
    if (hit) return hit;
    const src = this.sprite(key);
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const p = data.data;
    const RC = this.cfg.recolor;
    const T = tint ? hexRgb(tint) : null;
    const S = this.cfg.skinTones[skin];
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const r = p[i], g = p[i + 1], b = p[i + 2];
      const y = ((i / 4) / c.width) | 0;
      const L = lum(r, g, b);
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (r > g + RC.skin.rMinusG && g > b + RC.skin.gMinusB && r > RC.skin.rMin) {
        const k = L / this.skinRef;
        p[i] = Math.min(255, S[0] * k);
        p[i + 1] = Math.min(255, S[1] * k);
        p[i + 2] = Math.min(255, S[2] * k);
      } else if (T && sat < RC.tint.maxSaturation && L > RC.tint.minLuminance && y < tintBelow) {
        const k = L / RC.tint.refLuminance;
        const hb = k > RC.tint.highlightAbove ? RC.tint.highlightBoost : 0;
        p[i] = Math.min(255, T[0] * k + hb);
        p[i + 1] = Math.min(255, T[1] * k + hb);
        p[i + 2] = Math.min(255, T[2] * k + hb);
      }
    }
    ctx.putImageData(data, 0, 0);
    this.tinted.set(id, c);
    return c;
  }

  private headColor(c: CharacterChoice): string | null {
    const cat = this.cfg.colorCategories[this.cfg.headCategory[c.head] ?? ""];
    return cat ? c[cat.key] : null;
  }

  /** Menggambar satu frame dengan titik kaki di (cx, footY). */
  draw(ctx: CanvasRenderingContext2D, c: CharacterChoice, cx: number, footY: number, dir: Direction, frame: number, shadow = true) {
    const setKey = this.cfg.genders[c.gender].btype === "b" ? `${c.set}_b` : c.set;
    const bm = this.atlas.sets[setKey]?.[dir]?.[frame];
    const hm = this.atlas.heads[c.head]?.[dir];
    if (!bm || !hm) return;
    const body = this.recolor(bm.key, c.topColor, bm.tintBelow, c.skin);
    const head = this.recolor(hm.key, this.headColor(c), 999, c.skin);
    const bx = Math.round(cx - body.width / 2);
    const by = footY - body.height;

    if (shadow) {
      ctx.fillStyle = "rgba(20,25,40,.28)";
      ctx.beginPath();
      ctx.ellipse(cx, footY - 1, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.drawImage(body, bx, by);
    const bg = c.bag ? this.atlas.bags[c.bag]?.[dir] : null;
    if (bg) ctx.drawImage(this.sprite(bg.key), Math.round(bx + bm.neckX + bg.ax), by + bm.attachY + bg.ay);
    // Tanpa leher: dagu langsung menempel di kerah.
    const adj = this.headAdj[c.gender]?.[c.head]?.[dir] ?? {};
    const hx = Math.round(bx + bm.neckX - hm.neckX) + (adj.dx ?? 0);
    const hy = by + bm.attachY + this.atlas.overlap - hm.neckY + (adj.dy ?? 0);
    ctx.drawImage(head, hx, hy);
    const chinX = hx + hm.neckX, chinY = hy + hm.neckY;
    for (const k of [c.glasses, c.headgear]) {
      const a = k ? this.atlas.acc[k]?.[dir] : null;
      if (a) ctx.drawImage(this.sprite(a.key), Math.round(chinX + a.ax), chinY + a.ay);
    }
  }

  /**
   * Lembar sprite 3 kolom (frame) × 4 baris (arah, urutan DIRECTIONS).
   * Bayangan ikut digambar supaya satu sprite Phaser cukup per pemain.
   */
  buildSheet(c: CharacterChoice): HTMLCanvasElement {
    const sheet = document.createElement("canvas");
    sheet.width = CELL_W * 3;
    sheet.height = CELL_H * DIRECTIONS.length;
    const ctx = sheet.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    DIRECTIONS.forEach((dir, row) => {
      for (let f = 0; f < 3; f++) this.draw(ctx, c, f * CELL_W + CELL_W / 2, row * CELL_H + FOOT_Y, dir, f);
    });
    return sheet;
  }
}

/** Kunci tekstur yang sama untuk pilihan yang sama (berbagi tekstur antarpemain). */
export function choiceKey(c: CharacterChoice): string {
  return "char:" + [c.gender, c.head, c.hairColor, c.hijabColor, c.capColor, c.set, c.topColor, c.skin, c.glasses, c.headgear, c.bag].join("|");
}
