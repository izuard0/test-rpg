// Pemain lain di ruang yang sama (dan pemain kelas yang dicerminkan ke kampus).
// Posisi dari cuplikan server diinterpolasi supaya gerak tetap halus di 60 fps.

import Phaser from "phaser";
import { DIRS, FLAG_MOVING, FLAG_SITTING, type CharacterConfig, type Profile } from "@mita/shared";
import { Avatar } from "./player";

interface Remote {
  profile: Profile;
  avatar: Avatar;
  tx: number;
  ty: number;
  /** Terlihat di cuplikan terakhir (di luar pandangan = disembunyikan). */
  visible: boolean;
}

export class RemotePlayers {
  private readonly list = new Map<number, Remote>();
  private zoom = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onClick: (p: Profile) => void,
  ) {}

  add(p: Profile): void {
    this.remove(p.sid);
    const avatar = new Avatar(this.scene, p.choice, p.name, -1000, -1000, p.role, p.tag ?? null);
    avatar.setTextResolution(this.zoom);
    avatar.sprite.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.onClick(p));
    avatar.sprite.setVisible(false);
    avatar.tag.setVisible(false);
    this.list.set(p.sid, { profile: p, avatar, tx: -1000, ty: -1000, visible: false });
  }

  remove(sid: number): void {
    this.list.get(sid)?.avatar.destroy();
    this.list.delete(sid);
  }

  clear(): void {
    for (const sid of [...this.list.keys()]) this.remove(sid);
  }

  get(sid: number): Remote | undefined {
    return this.list.get(sid);
  }

  /** Admin mengubah tag pemain (semua sesinya, termasuk cermin kelas). */
  setTag(uid: string, tag: string | null): void {
    for (const r of this.list.values()) {
      if (r.profile.uid !== uid) continue;
      r.profile.tag = tag ?? undefined;
      r.avatar.setNameTag(tag);
    }
  }

  profiles(): Profile[] {
    return [...this.list.values()].map((r) => r.profile);
  }

  /** Cuplikan server: [sid, x, y, arah, flag, ...]. Pemain yang tidak disebut berada di luar pandangan. */
  snapshot(data: number[]): void {
    const seen = new Set<number>();
    for (let i = 0; i + 4 < data.length; i += 5) {
      const r = this.list.get(data[i]);
      if (!r) continue;
      seen.add(data[i]);
      const first = !r.visible;
      r.tx = data[i + 1];
      r.ty = data[i + 2];
      r.avatar.dir = DIRS[data[i + 3]] ?? "down";
      r.avatar.moving = (data[i + 4] & FLAG_MOVING) !== 0;
      r.avatar.sitting = (data[i + 4] & FLAG_SITTING) !== 0;
      if (first) {
        r.avatar.x = r.tx;
        r.avatar.y = r.ty;
      }
      r.visible = true;
    }
    for (const r of this.list.values()) {
      if (!seen.has(r.profile.sid)) r.visible = false;
      r.avatar.sprite.setVisible(r.visible);
      r.avatar.tag.setVisible(r.visible);
    }
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    for (const r of this.list.values()) r.avatar.setTextResolution(zoom);
  }

  update(dt: number, mv: CharacterConfig["movement"]): void {
    // Mengejar posisi tujuan: 100 ms per cuplikan, jadi ± 12 kali/detik cukup halus.
    const k = 1 - Math.exp(-dt * 12);
    for (const r of this.list.values()) {
      if (!r.visible) continue;
      const a = r.avatar;
      const dx = r.tx - a.x, dy = r.ty - a.y;
      if (Math.hypot(dx, dy) > 200) {
        a.x = r.tx;
        a.y = r.ty;
      } else {
        a.x += dx * k;
        a.y += dy * k;
      }
      a.update(dt, mv, true);
    }
  }
}
