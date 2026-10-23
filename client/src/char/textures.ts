// Mendaftarkan lembar sprite karakter sebagai tekstur Phaser.

import Phaser from "phaser";
import type { CharacterChoice, CharacterConfig, Direction } from "@mita/shared";
import { CELL_H, CELL_W, CharacterAssembler, DIRECTIONS, FOOT_Y, choiceKey, type CharacterAtlas, type HeadAdjust } from "./assembler";

let assembler: CharacterAssembler | undefined;

/** Perakit tunggal; dibuat setelah atlas karakter selesai dimuat. */
export function getAssembler(scene: Phaser.Scene): CharacterAssembler {
  if (!assembler) {
    const img = scene.textures.get("char-atlas").getSourceImage() as HTMLImageElement;
    assembler = new CharacterAssembler(
      img,
      scene.cache.json.get("char-atlas") as CharacterAtlas,
      scene.cache.json.get("char-config") as CharacterConfig,
      scene.cache.json.get("char-head_adjust") as HeadAdjust,
    );
  }
  return assembler;
}

export const frameName = (dir: Direction, f: number) => `${dir}:${f}`;

/** Kunci tekstur untuk pilihan ini; tekstur dibangun hanya bila belum ada. */
export function ensureCharacterTexture(scene: Phaser.Scene, choice: CharacterChoice): string {
  const key = choiceKey(choice);
  if (scene.textures.exists(key)) return key;
  const sheet = getAssembler(scene).buildSheet(choice);
  const tex = scene.textures.addCanvas(key, sheet)!;
  DIRECTIONS.forEach((dir, row) => {
    for (let f = 0; f < 3; f++) tex.add(frameName(dir, f), 0, f * CELL_W, row * CELL_H, CELL_W, CELL_H);
  });
  return key;
}

/** Origin sprite agar posisi sprite = titik kaki. */
export const CHAR_ORIGIN = { x: 0.5, y: FOOT_Y / CELL_H };
