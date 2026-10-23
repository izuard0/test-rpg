// Pilihan karakter pemain dan aturannya (docs/KARAKTER.md bagian 1).
// Aturan yang sama dijalankan klien (kreator) dan server (saat menyimpan).

export type Gender = "L" | "P";
export type Direction = "down" | "left" | "right" | "up";

export interface CharacterChoice {
  gender: Gender;
  head: string;
  hairColor: string;
  hijabColor: string;
  capColor: string;
  set: string;
  /** `null` = warna asli atasan. */
  topColor: string | null;
  skin: number;
  glasses: string | null;
  headgear: string | null;
  bag: string | null;
}

/** Bentuk `export/character/config.json` sebatas yang dibaca kode. */
export interface CharacterConfig {
  tile: number;
  directions: Direction[];
  movement: {
    runSpeed: number;
    walkSpeed: number;
    runAnimMultiplier: number;
    animFps: number;
    walkSequence: number[];
  };
  skinTones: [number, number, number][];
  recolor: {
    skin: { rMinusG: number; gMinusB: number; rMin: number };
    skinReference: [number, number, number];
    tint: { maxSaturation: number; minLuminance: number; refLuminance: number; highlightAbove: number; highlightBoost: number };
  };
  headLabels: Record<string, string>;
  headCategory: Record<string, string>;
  colorCategories: Record<string, { title: string; key: "hairColor" | "hijabColor" | "capColor"; palette?: string[] }>;
  hijabSets: string[];
  genders: Record<
    Gender,
    {
      label: string;
      btype: "a" | "b";
      heads: string[];
      sets: string[];
      hair: string[];
      top: (string | null)[];
      def: { head: string; set: string; top: string | null; hair: string; hijab?: string };
    }
  >;
  accessories: { glasses: string[]; headgear: string[]; bag: string[] };
}

/** Setelan bawaan sebuah jenis kelamin (dipakai saat jenis kelamin diganti). */
export function defaultChoice(cfg: CharacterConfig, gender: Gender): CharacterChoice {
  const g = cfg.genders[gender];
  const hijab = cfg.colorCategories.hijab?.palette ?? [];
  const caps = cfg.colorCategories.topi?.palette ?? [];
  return {
    gender,
    head: g.def.head,
    hairColor: g.def.hair,
    hijabColor: g.def.hijab ?? hijab[0] ?? g.def.hair,
    capColor: caps[0] ?? g.def.hair,
    set: g.def.set,
    topColor: g.def.top,
    skin: 1,
    glasses: null,
    headgear: null,
    bag: null,
  };
}

/** Baju yang boleh dipakai bersama kepala tertentu. */
export function allowedSets(cfg: CharacterConfig, gender: Gender, head: string): string[] {
  const list = cfg.genders[gender].sets;
  return cfg.headCategory[head] === "hijab" ? list.filter((s) => cfg.hijabSets.includes(s)) : list;
}

/** Palet warna untuk kategori kepala; `undefined` bila kepala tidak bisa diwarnai (peci). */
export function headPalette(cfg: CharacterConfig, gender: Gender, head: string): string[] | undefined {
  const cat = cfg.colorCategories[cfg.headCategory[head] ?? ""];
  if (!cat) return undefined;
  return cat.palette ?? cfg.genders[gender].hair;
}

/**
 * Merapikan pilihan dari luar (formulir, server, penyimpanan) agar selalu sah:
 * nilai yang tidak dikenal diganti setelan bawaan, bukan ditolak.
 */
export function sanitizeChoice(cfg: CharacterConfig, input: Partial<CharacterChoice>): CharacterChoice {
  const gender: Gender = input.gender === "P" ? "P" : "L";
  const g = cfg.genders[gender];
  const base = defaultChoice(cfg, gender);
  const c: CharacterChoice = { ...base };

  c.head = input.head && g.heads.includes(input.head) ? input.head : base.head;
  const sets = allowedSets(cfg, gender, c.head);
  c.set = input.set && sets.includes(input.set) ? input.set : sets.includes(base.set) ? base.set : sets[0];

  const pick = (v: string | null | undefined, pal: readonly (string | null)[], fallback: string | null) =>
    v !== undefined && pal.includes(v) ? v : fallback;
  c.hairColor = pick(input.hairColor, g.hair, base.hairColor) ?? base.hairColor;
  c.hijabColor = pick(input.hijabColor, cfg.colorCategories.hijab?.palette ?? [], base.hijabColor) ?? base.hijabColor;
  c.capColor = pick(input.capColor, cfg.colorCategories.topi?.palette ?? [], base.capColor) ?? base.capColor;
  c.topColor = pick(input.topColor, g.top, base.topColor);

  const skin = Number(input.skin);
  c.skin = Number.isInteger(skin) && skin >= 0 && skin < cfg.skinTones.length ? skin : base.skin;

  const acc = (v: string | null | undefined, list: string[]) => (v && list.includes(v) ? v : null);
  c.glasses = acc(input.glasses, cfg.accessories.glasses);
  c.headgear = acc(input.headgear, cfg.accessories.headgear);
  c.bag = acc(input.bag, cfg.accessories.bag);
  return c;
}
