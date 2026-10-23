import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allowedSets, defaultChoice, sanitizeChoice, type CharacterConfig } from "../src/index.js";

const cfg = JSON.parse(
  readFileSync(new URL("../../export/character/config.json", import.meta.url), "utf8"),
) as CharacterConfig;

describe("pilihan karakter", () => {
  it("setelan bawaan selalu sah", () => {
    for (const g of ["L", "P"] as const) {
      const d = defaultChoice(cfg, g);
      expect(sanitizeChoice(cfg, d)).toEqual(d);
    }
  });

  it("kepala berhijab hanya boleh memakai baju yang diizinkan", () => {
    expect(allowedSets(cfg, "P", "hijab_simple")).toEqual(cfg.hijabSets);
    const c = sanitizeChoice(cfg, { gender: "P", head: "hijab_simple", set: "batik" });
    expect(cfg.hijabSets).toContain(c.set);
  });

  it("nilai asing diganti setelan bawaan", () => {
    const c = sanitizeChoice(cfg, {
      gender: "L",
      head: "hijab_long",
      topColor: "#123456",
      skin: 99,
      glasses: "kacamata_hitam",
    });
    expect(c.head).toBe(cfg.genders.L.def.head);
    expect(c.topColor).toBe(cfg.genders.L.def.top);
    expect(c.skin).toBe(1);
    expect(c.glasses).toBeNull();
  });
});
