// Akun pemain di server (tahap 5). Daftar -> menunggu persetujuan admin di /panel -> masuk.
//
// Token sesi disimpan per tab (sessionStorage): komputer lab dipakai bergantian, jadi
// menutup tab = keluar. Peran dan nama selalu dari server, bukan dari browser.

import {
  validateRegistration,
  type AccountStatus,
  type AccountView,
  type CharacterChoice,
  type FieldErrors,
  type Registration,
} from "@mita/shared";
import { serverUrl } from "./net/net";

export type Account = AccountView;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly fields: FieldErrors & { current?: string } = {},
    /** Status akun bila sandi benar tetapi akun belum bisa dipakai. */
    readonly status?: AccountStatus,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "mita:sesi";

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(t: string | null): void {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Tanpa sessionStorage, sesi hanya berlaku sampai halaman dimuat ulang.
  }
}

export class AuthService {
  /** false = server belum memakai database (akun hilang saat server mulai ulang). */
  persistent = true;
  private tokenValue: string | null = readToken();

  get token(): string | null {
    return this.tokenValue;
  }

  async init(): Promise<void> {
    try {
      const r = await this.call<{ persistent: boolean }>("GET", "/api/auth/info");
      this.persistent = r.persistent;
    } catch {
      // Server tidak terjangkau: formulir tetap tampil, galat muncul saat dikirim.
    }
  }

  /** Mendaftar; akun menunggu persetujuan admin (tidak langsung masuk). */
  async register(r: Registration & { password2: string }): Promise<void> {
    const errors = validateRegistration(r);
    if (Object.keys(errors).length) throw new AuthError("Periksa kembali isian yang ditandai.", errors);
    await this.call("POST", "/api/auth/register", { role: r.role, id: r.id, fullName: r.fullName, password: r.password });
  }

  async login(id: string, password: string): Promise<Account> {
    const r = await this.call<{ token: string; account: Account }>("POST", "/api/auth/login", { id, password });
    this.setToken(r.token);
    return r.account;
  }

  /** Akun dari sesi tab ini (setelah muat ulang), atau null bila sesi sudah berakhir. */
  async restore(): Promise<Account | null> {
    if (!this.tokenValue) return null;
    try {
      return (await this.call<{ account: Account }>("GET", "/api/auth/me")).account;
    } catch {
      this.setToken(null);
      return null;
    }
  }

  async saveCharacter(choice: CharacterChoice): Promise<Account> {
    return (await this.call<{ account: Account }>("PUT", "/api/auth/character", { choice })).account;
  }

  async changePassword(current: string, password: string, password2: string): Promise<Account> {
    if (password !== password2) throw new AuthError("Kata sandi baru tidak sama.", { password2: "Kata sandi tidak sama." });
    return (await this.call<{ account: Account }>("POST", "/api/auth/password", { current, password })).account;
  }

  async logout(): Promise<void> {
    const had = this.tokenValue;
    this.setToken(null);
    if (had) await fetch(`${serverUrl()}/api/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${had}` } }).catch(() => undefined);
  }

  private setToken(t: string | null): void {
    this.tokenValue = t;
    writeToken(t);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.tokenValue) headers.authorization = `Bearer ${this.tokenValue}`;
    let res: Response;
    try {
      res = await fetch(`${serverUrl()}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new AuthError("Tidak bisa menghubungi server. Periksa koneksi internet lalu coba lagi.");
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: FieldErrors; status?: AccountStatus };
    if (!res.ok) throw new AuthError(data.error ?? `Gagal (${res.status}).`, data.fields ?? {}, data.status);
    return data as T;
  }
}
