// Data pemain sebelum fitur login ada (tahap 5). Disimpan di sessionStorage:
// bertahan saat halaman dimuat ulang, hilang saat tab ditutup. Komputer lab
// dipakai bergantian, jadi tidak memakai localStorage (docs/RANCANGAN.md).

import type { CharacterChoice } from "@mita/shared";

export interface PlayerProfile {
  /** Nama lengkap (tanpa username). Sementara diisi sendiri; kelak dari daftar NIM. */
  name: string;
  choice: CharacterChoice;
}

const KEY = "mita:profil";

export function loadProfile(): PlayerProfile | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlayerProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: PlayerProfile): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Penyimpanan diblokir (mode privat): profil tetap berlaku selama halaman terbuka.
  }
}
