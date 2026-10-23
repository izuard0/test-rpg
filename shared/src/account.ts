// Aturan akun: login NIM (mahasiswa) / NIP (dosen) + kata sandi, tanpa username
// (docs/RANCANGAN.md, "Login dengan NIM"). Dipakai formulir klien sekarang dan
// API server kelak, supaya pesan galatnya sama.

import type { CharacterChoice } from "./character.js";

export type Role = "mahasiswa" | "dosen";

export interface Registration {
  role: Role;
  /** NIM atau NIP, hanya angka. */
  id: string;
  fullName: string;
  password: string;
}

export const ROLE_ID_LABEL: Record<Role, string> = { mahasiswa: "NIM", dosen: "NIP" };

export const PASSWORD_MIN = 8;
export const NAME_MAX = 60;

/** Menghapus spasi dan pemisah yang sering ikut tersalin (titik, tanda hubung). */
export function normalizeId(raw: string): string {
  return raw.replace(/[\s.\-]/g, "");
}

/** Merapikan spasi nama lengkap. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export type FieldErrors = Partial<Record<"id" | "fullName" | "password" | "password2", string>>;

export function validateId(role: Role, raw: string): string | undefined {
  const id = normalizeId(raw);
  const label = ROLE_ID_LABEL[role];
  if (!id) return `${label} wajib diisi.`;
  if (!/^\d+$/.test(id)) return `${label} hanya berisi angka.`;
  // Panjang NIM berbeda antarkampus; NIP PNS 18 digit, NIP dosen yayasan bisa lebih pendek.
  if (id.length < 5 || id.length > 20) return `${label} harus 5–20 digit.`;
  return undefined;
}

export function validateRegistration(r: Registration & { password2?: string }): FieldErrors {
  const e: FieldErrors = {};
  const idErr = validateId(r.role, r.id);
  if (idErr) e.id = idErr;
  const name = normalizeName(r.fullName);
  if (name.length < 2) e.fullName = "Nama lengkap wajib diisi.";
  else if (name.length > NAME_MAX) e.fullName = `Nama lengkap maksimal ${NAME_MAX} karakter.`;
  else if (!/^[\p{L}][\p{L}\p{M} .,'’-]*$/u.test(name)) e.fullName = "Nama hanya boleh berisi huruf, spasi, titik, koma, apostrof, dan tanda hubung.";
  if (r.password.length < PASSWORD_MIN) e.password = `Kata sandi minimal ${PASSWORD_MIN} karakter.`;
  else if (r.password.toLowerCase() === normalizeId(r.id)) e.password = `Kata sandi tidak boleh sama dengan ${ROLE_ID_LABEL[r.role]}.`;
  if (r.password2 !== undefined && r.password2 !== r.password) e.password2 = "Kata sandi tidak sama.";
  return e;
}

// ----- API akun (tahap 5): akun di server, disetujui admin di /panel -----

export type AccountStatus = "menunggu" | "disetujui" | "ditolak" | "nonaktif";

/** Data akun yang dikirim ke pemiliknya (tanpa hash kata sandi). */
export interface AccountView {
  role: Role;
  /** NIM/NIP. */
  id: string;
  fullName: string;
  character: CharacterChoice | null;
  /** Admin me-reset kata sandi: wajib ganti sebelum main. */
  mustChangePassword: boolean;
  /** Label dari admin di name tag ("[tag] Nama"); null = tanpa tag. */
  tag: string | null;
}

// ----- tag nama (diberikan admin di /panel) -----

export const TAG_MAX = 12;

/**
 * Merapikan tag dari admin. Hasil "" = hapus tag; `null` = tidak sah. Kurung siku dibuang
 * karena ditambahkan saat tampil; hanya huruf, angka, spasi, dan . - _ & + yang boleh.
 */
export function normalizeTag(raw: string): string | null {
  const t = raw.replace(/[[\]]/g, "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length > TAG_MAX || !/^[\p{L}\p{N}][\p{L}\p{N} .\-_&+]*$/u.test(t)) return null;
  return t;
}

/** Teks name tag: "[tag] Nama". */
export const taggedName = (name: string, tag?: string | null) => (tag ? `[${tag}] ${name}` : name);

/** Pesan untuk akun yang belum bisa masuk (login dengan sandi benar, tetapi belum disetujui). */
export const STATUS_MESSAGE: Record<Exclude<AccountStatus, "disetujui">, string> = {
  menunggu: "Akunmu sedang menunggu persetujuan admin. Coba masuk lagi nanti.",
  ditolak: "Pendaftaran akunmu ditolak admin. Hubungi admin prodi bila ini keliru.",
  nonaktif: "Akunmu dinonaktifkan admin. Hubungi admin prodi.",
};

/** Kode tutup WebSocket saat akun dinonaktifkan / sesi dicabut di tengah permainan. */
export const CLOSE_ACCOUNT_REVOKED = 4401;
