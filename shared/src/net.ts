// Protokol multipemain (Colyseus) antara klien dan server, plus aturan chat yang
// dipakai kedua sisi. Server tetap penentu akhir: klien hanya memakai aturan ini
// untuk menampilkan pilihan yang masuk akal.

import type { Role } from "./account.js";
import type { CharacterChoice, Direction } from "./character.js";

/** Nama jenis ruang Colyseus. Ruang kelas dibedakan lewat opsi `kelas`. */
export const ROOM_KAMPUS = "kampus";
export const ROOM_KELAS = "kelas";

/** Frekuensi kirim posisi (klien) dan cuplikan (server). */
export const NET_HZ = 10;

/** Pemain lain dikirim bila berada dalam kotak ini di sekitar penerima (petak, setengah lebar/tinggi). */
export const VIEW_HALF_TILES = { x: 32, y: 20 };

export const CHAT_MAX_LEN = 200;
export const PM_REQUEST_MAX_LEN = 100;
/** Jeda minimum antarpesan (ms) dan jeda Global di kampus. */
export const CHAT_MIN_INTERVAL_MS = 1000;
export const GLOBAL_KAMPUS_INTERVAL_MS = 10_000;
export const PM_REQUEST_TTL_MS = 10 * 60_000;
export const PM_RETRY_AFTER_DECLINE_MS = 2 * 60_000;
/** Riwayat Global yang disimpan DI MEMORI per ruang (bukan database). */
export const CHAT_HISTORY = 50;
/** Radius zona sebesar ini atau lebih berarti "seluruh ruangan itu" (mis. ruang diskusi). */
export const ROOM_WIDE_RADIUS = 50;

export const DIRS: Direction[] = ["down", "left", "right", "up"];
export const FLAG_MOVING = 1;
export const FLAG_SITTING = 2;

export interface JoinOptions {
  /** Token sesi login (POST /api/auth/login). Identitas, peran, dan avatar diambil server dari database. */
  token: string;
  /** Titik muncul di peta tujuan. */
  spawn?: string;
  /** Kode peta kelas untuk ROOM_KELAS ("kelas-a", ...). */
  kelas?: string;
}

/** Data pemain yang dikirim sekali (saat masuk pandangan), bukan tiap cuplikan. */
export interface Profile {
  /** Nomor sesi di ruang ini (dipakai cuplikan posisi). */
  sid: number;
  /**
   * Penanda pemain yang tetap selama ia daring, walau pindah ruang (sid berganti).
   * Dipakai untuk pesan pribadi. Bukan NIM: NIM tidak dikirim ke pemain lain.
   */
  uid: string;
  name: string;
  role: Role;
  choice: CharacterChoice;
  /** Tag dari admin (tampil "[tag] Nama"). */
  tag?: string;
  /** Pemain di dalam kelas yang dicerminkan ke denah kampus (tidak bisa diajak chat Sekitar). */
  mirror?: string;
}

/**
 * "kelas": obrolan semua orang di ruang kelas, hanya selama sesi kelas berjalan.
 * Di dalam ruang kelas, mode ini menggantikan "global".
 */
export type ChatMode = "sekitar" | "global" | "pribadi" | "kelas";

export interface ChatMessage {
  mode: ChatMode;
  /** sid pengirim di ruang penerima (untuk gelembung), -1 bila berada di ruang lain. */
  from: number;
  fromUid: string;
  fromName: string;
  fromRole: Role;
  /** Penerima pesan pribadi (uid). */
  to?: string;
  toName?: string;
  text: string;
  at: number;
}

// ----- sesi kelas (tahap 4) -----

/** Pilihan masa berlaku file bersama (menit). */
export const FILE_TTL_MINUTES = [15, 30, 60] as const;
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const FILE_TOTAL_MAX_BYTES = 200 * 1024 * 1024;
/** Jenis file yang boleh dibagikan dosen (file program dan HTML ditolak). */
export const FILE_EXTENSIONS = ["txt", "md", "csv", "json", "pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "ipynb", "sql", "py", "zip"];

export interface Materi {
  title: string;
  /** Jalur di bawah bahan_ajar/, mis. "bahan_ajar/Logika Komputasional/x.html". */
  file: string;
  course: string;
}

export interface SharedFile {
  token: string;
  name: string;
  size: number;
  expiresAt: number;
  fromName: string;
}

export interface ClassState {
  active: boolean;
  dosenUid?: string;
  dosenName?: string;
  materi?: Materi;
  startedAt?: number;
  files: SharedFile[];
}

/** Ekstensi file yang diizinkan (huruf kecil), atau null. */
export function allowedFileExt(name: string): string | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext && FILE_EXTENSIONS.includes(ext) ? ext : null;
}

export type PmState = "pending" | "accepted" | "declined" | "expired" | "closed" | "muted" | "offline";

// ----- pesan klien -> server -----
export interface C2S {
  /** [x, y, arah (indeks DIRS), flag] */
  move: [number, number, number, number];
  chat: { mode: ChatMode; text: string; to?: string };
  sit: { seatId: number | null };
  pmAsk: { to: string; text: string };
  pmAnswer: { from: string; accept: boolean };
  pmClose: { peer: string };
  pmMute: { muted: boolean };
  directory: Record<string, never>;
  /** Dosen di dekat meja dosen memulai kelas dengan materi pilihan. */
  classStart: { materi: Materi };
  classMateri: { materi: Materi };
  classEnd: Record<string, never>;
}

// ----- pesan server -> klien -----
export interface S2C {
  /** `x`/`y`: titik muncul yang dipilih server (diacak sedikit agar pemain tidak bertumpuk). */
  welcome: { you: number; uid: string; room: string; x: number; y: number; kelas?: ClassState; players: Profile[]; seats: Record<number, number>; history: ChatMessage[] };
  add: Profile;
  /** Admin mengubah tag pemain yang sedang daring (semua ruang). */
  tag: { uid: string; tag: string | null };
  remove: { sid: number };
  /** Rata: [sid, x, y, arah, flag, sid, x, y, ...] untuk pemain dalam pandangan. */
  snap: number[];
  chat: ChatMessage;
  /** Gelembung "…" untuk penerima di luar radius Sekitar. */
  dots: { from: number };
  seat: { seatId: number; sid: number | null };
  pmRequest: { from: string; fromName: string; text: string; expiresAt: number };
  pmStatus: { peer: string; peerName: string; state: PmState };
  /** Daftar pemain daring (untuk memilih penerima pesan pribadi, /w). */
  directory: { players: { uid: string; name: string; role: Role; place: string }[] };
  notice: { text: string };
  /** Keadaan sesi kelas berubah (mulai, ganti materi, file baru, selesai). */
  classState: ClassState & { event?: "start" | "materi" | "file" | "end" };
  /** Gerak ditolak server (terlalu jauh / menembus rintangan): klien kembali ke posisi ini. */
  correct: { x: number; y: number };
}

/**
 * Aturan pesan pribadi (docs/RANCANGAN.md bagian 4): mahasiswa ke dosen harus disetujui
 * dosen; arah lain langsung. Setelah dosen memulai, mahasiswa boleh membalas.
 */
export function privateNeedsApproval(from: Role, to: Role): boolean {
  return from === "mahasiswa" && to === "dosen";
}

// Saringan kata kasar (bahasa Indonesia & Inggris). Dicocokkan per kata, tidak peka huruf
// besar, dengan pengganti angka umum (4->a, 1->i, 0->o, 3->e).
const KASAR = [
  "anjing", "anjir", "anjrit", "bangsat", "bajingan", "brengsek", "kampret", "keparat", "kontol", "memek",
  "ngentot", "entot", "jancok", "jancuk", "cok", "asu", "goblok", "goblog", "tolol", "bego", "idiot",
  "tai", "taik", "sialan", "pantek", "pepek", "perek", "lonte", "pelacur", "bencong",
  "fuck", "fucking", "shit", "bitch", "bastard", "asshole", "dick", "pussy", "cunt", "motherfucker", "wtf",
];
const KASAR_SET = new Set(KASAR);
const leet = (w: string) => w.replace(/4/g, "a").replace(/1/g, "i").replace(/0/g, "o").replace(/3/g, "e").replace(/5/g, "s");

/** Mengganti kata kasar dengan bintang. */
export function maskProfanity(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (w) => {
    const norm = leet(w.toLowerCase()).replace(/(.)\1+/g, "$1");
    return KASAR_SET.has(norm) || KASAR_SET.has(leet(w.toLowerCase())) ? "*".repeat(w.length) : w;
  });
}

/** Merapikan teks chat: spasi, karakter kendali, batas panjang. */
export function cleanChatText(text: unknown, max = CHAT_MAX_LEN): string {
  return String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
