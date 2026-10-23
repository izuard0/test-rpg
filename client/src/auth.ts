// Akun pemain. Antarmuka `AuthService` sengaja dibuat seperti API server
// (tahap 5): saat server siap, `LocalAuth` diganti klien HTTP tanpa mengubah layar.
//
// MODE UJI: `LocalAuth` menyimpan akun di browser ini saja (localStorage).
// Tidak ada verifikasi NIM ke daftar kelas, dan akun tidak berpindah perangkat.
// Kata sandi tidak disimpan apa adanya: hanya hash PBKDF2 + garam.

import {
  normalizeId,
  normalizeName,
  validateRegistration,
  type CharacterChoice,
  type FieldErrors,
  type Registration,
  type Role,
} from "@mita/shared";

export interface Account {
  role: Role;
  id: string;
  fullName: string;
  /** `null` = belum membuat avatar (langkah setelah daftar). */
  character: CharacterChoice | null;
}

export class AuthError extends Error {
  constructor(message: string, readonly fields: FieldErrors = {}) {
    super(message);
  }
}

export interface AuthService {
  readonly testMode: boolean;
  register(r: Registration & { password2: string }): Promise<Account>;
  login(id: string, password: string): Promise<Account>;
  saveCharacter(choice: CharacterChoice): Promise<Account>;
  /** Akun yang sedang masuk di tab ini, atau `null`. */
  current(): Account | null;
  logout(): void;
}

interface StoredAccount extends Account {
  salt: string;
  hash: string;
  createdAt: string;
}

const ACCOUNTS_KEY = "mita:uji:akun";
// Sesi per tab: komputer lab dipakai bergantian, jadi menutup tab = keluar.
const SESSION_KEY = "mita:sesi";

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // crypto.subtle hanya ada di HTTPS/localhost. Di server Coolify selalu HTTPS.
    throw new AuthError("Halaman harus dibuka lewat HTTPS (atau localhost) agar kata sandi bisa diamankan.");
  }
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 }, key, 256);
  return toHex(bits);
}

function readAccounts(): Record<string, StoredAccount> {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "{}") as Record<string, StoredAccount>;
  } catch {
    return {};
  }
}

function writeAccounts(all: Record<string, StoredAccount>): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
  } catch {
    throw new AuthError("Browser menolak menyimpan data (mode privat?). Coba jendela biasa.");
  }
}

const publicPart = ({ role, id, fullName, character }: StoredAccount): Account => ({ role, id, fullName, character });

export class LocalAuth implements AuthService {
  readonly testMode = true;

  async register(r: Registration & { password2: string }): Promise<Account> {
    const errors = validateRegistration(r);
    if (Object.keys(errors).length) throw new AuthError("Periksa kembali isian yang ditandai.", errors);
    const id = normalizeId(r.id);
    const all = readAccounts();
    if (all[id]) throw new AuthError("Akun sudah terdaftar. Silakan masuk.", { id: "Sudah terdaftar." });
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const acc: StoredAccount = {
      role: r.role,
      id,
      fullName: normalizeName(r.fullName),
      character: null,
      salt,
      hash: await hashPassword(r.password, salt),
      createdAt: new Date().toISOString(),
    };
    all[id] = acc;
    writeAccounts(all);
    this.setSession(id);
    return publicPart(acc);
  }

  async login(rawId: string, password: string): Promise<Account> {
    const id = normalizeId(rawId);
    const acc = readAccounts()[id];
    // Pesan sama untuk akun tidak ada dan sandi salah: tidak membocorkan NIM terdaftar.
    const fail = new AuthError("NIM/NIP atau kata sandi salah.");
    if (!acc) throw fail;
    if ((await hashPassword(password, acc.salt)) !== acc.hash) throw fail;
    this.setSession(id);
    return publicPart(acc);
  }

  async saveCharacter(choice: CharacterChoice): Promise<Account> {
    const id = this.sessionId();
    const all = readAccounts();
    const acc = id ? all[id] : undefined;
    if (!acc) throw new AuthError("Sesi berakhir. Silakan masuk lagi.");
    acc.character = choice;
    writeAccounts(all);
    return publicPart(acc);
  }

  current(): Account | null {
    const id = this.sessionId();
    const acc = id ? readAccounts()[id] : undefined;
    return acc ? publicPart(acc) : null;
  }

  logout(): void {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // abaikan
    }
  }

  private sessionId(): string | null {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }

  private setSession(id: string): void {
    try {
      sessionStorage.setItem(SESSION_KEY, id);
    } catch {
      // Tanpa sessionStorage, sesi hanya berlaku sampai halaman dimuat ulang.
    }
  }
}
