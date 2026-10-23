// Sambungan multipemain (Colyseus). Satu ruang aktif pada satu waktu: pindah peta =
// keluar dari ruang lama lalu masuk ruang baru. Bila server tidak bisa dihubungi,
// game tetap berjalan sendiri (mode sendiri) dan chat dinonaktifkan.

import { Client, type Room } from "@colyseus/sdk";
import { NET_HZ, ROOM_KAMPUS, ROOM_KELAS, type C2S, type JoinOptions, type S2C } from "@mita/shared";

type Handlers = { [K in keyof S2C]?: (msg: S2C[K]) => void } & { leave?: (code: number) => void };

export function serverUrl(): string {
  const q = new URLSearchParams(location.search).get("server");
  if (q) return q;
  // Saat pengembangan, Vite (5173) dan server game (3000) berjalan terpisah.
  if (location.port === "5173") return `${location.protocol}//${location.hostname}:3000`;
  return location.origin;
}

export class GameNet {
  private room?: Room;
  private lastSent = "";
  private lastSentAt = 0;
  private authToken = "";

  get connected(): boolean {
    return !!this.room;
  }

  /** sessionId ruang aktif; dipakai rute HTTP (unggah/unduh file kelas). */
  get sessionId(): string | undefined {
    return this.room?.sessionId;
  }

  /** Header untuk rute HTTP yang terikat sesi game (token login pemilik sesi). */
  authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.authToken}` };
  }

  async join(map: string, opts: Omit<JoinOptions, "kelas">, on: Handlers): Promise<void> {
    await this.leave();
    this.authToken = opts.token;
    const client = new Client(serverUrl());
    const name = map === "kampus" ? ROOM_KAMPUS : ROOM_KELAS;
    const room = await client.joinOrCreate(name, map === "kampus" ? opts : { ...opts, kelas: map });
    for (const [type, fn] of Object.entries(on)) {
      if (type === "leave") continue;
      room.onMessage(type, fn as (m: unknown) => void);
    }
    room.onLeave((code) => {
      if (this.room === room) this.room = undefined;
      on.leave?.(code);
    });
    this.room = room;
  }

  async leave(): Promise<void> {
    const r = this.room;
    this.room = undefined;
    this.lastSent = "";
    if (r) await r.leave().catch(() => undefined);
  }

  send<K extends keyof C2S>(type: K, msg: C2S[K]): void {
    this.room?.send(type, msg);
  }

  /** Posisi dikirim paling sering NET_HZ kali per detik, dan hanya bila berubah (atau tiap 1 detik). */
  sendMove(x: number, y: number, dir: number, flags: number, now: number): void {
    if (!this.room || now - this.lastSentAt < 1000 / NET_HZ) return;
    const key = `${Math.round(x)},${Math.round(y)},${dir},${flags}`;
    if (key === this.lastSent && now - this.lastSentAt < 1000) return;
    this.lastSent = key;
    this.lastSentAt = now;
    this.room.send("move", [Math.round(x), Math.round(y), dir, flags]);
  }
}

export const net = new GameNet();
