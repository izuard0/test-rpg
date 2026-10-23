// Ruang Colyseus untuk satu peta: "kampus" (satu ruang bersama) atau satu kelas.
// Tanpa state schema: posisi dikirim sebagai cuplikan 10 Hz yang hanya memuat pemain
// di sekitar penerima, profil dikirim sekali, chat disaring penerimanya di server.

import { Room, type Client } from "@colyseus/core";
import {
  CHAT_HISTORY,
  CHAT_MIN_INTERVAL_MS,
  DIRS,
  FLAG_MOVING,
  FLAG_SITTING,
  GLOBAL_KAMPUS_INTERVAL_MS,
  NET_HZ,
  PM_REQUEST_MAX_LEN,
  ROOM_WIDE_RADIUS,
  VIEW_HALF_TILES,
  cleanChatText,
  defaultChoice,
  footBox,
  maskProfanity,
  normalizeId,
  normalizeName,
  sanitizeChoice,
  validateId,
  zoneAt,
  type C2S,
  type CharacterConfig,
  type ChatMessage,
  type JoinOptions,
} from "@mita/shared";
import { hub, send, type Session } from "./hub.js";
import type { World, WorldRoom } from "./world.js";

export interface GameContext {
  world: World;
  cfg: CharacterConfig;
  runSpeed: number;
}

let ctx: GameContext;
export function setGameContext(c: GameContext): void {
  ctx = c;
}

export class GameRoom extends Room {
  private code = "kampus";
  private map!: WorldRoom;
  private readonly mine = new Map<string, Session>(); // sessionId -> sesi
  private readonly seats = new Map<number, number>(); // seatId -> sid
  private readonly history: ChatMessage[] = [];
  /** sid pemain kelas yang sedang dicerminkan ke klien kampus. */
  private mirrored = new Set<number>();

  onCreate(options: { kelas?: string }): void {
    this.code = this.roomName === "kelas" ? String(options.kelas ?? "") : "kampus";
    const map = ctx.world.rooms.get(this.code);
    if (!map || (this.roomName === "kelas" && !/^kelas-/.test(this.code))) throw new Error(`Ruang tidak dikenal: ${this.code}`);
    this.map = map;
    this.maxClients = Math.max(1, map.data.capacity || 150);
    this.autoDispose = this.roomName === "kelas";
    this.setPatchRate(null);

    this.onMessage("move", (c, m: C2S["move"]) => this.onMove(c, m));
    this.onMessage("chat", (c, m: C2S["chat"]) => this.onChat(c, m));
    this.onMessage("sit", (c, m: C2S["sit"]) => this.onSit(c, m));
    this.onMessage("pmAsk", (c, m: C2S["pmAsk"]) => this.onPmAsk(c, m));
    this.onMessage("pmAnswer", (c, m: C2S["pmAnswer"]) => {
      const s = this.mine.get(c.sessionId);
      if (s?.role === "dosen" && typeof m?.from === "string") hub.answer(s, m.from, !!m.accept, Date.now());
    });
    this.onMessage("pmClose", (c, m: C2S["pmClose"]) => {
      const s = this.mine.get(c.sessionId);
      if (s && typeof m?.peer === "string") hub.close(s, m.peer);
    });
    this.onMessage("pmMute", (c, m: C2S["pmMute"]) => {
      const s = this.mine.get(c.sessionId);
      if (s) hub.setMuted(s, !!m?.muted);
    });
    this.onMessage("directory", (c) => send(c, "directory", { players: hub.directory() }));

    this.clock.setInterval(() => this.tick(), 1000 / NET_HZ);
    if (this.code === "kampus") this.clock.setInterval(() => hub.sweep(Date.now()), 5000);
  }

  onAuth(_client: Client, options: JoinOptions): JoinOptions {
    // Mode uji: identitas dari akun di browser. Tahap 5 menggantinya dengan sesi login.
    if (validateId(options?.role === "dosen" ? "dosen" : "mahasiswa", String(options?.id ?? ""))) throw new Error("NIM/NIP tidak sah.");
    if (normalizeName(String(options?.name ?? "")).length < 2) throw new Error("Nama tidak sah.");
    return options;
  }

  onJoin(client: Client, options: JoinOptions): void {
    const role = options.role === "dosen" ? "dosen" : "mahasiswa";
    const accountId = normalizeId(options.id);
    const base = this.map.data.spawns[options.spawn ?? ""] ?? this.map.data.spawns.awal ?? this.map.data.spawns.dari_lobi ?? Object.values(this.map.data.spawns)[0];
    const spawn = this.scatter(base);
    const s: Session = {
      sid: hub.allocSid(),
      uid: hub.uidFor(accountId),
      accountId,
      name: normalizeName(options.name).slice(0, 60),
      role,
      choice: options.choice ? sanitizeChoice(ctx.cfg, options.choice) : defaultChoice(ctx.cfg, "L"),
      client,
      room: { code: this.code, title: this.map.data.title },
      x: spawn.x,
      y: spawn.y,
      dir: 0,
      flags: 0,
      seatId: null,
      lastMoveAt: Date.now(),
      lastChatAt: 0,
      lastGlobalAt: 0,
    };
    this.mine.set(client.sessionId, s);
    hub.add(s);
    for (const other of this.mine.values()) if (other !== s) send(other.client, "add", hub.profile(s));
    const players = [...this.mine.values()].map((p) => hub.profile(p));
    if (this.code === "kampus") {
      const mirrors = this.mirrorSessions();
      players.push(...mirrors.map((m) => hub.profile(m, m.room.code)));
    }
    send(client, "welcome", {
      you: s.sid,
      x: s.x,
      y: s.y,
      uid: s.uid,
      room: this.code,
      players,
      seats: Object.fromEntries(this.seats),
      history: this.history,
    });
  }

  onLeave(client: Client): void {
    const s = this.mine.get(client.sessionId);
    if (!s) return;
    this.mine.delete(client.sessionId);
    hub.remove(s.sid);
    if (s.seatId !== null) this.freeSeat(s);
    for (const other of this.mine.values()) send(other.client, "remove", { sid: s.sid });
  }

  /** Titik bebas acak dalam ± 2 petak dari titik muncul (docs/PETA.md: muncul acak agar tidak bertumpuk). */
  private scatter(p: { x: number; y: number }): { x: number; y: number } {
    const r = this.map.data.tile * 2;
    for (let i = 0; i < 20; i++) {
      const x = Math.round(p.x + (Math.random() * 2 - 1) * r);
      const y = Math.round(p.y + (Math.random() * 2 - 1) * r);
      if (!this.map.collision.blocked(footBox(x, y))) return { x, y };
    }
    return p;
  }

  // ----- gerak -----

  private onMove(c: Client, m: C2S["move"]): void {
    const s = this.mine.get(c.sessionId);
    if (!s || !Array.isArray(m) || m.length < 4) return;
    const [x, y, dir, flags] = m.map(Number);
    if (![x, y, dir, flags].every(Number.isFinite)) return;
    const now = Date.now();
    // Kecepatan dibatasi (lari + toleransi jaringan); posisi harus di dalam dunia dan tidak di rintangan.
    const maxStep = ctx.runSpeed * Math.max(0.1, (now - s.lastMoveAt) / 1000) * 1.6 + 12;
    const dist = Math.hypot(x - s.x, y - s.y);
    const sitting = (flags & FLAG_SITTING) !== 0 && s.seatId !== null;
    const inside = x >= 0 && y >= 0 && x <= this.map.data.width && y <= this.map.data.height;
    if (inside && !sitting && dist <= maxStep && !this.map.collision.blocked(footBox(x, y))) {
      s.x = Math.round(x);
      s.y = Math.round(y);
    } else if (!sitting && dist > 2) {
      // Tanpa koreksi, posisi klien dan server berbeda selamanya dan pemain tampak membeku.
      send(c, "correct", { x: s.x, y: s.y });
    }
    s.dir = Math.max(0, Math.min(DIRS.length - 1, dir | 0));
    s.flags = (flags & FLAG_MOVING) | (s.seatId !== null ? FLAG_SITTING : 0);
    s.lastMoveAt = now;
    if (s.seatId !== null && (flags & FLAG_SITTING) === 0) this.freeSeat(s);
  }

  // ----- kursi kelas -----

  private onSit(c: Client, m: C2S["sit"]): void {
    const s = this.mine.get(c.sessionId);
    if (!s) return;
    if (m?.seatId === null || m?.seatId === undefined) {
      if (s.seatId !== null) this.freeSeat(s);
      return;
    }
    const seatId = Number(m.seatId);
    const seat = this.map.seats.get(seatId);
    if (!seat) return;
    const taken = this.seats.get(seatId);
    if (taken !== undefined && taken !== s.sid) {
      send(c, "notice", { text: "Kursi itu sudah diduduki." });
      send(c, "seat", { seatId, sid: taken });
      return;
    }
    if (Math.hypot(seat.x - s.x, seat.y - s.y) > this.map.data.tile * 2.5) return;
    if (s.seatId !== null) this.freeSeat(s);
    s.seatId = seatId;
    s.x = seat.x;
    s.y = seat.y;
    s.dir = DIRS.indexOf("up");
    s.flags = FLAG_SITTING;
    this.seats.set(seatId, s.sid);
    this.broadcast("seat", { seatId, sid: s.sid });
  }

  private freeSeat(s: Session): void {
    if (s.seatId === null) return;
    if (this.seats.get(s.seatId) === s.sid) {
      this.seats.delete(s.seatId);
      this.broadcast("seat", { seatId: s.seatId, sid: null });
    }
    s.seatId = null;
    s.flags &= ~FLAG_SITTING;
  }

  // ----- cuplikan posisi -----

  /** Pemain di ruang kelas, untuk dicerminkan ke denah kampus. */
  private mirrorSessions(): Session[] {
    if (this.code !== "kampus") return [];
    return [...hub.sessions.values()].filter((s) => ctx.world.mirrorOffset.has(s.room.code));
  }

  private tick(): void {
    if (!this.mine.size) return;
    const tile = this.map.data.tile;
    const hx = VIEW_HALF_TILES.x * tile, hy = VIEW_HALF_TILES.y * tile;
    // Pemain kelas tampak di kampus dengan posisi digeser ke ruang "tampak"-nya.
    const mirrors = this.mirrorSessions().map((s) => {
      const off = ctx.world.mirrorOffset.get(s.room.code)!;
      return { s, x: s.x + off.x, y: s.y + off.y };
    });
    if (this.code === "kampus") this.syncMirrors(mirrors.map((m) => m.s));
    const everyone = [...[...this.mine.values()].map((s) => ({ s, x: s.x, y: s.y })), ...mirrors];
    for (const me of this.mine.values()) {
      const out: number[] = [];
      for (const o of everyone) {
        if (o.s === me) continue;
        if (Math.abs(o.x - me.x) > hx || Math.abs(o.y - me.y) > hy) continue;
        out.push(o.s.sid, o.x, o.y, o.s.dir, o.s.flags);
      }
      send(me.client, "snap", out);
    }
  }

  private syncMirrors(current: Session[]): void {
    const now = new Set(current.map((s) => s.sid));
    for (const s of current) {
      if (this.mirrored.has(s.sid)) continue;
      for (const me of this.mine.values()) send(me.client, "add", hub.profile(s, s.room.code));
    }
    for (const sid of this.mirrored) {
      if (now.has(sid)) continue;
      for (const me of this.mine.values()) send(me.client, "remove", { sid });
    }
    this.mirrored = now;
  }

  // ----- chat -----

  private onChat(c: Client, m: C2S["chat"]): void {
    const s = this.mine.get(c.sessionId);
    if (!s) return;
    const text = maskProfanity(cleanChatText(m?.text));
    if (!text) return;
    const now = Date.now();
    if (now - s.lastChatAt < CHAT_MIN_INTERVAL_MS) return send(c, "notice", { text: "Pelan-pelan: maksimal 1 pesan per detik." });
    const zone = zoneAt(this.map.data, s.x, s.y);
    const msg: ChatMessage = { mode: m.mode, from: s.sid, fromUid: s.uid, fromName: s.name, fromRole: s.role, text, at: now };

    if (m.mode === "global") {
      if (zone && !zone.chatPublic) return send(c, "notice", { text: `Global tidak bisa dikirim dari ${zone.name} (ruang tenang). Pakai Sekitar atau Pribadi.` });
      if (this.code === "kampus" && now - s.lastGlobalAt < GLOBAL_KAMPUS_INTERVAL_MS) {
        return send(c, "notice", { text: `Global di kampus: tunggu ${Math.ceil((GLOBAL_KAMPUS_INTERVAL_MS - (now - s.lastGlobalAt)) / 1000)} detik lagi.` });
      }
      s.lastGlobalAt = now;
      s.lastChatAt = now;
      this.history.push(msg);
      if (this.history.length > CHAT_HISTORY) this.history.shift();
      this.broadcast("chat", msg);
      return;
    }

    if (m.mode === "pribadi") {
      const targets = typeof m.to === "string" ? hub.byUid(m.to) : [];
      const to = targets[0];
      if (!to) return send(c, "notice", { text: "Penerima sedang tidak daring." });
      if (to.uid === s.uid) return;
      if (!hub.canPrivate(s, to)) {
        return send(c, "notice", { text: `Untuk chat dengan ${to.name} (dosen), kirim permintaan dulu dan tunggu persetujuan.` });
      }
      hub.grantByDosen(s, to);
      s.lastChatAt = now;
      const pm: ChatMessage = { ...msg, to: to.uid, toName: to.name };
      // Hanya pengirim dan penerima yang menerima isi pesan (penyaringan di server).
      for (const r of [...hub.byUid(s.uid), ...targets]) send(r.client, "chat", { ...pm, from: r.room.code === s.room.code ? s.sid : -1 });
      return;
    }

    // Sekitar: radius zona dalam petak; radius besar = seluruh zona (ruang diskusi).
    s.lastChatAt = now;
    const radius = (zone?.chatRadius ?? 3) * this.map.data.tile;
    const hx = VIEW_HALF_TILES.x * this.map.data.tile, hy = VIEW_HALF_TILES.y * this.map.data.tile;
    const local: ChatMessage = { ...msg, mode: "sekitar" };
    for (const r of this.mine.values()) {
      const near = zone && zone.chatRadius >= ROOM_WIDE_RADIUS ? zoneAt(this.map.data, r.x, r.y) === zone : Math.hypot(r.x - s.x, r.y - s.y) <= radius;
      if (near) send(r.client, "chat", local);
      else if (Math.abs(r.x - s.x) <= hx && Math.abs(r.y - s.y) <= hy) send(r.client, "dots", { from: s.sid });
    }
  }

  private onPmAsk(c: Client, m: C2S["pmAsk"]): void {
    const s = this.mine.get(c.sessionId);
    if (!s || typeof m?.to !== "string") return;
    const to = hub.byUid(m.to)[0];
    if (!to) return send(c, "notice", { text: "Dosen sedang tidak daring." });
    const text = maskProfanity(cleanChatText(m.text, PM_REQUEST_MAX_LEN));
    if (!text) return send(c, "notice", { text: "Tulis pesan pembuka singkat untuk dosen." });
    const r = hub.ask(s, to, text, Date.now());
    hub.notifyStatus(s.uid, to.uid, to.name, r.ok ? "pending" : r.state);
    if (!r.ok) send(c, "notice", { text: r.reason });
  }
}
