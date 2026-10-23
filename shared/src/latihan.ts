// Format latihan terminal setelah dikompilasi (client/scripts/build-latihan.ts).
// Sumbernya berkas YAML di latihan/<mode>/; lihat latihan/README.md.

import type { ResultSet } from "./sql.js";

export type LatihanMode = "pseudocode" | "sql";

interface Base {
  /** `<mode>/<nama berkas tanpa .yaml>`, mis. "sql/02_angkatan_2023". */
  id: string;
  mode: LatihanMode;
  judul: string;
  mataKuliah?: string;
  deskripsi: string;
  kodeAwal: string;
}

export interface PseudoLatihan extends Base {
  mode: "pseudocode";
  /** Masukan uji dan keluaran yang diharapkan (baris per baris). */
  uji: { masukan: string; keluaran: string[] }[];
}

export interface SqlLatihan extends Base {
  mode: "sql";
  /** Nama dataset di `datasets`, atau "kosong". */
  dataset: string;
  /** Perintah yang dijalankan sebelum kode mahasiswa (mis. tabel induk untuk latihan FK). */
  persiapan?: string;
  /** Query pemeriksa yang dijalankan sesudah kode mahasiswa (latihan DDL). */
  periksa?: string;
  /**
   * Hasil yang diharapkan: hasil `periksa` (satu per pernyataan) atau hasil SELECT
   * terakhir kunci. Query kunci sendiri TIDAK dikirim ke browser.
   */
  harapan: ResultSet[];
  /** Urutan baris ikut dinilai (kunci memakai ORDER BY, atau memakai `periksa`). */
  urut: boolean;
}

export type Latihan = PseudoLatihan | SqlLatihan;

export interface LatihanBundle {
  /** Isi SQL tiap dataset (latihan/data/<nama>.sql). */
  datasets: Record<string, string>;
  items: Latihan[];
}

/** Membandingkan keluaran program dengan yang diharapkan; spasi di ujung baris diabaikan. */
export function compareOutput(got: string[], want: string[]): { ok: boolean; reason?: string } {
  const norm = (xs: string[]) => {
    const out = xs.map((x) => x.replace(/\s+/g, " ").trim());
    while (out.length && out[out.length - 1] === "") out.pop();
    return out;
  };
  const a = norm(got), b = norm(want);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      if (a[i] === undefined) return { ok: false, reason: `Keluaran kurang: baris ke-${i + 1} seharusnya "${b[i]}".` };
      if (b[i] === undefined) return { ok: false, reason: `Keluaran berlebih mulai baris ke-${i + 1}: "${a[i]}".` };
      return { ok: false, reason: `Baris ke-${i + 1}: keluaran "${a[i]}", seharusnya "${b[i]}".` };
    }
  }
  return { ok: true };
}
