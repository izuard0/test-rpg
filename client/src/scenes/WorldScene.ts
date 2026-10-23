// Scene dunia: satu ruangan (peta kampus atau salah satu kelas).
// Pindah ruangan = scene dimulai ulang dengan peta tujuan.

import Phaser from "phaser";
import {
  CollisionWorld,
  defaultChoice,
  GID_FLIP_H,
  GID_FLIP_V,
  nearestInteractable,
  readRoom,
  zoneAt,
  type CharacterConfig,
  type Interactable,
  type RoomData,
  type Zone,
} from "@mita/shared";
import { getAssembler } from "../char/textures";
import { loadProfile, saveProfile, type PlayerProfile } from "../state";
import { actionLabel, openInfo, openShelf, openTerminalPlaceholder, type MateriCatalog } from "../ui/content";
import { openCreator } from "../ui/creator";
import { setHud, setPrompt, showError, showLoading } from "../ui/hud";
import { closePanel, isPanelOpen } from "../ui/panel";
import { onTouchAction, touchDirs } from "../ui/touch";
import { loadCharacterAssets, loadMap, textureForGid, type LoadedMap } from "../world/loader";
import { Avatar } from "../world/player";

export interface WorldData {
  room?: string;
  spawn?: string;
}

const ORANGE = 0xe8833a;
/** `?debug=1`: gambar persegi tabrakan/interaksi dan buka kait untuk uji otomatis. */
const DEBUG = new URLSearchParams(location.search).has("debug");
const FADE_MS = 300;
/** Lebar dunia minimal yang terlihat (piksel) saat memilih zoom bawaan. */
const VIEW_TARGET_W = 560;

interface Placed {
  image: Phaser.GameObjects.Image;
  bounds: Phaser.Geom.Rectangle;
}

export class WorldScene extends Phaser.Scene {
  private roomCode = "kampus";
  private spawnName = "awal";
  private room!: RoomData;
  private loaded!: LoadedMap;
  private collision!: CollisionWorld;
  private player?: Avatar;
  private profile!: PlayerProfile;
  private cfg!: CharacterConfig;
  private catalog?: MateriCatalog;
  private placed: Placed[] = [];
  private focus?: Interactable;
  private focusImages: Phaser.GameObjects.Image[] = [];
  private marker!: Phaser.GameObjects.Triangle;
  private zone?: Zone;
  private zoomLevel = 0;
  private ready = false;
  private transitioning = false;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d" | "shift", Phaser.Input.Keyboard.Key>;

  constructor() {
    super("world");
  }

  init(data: WorldData): void {
    this.roomCode = data.room ?? "kampus";
    this.spawnName = data.spawn ?? "awal";
    this.ready = false;
    this.transitioning = false;
    this.placed = [];
    this.focus = undefined;
    this.focusImages = [];
    this.player = undefined;
    this.zone = undefined;
  }

  create(): void {
    showLoading(true);
    this.build().catch((err: unknown) => {
      console.error(err);
      showError(`Gagal memuat ruangan "${this.roomCode}". ${err instanceof Error ? err.message : ""}`);
    });
  }

  private async build(): Promise<void> {
    await loadCharacterAssets(this);
    this.loaded = await loadMap(this, this.roomCode);
    this.cfg = this.cache.json.get("char-config") as CharacterConfig;
    this.catalog = this.cache.json.get("materi") as MateriCatalog | undefined;
    this.room = readRoom(this.loaded.map);
    this.collision = new CollisionWorld(this.room.width, this.room.height, this.room.collisions);

    this.drawTiles();
    this.drawObjects();
    this.cameras.main.setBackgroundColor(this.loaded.map.backgroundcolor ?? "#1b2a41");

    this.marker = this.add.triangle(0, 0, 0, 0, 10, 0, 5, 7, ORANGE).setOrigin(0.5, 1).setVisible(false).setDepth(2e6);
    this.marker.setStrokeStyle(1, 0x1b2a41);
    this.tweens.add({ targets: this.marker, y: "-=3", duration: 450, yoyo: true, repeat: -1, ease: "Sine.inOut" });

    this.setupInput();
    if (DEBUG) this.drawDebug();
    const start = () => {
      this.spawnPlayer();
      showLoading(false);
      this.cameras.main.fadeIn(FADE_MS, 27, 42, 65);
      this.ready = true;
    };
    const existing = loadProfile();
    if (existing) {
      this.profile = existing;
      start();
    } else {
      showLoading(false);
      openCreator(getAssembler(this), null, (p) => {
        this.profile = p;
        saveProfile(p);
        start();
      }, () => {
        // Jendela ditutup tanpa menyimpan: masuk sebagai tamu dengan karakter bawaan.
        this.profile = { name: "Tamu", choice: defaultChoice(this.cfg, "L") };
        start();
      });
    }
  }

  // ---------- peta ----------

  private drawTiles(): void {
    const tm = this.make.tilemap({ key: this.loaded.tilemapKey });
    const sets = this.loaded.tilesets
      .filter((t) => t.imageKey)
      .map((t) => tm.addTilesetImage(t.data.name, t.imageKey, t.data.tilewidth, t.data.tileheight, t.data.margin ?? 0, t.data.spacing ?? 0, t.firstgid)!);
    for (const [i, name] of ["floor", "walls"].entries()) {
      tm.createLayer(name, sets, 0, 0)?.setDepth(-2e6 + i);
    }
  }

  /** Objek tile Tiled: (x, y) = pojok kiri BAWAH; lebar/tinggi = ukuran tampil (sudah termasuk skala). */
  private drawObjects(): void {
    const depthBase: Record<string, number | null> = { below: -1e6, objects: null, above: 3e6 };
    for (const layer of this.loaded.map.layers) {
      if (layer.type !== "objectgroup" || !(layer.name in depthBase) || layer.visible === false) continue;
      for (const o of layer.objects) {
        if (!o.gid || o.visible === false) continue;
        const key = textureForGid(this.loaded, o.gid);
        if (!key) continue;
        const img = this.add.image(o.x, o.y, key).setOrigin(0, 1).setDisplaySize(o.width, o.height);
        if (o.gid & GID_FLIP_H) img.setFlipX(true);
        if (o.gid & GID_FLIP_V) img.setFlipY(true);
        const base = depthBase[layer.name];
        img.setDepth(base === null ? o.y : base + o.y);
        this.placed.push({ image: img, bounds: new Phaser.Geom.Rectangle(o.x, o.y - o.height, o.width, o.height) });
      }
    }
  }

  /** Gambar benda yang menjadi milik sebuah persegi interaksi (untuk sorotan oranye). */
  private imagesFor(it: Interactable): Phaser.GameObjects.Image[] {
    const r = new Phaser.Geom.Rectangle(it.rect.x - 4, it.rect.y - 4, it.rect.w + 8, it.rect.h + 8);
    return this.placed
      .filter((p) => {
        const b = p.bounds;
        // Telapak benda (baris bawah gambar) harus bersinggungan dengan persegi interaksi.
        const foot = new Phaser.Geom.Rectangle(b.x, b.bottom - this.room.tile, b.width, this.room.tile);
        return Phaser.Geom.Intersects.RectangleToRectangle(foot, r);
      })
      .map((p) => p.image);
  }

  private drawDebug(): void {
    const g = this.add.graphics().setDepth(4e6);
    g.lineStyle(1, 0xff3b30, 0.9);
    for (const r of this.room.collisions) g.strokeRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1, 0x3fc1c9, 1);
    for (const it of this.room.interactables) g.strokeRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
    (window as unknown as { __mita: unknown }).__mita = {
      room: () => this.roomCode,
      player: () => this.player && { x: this.player.x, y: this.player.y, dir: this.player.dir, sitting: this.player.sitting },
      focus: () => this.focus?.name ?? null,
      interactables: () => this.room.interactables.map((i) => ({ name: i.name, kind: i.kind, rect: i.rect })),
      teleport: (x: number, y: number) => {
        if (this.player) {
          this.player.x = x;
          this.player.y = y;
          this.player.sitting = false;
        }
      },
    };
  }

  // ---------- pemain ----------

  private spawnPlayer(): void {
    const s = this.room.spawns[this.spawnName] ?? this.room.spawns.awal ?? this.room.spawns.dari_lobi ?? Object.values(this.room.spawns)[0];
    this.player = new Avatar(this, this.profile.choice, this.profile.name, s.x, s.y);
    const cam = this.cameras.main;
    cam.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 24);
    cam.setRoundPixels(true);
    this.applyZoom();
    this.player.update(0, this.cfg.movement, false);
    cam.centerOn(this.player.x, this.player.y - 24);
  }

  private defaultZoom(): number {
    const w = this.scale.width;
    return Phaser.Math.Clamp(Math.floor(w / VIEW_TARGET_W), 1, 4);
  }

  /** Zoom selalu bilangan bulat agar piksel tetap tajam. */
  private applyZoom(level = this.zoomLevel): void {
    this.zoomLevel = level || this.defaultZoom();
    const cam = this.cameras.main;
    cam.setZoom(this.zoomLevel);
    // Ruangan yang lebih kecil dari layar diletakkan di tengah: batas kamera
    // diperlebar ke kedua sisi sehingga sisa layar terbagi rata.
    const vw = this.scale.width / this.zoomLevel, vh = this.scale.height / this.zoomLevel;
    const { width: rw, height: rh } = this.room;
    cam.setBounds(Math.min(0, (rw - vw) / 2), Math.min(0, (rh - vh) / 2), Math.max(rw, vw), Math.max(rh, vh));
    this.player?.setTextResolution(this.zoomLevel);
  }

  // ---------- masukan ----------

  private setupInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT,
    }, false) as typeof this.keys;
    kb.on("keydown-E", () => this.interact());
    kb.on("keydown-SPACE", () => this.interact());
    kb.on("keydown-C", () => this.editCharacter());
    kb.on("keydown-MINUS", () => this.applyZoom(Math.max(1, this.zoomLevel - 1)));
    kb.on("keydown-NUMPAD_SUBTRACT", () => this.applyZoom(Math.max(1, this.zoomLevel - 1)));
    kb.on("keydown-PLUS", () => this.applyZoom(Math.min(4, this.zoomLevel + 1)));
    kb.on("keydown-NUMPAD_ADD", () => this.applyZoom(Math.min(4, this.zoomLevel + 1)));
    onTouchAction(() => this.interact());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      kb.removeAllListeners();
    });
  }

  private onResize(): void {
    // Zoom pilihan pemain dipertahankan selama masih muat; bila tidak, kembali ke bawaan.
    if (this.zoomLevel > this.defaultZoom() + 1) this.zoomLevel = 0;
    this.applyZoom();
  }

  private editCharacter(): void {
    if (!this.ready || isPanelOpen()) return;
    openCreator(getAssembler(this), this.profile, (p) => {
      this.profile = p;
      saveProfile(p);
      const old = this.player!;
      this.player = new Avatar(this, p.choice, p.name, old.x, old.y);
      this.player.dir = old.dir;
      old.destroy();
      this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 24);
      this.applyZoom();
    });
  }

  private interact(): void {
    if (!this.ready || this.transitioning || !this.player) return;
    if (isPanelOpen()) return;
    if (this.player.sitting) {
      this.player.sitting = false;
      return;
    }
    const it = this.focus;
    if (!it) return;
    switch (it.kind) {
      case "door":
        this.goTo(String(it.props.target), String(it.props.spawn));
        break;
      case "shelf":
        openShelf(it, this.catalog);
        break;
      case "terminal":
        openTerminalPlaceholder();
        break;
      case "seat":
        this.sit(it);
        break;
      default:
        openInfo(it);
    }
  }

  private sit(it: Interactable): void {
    const p = this.player!;
    // Duduk menghadap papan; pose duduk (badan dipotong di pinggang) belum ada.
    p.x = it.rect.x + it.rect.w / 2;
    p.y = it.rect.y + it.rect.h - 2;
    p.dir = "up";
    p.sitting = true;
  }

  private goTo(target: string, spawn: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    setPrompt(null);
    closePanel();
    const cam = this.cameras.main;
    cam.fadeOut(FADE_MS, 27, 42, 65);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart({ room: target, spawn } satisfies WorldData));
  }

  // ---------- putaran ----------

  update(_time: number, deltaMs: number): void {
    const p = this.player;
    if (!this.ready || !p) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    const k = this.keys;
    const frozen = isPanelOpen() || this.transitioning;
    let vx = 0, vy = 0;
    if (!frozen) {
      if (k.left.isDown || k.a.isDown || touchDirs.has("left")) vx -= 1;
      if (k.right.isDown || k.d.isDown || touchDirs.has("right")) vx += 1;
      if (k.up.isDown || k.w.isDown || touchDirs.has("up")) vy -= 1;
      if (k.down.isDown || k.s.isDown || touchDirs.has("down")) vy += 1;
    }
    const running = !k.shift.isDown;
    p.moving = vx !== 0 || vy !== 0;
    if (p.moving) {
      p.sitting = false;
      if (vx && vy) {
        vx *= Math.SQRT1_2;
        vy *= Math.SQRT1_2;
      }
      p.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? "left" : "right") : vy < 0 ? "up" : "down";
      const speed = running ? this.cfg.movement.runSpeed : this.cfg.movement.walkSpeed;
      const next = this.collision.move(p.x, p.y, vx * speed * dt, vy * speed * dt);
      p.x = next.x;
      p.y = next.y;
    }
    p.update(dt, this.cfg.movement, running);
    this.updateFocus();
    this.updateHud();
  }

  private updateFocus(): void {
    const p = this.player!;
    const it = p.sitting || this.transitioning ? undefined : nearestInteractable(this.room.interactables, p.x, p.y, this.room.tile);
    if (it !== this.focus) {
      for (const img of this.focusImages) img.postFX?.clear();
      this.focus = it;
      this.focusImages = it ? this.imagesFor(it) : [];
      for (const img of this.focusImages) img.postFX?.addGlow(ORANGE, 3, 0, false, 0.1, 10);
      setPrompt(it ? actionLabel(it) : p.sitting ? "Berdiri (atau bergerak)" : null);
    }
    if (it) {
      const top = this.focusImages.length ? Math.min(...this.focusImages.map((i) => i.getBounds().top)) : it.rect.y - 8;
      this.marker.setPosition(it.rect.x + it.rect.w / 2, top - 2).setVisible(true);
    } else this.marker.setVisible(false);
  }

  private updateHud(): void {
    const p = this.player!;
    const z = zoneAt(this.room, p.x, p.y);
    if (z !== this.zone) {
      this.zone = z;
      setHud(this.room.title, z);
    }
  }
}

