// Mendaftarkan lembar sprite karakter sebagai tekstur Phaser.

import Phaser from "phaser";
import type { CharacterChoice, Direction } from "@mita/shared";
import { CELL_H, CELL_W, CharacterAssembler, DIRECTIONS, FOOT_Y, choiceKey } from "./assembler";

let assembler: CharacterAssembler | undefined;

/** Dipanggil sekali di main.ts setelah paket karakter dimuat. */
export function setAssembler(a: CharacterAssembler): void {
  assembler = a;
}

export function getAssembler(): CharacterAssembler {
  if (!assembler) throw new Error("Perakit karakter belum dimuat.");
  return assembler;
}

export const frameName = (dir: Direction, f: number) => `${dir}:${f}`;

/** Kunci tekstur untuk pilihan ini; tekstur dibangun hanya bila belum ada. */
export function ensureCharacterTexture(scene: Phaser.Scene, choice: CharacterChoice): string {
  const key = choiceKey(choice);
  if (scene.textures.exists(key)) return key;
  const sheet = getAssembler().buildSheet(choice);
  const tex = scene.textures.addCanvas(key, sheet)!;
  DIRECTIONS.forEach((dir, row) => {
    for (let f = 0; f < 3; f++) tex.add(frameName(dir, f), 0, f * CELL_W, row * CELL_H, CELL_W, CELL_H);
  });
  return key;
}

/** Origin sprite agar posisi sprite = titik kaki. */
export const CHAR_ORIGIN = { x: 0.5, y: FOOT_Y / CELL_H };
