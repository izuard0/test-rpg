// Scene dunia: satu ruangan (peta kampus atau salah satu kelas).
// Pindah ruangan = scene dimulai ulang dengan peta tujuan.

import Phaser from "phaser";
import {
  CLOSE_ACCOUNT_REVOKED,
  CollisionWorld,
  DIRS,
  FLAG_MOVING,
  FLAG_SITTING,
  GID_FLIP_H,
  GID_FLIP_V,
  nearestInteractable,
  readRoom,
  zoneAt,
  type CharacterConfig,
  type ClassState,
  type Interactable,
  type RoomData,
  type Zone,
} from "@mita/shared";
import { getAssembler } from "../char/textures";
import type { Account, AuthService } from "../auth";
import { net } from "../net/net";
import { chat } from "../ui/chat";
import { actionLabel, openCatalog, openInfo, openTerminal, type MateriCatalog } from "../ui/content";
import { openCreator } from "../ui/creator";
import { downloadFile, kelasPanelOpen, openBahanKelas, openDosenPanel, openSlide, refreshFileLists } from "../ui/kelas";
import { toast } from "../ui/toast";
import { setHud, setLoadingProgress, setPrompt, showError, showLoading } from "../ui/hud";
import { closePanel, isPanelOpen } from "../ui/panel";
import { onTouchAction, touchDirs } from "../ui/touch";
import { MARKER_KEY, loadMap, loadWorldUi, textureForGid, type LoadedMap } from "../world/loader";
import { Avatar } from "../world/player";
import { RemotePlayers } from "../world/remotes";

export interface WorldData {
  room?: string;
  spawn?: string;
}

const ORANGE = 0xe8833a;
/** `?debug=1`: gambar persegi tabrakan/interaksi dan buka kait untuk uji otomatis. */
const DEBUG = new URLSearchParams(location.search).has("debug");
const FADE_MS = 300;
/**
 * Zoom bawaan = bilangan bulat terbesar yang masih menampilkan ± 30 × 17 petak
 * (840 × 480 px dunia), supaya pemain melihat sekeliling cukup luas.
 * Laptop 1366 × 768 -> 1×, 1920 × 1080 -> 2×, 2560 × 1440 -> 3×.
 */
const VIEW_TARGET = { w: 840, h: 480 };
/** Zoom terbesar: sisi layar terpendek masih menampilkan ± 6 petak (160 px dunia). */
const VIEW_MIN_SIDE = 160;
const ZOOM_MAX = 6;
/** Zoom pilihan pemain (+/−) diingat per browser; hanya kenyamanan, boleh hilang. */
const ZOOM_KEY = "mita:zoom";

function savedZoom(): number {
  try {
    return Number(localStorage.getItem(ZOOM_KEY)) || 0;
  } catch {
    return 0;
  }
}

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
  private account!: Account;
  private auth!: AuthService;
  private cfg!: CharacterConfig;
  private catalog?: MateriCatalog;
  private placed: Placed[] = [];
  private focus?: Interactable;
  private focusImages: Phaser.GameObjects.Image[] = [];
  private marker!: Phaser.GameObjects.Image;
  private zone?: Zone;
  private zoomLevel = 0;
  /** Zoom pilihan pemain; 0 = bawaan menurut ukuran layar. */
  private zoomPref = savedZoom();
  private ready = false;
  private transitioning = false;
  private remotes!: RemotePlayers;
  /** seatId -> sid pemain yang duduk (dari server). */
  private seats = new Map<number, number>();
  private mySid = -1;
  private debugTeleported = false;
  private myUid = "";
  private kelasState: ClassState = { active: false, files: [] };
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
    this.seats = new Map();
    this.mySid = -1;
    this.kelasState = { active: false, files: [] };
  }

  create(): void {
    showLoading(true, this.roomCode === "kampus" ? "Memuat kampus…" : "Memuat ruang kelas…");
    this.build().catch((err: unknown) => {
      console.error(err);
      showError(`Gagal memuat ruangan "${this.roomCode}". ${err instanceof Error ? err.message : ""}`);
    });
  }

  private async build(): Promise<void> {
    // Akun dan layanan akun diisi main.ts setelah pemain masuk dan punya avatar.
    this.account = this.registry.get("account") as Account;
    this.auth = this.registry.get("auth") as AuthService;
    await loadWorldUi(this);
    this.loaded = await loadMap(this, this.roomCode, setLoadingProgress);
    this.cfg = getAssembler().cfg;
    this.catalog = this.cache.json.get("materi") as MateriCatalog | undefined;
    this.room = readRoom(this.loaded.map);
    this.collision = new CollisionWorld(this.room.width, this.room.height, this.room.collisions);

    this.drawTiles();
    this.drawObjects();
    this.cameras.main.setBackgroundColor(this.loaded.map.backgroundcolor ?? "#1b2a41");

    // Ikon 22 × 26 px digambar setengah ukuran: penanda "panah oranye kecil" (docs/PETA.md).
    this.marker = this.add.image(0, 0, MARKER_KEY).setOrigin(0.5, 1).setScale(0.5).setVisible(false).setDepth(2e6);
    this.tweens.add({ targets: this.marker, y: "-=3", duration: 450, yoyo: true, repeat: -1, ease: "Sine.inOut" });

    this.setupInput();
    this.remotes = new RemotePlayers(this, (p) => chat.setTarget({ uid: p.uid, name: p.name, role: p.role }));
    if (DEBUG) this.drawDebug();
    this.spawnPlayer();
    void this.connect();
    showLoading(false);
    this.cameras.main.fadeIn(FADE_MS, 27, 42, 65);
    this.ready = true;
  }

  // ---------- multipemain ----------

  private async connect(): Promise<void> {
    const acc = this.account;
    try {
      await net.join(
        this.roomCode,
        { token: this.auth.token ?? "", spawn: this.spawnName },
        {
          welcome: (w) => {
            this.mySid = w.you;
            if (this.player) {
              this.player.x = w.x;
              this.player.y = w.y;
            }
            this.remotes.clear();
            for (const p of w.players) if (p.sid !== w.you) this.remotes.add(p);
            this.seats = new Map(Object.entries(w.seats).map(([k, v]) => [Number(k), v]));
            this.myUid = w.uid;
            chat.attach(net, { uid: w.uid, role: acc.role, name: acc.fullName }, w.history);
            this.onClassState(w.kelas ?? { active: false, files: [] }, undefined, true);
          },
          add: (p) => p.sid !== this.mySid && this.remotes.add(p),
          remove: (m) => this.remotes.remove(m.sid),
          snap: (d) => this.remotes.snapshot(d),
          chat: (m) => {
            chat.message(m);
            const who = m.from === this.mySid ? this.player : this.remotes.get(m.from)?.avatar;
            who?.say(m.mode === "pribadi" ? `🔒 ${m.text}` : m.text, m.mode);
          },
          dots: (m) => this.remotes.get(m.from)?.avatar.say("…", "dots"),
          seat: (m) => {
            if (m.sid === null) this.seats.delete(m.seatId);
            else this.seats.set(m.seatId, m.sid);
          },
          pmRequest: (r) => chat.pmRequest(r),
          pmStatus: (st) => chat.pmStatus(st),
          notice: (n) => chat.system(n.text),
          classState: (st) => this.onClassState(st, st.event),
          correct: (c) => {
            // Teleport uji (?debug=1) sengaja melompat; jangan ditarik kembali oleh server.
            if (!this.player || this.debugTeleported) return;
            this.player.x = c.x;
            this.player.y = c.y;
          },
          directory: (d) => chat.directory(d.players),
          leave: (code) => {
            if (code === CLOSE_ACCOUNT_REVOKED) {
              // Akun dinonaktifkan / sandi di-reset admin: kembali ke halaman masuk.
              void this.auth.logout().then(() => showError("Sesimu dicabut admin. Muat ulang halaman untuk masuk lagi."));
              return;
            }
            if (this.transitioning || !this.sys.isActive()) return;
            this.remotes.clear();
            chat.offline("Terputus dari server. Muat ulang halaman untuk menyambung lagi.");
          },
        },
      );
    } catch (e) {
      console.warn("multipemain tidak tersedia:", e);
      const msg = e instanceof Error && /penuh/.test(e.message) ? e.message : "Server multipemain tidak terhubung.";
      chat.offline(`${msg} Kamu bermain sendiri untuk sementara.`);
    }
  }

  // ---------- sesi kelas ----------

  private get isClassRoom(): boolean {
    return this.roomCode !== "kampus";
  }

  private onClassState(st: ClassState, event: string | undefined, joining = false): void {
    const prev = this.kelasState;
    this.kelasState = { active: st.active, dosenUid: st.dosenUid, dosenName: st.dosenName, materi: st.materi, startedAt: st.startedAt, files: st.files };
    chat.setClassContext(this.isClassRoom, st.active);
    const btn = document.getElementById("bahan");
    if (btn) {
      btn.hidden = !this.isClassRoom;
      btn.classList.toggle("live", st.active);
      btn.onclick = () => !isPanelOpen() && openBahanKelas(this.kelasState, this.room.title);
    }
    const iLead = st.dosenUid === this.myUid;
    // Masuk saat kelas sudah berjalan: diperlakukan seperti "kelas dimulai".
    const ev = joining && st.active ? "start" : event;
    if ((ev === "start" || ev === "materi") && st.materi && !iLead) {
      const t = ev === "start" ? `${st.dosenName} memulai kelas` : `${st.dosenName} mengganti materi`;
      toast(t, st.materi.title, [{ label: "Buka slide", primary: true, run: () => openSlide(st.materi!) }, { label: "Nanti", run: () => {} }]);
      chat.system(`${t}: ${st.materi.title}. Mode chat Kelas terbuka.`);
    }
    if (ev === "file" && !iLead) {
      const fresh = st.files.find((f) => !prev.files.some((p) => p.token === f.token));
      if (fresh) toast(`${fresh.fromName} membagikan file`, fresh.name, [{ label: "Unduh", primary: true, run: () => downloadFile(fresh) }]);
    }
    if (ev === "end" && prev.active) {
      toast("Kelas selesai", "Obrolan Kelas ditutup. File yang sudah dibagikan tetap bisa diunduh sampai kedaluwarsa.");
      chat.system("Kelas selesai.");
    }
    // Panel yang sedang terbuka mengikuti keadaan terbaru.
    const open = kelasPanelOpen();
    if (open && ev === "file") refreshFileLists(this.kelasState);
    else if (open === "dosen" && ev) openDosenPanel(this.kelasState, this.myUid, this.catalog, this.room.title);
    else if (open === "bahan" && ev) openBahanKelas(this.kelasState, this.room.title);
    else if (open && !ev) refreshFileLists(this.kelasState);
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
    const r = it.rect;
    // Benda harus menutupi setidaknya separuh lebarnya di atas persegi interaksi.
    const covers = (b: Phaser.Geom.Rectangle) => Math.min(b.right, r.x + r.w) - Math.max(b.x, r.x) >= Math.min(b.width, r.w) / 2;
    const near = this.placed.filter((p) => covers(p.bounds));
    // Utamakan benda yang telapaknya DI DALAM persegi (kursi, terminal). Bila tidak ada,
    // ambil benda yang berdiri tepat di belakangnya (rak, pintu: persegi ada di depannya).
    const inside = near.filter((p) => p.bounds.bottom > r.y + 2 && p.bounds.bottom <= r.y + r.h + 4);
    const behind = near.filter((p) => Math.abs(p.bounds.bottom - r.y) <= 4);
    if (inside.length || behind.length) return (inside.length ? inside : behind).map((p) => p.image);
    // Sisanya: benda di samping persegi (terminal di dinding) atau yang menutupinya
    // (kios lebih besar dari persegi); pilih yang telapaknya paling dekat.
    const grown = new Phaser.Geom.Rectangle(r.x - 8, r.y, r.w + 16, r.h);
    const touching = this.placed.filter((p) => Phaser.Geom.Intersects.RectangleToRectangle(p.bounds, grown));
    const gap = (p: Placed) => Math.abs(p.bounds.bottom - (r.y + r.h));
    const best = Math.min(...touching.map(gap));
    return touching.filter((p) => gap(p) === best).map((p) => p.image);
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
      sid: () => this.mySid,
      remotes: () => this.remotes.profiles().map((p) => ({ sid: p.sid, name: p.name, mirror: p.mirror ?? null, visible: !!this.remotes.get(p.sid)?.avatar.sprite.visible })),
      seats: () => Object.fromEntries(this.seats),
      zoom: () => this.zoomLevel,
      glow: () => this.focusImages.map((i) => i.texture.key.split("/").pop()),
      interactables: () => this.room.interactables.map((i) => ({ name: i.name, kind: i.kind, rect: i.rect })),
      teleport: (x: number, y: number) => {
        if (this.player) {
          this.player.x = x;
          this.player.y = y;
          this.player.sitting = false;
          this.debugTeleported = true;
        }
      },
    };
  }

  // ---------- pemain ----------

  private spawnPlayer(): void {
    const s = this.room.spawns[this.spawnName] ?? this.room.spawns.awal ?? this.room.spawns.dari_lobi ?? Object.values(this.room.spawns)[0];
    this.player = new Avatar(this, this.account.character!, this.account.fullName, s.x, s.y);
    const cam = this.cameras.main;
    cam.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 24);
    cam.setRoundPixels(true);
    this.applyZoom();
    this.player.update(0, this.cfg.movement, false);
    cam.centerOn(this.player.x, this.player.y - 24);
  }

  private maxZoom(): number {
    const { width, height } = this.scale;
    return Phaser.Math.Clamp(Math.floor(Math.min(width, height) / VIEW_MIN_SIDE), 1, ZOOM_MAX);
  }

  private defaultZoom(): number {
    const { width, height } = this.scale;
    const z = Math.floor(Math.min(width / VIEW_TARGET.w, height / VIEW_TARGET.h));
    return Phaser.Math.Clamp(z, 1, this.maxZoom());
  }

  private changeZoom(delta: number): void {
    this.zoomPref = Phaser.Math.Clamp(this.zoomLevel + delta, 1, this.maxZoom());
    try {
      localStorage.setItem(ZOOM_KEY, String(this.zoomPref));
    } catch {
      // Tanpa penyimpanan, pilihan berlaku sampai halaman ditutup.
    }
    this.applyZoom();
  }

  /** Zoom selalu bilangan bulat agar piksel tetap tajam. */
  private applyZoom(): void {
    // Pilihan pemain dipakai selama masih muat di layar ini (mis. setelah jendela diperkecil).
    this.zoomLevel = Math.min(this.zoomPref || this.defaultZoom(), this.maxZoom());
    const cam = this.cameras.main;
    cam.setZoom(this.zoomLevel);
    // Ruangan yang lebih kecil dari layar diletakkan di tengah: batas kamera
    // diperlebar ke kedua sisi sehingga sisa layar terbagi rata.
    const vw = this.scale.width / this.zoomLevel, vh = this.scale.height / this.zoomLevel;
    const { width: rw, height: rh } = this.room;
    cam.setBounds(Math.min(0, (rw - vw) / 2), Math.min(0, (rh - vh) / 2), Math.max(rw, vw), Math.max(rh, vh));
    this.player?.setTextResolution(this.zoomLevel);
    this.remotes?.setZoom(this.zoomLevel);
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
    kb.on("keydown-MINUS", () => this.changeZoom(-1));
    kb.on("keydown-NUMPAD_SUBTRACT", () => this.changeZoom(-1));
    kb.on("keydown-PLUS", () => this.changeZoom(1));
    kb.on("keydown-NUMPAD_ADD", () => this.changeZoom(1));
    onTouchAction(() => this.interact());
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      kb.removeAllListeners();
      this.remotes?.clear();
    });
  }

  private onResize(): void {
    this.applyZoom();
  }

  private editCharacter(): void {
    if (!this.ready || isPanelOpen()) return;
    openCreator(getAssembler(), {
      name: this.account.fullName,
      choice: this.account.character,
      onSave: async (choice) => {
        this.account = await this.auth.saveCharacter(choice);
        this.registry.set("account", this.account);
        this.player!.setChoice(choice);
      },
    });
  }

  private interact(): void {
    if (!this.ready || this.transitioning || !this.player) return;
    if (isPanelOpen()) return;
    if (this.player.sitting) {
      this.player.sitting = false;
      net.send("sit", { seatId: null });
      return;
    }
    const it = this.focus;
    if (!it) return;
    switch (it.kind) {
      case "door":
        this.goTo(String(it.props.target), String(it.props.spawn));
        break;
      case "materi":
        openCatalog(this.catalog);
        break;
      case "terminal":
        openTerminal();
        break;
      case "seat":
        this.sit(it);
        break;
      case "teacher_desk":
        if (this.account.role === "dosen") openDosenPanel(this.kelasState, this.myUid, this.catalog, this.room.title);
        else openBahanKelas(this.kelasState, this.room.title);
        break;
      default:
        openInfo(it);
    }
  }

  private sit(it: Interactable): void {
    const p = this.player!;
    const seatId = Number(it.props.seatId);
    const taken = this.seats.get(seatId);
    if (taken !== undefined && taken !== this.mySid) {
      chat.system(`Kursi ${seatId} sudah diduduki ${this.remotes.get(taken)?.profile.name ?? "pemain lain"}.`);
      return;
    }
    net.send("sit", { seatId });
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
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      void net.leave().then(() => this.scene.restart({ room: target, spawn } satisfies WorldData));
    });
  }

  // ---------- putaran ----------

  update(_time: number, deltaMs: number): void {
    const p = this.player;
    if (!this.ready || !p) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    const k = this.keys;
    const frozen = isPanelOpen() || this.transitioning || chat.isTyping();
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
    net.sendMove(p.x, p.y, DIRS.indexOf(p.dir), (p.moving ? FLAG_MOVING : 0) | (p.sitting ? FLAG_SITTING : 0), this.time.now);
    this.remotes.update(dt, this.cfg.movement);
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
      const label = it?.kind === "teacher_desk" ? (this.account.role === "dosen" ? "Kelola kelas" : "Bahan kelas") : it ? actionLabel(it) : null;
      setPrompt(label ?? (p.sitting ? "Berdiri (atau bergerak)" : null));
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

