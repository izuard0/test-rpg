// Karakter di dunia: sprite yang dirakit + name tag + gelembung chat. Posisi = titik kaki.

import Phaser from "phaser";
import type { CharacterChoice, CharacterConfig, Direction, Role } from "@mita/shared";
import { CHAR_ORIGIN, ensureCharacterTexture, frameName } from "../char/textures";

/** Panjang maksimum nama di name tag; nama utuh tampil di daftar pemain. */
const TAG_MAX = 22;
const BUBBLE_MS = 5000;
const BUBBLE_COLOR: Record<string, string> = { sekitar: "#F7F5F0", global: "#D6E9FB", pribadi: "#FCE3CF", dots: "#F7F5F0" };

export class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly tag: Phaser.GameObjects.Text;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleTimer?: Phaser.Time.TimerEvent;
  private zoom = 1;
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
    role: Role = "mahasiswa",
  ) {
    this.x = x;
    this.y = y;
    const key = ensureCharacterTexture(scene, choice);
    this.sprite = scene.add.sprite(x, y, key, frameName("down", 1)).setOrigin(CHAR_ORIGIN.x, CHAR_ORIGIN.y);
    const shown = name.length > TAG_MAX ? name.slice(0, TAG_MAX - 1) + "…" : name;
    this.tag = scene.add
      .text(x, y, role === "dosen" ? `${shown} · dosen` : shown, {
        fontFamily: "system-ui, 'Segoe UI', sans-serif",
        fontSize: "8px",
        color: role === "dosen" ? "#FFE3C9" : "#F7F5F0",
        backgroundColor: role === "dosen" ? "rgba(122,59,18,0.85)" : "rgba(27,42,65,0.72)",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1);
  }

  setChoice(choice: CharacterChoice): void {
    this.sprite.setTexture(ensureCharacterTexture(this.scene, choice), frameName(this.dir, 1));
  }

  /** Ketajaman teks mengikuti zoom kamera (teks digambar ulang pada resolusi layar). */
  setTextResolution(zoom: number): void {
    this.zoom = zoom;
    // Huruf di layar minimal ± 11 px: pada zoom 1× teks dunia 8 px terlalu kecil dibaca.
    const size = Math.max(8, Math.round(11 / zoom));
    const res = zoom * (window.devicePixelRatio || 1);
    this.tag.setFontSize(size).setResolution(res);
    this.bubble?.setFontSize(size).setResolution(res);
  }

  /** Gelembung di atas kepala selama beberapa detik. `kind` = mode chat, atau "dots" untuk "…". */
  say(text: string, kind: string): void {
    this.bubbleTimer?.remove();
    this.bubble?.destroy();
    const size = Math.max(8, Math.round(11 / this.zoom));
    this.bubble = this.scene.add
      .text(this.x, this.y, text.length > 80 ? text.slice(0, 79) + "…" : text, {
        fontFamily: "system-ui, 'Segoe UI', sans-serif",
        fontSize: `${size}px`,
        color: "#1B2A41",
        backgroundColor: BUBBLE_COLOR[kind] ?? BUBBLE_COLOR.sekitar,
        padding: { x: 4, y: 2 },
        wordWrap: { width: 120 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setResolution(this.zoom * (window.devicePixelRatio || 1));
    this.bubbleTimer = this.scene.time.delayedCall(BUBBLE_MS, () => {
      this.bubble?.destroy();
      this.bubble = undefined;
    });
    this.place();
  }

  /** Memperbarui animasi, kedalaman (urutan Y), dan letak name tag. */
  update(dt: number, mv: CharacterConfig["movement"], running: boolean): void {
    if (this.moving) this.t += dt * (running ? mv.runAnimMultiplier : 1);
    else this.t = 0;
    const seq = mv.walkSequence;
    const f = this.moving ? seq[Math.floor(this.t * mv.animFps) % seq.length] : 1;
    this.sprite.setFrame(frameName(this.dir, f));
    this.place();
  }

  private place(): void {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y).setDepth(y);
    // Kepala tertinggi ± 60 px di atas kaki (topi + rambut tinggi).
    this.tag.setPosition(x, y - 62).setDepth(1e6 + y);
    this.bubble?.setPosition(x, y - 62 - this.tag.displayHeight - 2).setDepth(1.5e6 + y);
  }

  destroy(): void {
    this.bubbleTimer?.remove();
    this.bubble?.destroy();
    this.sprite.destroy();
    this.tag.destroy();
  }
}
