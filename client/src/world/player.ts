// Karakter di dunia: sprite yang dirakit + name tag. Posisi = titik kaki.

import Phaser from "phaser";
import type { CharacterChoice, CharacterConfig, Direction } from "@mita/shared";
import { CHAR_ORIGIN, ensureCharacterTexture, frameName } from "../char/textures";

/** Panjang maksimum nama di name tag; nama utuh tampil di daftar pemain. */
const TAG_MAX = 22;

export class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly tag: Phaser.GameObjects.Text;
  x: number;
  y: number;
  dir: Direction = "down";
  moving = false;
  sitting = false;
  private t = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    choice: CharacterChoice,
    name: string,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    const key = ensureCharacterTexture(scene, choice);
    this.sprite = scene.add.sprite(x, y, key, frameName("down", 1)).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y);
    const shown = name.length > TAG_MAX ? name.slice(0, TAG_MAX - 1) + "…" : name;
    this.tag = scene.add
      .text(x, y, shown, {
        fontFamily: "system-ui, 'Segoe UI', sans-serif",
        fontSize: "8px",
        color: "#F7F5F0",
        backgroundColor: "rgba(27,42,65,0.72)",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1);
  }

  setChoice(choice: CharacterChoice): void {
    this.sprite.setTexture(ensureCharacterTexture(this.scene, choice), frameName(this.dir, 1));
  }

  /** Ketajaman teks mengikuti zoom kamera (teks digambar ulang pada resolusi layar). */
  setTextResolution(zoom: number): void {
    this.tag.setResolution(zoom * (window.devicePixelRatio || 1));
  }

  /** Memperbarui animasi, kedalaman (urutan Y), dan letak name tag. */
  update(dt: number, mv: CharacterConfig["movement"], running: boolean): void {
    if (this.moving) this.t += dt * (running ? mv.runAnimMultiplier : 1);
    else this.t = 0;
    const seq = mv.walkSequence;
    const f = this.moving ? seq[Math.floor(this.t * mv.animFps) % seq.length] : 1;
    this.sprite.setFrame(frameName(this.dir, f));
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y).setDepth(y);
    // Kepala tertinggi ± 60 px di atas kaki (topi + rambut tinggi).
    this.tag.setPosition(x, y - 62).setDepth(1e6 + y);
  }

  destroy(): void {
    this.sprite.destroy();
    this.tag.destroy();
  }
}
