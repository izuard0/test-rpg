// File yang dibagikan dosen ke mahasiswa di kelasnya. Disimpan SEMENTARA di folder temp
// server dan dihapus saat kedaluwarsa (15/30/60 menit) atau saat server mulai ulang,
// jadi penyimpanan tidak menumpuk. Tidak ada salinan di database.

import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FILE_MAX_BYTES, FILE_TOTAL_MAX_BYTES, allowedFileExt, type SharedFile } from "@mita/shared";

export interface StoredFile extends SharedFile {
  room: string;
  path: string;
}

export class FileError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// Tanda awal file program yang tidak boleh disebarkan walau ekstensinya diganti.
const EXECUTABLE_MAGIC = [
  [0x4d, 0x5a], // MZ: .exe/.dll Windows
  [0x7f, 0x45, 0x4c, 0x46], // ELF: program Linux
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O / class Java
  [0xcf, 0xfa, 0xed, 0xfe],
];

export class FileStore {
  private readonly files = new Map<string, StoredFile>();
  private total = 0;

  constructor(private readonly dir = join(tmpdir(), "mita-files")) {
    // Sisa dari proses sebelumnya dibuang: file bersama tidak bertahan melewati restart.
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
  }

  add(room: string, rawName: string, data: Buffer, ttlMinutes: number, fromName: string, now = Date.now()): StoredFile {
    const name = rawName.replace(/[\\/\u0000-\u001f"]/g, "_").trim().slice(0, 120) || "berkas";
    if (!allowedFileExt(name)) throw new FileError("Jenis file ini tidak boleh dibagikan. Yang boleh: dokumen, data, notebook, kode SQL/Python, dan zip.");
    if (!data.length) throw new FileError("File kosong.");
    if (data.length > FILE_MAX_BYTES) throw new FileError(`File terlalu besar (maks. ${FILE_MAX_BYTES / 1024 / 1024} MB).`, 413);
    if (EXECUTABLE_MAGIC.some((m) => m.every((b, i) => data[i] === b))) throw new FileError("File program tidak boleh dibagikan.");
    this.sweep(now);
    if (this.total + data.length > FILE_TOTAL_MAX_BYTES) throw new FileError("Penyimpanan sementara server sedang penuh. Coba lagi setelah file lain kedaluwarsa.", 507);
    const token = randomBytes(18).toString("base64url");
    const path = join(this.dir, token);
    writeFileSync(path, data);
    const f: StoredFile = { token, name, size: data.length, expiresAt: now + ttlMinutes * 60_000, fromName, room, path };
    this.files.set(token, f);
    this.total += data.length;
    return f;
  }

  get(token: string, now = Date.now()): StoredFile | undefined {
    const f = this.files.get(token);
    if (!f) return undefined;
    if (f.expiresAt <= now) {
      this.delete(f);
      return undefined;
    }
    return f;
  }

  inRoom(room: string, now = Date.now()): SharedFile[] {
    return [...this.files.values()]
      .filter((f) => f.room === room && f.expiresAt > now)
      .map(({ token, name, size, expiresAt, fromName }) => ({ token, name, size, expiresAt, fromName }));
  }

  /** Menghapus file kedaluwarsa; mengembalikan ruang yang daftar filenya berubah. */
  sweep(now = Date.now()): Set<string> {
    const changed = new Set<string>();
    for (const f of this.files.values()) {
      if (f.expiresAt > now) continue;
      this.delete(f);
      changed.add(f.room);
    }
    return changed;
  }

  get usedBytes(): number {
    return this.total;
  }

  private delete(f: StoredFile): void {
    this.files.delete(f.token);
    this.total -= f.size;
    try {
      unlinkSync(f.path);
    } catch {
      // sudah terhapus
    }
  }
}
