// Memuat paket karakter (export/character/) tanpa Phaser, supaya kreator
// karakter bisa dipakai di layar registrasi sebelum game dimulai.

import type { CharacterConfig } from "@mita/shared";
import { GAME_BASE } from "../world/loader";
import { CharacterAssembler, type CharacterAtlas, type HeadAdjust } from "./assembler";

async function json<T>(path: string): Promise<T> {
  const res = await fetch(GAME_BASE + path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Gagal memuat ${path} (${res.status})`);
  return (await res.json()) as T;
}

function image(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat ${path}`));
    img.src = GAME_BASE + path;
  });
}

export async function loadAssembler(): Promise<CharacterAssembler> {
  const base = "export/character/";
  const [img, atlas, cfg, adj] = await Promise.all([
    image(base + "atlas.png"),
    json<CharacterAtlas>(base + "atlas.json"),
    json<CharacterConfig>(base + "config.json"),
    json<HeadAdjust>(base + "head_adjust.json"),
  ]);
  return new CharacterAssembler(img, atlas, cfg, adj);
}
