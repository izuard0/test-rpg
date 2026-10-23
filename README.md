# Virtual Class · Gedung Prodi Informatika

Game RPG 2D pixel berbasis browser yang menggambarkan gedung Prodi Informatika:
satu lobi (maks. 100 orang), perpustakaan digital dengan terminal praktik
(SQL, Python, pseudocode), dan tiga kelas (30 / 45 / 60 kursi) untuk kuis.
Mahasiswa membuat karakter sendiri saat registrasi.

Rancangan lengkap dan keputusan yang sudah disepakati ada di
[`docs/RANCANGAN.md`](docs/RANCANGAN.md). Mulai membaca dari sana.

## Status

| Bagian | Kondisi |
|---|---|
| Rancangan, tech stack, aturan chat, login | Selesai (lihat `docs/RANCANGAN.md`) |
| Prototipe karakter (gerak, kamera, kustomisasi) | Selesai: `prototype/karakter/index.html` |
| Aset tile (lobi, perpustakaan, kelas) | Gambar sudah ada; belum diolah menjadi tileset |
| Aset NPC, ikon, dua latar layar | Belum dibuat (lihat `belum-dibuat/`) |
| Klien (Phaser), server (Colyseus), terminal, kuis | Belum dimulai |

Pengembangan dilanjutkan di repositori ini, dimulai dari tahap 1 pada
`docs/RANCANGAN.md` bagian 7.

## Mulai cepat

Lihat prototipe karakter tanpa memasang apa pun: buka
`prototype/karakter/index.html` di browser (klik dua kali).

Menjalankan ulang pemrosesan aset karakter (butuh Python 3.12):

```bash
pip install -r requirements.txt
python tools/process_character.py   # gambar mentah -> atlas (± 1 menit)
python tools/build_sim.py           # bangun ulang halaman prototipe
```

Rencana alat klien: Node 24 + npm, TypeScript, Phaser 3 (belum ada di repositori).

## Struktur folder

```
assets/
  characters/raw/   gambar mentah dari Gemini (sumber pemrosesan, jangan diedit)
  characters/base/  badan dasar acuan gaya
  tiles/            lobi, perpustakaan, kelas (+ _draft/ untuk draf lama)
  backgrounds/      layar judul
asset-prompts/      prompt pembuatan aset; karakter-hemat/ = kotak masuk gambar baru
belum-dibuat/       daftar aset yang belum dibuat + gambar acuan
docs/               RANCANGAN.md dan dokumen teknis
export/character/   paket karakter siap pakai untuk klien (dihasilkan; docs/KARAKTER.md)
prototype/karakter/ prototipe karakter (dibangun otomatis, jangan diedit tangan)
tools/              skrip pemroses aset dan pembuat prototipe
```

## Panduan untuk pengembang dan asisten AI

Konvensi, jebakan yang sudah ditemui, dan cara kerja alur aset ada di
[`CLAUDE.md`](CLAUDE.md).
