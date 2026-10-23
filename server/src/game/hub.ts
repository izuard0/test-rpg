// Keadaan bersama semua ruang dalam satu proses: sesi pemain, izin pesan pribadi,
// dan permintaan chat mahasiswa ke dosen. Tidak ada yang ditulis ke database:
// isi chat hanya diteruskan (docs/RANCANGAN.md bagian 4).

import { randomBytes } from "node:crypto";
import type { Client } from "@colyseus/core";
import {
  PM_REQUEST_TTL_MS,
  PM_RETRY_AFTER_DECLINE_MS,
  type CharacterChoice,
  type PmState,
  type Profile,
  type Role,
  type S2C,
} from "@mita/shared";

export interface RoomRef {
  /** "kampus" atau kode kelas ("kelas-a"). */
  code: string;
  title: string;
}

export interface Session {
  sid: number;
  uid: string;
  accountId: string;
  name: string;
  role: Role;
  choice: CharacterChoice;
  client: Client;
  room: RoomRef;
  x: number;
  y: number;
  dir: number;
  flags: number;
  seatId: number | null;
  lastMoveAt: number;
  lastChatAt: number;
  lastGlobalAt: number;
}

interface PendingRequest {
  fromUid: string;
  toUid: string;
  text: string;
  expiresAt: number;
}

export function send<K extends keyof S2C>(client: Client, type: K, msg: S2C[K]): void {
  client.send(type, msg);
}

export class Hub {
  private nextSid = 1;
  readonly sessions = new Map<number, Session>();
  /** accountId -> uid, tetap selama server berjalan (pindah ruang tidak mengubahnya). */
  private readonly uids = new Map<string, string>();
  /** Izin mahasiswa -> dosen yang sudah disetujui: "mhsUid|dosenUid". */
  private readonly approved = new Set<string>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly declinedUntil = new Map<string, number>();
  /** Dosen yang sementara tidak menerima permintaan chat (uid). */
  private readonly muted = new Set<string>();
  /** Penghapusan izin ditunda sebentar: pindah ruang = keluar lalu masuk lagi. */
  private readonly goneTimers = new Map<string, NodeJS.Timeout>();

  allocSid(): number {
    return this.nextSid++;
  }

  uidFor(accountId: string): string {
    let uid = this.uids.get(accountId);
    if (!uid) this.uids.set(accountId, (uid = randomBytes(6).toString("base64url")));
    return uid;
  }

  add(s: Session): void {
    this.sessions.set(s.sid, s);
    const t = this.goneTimers.get(s.uid);
    if (t) {
      clearTimeout(t);
      this.goneTimers.delete(s.uid);
    }
  }

  remove(sid: number): void {
    const s = this.sessions.get(sid);
    if (!s) return;
    this.sessions.delete(sid);
    if (this.byUid(s.uid).length) return;
    // Benar-benar keluar (bukan pindah ruang): izin dan permintaan berakhir setelah 30 detik.
    this.goneTimers.set(
      s.uid,
      setTimeout(() => {
        this.goneTimers.delete(s.uid);
        if (this.byUid(s.uid).length) return;
        for (const key of [...this.approved]) {
          if (!key.split("|").includes(s.uid)) continue;
          this.approved.delete(key);
          const [a, b] = key.split("|");
          const peer = a === s.uid ? b : a;
          this.notifyStatus(peer, s.uid, s.name, "offline");
        }
        for (const [key, p] of this.pending) if (p.fromUid === s.uid || p.toUid === s.uid) this.pending.delete(key);
        this.muted.delete(s.uid);
      }, 30_000),
    );
  }

  byUid(uid: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.uid === uid);
  }

  inRoom(code: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.room.code === code);
  }

  profile(s: Session, mirror?: string): Profile {
    return { sid: s.sid, uid: s.uid, name: s.name, role: s.role, choice: s.choice, ...(mirror ? { mirror } : {}) };
  }

  directory(): S2C["directory"]["players"] {
    const seen = new Map<string, S2C["directory"]["players"][number]>();
    for (const s of this.sessions.values()) seen.set(s.uid, { uid: s.uid, name: s.name, role: s.role, place: s.room.title });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
  }

  // ----- pesan pribadi -----

  private key(mhs: string, dosen: string): string {
    return `${mhs}|${dosen}`;
  }

  /** Boleh mengirim pesan pribadi sekarang? Hanya mahasiswa -> dosen yang butuh izin. */
  canPrivate(from: Session, to: Session): boolean {
    if (!(from.role === "mahasiswa" && to.role === "dosen")) return true;
    return this.approved.has(this.key(from.uid, to.uid));
  }

  /** Dosen yang memulai percakapan sekaligus memberi izin mahasiswa membalas. */
  grantByDosen(dosen: Session, mhs: Session): void {
    if (dosen.role === "dosen" && mhs.role === "mahasiswa") this.approved.add(this.key(mhs.uid, dosen.uid));
  }

  ask(from: Session, to: Session, text: string, now: number): { ok: true } | { ok: false; state: PmState; reason: string } {
    if (this.canPrivate(from, to)) return { ok: false, state: "accepted", reason: "Percakapan sudah diizinkan." };
    if (this.muted.has(to.uid)) return { ok: false, state: "muted", reason: `${to.name} sedang tidak menerima permintaan chat.` };
    const key = this.key(from.uid, to.uid);
    const until = this.declinedUntil.get(key) ?? 0;
    if (until > now) {
      return { ok: false, state: "declined", reason: `Permintaan sebelumnya ditolak. Coba lagi dalam ${Math.ceil((until - now) / 60_000)} menit.` };
    }
    const prev = this.pending.get(key);
    if (prev && prev.expiresAt > now) return { ok: false, state: "pending", reason: "Masih menunggu jawaban dosen." };
    const req = { fromUid: from.uid, toUid: to.uid, text, expiresAt: now + PM_REQUEST_TTL_MS };
    this.pending.set(key, req);
    for (const t of this.byUid(to.uid)) send(t.client, "pmRequest", { from: from.uid, fromName: from.name, text, expiresAt: req.expiresAt });
    return { ok: true };
  }

  answer(dosen: Session, mhsUid: string, accept: boolean, now: number): void {
    const key = this.key(mhsUid, dosen.uid);
    const req = this.pending.get(key);
    if (!req || req.expiresAt <= now) {
      this.pending.delete(key);
      return;
    }
    this.pending.delete(key);
    if (accept) this.approved.add(key);
    else this.declinedUntil.set(key, now + PM_RETRY_AFTER_DECLINE_MS);
    this.notifyStatus(mhsUid, dosen.uid, dosen.name, accept ? "accepted" : "declined");
    this.notifyStatus(dosen.uid, mhsUid, this.byUid(mhsUid)[0]?.name ?? "", accept ? "accepted" : "declined");
  }

  close(by: Session, peerUid: string): void {
    const keys = [this.key(by.uid, peerUid), this.key(peerUid, by.uid)];
    let any = false;
    for (const k of keys) any = this.approved.delete(k) || any;
    if (!any) return;
    this.notifyStatus(peerUid, by.uid, by.name, "closed");
    this.notifyStatus(by.uid, peerUid, this.byUid(peerUid)[0]?.name ?? "", "closed");
  }

  setMuted(dosen: Session, muted: boolean): void {
    if (dosen.role !== "dosen") return;
    if (muted) this.muted.add(dosen.uid);
    else this.muted.delete(dosen.uid);
  }

  /** Permintaan yang kedaluwarsa diberitahukan ke mahasiswa. Dipanggil berkala. */
  sweep(now: number): void {
    for (const [key, p] of this.pending) {
      if (p.expiresAt > now) continue;
      this.pending.delete(key);
      const dosen = this.byUid(p.toUid)[0];
      this.notifyStatus(p.fromUid, p.toUid, dosen?.name ?? "", "expired");
    }
    for (const [key, until] of this.declinedUntil) if (until <= now) this.declinedUntil.delete(key);
  }

  notifyStatus(toUid: string, peerUid: string, peerName: string, state: PmState): void {
    for (const s of this.byUid(toUid)) send(s.client, "pmStatus", { peer: peerUid, peerName, state });
  }
}

export const hub = new Hub();
